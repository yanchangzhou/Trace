use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use crate::parser;
use std::sync::{Arc, Mutex};
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};
use tantivy::tokenizer::*;
use std::time::{SystemTime, UNIX_EPOCH};

/// Maximum file size to index (10MB)
const MAX_CONTENT_SIZE: u64 = 10_000_000;

/// LRU cache expiry in seconds (30 days)
const CACHE_EXPIRY_SECONDS: i64 = 30 * 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentSearchResult {
    pub file_id: String,
    pub file_name: String,
    pub chunk_id: Option<i64>,
    pub snippet: String,
    pub score: f32,
    pub locator: Option<String>,
    pub matched_terms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub size: u64,
    pub last_modified: i64,
    pub score: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexStats {
    pub num_docs: usize,
    pub num_segments: usize,
    pub index_size_mb: f64,
}

pub struct SearchEngine {
    index: Index,
    #[allow(dead_code)]
    schema: Schema,
    writer: Arc<Mutex<IndexWriter>>,
    name_field: Field,
    path_field: Field,
    extension_field: Field,
    last_modified_field: Field,
    last_accessed_field: Field,
    size_field: Field,
    content_field: Field,
}

impl SearchEngine {
    pub fn new(index_path: &Path) -> Result<Self> {
        let mut schema_builder = Schema::builder();

        let text_options = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer("icu")
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            )
            .set_stored();

        let name_field = schema_builder.add_text_field("name", text_options.clone());
        let path_field = schema_builder.add_text_field("path", STORED);
        let extension_field = schema_builder.add_text_field("extension", STRING | STORED);
        let last_modified_field = schema_builder.add_i64_field("last_modified", INDEXED | STORED);
        let last_accessed_field = schema_builder.add_i64_field("last_accessed", INDEXED | STORED);
        let size_field = schema_builder.add_u64_field("size", STORED);

        // Content field for full-text document search
        let content_field = schema_builder.add_text_field("content",
            TextOptions::default()
                .set_indexing_options(
                    TextFieldIndexing::default()
                        .set_tokenizer("icu")
                        .set_index_option(IndexRecordOption::WithFreqsAndPositions),
                )
                .set_stored(),
        );

        let schema = schema_builder.build();

        std::fs::create_dir_all(index_path)?;

        let meta_path = index_path.join("meta.json");
        let index = if meta_path.exists() {
            Index::open_in_dir(index_path)?
        } else {
            Index::create_in_dir(index_path, schema.clone())?
        };

        let tokenizer = TextAnalyzer::builder(SimpleTokenizer::default())
            .filter(RemoveLongFilter::limit(40))
            .filter(LowerCaser)
            .build();

        index.tokenizers().register("icu", tokenizer);

        let writer = index.writer(15_000_000)?;

        Ok(Self {
            index,
            schema,
            writer: Arc::new(Mutex::new(writer)),
            name_field,
            path_field,
            extension_field,
            last_modified_field,
            last_accessed_field,
            size_field,
            content_field,
        })
    }

    /// Index a single file with content extraction
    pub fn index_file(&self, file_path: &Path) -> Result<()> {
        let metadata = std::fs::metadata(file_path)?;

        let name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let path = file_path.to_string_lossy().to_string();

        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let last_modified = metadata
            .modified()?
            .duration_since(UNIX_EPOCH)?
            .as_secs() as i64;

        let size = metadata.len();

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() as i64;

        // Extract text content for indexing (skip for very large files)
        let content = if size <= MAX_CONTENT_SIZE {
            parser::extract_full_text(file_path).unwrap_or_default()
        } else {
            println!("Skipping content indexing for large file ({}MB): {}", size / 1_000_000, name);
            String::new()
        };

        let writer = self.writer.lock().unwrap();

        // Remove existing entry if any
        let path_term = Term::from_field_text(self.path_field, &path);
        writer.delete_term(path_term);

        writer.add_document(doc!(
            self.name_field => name,
            self.path_field => path,
            self.extension_field => extension,
            self.last_modified_field => last_modified,
            self.last_accessed_field => now,
            self.size_field => size,
            self.content_field => content,
        ))?;

        Ok(())
    }

    /// Remove a file from the index
    pub fn remove_file(&self, file_path: &Path) -> Result<()> {
        let path = file_path.to_string_lossy().to_string();
        let writer = self.writer.lock().unwrap();
        let path_term = Term::from_field_text(self.path_field, &path);
        writer.delete_term(path_term);
        Ok(())
    }

    /// Commit all pending changes
    pub fn commit(&self) -> Result<()> {
        let mut writer = self.writer.lock().unwrap();
        writer.commit()?;
        Ok(())
    }

    /// Compact the index by merging segments
    pub fn compact_index(&self) -> Result<()> {
        println!("Starting index compaction...");
        let mut writer = self.writer.lock().unwrap();
        writer.commit()?;
        println!("Index compaction triggered");
        Ok(())
    }

    /// Clean up old cached entries based on LRU policy (30 days)
    pub fn cleanup_old_entries(&self) -> Result<usize> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() as i64;

        let expiry_threshold = now - CACHE_EXPIRY_SECONDS;

        let reader = self.index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let searcher = reader.searcher();
        let mut paths_to_delete = Vec::new();

        for segment_reader in searcher.segment_readers() {
            let store_reader = segment_reader.get_store_reader(1)?;
            for doc_id in 0..segment_reader.num_docs() {
                let doc: TantivyDocument = store_reader.get(doc_id)?;
                if let Some(last_accessed_value) = doc.get_first(self.last_accessed_field) {
                    if let Some(last_accessed) = last_accessed_value.as_i64() {
                        if last_accessed < expiry_threshold {
                            if let Some(path_value) = doc.get_first(self.path_field) {
                                if let Some(path_str) = path_value.as_str() {
                                    paths_to_delete.push(path_str.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        let deleted_count = paths_to_delete.len();
        if deleted_count > 0 {
            let writer = self.writer.lock().unwrap();
            for path in paths_to_delete {
                let path_term = Term::from_field_text(self.path_field, &path);
                writer.delete_term(path_term);
            }
            drop(writer);
            self.commit()?;
            println!("Cleaned up {} old entries", deleted_count);
        }

        Ok(deleted_count)
    }

    /// Search files by name (fuzzy matching)
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let reader = self.index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let searcher = reader.searcher();

        let query_parser = QueryParser::for_index(&self.index, vec![self.name_field]);
        let query = query_parser.parse_query(query_str)?;

        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let retrieved_doc: TantivyDocument = searcher.doc(doc_address)?;

            let name = retrieved_doc
                .get_first(self.name_field)
                .and_then(|v: &OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let path = retrieved_doc
                .get_first(self.path_field)
                .and_then(|v: &OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let extension = retrieved_doc
                .get_first(self.extension_field)
                .and_then(|v: &OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let last_modified = retrieved_doc
                .get_first(self.last_modified_field)
                .and_then(|v: &OwnedValue| v.as_i64())
                .unwrap_or(0);

            let size = retrieved_doc
                .get_first(self.size_field)
                .and_then(|v: &OwnedValue| v.as_u64())
                .unwrap_or(0);

            results.push(SearchResult {
                name,
                path,
                extension,
                size,
                last_modified,
                score,
            });
        }

        Ok(results)
    }

    /// Search document content (full-text)
    pub fn search_documents(&self, query_str: &str, scope: Option<&str>, limit: usize) -> Result<Vec<DocumentSearchResult>> {
        let reader = self.index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let searcher = reader.searcher();

        // Search both name and content fields
        let query_parser = QueryParser::for_index(&self.index, vec![self.name_field, self.content_field]);
        let query = query_parser.parse_query(query_str)?;

        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let retrieved_doc: TantivyDocument = searcher.doc(doc_address)?;

            let file_id = retrieved_doc
                .get_first(self.path_field)
                .and_then(|v: &OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let file_name = retrieved_doc
                .get_first(self.name_field)
                .and_then(|v: &OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            // Get content snippet around the match
            let snippet = retrieved_doc
                .get_first(self.content_field)
                .and_then(|v: &OwnedValue| v.as_str())
                .map(|c| {
                    let chars: Vec<char> = c.chars().collect();
                    let len = chars.len().min(200);
                    chars[..len].iter().collect()
                })
                .unwrap_or_default();

            // Filter by scope if provided
            if let Some(scope_path) = scope {
                if !file_id.starts_with(scope_path) {
                    continue;
                }
            }

            results.push(DocumentSearchResult {
                file_id,
                file_name,
                chunk_id: None,
                snippet,
                score,
                locator: None,
                matched_terms: vec![query_str.to_string()],
            });
        }

        Ok(results)
    }

    /// Get document chunks by parsing the file
    pub fn get_document_chunks(&self, file_path: &str, chunk_size: usize) -> Result<Vec<String>> {
        let path = std::path::Path::new(file_path);
        parser::parse_and_chunk(path, chunk_size)
    }

    /// Summarize a document
    pub fn summarize_document(&self, file_path: &str) -> Result<String> {
        let path = std::path::Path::new(file_path);
        parser::parse_document(path).map(|p| p.summary)
    }

    /// Get related documents by filename similarity
    pub fn get_related_documents(&self, file_path: &str, limit: usize) -> Result<Vec<String>> {
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        let reader = self.index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let searcher = reader.searcher();
        let query_parser = QueryParser::for_index(&self.index, vec![self.name_field]);
        let query = query_parser.parse_query(&file_name)?;
        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;

        let mut results = Vec::new();
        for (_score, doc_address) in top_docs {
            let retrieved_doc: TantivyDocument = searcher.doc(doc_address)?;
            if let Some(path_val) = retrieved_doc.get_first(self.path_field) {
                if let Some(path_str) = path_val.as_str() {
                    if path_str != file_path {
                        results.push(path_str.to_string());
                    }
                }
            }
        }

        Ok(results)
    }

    /// Index all files in a directory recursively
    pub fn index_directory(&self, dir_path: &Path) -> Result<usize> {
        use walkdir::WalkDir;

        let mut count = 0;
        let mut skipped = 0;

        for entry in WalkDir::new(dir_path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.starts_with('.') || name.starts_with('~') || name == "trace.db" {
                        skipped += 1;
                        continue;
                    }
                }

                if let Err(e) = self.index_file(entry.path()) {
                    eprintln!("Failed to index {:?}: {}", entry.path(), e);
                } else {
                    count += 1;
                }
            }
        }

        self.commit()?;

        if skipped > 0 {
            println!("Skipped {} hidden/system/db files", skipped);
        }

        Ok(count)
    }

    /// Get index statistics
    pub fn get_stats(&self) -> Result<IndexStats> {
        let reader = self.index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let searcher = reader.searcher();
        let num_docs = searcher.num_docs() as usize;
        let num_segments = searcher.segment_readers().len();

        Ok(IndexStats {
            num_docs,
            num_segments,
            index_size_mb: 0.0,
        })
    }
}
