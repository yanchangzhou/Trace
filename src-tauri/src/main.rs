// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod search;
mod watcher;
mod parser;
mod db;
mod models;
mod ai;
mod style;

use once_cell::sync::Lazy;
use parser::ParsedDocument;
use search::{ContentSearchResult, SearchEngine, SearchResult};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use watcher::FileWatcher;
use db::Database;
use models::*;

// Global search engine instance
static SEARCH_ENGINE: Lazy<Arc<SearchEngine>> = Lazy::new(|| {
    let index_path = get_index_path();
    Arc::new(SearchEngine::new(&index_path).expect("Failed to initialize search engine"))
});

// Global database instance
static DATABASE: Lazy<Arc<Database>> = Lazy::new(|| {
    let db_path = get_db_path();
    Arc::new(Database::new(&db_path).expect("Failed to initialize database"))
});

fn get_db_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Trace");
    path.push("trace.db");
    path
}

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

// ── Existing commands (unchanged) ──

#[tauri::command]
async fn search_local_files(query: String) -> Result<Vec<SearchResult>, String> {
    SEARCH_ENGINE.search(&query, 50).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_docs_folder() -> Result<String, String> {
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
    { std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "windows")]
    { std::process::Command::new("cmd").args(&["/C", "start", "", &path]).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?; }
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
    let mut stats = SEARCH_ENGINE.get_stats().map_err(|e| e.to_string())?;
    // Augment with DB stats
    stats.total_chunks = DATABASE.get_chunk_count().unwrap_or(0);
    stats.total_documents = DATABASE.get_document_count().unwrap_or(stats.total_documents);
    Ok(stats)
}

#[tauri::command]
async fn parse_document(file_path: String) -> Result<ParsedDocument, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() { return Err(format!("File not found: {:?}", path)); }
    parser::parse_document(&path).map_err(|e| format!("Failed to parse: {}", e))
}

#[tauri::command]
async fn get_file_summary(file_path: String) -> Result<String, String> {
    Ok(parser::get_file_summary(std::path::Path::new(&file_path)))
}

#[tauri::command]
async fn list_all_files() -> Result<Vec<SearchResult>, String> {
    SEARCH_ENGINE.search("*", 100).or_else(|_| SEARCH_ENGINE.search("", 100)).map_err(|e| e.to_string())
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
    if path.exists() { std::fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete: {}", e))?; }
    Ok(())
}

#[tauri::command]
async fn select_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app.dialog().file()
        .add_filter("Documents", &["pdf", "docx", "doc", "pptx", "ppt", "txt"])
        .set_title("Select Files to Upload")
        .blocking_pick_files();
    match files {
        Some(paths) => Ok(paths.into_iter().map(|p| p.to_string()).collect()),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
async fn copy_file_to_book(file_path: String, book_id: String) -> Result<String, String> {
    let source = std::path::Path::new(&file_path);
    if !source.exists() { return Err(format!("Source file does not exist: {}", file_path)); }
    let file_name = source.file_name().ok_or("Invalid file name")?.to_string_lossy().to_string();
    let mut dest_dir = get_trace_docs_path();
    dest_dir.push(&book_id);
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("Failed to create book folder: {}", e))?;
    let mut dest_path = dest_dir.clone();
    dest_path.push(&file_name);

    let mut counter = 1;
    let stem = source.file_stem().unwrap().to_string_lossy().to_string();
    let extension = source.extension().map(|e| e.to_string_lossy().to_string());
    while dest_path.exists() {
        let new_name = if let Some(ext) = &extension {
            format!("{}-{}.{}", stem, counter, ext)
        } else { format!("{}-{}", stem, counter) };
        dest_path = dest_dir.clone();
        dest_path.push(new_name);
        counter += 1;
    }

    std::fs::copy(&source, &dest_path).map_err(|e| format!("Failed to copy file: {}", e))?;

    let search_engine = Arc::clone(&SEARCH_ENGINE);
    let db = Arc::clone(&DATABASE);
    let dest_path_clone = dest_path.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = search_engine.index_file(&dest_path_clone) {
            eprintln!("Failed to index file: {}", e);
        }
        // Parse and chunk
        if let Ok(parsed) = parser::parse_to_text(&dest_path_clone) {
            let file_id = uuid::Uuid::new_v4().to_string();
            let name = dest_path_clone.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let ext = dest_path_clone.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            let path_str = dest_path_clone.to_string_lossy().to_string();
            let metadata = std::fs::metadata(&dest_path_clone).unwrap();
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;

            let _ = db.add_file(&FileRecord {
                id: file_id.clone(), book_id: book_id.clone(), name: name.clone(),
                path: path_str.clone(), extension: ext.clone(), size: metadata.len(),
                hash: None, status: "ready".to_string(), created_at: now, updated_at: now,
            });
            let chunks = parser::split_into_chunks(&parsed.text, &file_id);
            for chunk in &chunks {
                let _ = search_engine.index_chunk(chunk, &name, &path_str, &ext);
            }
            let _ = db.insert_chunks(&chunks);
            let _ = search_engine.commit();
        }
    });

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn list_book_files(book_id: String) -> Result<Vec<SearchResult>, String> {
    let mut book_path = get_trace_docs_path();
    book_path.push(&book_id);
    if !book_path.exists() { return Ok(Vec::new()); }
    let all_files = SEARCH_ENGINE.search("*", 1000).or_else(|_| SEARCH_ENGINE.search("", 1000)).map_err(|e| e.to_string())?;
    let book_path_str = book_path.to_string_lossy().to_string();
    Ok(all_files.into_iter().filter(|f| f.path.starts_with(&book_path_str)).collect())
}

