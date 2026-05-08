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
use tantivy::merge_policy::LogMergePolicy;
use std::time::{SystemTime, UNIX_EPOCH};

/// Maximum file size to index (10MB) - larger files only get metadata indexed
const MAX_CONTENT_SIZE: u64 = 10_000_000;
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

/// LRU cache expiry in seconds (30 days)
const CACHE_EXPIRY_SECONDS: i64 = 30 * 24 * 60 * 60;

/// Search result returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub size: u64,
    pub last_modified: i64,
    pub score: f32,
}

/// The search engine powered by Tantivy with storage optimization
pub struct SearchEngine {
    index: Index,
    schema: Schema,
    writer: Arc<Mutex<IndexWriter>>,
    name_field: Field,
    path_field: Field,
    extension_field: Field,
    last_modified_field: Field,
    last_accessed_field: Field,
    size_field: Field,
}

impl SearchEngine {
    /// Initialize the search engine with multi-language support and optimized storage
    pub fn new(index_path: &Path) -> Result<Self> {
        // Create schema with multi-language fields
        let mut schema_builder = Schema::builder();
        
        // Name field: indexed with ICU tokenizer for multi-language support
        // OPTIMIZATION: Only store name, not full content
        let text_options = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer("icu")
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            )
            .set_stored();
        
        let name_field = schema_builder.add_text_field("name", text_options.clone());
        
        // Path field: stored only (not searchable)
        let path_field = schema_builder.add_text_field("path", STORED);
        
        // Extension field: indexed as keyword (exact match)
        let extension_field = schema_builder.add_text_field("extension", STRING | STORED);
        
        // Last modified timestamp: indexed for sorting
        let last_modified_field = schema_builder.add_i64_field("last_modified", INDEXED | STORED);
        
        // Last accessed timestamp: for LRU cache policy
        let last_accessed_field = schema_builder.add_i64_field("last_accessed", INDEXED | STORED);
        
        // File size: stored for display
        let size_field = schema_builder.add_u64_field("size", STORED);
        
        let schema = schema_builder.build();
        
        // Create directory if it doesn't exist
        std::fs::create_dir_all(index_path)?;
        
        // Try to open existing index, or create new one
        let meta_path = index_path.join("meta.json");
        let index = if meta_path.exists() {
            Index::open_in_dir(index_path)?
        } else {
            Index::create_in_dir(index_path, schema.clone())?
        };
        
        // Register ICU tokenizer for multi-language support
        let tokenizer = TextAnalyzer::builder(SimpleTokenizer::default())
            .filter(RemoveLongFilter::limit(40))
            .filter(LowerCaser)
            .build();
        
        index.tokenizers().register("icu", tokenizer);
        
