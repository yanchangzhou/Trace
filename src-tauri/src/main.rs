#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod search;
mod watcher;
mod parser;
mod db;

use once_cell::sync::Lazy;
use parser::{ParsedDocument, DocumentData};
use search::{SearchEngine, SearchResult, DocumentSearchResult};
use db::{Database, Note, NoteSource, Block, VersionHistory, Session};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use watcher::FileWatcher;

static SEARCH_ENGINE: Lazy<Arc<SearchEngine>> = Lazy::new(|| {
    let index_path = get_index_path();
    Arc::new(SearchEngine::new(&index_path).expect("Failed to initialize search engine"))
});

fn get_index_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Trace");
    path.push("index");
    path
}

fn get_trace_docs_path() -> PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("TraceDocs");
    if !path.exists() {
        std::fs::create_dir_all(&path).ok();
    }
    path
}

fn get_db_path() -> PathBuf {
    let mut db_path = get_trace_docs_path();
    db_path.push("trace.db");
    db_path
}

async fn get_db() -> Result<Database, String> {
    Database::new(&get_db_path()).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// Search & Index commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn search_local_files(query: String) -> Result<Vec<SearchResult>, String> {
    SEARCH_ENGINE.search(&query, 50).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_docs_folder() -> Result<String, String> {
    Ok(get_trace_docs_path().to_string_lossy().to_string())
}

#[tauri::command]
async fn reindex_files() -> Result<usize, String> {
    let docs_path = get_trace_docs_path();
    SEARCH_ENGINE.index_directory(&docs_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd").args(&["/C", "start", "", &path]).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn compact_index() -> Result<String, String> {
    SEARCH_ENGINE.compact_index().map_err(|e| e.to_string())?;
    Ok("Index compaction complete".to_string())
}

#[tauri::command]
async fn cleanup_old_entries() -> Result<usize, String> {
    SEARCH_ENGINE.cleanup_old_entries().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_index_stats() -> Result<search::IndexStats, String> {
    SEARCH_ENGINE.get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_all_files() -> Result<Vec<SearchResult>, String> {
    SEARCH_ENGINE.search("*", 1000)
        .or_else(|_| SEARCH_ENGINE.search("", 1000))
        .map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// Document Parsing commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn parse_document(file_path: String) -> Result<ParsedDocument, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {:?}", path));
    }
    parser::parse_document(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_file_summary(file_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    Ok(parser::get_file_summary(path))
}

#[tauri::command]
async fn search_documents(query: String, scope: Option<String>, limit: Option<u32>) -> Result<Vec<DocumentSearchResult>, String> {
    let lim = limit.unwrap_or(10) as usize;
    SEARCH_ENGINE.search_documents(&query, scope.as_deref(), lim).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_document_chunks(file_path: String, chunk_size: Option<usize>) -> Result<Vec<String>, String> {
    let size = chunk_size.unwrap_or(1000);
    SEARCH_ENGINE.get_document_chunks(&file_path, size).map_err(|e| e.to_string())
}

#[tauri::command]
async fn summarize_document(file_path: String) -> Result<String, String> {
    SEARCH_ENGINE.summarize_document(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_related_documents(file_path: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let lim = limit.unwrap_or(5);
    SEARCH_ENGINE.get_related_documents(&file_path, lim).map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// Book commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn list_books() -> Result<Vec<db::Book>, String> {
    let db = get_db().await?;
    db.list_books().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_book(name: String) -> Result<i64, String> {
    let db = get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = db.create_book(&name, &now).await.map_err(|e| e.to_string())?;
    // Also create folder for the book
    let mut folder = get_trace_docs_path();
    folder.push(&name);
    std::fs::create_dir_all(&folder).ok();
    Ok(id)
}

#[tauri::command]
async fn rename_book(book_id: i64, new_name: String) -> Result<(), String> {
    let db = get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    db.rename_book(book_id, &new_name, &now).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_book(book_id: i64) -> Result<(), String> {
    let db = get_db().await?;
    db.delete_book(book_id).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// File commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn list_files_by_book(book_id: i64) -> Result<Vec<db::FileRecord>, String> {
    let db = get_db().await?;
    db.list_files_by_book(book_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_file_detail(file_id: i64) -> Result<Option<db::FileRecord>, String> {
    let db = get_db().await?;
    db.get_file_detail(file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_file(file_id: i64) -> Result<(), String> {
    let db = get_db().await?;
    db.delete_file(file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_library(book_id: i64, book_path: String) -> Result<usize, String> {
    use walkdir::WalkDir;
    let mut files = Vec::new();
    for entry in WalkDir::new(&book_path).follow_links(true).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let p = entry.path().to_string_lossy().to_string();
            if let Ok(meta) = entry.metadata() {
                files.push((p, meta.len() as i64, entry.path().extension().and_then(|e| e.to_str()).unwrap_or("").to_string()));
            }
        }
    }
    let count = files.len();
    let db = get_db().await?;
    db.sync_files_for_book(book_id, files).await.map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
async fn create_book_folder(book_id: String) -> Result<String, String> {
    let mut path = get_trace_docs_path();
    path.push(&book_id);
    std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create book folder: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn delete_book_folder(book_id: String) -> Result<(), String> {
    let mut path = get_trace_docs_path();
    path.push(&book_id);
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete book folder: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn select_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app.dialog()
        .file()
        .add_filter("Documents", &["pdf", "docx", "doc", "pptx", "ppt", "txt", "md"])
        .set_title("Select Files to Upload")
        .blocking_pick_files();
    match files {
        Some(paths) => Ok(paths.into_iter().map(|p| p.to_string()).collect()),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
async fn copy_file_to_book(file_path: String, book_id: String) -> Result<String, String> {
    use std::path::Path;
    let source = Path::new(&file_path);
    if !source.exists() {
        return Err(format!("Source file does not exist: {}", file_path));
    }
    let file_name = source.file_name().ok_or("Invalid file name")?.to_string_lossy().to_string();
    let mut dest_dir = get_trace_docs_path();
    dest_dir.push(&book_id);
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("Failed to create book folder: {}", e))?;

    let mut dest_path = dest_dir.clone();
    dest_path.push(&file_name);

    let stem = source.file_stem().unwrap().to_string_lossy().to_string();
    let extension = source.extension().map(|e| e.to_string_lossy().to_string());
    let mut counter = 1;
    while dest_path.exists() {
        let new_name = if let Some(ext) = &extension {
            format!("{}-{}.{}", stem, counter, ext)
        } else {
            format!("{}-{}", stem, counter)
        };
        dest_path = dest_dir.clone();
        dest_path.push(new_name);
        counter += 1;
    }

    std::fs::copy(&source, &dest_path).map_err(|e| format!("Failed to copy file: {}", e))?;

    // Index the new file
    let search_engine = Arc::clone(&SEARCH_ENGINE);
    let dest_path_clone = dest_path.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = search_engine.index_file(&dest_path_clone) {
            eprintln!("Failed to index file: {}", e);
        }
    });

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn list_book_files(book_id: String) -> Result<Vec<SearchResult>, String> {
    let mut book_path = get_trace_docs_path();
    book_path.push(&book_id);
    if !book_path.exists() {
        return Ok(Vec::new());
    }
    let all_files = SEARCH_ENGINE.search("*", 1000)
        .or_else(|_| SEARCH_ENGINE.search("", 1000))
        .map_err(|e| e.to_string())?;
    let book_path_str = book_path.to_string_lossy().to_string();
    Ok(all_files.into_iter().filter(|f| f.path.starts_with(&book_path_str)).collect())
}

// ═══════════════════════════════════════════════════════════════
// Document persistence commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn parse_and_store_document(file_id: i64, file_path: String) -> Result<DocumentData, String> {
    let path = std::path::Path::new(&file_path);
    let data = parser::extract_document_data(path).map_err(|e| e.to_string())?;
    let db = get_db().await?;
    db.save_document_metadata(
        file_id, &data.summary, data.word_count,
        data.page_count, data.slide_count, &data.headings_json,
    ).await.map_err(|e| e.to_string())?;
    let chunks: Vec<(i64, String, i64, String)> = data.chunks.iter().map(|c| {
        (c.chunk_index, c.text.clone(), c.token_count, c.locator_json.clone())
    }).collect();
    db.save_document_chunks(file_id, chunks).await.map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
async fn get_document_chunks_from_db(file_id: i64) -> Result<Vec<db::DocumentChunk>, String> {
    let db = get_db().await?;
    db.get_document_chunks(file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_document_metadata(file_id: i64) -> Result<Option<db::Document>, String> {
    let db = get_db().await?;
    db.get_document_metadata(file_id).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// Note commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn create_note(book_id: i64, title: String, content_json: String, plain_text: String) -> Result<i64, String> {
    let db = get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let note = Note {
        id: 0,
        book_id,
        title,
        content_json,
        plain_text,
        created_at: now.clone(),
        updated_at: now,
    };
    db.create_note(&note).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_note(note_id: i64) -> Result<Note, String> {
    let db = get_db().await?;
    db.get_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_note(note: Note) -> Result<(), String> {
    let db = get_db().await?;
    db.update_note(&Note { updated_at: chrono::Utc::now().to_rfc3339(), ..note })
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_note(note_id: i64) -> Result<(), String> {
    let db = get_db().await?;
    db.delete_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_notes_by_book(book_id: i64) -> Result<Vec<Note>, String> {
    let db = get_db().await?;
    db.list_notes_by_book(book_id).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// Note sources commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn add_note_source(note_id: i64, file_id: i64, chunk_id: i64, quote_text: String) -> Result<(), String> {
    let db = get_db().await?;
    let source = NoteSource { note_id, file_id, chunk_id, quote_text };
    db.add_note_source(&source).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_note_sources(note_id: i64) -> Result<Vec<NoteSource>, String> {
    let db = get_db().await?;
    db.get_note_sources(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_note_source(note_id: i64, file_id: i64, chunk_id: i64) -> Result<(), String> {
    let db = get_db().await?;
    db.remove_note_source(note_id, file_id, chunk_id).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// AI Context commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn build_ai_context(note_id: i64) -> Result<String, String> {
    let db = get_db().await?;
    let sources = db.get_note_sources(note_id).await.map_err(|e| e.to_string())?;

    let context = sources.into_iter().enumerate().map(|(i, source)| {
        format!(
            "[Source {}]\nFile ID: {}\nChunk ID: {}\nQuote: {}\n",
            i + 1, source.file_id, source.chunk_id, source.quote_text
        )
    }).collect::<Vec<_>>().join("\n");

    Ok(context)
}

#[tauri::command]
async fn generate_with_context(note_id: i64, prompt: String) -> Result<String, String> {
    let context = build_ai_context_inner(note_id).await?;
    let full_prompt = format!(
        "You are an AI writing assistant. Use the following source materials to help write.\n\n## Source Materials\n{}\n\n## User Request\n{}",
        context, prompt
    );
    // Returns the assembled prompt — actual LLM call can be wired in by the frontend
    Ok(full_prompt)
}

#[tauri::command]
async fn retry_generation(previous_prompt: String) -> Result<String, String> {
    Ok(format!(
        "[RETRY] Previous prompt:\n{}\n\n---\nPlease try again with a different approach.",
        previous_prompt
    ))
}

async fn build_ai_context_inner(note_id: i64) -> Result<String, String> {
    let db = get_db().await?;
    let sources = db.get_note_sources(note_id).await.map_err(|e| e.to_string())?;
    Ok(sources.into_iter().enumerate().map(|(i, source)| {
        format!("[Source {}]\nFile ID: {}\nChunk ID: {}\nQuote: {}\n", i + 1, source.file_id, source.chunk_id, source.quote_text)
    }).collect::<Vec<_>>().join("\n"))
}

// ═══════════════════════════════════════════════════════════════
// Block commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn create_block(note_id: i64, content: String, order: i32) -> Result<i64, String> {
    let db = get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let block = Block {
        id: 0,
        note_id,
        content,
        order,
        created_at: now.clone(),
        updated_at: now,
    };
    db.add_block(&block).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_block(block: Block) -> Result<(), String> {
    let db = get_db().await?;
    db.update_block(&Block { updated_at: chrono::Utc::now().to_rfc3339(), ..block })
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_block(block_id: i64) -> Result<(), String> {
    let db = get_db().await?;
    db.delete_block(block_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_blocks_by_note(note_id: i64) -> Result<Vec<Block>, String> {
    let db = get_db().await?;
    db.list_blocks_by_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn reorder_blocks(note_id: i64, block_ids: Vec<i64>) -> Result<(), String> {
    let db = get_db().await?;
    db.reorder_blocks(note_id, block_ids).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// Snapshot / Version history commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn create_snapshot(note_id: i64, snapshot: String) -> Result<i64, String> {
    let db = get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let vh = VersionHistory { id: 0, note_id, snapshot, created_at: now };
    db.save_version_history(&vh).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_snapshots_by_note(note_id: i64) -> Result<Vec<VersionHistory>, String> {
    let db = get_db().await?;
    db.list_snapshots_by_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_snapshot(snapshot_id: i64) -> Result<VersionHistory, String> {
    let db = get_db().await?;
    db.get_snapshot(snapshot_id).await.map_err(|e| e.to_string())
}

/// Restore a note's content from a snapshot
#[tauri::command]
async fn restore_snapshot(snapshot_id: i64) -> Result<String, String> {
    let db = get_db().await?;
    let snap = db.get_snapshot(snapshot_id).await.map_err(|e| e.to_string())?;
    Ok(snap.snapshot)
}

// ═══════════════════════════════════════════════════════════════
// Session commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn save_session(note_id: i64, session_data: String) -> Result<i64, String> {
    let db = get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let session = Session {
        id: 0,
        note_id,
        session_data,
        last_active: now.clone(),
        created_at: now,
    };
    db.save_session(&session).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_recent_sessions(note_id: i64, limit: Option<i64>) -> Result<Vec<Session>, String> {
    let db = get_db().await?;
    let lim = limit.unwrap_or(10);
    db.list_recent_sessions(note_id, lim).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn restore_session(session_id: i64) -> Result<String, String> {
    let db = get_db().await?;
    let session = db.get_session(session_id).await.map_err(|e| e.to_string())?;
    Ok(session.session_data)
}

// ═══════════════════════════════════════════════════════════════
// Style Profile commands
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn extract_style_profile(book_id: i64) -> Result<String, String> {
    let db = get_db().await?;
    let texts = db.get_book_notes_text(book_id).await.map_err(|e| e.to_string())?;

    if texts.is_empty() {
        return Ok(serde_json::json!({
            "status": "no_data",
            "message": "No notes found for this book. Write some notes first."
        }).to_string());
    }

    let combined = texts.join("\n\n");

    // Average sentence length
    let sentences: Vec<&str> = combined.split_inclusive(&['.', '!', '?', '\n'])
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    let sentence_count = sentences.len();
    let avg_sentence_len = if sentence_count > 0 {
        sentences.iter().map(|s| s.split_whitespace().count()).sum::<usize>() as f64 / sentence_count as f64
    } else { 0.0 };

    // Word frequency
    let words: Vec<&str> = combined.split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|w| w.len() > 2)
        .collect();
    let mut freq_map = std::collections::HashMap::new();
    for w in &words {
        *freq_map.entry(w.to_lowercase()).or_insert(0) += 1;
    }
    let mut freq_vec: Vec<_> = freq_map.into_iter().collect();
    freq_vec.sort_by(|a, b| b.1.cmp(&a.1));

    // Top 30 high-frequency words
    let high_freq_words: Vec<serde_json::Value> = freq_vec.iter().take(30).map(|(word, count)| {
        serde_json::json!({"word": word, "count": count})
    }).collect();

    // Heading density (lines that look like headings: short, no ending punctuation)
    let lines: Vec<&str> = combined.lines().collect();
    let total_lines = lines.len();
    let heading_lines = lines.iter().filter(|l| {
        let t = l.trim();
        t.len() > 2 && t.len() < 80 && !t.ends_with('.') && !t.ends_with(',')
    }).count();
    let heading_density = if total_lines > 0 {
        heading_lines as f64 / total_lines as f64
    } else { 0.0 };

    // Terminology density (capitalized words ratio)
    let capitalized_words = words.iter().filter(|w| {
        w.chars().next().map_or(false, |c| c.is_uppercase())
    }).count();
    let term_density = if !words.is_empty() {
        capitalized_words as f64 / words.len() as f64
    } else { 0.0 };

    // Paragraph length distribution
    let paragraphs: Vec<&str> = combined.split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    let para_lengths: Vec<usize> = paragraphs.iter().map(|p| p.split_whitespace().count()).collect();
    let para_count = para_lengths.len();
    let avg_para_len = if para_count > 0 {
        para_lengths.iter().sum::<usize>() as f64 / para_count as f64
    } else { 0.0 };
    let min_para_len = para_lengths.iter().min().copied().unwrap_or(0);
    let max_para_len = para_lengths.iter().max().copied().unwrap_or(0);

    // Build distribution buckets
    let mut buckets = vec![0usize; 6]; // 0-10, 10-25, 25-50, 50-100, 100-250, 250+
    let bucket_labels = ["0-10", "10-25", "25-50", "50-100", "100-250", "250+"];
    for len in &para_lengths {
        match *len {
            0..=10 => buckets[0] += 1,
            11..=25 => buckets[1] += 1,
            26..=50 => buckets[2] += 1,
            51..=100 => buckets[3] += 1,
            101..=250 => buckets[4] += 1,
            _ => buckets[5] += 1,
        }
    }
    let distribution: Vec<serde_json::Value> = bucket_labels.iter().enumerate().map(|(i, label)| {
        serde_json::json!({"range": label, "count": buckets[i]})
    }).collect();

    let profile = serde_json::json!({
        "summary": {
            "total_notes": texts.len(),
            "total_words": words.len(),
            "total_sentences": sentence_count,
            "total_paragraphs": para_count,
        },
        "avg_sentence_length": format!("{:.1}", avg_sentence_len),
        "high_freq_words": high_freq_words,
        "heading_density": format!("{:.4}", heading_density),
        "heading_density_interpretation": if heading_density > 0.3 {
            "High — your writing uses many headings/section breaks"
        } else if heading_density > 0.1 {
            "Moderate — balanced structure"
        } else {
            "Low — consider adding more section breaks"
        },
        "terminology_density": format!("{:.4}", term_density),
        "terminology_density_interpretation": if term_density > 0.15 {
            "High — your writing uses many proper nouns or technical terms"
        } else {
            "Normal — standard vocabulary usage"
        },
        "paragraph_length": {
            "avg_words": format!("{:.1}", avg_para_len),
            "min_words": min_para_len,
            "max_words": max_para_len,
            "distribution": distribution,
        },
    });

    let profile_str = profile.to_string();
    db.save_style_profile(book_id, &profile_str).await.map_err(|e| e.to_string())?;
    Ok(profile_str)
}

#[tauri::command]
async fn get_style_profile(book_id: i64) -> Result<Option<db::StyleProfile>, String> {
    let db = get_db().await?;
    db.get_style_profile(book_id).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
// App Entry Point
// ═══════════════════════════════════════════════════════════════

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[allow(unused_variables)]
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Failed to apply vibrancy");

            let docs_path = get_trace_docs_path();
            println!("TraceDocs folder: {:?}", docs_path);

            // Initial indexing on startup
            let search_engine = Arc::clone(&SEARCH_ENGINE);
            let docs_path_clone = docs_path.clone();
            tauri::async_runtime::spawn(async move {
                match search_engine.index_directory(&docs_path_clone) {
                    Ok(count) => println!("Initial indexing complete: {} files", count),
                    Err(e) => eprintln!("Initial indexing failed: {}", e),
                }
            });

            // Start file watcher
            let search_engine = Arc::clone(&SEARCH_ENGINE);
            std::thread::spawn(move || {
                match FileWatcher::new(&docs_path, search_engine) {
                    Ok(_watcher) => {
                        println!("File watcher started successfully");
                        loop {
                            std::thread::sleep(std::time::Duration::from_secs(1));
                        }
                    }
                    Err(e) => eprintln!("Failed to start file watcher: {}", e),
                }
            });

            // Initialize SQLite DB and create tables
            let db_path = get_db_path();
            tauri::async_runtime::spawn(async move {
                match Database::new(&db_path).await {
                    Ok(db) => {
                        if let Err(e) = db.create_tables().await {
                            eprintln!("Failed to create core tables: {:?}", e);
                        }
                        if let Err(e) = db.create_block_table().await {
                            eprintln!("Failed to create block/version tables: {:?}", e);
                        }
                        println!("Database initialized successfully");
                    }
                    Err(e) => eprintln!("Failed to initialize DB: {:?}", e),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Search & index
            search_local_files,
            get_docs_folder,
            reindex_files,
            open_file,
            compact_index,
            cleanup_old_entries,
            get_index_stats,
            list_all_files,
            // Document parsing
            parse_document,
            get_file_summary,
            search_documents,
            get_document_chunks,
            summarize_document,
            get_related_documents,
            // Books
            list_books,
            create_book,
            rename_book,
            delete_book,
            create_book_folder,
            delete_book_folder,
            // Files
            list_files_by_book,
            get_file_detail,
            delete_file,
            sync_library,
            select_files,
            copy_file_to_book,
            list_book_files,
            // Document persistence
            parse_and_store_document,
            get_document_chunks_from_db,
            get_document_metadata,
            // Notes
            create_note,
            get_note,
            update_note,
            delete_note,
            list_notes_by_book,
            // Note sources
            add_note_source,
            get_note_sources,
            remove_note_source,
            // AI context
            build_ai_context,
            generate_with_context,
            retry_generation,
            // Blocks
            create_block,
            update_block,
            delete_block,
            list_blocks_by_note,
            reorder_blocks,
            // Snapshots
            create_snapshot,
            list_snapshots_by_note,
            get_snapshot,
            restore_snapshot,
            // Sessions
            save_session,
            list_recent_sessions,
            restore_session,
            // Style profile
            extract_style_profile,
            get_style_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