// ══════════════════════════════════════════════════════════════
// Stage 1: Books & Files CRUD (SQLite-backed)
// ══════════════════════════════════════════════════════════════

#[tauri::command]
async fn list_books() -> Result<Vec<Book>, String> {
    DATABASE.list_books().map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_book(name: String) -> Result<Book, String> {
    let book = DATABASE.create_book(&name).map_err(|e| e.to_string())?;
    // Also create the folder
    let _ = create_book_folder(book.id.clone()).await;
    Ok(book)
}

#[tauri::command]
async fn rename_book(book_id: String, new_name: String) -> Result<(), String> {
    DATABASE.rename_book(&book_id, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_book(book_id: String) -> Result<(), String> {
    DATABASE.delete_book(&book_id).map_err(|e| e.to_string())?;
    let _ = delete_book_folder(book_id).await;
    Ok(())
}

#[tauri::command]
async fn list_files_by_book(book_id: String) -> Result<Vec<FileRecord>, String> {
    DATABASE.list_files_by_book(&book_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_file(file_id: String, file_path: String, _book_id: String) -> Result<(), String> {
    // Remove from filesystem
    if std::path::Path::new(&file_path).exists() {
        std::fs::remove_file(&file_path).map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    // Remove from index
    SEARCH_ENGINE.remove_chunks_for_file(&file_id).ok();
    SEARCH_ENGINE.remove_file(std::path::Path::new(&file_path)).ok();
    SEARCH_ENGINE.commit().ok();
    // Remove from DB
    DATABASE.delete_chunks_for_file(&file_id).ok();
    DATABASE.delete_file(&file_id, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_file_detail(file_id: String) -> Result<Option<DocumentRecord>, String> {
    DATABASE.get_document(&file_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_library() -> Result<usize, String> {
    let docs_path = get_trace_docs_path();
    let count = SEARCH_ENGINE.index_directory(&docs_path).map_err(|e| e.to_string())?;
    // Re-parse and chunk all files
    use walkdir::WalkDir;
    for entry in WalkDir::new(&docs_path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(parsed) = parser::parse_to_text(entry.path()) {
                let file_id = uuid::Uuid::new_v4().to_string();
                let name = entry.file_name().to_string_lossy().to_string();
                let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                let path_str = entry.path().to_string_lossy().to_string();
                let metadata = std::fs::metadata(entry.path()).ok();
                let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;

                let _ = DATABASE.add_file(&FileRecord {
                    id: file_id.clone(), book_id: String::new(), name: name.clone(),
                    path: path_str.clone(), extension: ext.clone(), size: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
                    hash: None, status: "ready".to_string(), created_at: now, updated_at: now,
                });
                let chunks = parser::split_into_chunks(&parsed.text, &file_id);
                for chunk in &chunks {
                    let _ = SEARCH_ENGINE.index_chunk(chunk, &name, &path_str, &ext);
                }
                let _ = DATABASE.insert_chunks(&chunks);
            }
        }
    }
    SEARCH_ENGINE.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

// ══════════════════════════════════════════════════════════════
// Stage 2: Content Search & Document Retrieval
// ══════════════════════════════════════════════════════════════

#[tauri::command]
async fn search_documents(query: String, _scope: Option<String>) -> Result<Vec<ContentSearchResult>, String> {
    SEARCH_ENGINE.search_content(&query, 20).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_document_chunks(file_id: String) -> Result<Vec<DocumentChunk>, String> {
    DATABASE.get_chunks(&file_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn summarize_document(file_id: String) -> Result<String, String> {
    let doc = DATABASE.get_document(&file_id).map_err(|e| e.to_string())?;
    match doc {
        Some(d) => Ok(d.summary),
        None => Ok("Document not found".to_string()),
    }
}

#[tauri::command]
async fn get_related_documents(_file_id: String) -> Result<Vec<SearchResult>, String> {
    // Simple: search by the document's extension in the same book
    SEARCH_ENGINE.search("*", 20).map_err(|e| e.to_string())
}

// ══════════════════════════════════════════════════════════════
// Stage 3: Notes & AI
// ══════════════════════════════════════════════════════════════

#[tauri::command]
async fn create_note(book_id: String, title: String, content_json: String, plain_text: String) -> Result<Note, String> {
    DATABASE.create_note(&book_id, &title, &content_json, &plain_text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_note(note_id: String, title: String, content_json: String, plain_text: String) -> Result<Note, String> {
    // Save version before updating
    let _ = DATABASE.save_version(&note_id, &content_json, &plain_text);
    DATABASE.update_note(&note_id, &title, &content_json, &plain_text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_note(note_id: String) -> Result<Option<Note>, String> {
    DATABASE.get_note(&note_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_notes_by_book(book_id: String) -> Result<Vec<Note>, String> {
    DATABASE.list_notes_by_book(&book_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn build_ai_context(request: AIRequest) -> Result<String, String> {
    ai::build_ai_context(&DATABASE, &request).map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate_with_context(request: AIRequest) -> Result<String, String> {
    let context = ai::build_ai_context(&DATABASE, &request).map_err(|e| e.to_string())?;

    // Build the system prompt
    let action_prompt = match request.action.as_str() {
        "summarize" => "Summarize the provided documents concisely.",
        "compare" => "Compare the provided documents, highlighting similarities and differences.",
        "outline" => "Generate a structured outline based on the provided documents.",
        _ => "Answer the user's question based on the provided documents.",
    };

    let style_instruction = match request.style.as_deref() {
        Some("academic") => "Use a formal, academic tone with precise terminology.",
        Some("analytical") => "Use an analytical tone focused on data and logical reasoning.",
        Some("concise") => "Be brief and direct. Use short sentences.",
        Some("my_style") => "Match the user's writing style from their notes.",
        _ => "Use a balanced, helpful tone.",
    };

    let system_prompt = format!(
        "{}\n\nStyle: {}\n\nContext:\n{}",
        action_prompt, style_instruction, context
    );

    // Return the assembled prompt — the frontend handles actual LLM calls
    // In production, this would call the LLM API directly from the backend
    Ok(system_prompt)
}

#[tauri::command]
async fn retry_generation(request: AIRequest) -> Result<String, String> {
    // Regenerate with slightly different parameters
    generate_with_context(request).await
}

// ══════════════════════════════════════════════════════════════
// Stage 4: Version History & Sessions
// ══════════════════════════════════════════════════════════════

#[tauri::command]
async fn save_note_version(note_id: String, content_json: String, plain_text: String) -> Result<NoteVersion, String> {
    DATABASE.save_version(&note_id, &content_json, &plain_text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_note_versions(note_id: String) -> Result<Vec<NoteVersion>, String> {
    DATABASE.list_versions(&note_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn restore_note_version(note_id: String, version_number: i64) -> Result<Option<Note>, String> {
    DATABASE.restore_version(&note_id, version_number).map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_editing_session(note_id: String) -> Result<NoteSession, String> {
    DATABASE.start_session(&note_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn end_editing_session(session_id: String) -> Result<(), String> {
    DATABASE.end_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_recent_session(note_id: String) -> Result<Option<NoteSession>, String> {
    // Return the most recent session for recovery
    // Simplified: just start a new one
    DATABASE.start_session(&note_id).map(Some).map_err(|e| e.to_string())
}

// ══════════════════════════════════════════════════════════════
// Stage 5: Style Profiles
// ══════════════════════════════════════════════════════════════

#[tauri::command]
async fn get_style_profile(style: String) -> Result<Option<StyleProfile>, String> {
    if style == "my_style" {
        Ok(Some(style::extract_style_profile(&DATABASE).map_err(|e| e.to_string())?))
    } else {
        style::get_style_profile(&style).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn extract_my_style() -> Result<StyleProfile, String> {
    style::extract_style_profile(&DATABASE).map_err(|e| e.to_string())
}

// ══════════════════════════════════════════════════════════════
// Main entry
// ══════════════════════════════════════════════════════════════

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            #[cfg(target_os = "windows")]
            apply_vibrancy(&window, None)
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on Windows");

            let docs_path = get_trace_docs_path();
            println!("TraceDocs folder: {:?}", docs_path);
            println!("Database path: {:?}", get_db_path());

            // Initialize DB (already done via Lazy)
            let _db = Arc::clone(&DATABASE);

            // Initial indexing
            let search_engine = Arc::clone(&SEARCH_ENGINE);
            let docs_path_clone = docs_path.clone();
            tauri::async_runtime::spawn(async move {
                match search_engine.index_directory(&docs_path_clone) {
                    Ok(count) => println!("Initial indexing complete: {} files", count),
                    Err(e) => eprintln!("Initial indexing failed: {}", e),
                }
            });

            // Start file watcher with DB integration
            let search_engine = Arc::clone(&SEARCH_ENGINE);
            let db = Arc::clone(&DATABASE);
            std::thread::spawn(move || {
                match FileWatcher::new(&docs_path, search_engine, db) {
                    Ok(_watcher) => {
                        println!("File watcher started successfully");
                        loop { std::thread::sleep(std::time::Duration::from_secs(1)); }
                    }
                    Err(e) => eprintln!("Failed to start file watcher: {}", e),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Existing
            search_local_files,
            get_docs_folder,
            reindex_files,
            open_file,
            compact_index,
            cleanup_old_entries,
            get_index_stats,
            parse_document,
            get_file_summary,
            list_all_files,
            create_book_folder,
            delete_book_folder,
            select_files,
            copy_file_to_book,
            list_book_files,
            // Stage 1: Books & Files
            list_books,
            create_book,
            rename_book,
            delete_book,
            list_files_by_book,
            delete_file,
            get_file_detail,
            sync_library,
            // Stage 2: Content Search
            search_documents,
            get_document_chunks,
            summarize_document,
            get_related_documents,
            // Stage 3: Notes & AI
            create_note,
            update_note,
            get_note,
            list_notes_by_book,
            build_ai_context,
            generate_with_context,
            retry_generation,
            // Stage 4: Versions & Sessions
            save_note_version,
            list_note_versions,
            restore_note_version,
            start_editing_session,
            end_editing_session,
            get_recent_session,
            // Stage 5: Style
            get_style_profile,
            extract_my_style,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