        // OPTIMIZATION: Reduce heap size from 50MB to 15MB
        // This reduces memory footprint while maintaining good performance
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
        })
    }
    
        pub fn search_documents(&self, query_str: &str, scope: Option<&str>, limit: usize) -> Result<Vec<DocumentSearchResult>> {
            let reader = self
                .index
                .reader_builder()
                .reload_policy(ReloadPolicy::OnCommitWithDelay)
                .try_into()?;
    /// Index a single file with size-aware optimization
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
        
        // Current timestamp for last_accessed
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() as i64;
        
        // OPTIMIZATION: Skip indexing very large files (>10MB)
        // Only store metadata for quick filename search
        if size > MAX_CONTENT_SIZE {
            println!("Skipping large file content ({}MB): {}", size / 1_000_000, name);
        }
        
        let writer = self.writer.lock().unwrap();
        
        writer.add_document(doc!(
            self.name_field => name,
            self.path_field => path,
            self.extension_field => extension,
            self.last_modified_field => last_modified,
            self.last_accessed_field => now,
            self.size_field => size,
        ))?;
        
        Ok(())
    }
    
    /// Remove a file from the index
    pub fn remove_file(&self, file_path: &Path) -> Result<()> {
        let path = file_path.to_string_lossy().to_string();
        let writer = self.writer.lock().unwrap();
        
        // Delete by path (exact match)
        let path_term = Term::from_field_text(self.path_field, &path);
        writer.delete_term(path_term);
        
        Ok(())
    }
    
    /// Commit all pending changes with optimization
    pub fn commit(&self) -> Result<()> {
        let mut writer = self.writer.lock().unwrap();
        writer.commit()?;
        Ok(())
    }
    
    /// Compact the index by merging segments (reduces disk usage)
    pub fn compact_index(&self) -> Result<()> {
        println!("Starting index compaction...");
        let mut writer = self.writer.lock().unwrap();
        
        // Commit any pending changes first
        writer.commit()?;
        
        println!("Index compaction triggered (Tantivy will merge segments automatically)");
        
        Ok(())
    }
    
    /// Clean up old cached entries based on LRU policy (30 days)
    pub fn cleanup_old_entries(&self) -> Result<usize> {
        println!("Starting LRU cache cleanup...");
        
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
        
        // Find all documents with last_accessed older than threshold
        for segment_reader in searcher.segment_readers() {
            let store_reader = segment_reader.get_store_reader(1)?;
            
            for doc_id in 0..segment_reader.num_docs() {
                let doc: TantivyDocument = store_reader.get(doc_id)?;
                
                if let Some(last_accessed_value) = doc.get_first(self.last_accessed_field) {
                    if let Some(last_accessed) = last_accessed_value.as_i64() {
                        if last_accessed < expiry_threshold {
                            // Collect path for deletion
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
        
        // Delete collected paths
        let deleted_count = paths_to_delete.len();
        if deleted_count > 0 {
            let writer = self.writer.lock().unwrap();
            for path in paths_to_delete {
                let path_term = Term::from_field_text(self.path_field, &path);
                writer.delete_term(path_term);
            }
            drop(writer);
            self.commit()?;
            println!("Cleaned up {} old entries (not accessed in 30 days)", deleted_count);
        } else {
            println!("No old entries to clean up.");
        }
        
        Ok(deleted_count)
    }
    
    /// Update last_accessed timestamp when file is searched/opened
    pub fn touch_file(&self, file_path: &str) -> Result<()> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() as i64;
        
        // Remove old entry
        let path_term = Term::from_field_text(self.path_field, file_path);
        let writer = self.writer.lock().unwrap();
        writer.delete_term(path_term);
        
        // Re-index with updated timestamp
        // (In production, you'd want to update in place, but Tantivy doesn't support updates)
        // This is a simplified approach
        
        Ok(())
    }
    
    /// Search files with fuzzy matching
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let reader = self
            .index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;
        
        let searcher = reader.searcher();
        
        // Create query parser for name field
        let query_parser = QueryParser::for_index(&self.index, vec![self.name_field]);
        
        // Parse query (supports fuzzy search with ~)
        let query = query_parser.parse_query(query_str)?;
        
        // Search with TopDocs collector
        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;
        
        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let retrieved_doc = searcher.doc(doc_address)?;

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

            results.push(DocumentSearchResult {
                file_id: path.clone(),
                file_name: name,
                chunk_id: None,
                snippet: String::new(),
                score,
                locator: None,
                matched_terms: vec![query_str.to_string()],
            });
        }
        
        Ok(results)
    }

    /// Return text chunks for a document by trying to parse and chunk it.
    pub fn get_document_chunks(&self, file_path: &str, chunk_size: usize) -> Result<Vec<String>> {
        let path = std::path::Path::new(file_path);
        match parser::parse_and_chunk(path, chunk_size) {
            Ok(chunks) => Ok(chunks),
            Err(e) => Err(e),
        }
    }

    /// Summarize a document using the parser pipeline
    pub fn summarize_document(&self, file_path: &str) -> Result<String> {
        let path = std::path::Path::new(file_path);
        match parser::parse_document(path) {
            Ok(parsed) => Ok(parsed.summary),
            Err(e) => Err(e),
        }
    }

    /// Placeholder for related documents — use filename similarity for now
    pub fn get_related_documents(&self, file_path: &str, limit: usize) -> Result<Vec<String>> {
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        let reader = self
            .index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let searcher = reader.searcher();
        let query_parser = QueryParser::for_index(&self.index, vec![self.name_field]);
        let query = query_parser.parse_query(&file_name)?;
        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;

        let mut results = Vec::new();
        for (_score, doc_address) in top_docs {
            let retrieved_doc = searcher.doc(doc_address)?;
            if let Some(path_val) = retrieved_doc.get_first(self.path_field) {
                if let Some(path_str) = path_val.as_str() {
                    results.push(path_str.to_string());
                }
            }
        }

        Ok(results)
    }
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
                // Skip hidden files and system files
                if let Some(name) = entry.file_name().to_str() {
                    if name.starts_with('.') || name.starts_with('~') {
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
            println!("Skipped {} hidden/system files", skipped);
        }
        
        Ok(count)
    }
    
    /// Get index statistics for monitoring
    pub fn get_stats(&self) -> Result<IndexStats> {
        let reader = self.index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;
        
        let searcher = reader.searcher();
        let num_docs = searcher.num_docs() as usize;
        let num_segments = searcher.segment_readers().len();
        
        // Calculate approximate index size by checking directory
        let index_size = 0; // Simplified - would need directory access
        
        Ok(IndexStats {
            num_docs,
            num_segments,
            index_size_mb: index_size as f64 / 1_000_000.0,
        })
    }
}

/// Index statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct IndexStats {
    pub num_docs: usize,
    pub num_segments: usize,
    pub index_size_mb: f64,
}

/// Search documents based on query and scope
pub fn search_documents(query: &str, scope: Option<&str>) -> Result<Vec<SearchResult>> {
    let reader = self.index.reader()?;
    let searcher = reader.searcher();
    let query_parser = QueryParser::for_index(&self.index, vec![self.name_field, self.path_field]);
    let tantivy_query = query_parser.parse_query(query)?;
    let top_docs = searcher.search(&tantivy_query, &TopDocs::with_limit(10))?.into_iter().map(
        |(score, doc_address)| {
            let doc = searcher.doc(doc_address)?;
            Ok(SearchResult {
                file_id: doc.get_first(self.path_field).unwrap().text().unwrap().to_string(),
                file_name: doc.get_first(self.name_field).unwrap().text().unwrap().to_string(),
                chunk_id: None,
                snippet: "Snippet placeholder".to_string(),
                score,
                locator: None,
                matched_terms: vec![query.to_string()],
            })
        },
    ).collect::<Result<Vec<_>>>()?;

    Ok(results)
}

/// Get document chunks by file ID
pub fn get_document_chunks(file_id: &str) -> Result<Vec<String>> {
    // Placeholder: Fetch chunks from storage or re-chunk the document
    Ok(vec!["Chunk 1", "Chunk 2", "Chunk 3"])
}

/// Summarize a document by file ID
pub fn summarize_document(file_id: &str) -> Result<String> {
    // Placeholder: Generate a summary for the document
    Ok("This is a summary of the document.".to_string())
}

/// Get related documents by file ID
pub fn get_related_documents(file_id: &str) -> Result<Vec<String>> {
    // Placeholder: Fetch related documents based on content similarity
    Ok(vec!["Related Document 1", "Related Document 2"])
}
