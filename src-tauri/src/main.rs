// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod search;
mod watcher;
mod parser;
mod db;

use once_cell::sync::Lazy;
use parser::ParsedDocument;
use search::{SearchEngine, SearchResult};
use db::{Database, Note, NoteSource, Block, VersionHistory, Session};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use watcher::FileWatcher;

// Global search engine instance
static SEARCH_ENGINE: Lazy<Arc<SearchEngine>> = Lazy::new(|| {
    let index_path = get_index_path();
    Arc::new(SearchEngine::new(&index_path).expect("Failed to initialize search engine"))
});

/// Get the path for the Tantivy index
fn get_index_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Trace");
    path.push("index");
    path
}

/// Get the TraceDocs folder path in user's home directory
fn get_trace_docs_path() -> PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("TraceDocs");
    
    // Create the directory if it doesn't exist
    if !path.exists() {
        std::fs::create_dir_all(&path).ok();
    }
    
    path
}

/// Tauri command: Search local files
#[tauri::command]
async fn search_local_files(query: String) -> Result<Vec<SearchResult>, String> {
    let start = std::time::Instant::now();
    
    // Perform search
    let results = SEARCH_ENGINE
        .search(&query, 50)
        .map_err(|e| e.to_string())?;
    
    let elapsed = start.elapsed();
    println!("Search completed in {:?} for query: '{}'", elapsed, query);
    
    Ok(results)
}

/// Tauri command: Get the TraceDocs folder path
#[tauri::command]

/// Tauri command: Create a block (block-level content)
async fn get_docs_folder() -> Result<String, String> {
    let path = get_trace_docs_path();
    Ok(path.to_string_lossy().to_string())
}

/// Tauri command: Reindex all files
#[tauri::command]
async fn reindex_files() -> Result<usize, String> {
    let docs_path = get_trace_docs_path();
    let count = SEARCH_ENGINE
        .index_directory(&docs_path)
        .map_err(|e| e.to_string())?;
    
    println!("Indexed {} files", count);
    Ok(count)
}


/// Tauri command: Open file in default application
#[tauri::command]
async fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()

            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")

            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Tauri command: Compact index to reduce disk usage

#[tauri::command]
async fn compact_index() -> Result<String, String> {
    SEARCH_ENGINE
        .compact_index()
        .map_err(|e| e.to_string())?;
    
    Ok("Index compaction complete".to_string())
}


/// Tauri command: Clean up old cached entries (LRU policy)
#[tauri::command]
async fn cleanup_old_entries() -> Result<usize, String> {
    let deleted = SEARCH_ENGINE
        .cleanup_old_entries()
        .map_err(|e| e.to_string())?;
    
    Ok(deleted)
}

/// Tauri command: Get index statistics
#[tauri::command]
async fn get_index_stats() -> Result<search::IndexStats, String> {
    SEARCH_ENGINE
        .get_stats()

        .map_err(|e| e.to_string())
}

/// Tauri command: Parse document and get structured content
/// Robust file bridge with UTF-8 support and error resilience
#[tauri::command]
async fn parse_document(file_path: String) -> Result<ParsedDocument, String> {
    use std::path::PathBuf;
    use std::fs;
    

    // Convert to PathBuf for proper UTF-8 handling (supports Chinese characters)
    let path = PathBuf::from(&file_path);
    
    println!("Attempting to open: {:?}", path);
    
    // Verify file exists before attempting to parse
    if !path.exists() {
        let error_msg = format!("File not found: {:?}", path);
        eprintln!("{}", error_msg);
        return Err(error_msg);
    }
    
    // Verify file is readable
    match fs::metadata(&path) {
        Ok(metadata) => {
            if !metadata.is_file() {
                let error_msg = format!("Path is not a file: {:?}", path);
                eprintln!("{}", error_msg);
                return Err(error_msg);
            }
            println!("File size: {} bytes", metadata.len());
        }
        Err(e) => {
            let error_msg = format!("Cannot access file metadata: {:?} - {}", path, e);
            eprintln!("{}", error_msg);
            return Err(error_msg);
        }
    }
    
    // Attempt to parse with detailed error handling
    match parser::parse_document(&path) {
        Ok(parsed) => {
            println!("Successfully parsed: {:?} ({} words)", path, parsed.metadata.word_count);
            Ok(parsed)
        }
        Err(e) => {
            let error_msg = format!("Failed to parse {:?}: {}", path, e);
            eprintln!("{}", error_msg);
            Err(error_msg)
        }
    }
}

/// Tauri command: Get quick file summary
#[tauri::command]
async fn get_file_summary(file_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    Ok(parser::get_file_summary(path))
}

/// Tauri command: List all indexed files
#[tauri::command]
async fn list_all_files() -> Result<Vec<SearchResult>, String> {
    // Search with wildcard to get all files
    SEARCH_ENGINE
        .search("*", 100)
        .or_else(|_| {
            // If wildcard doesn't work, try empty query
            SEARCH_ENGINE.search("", 100)
        })
        .map_err(|e| e.to_string())
}

/// Tauri command: Create a book folder
#[tauri::command]
async fn create_book_folder(book_id: String) -> Result<String, String> {
    let mut path = get_trace_docs_path();
    path.push(&book_id);
    
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create book folder: {}", e))?;
    
    Ok(path.to_string_lossy().to_string())
}

/// Tauri command: Delete a book folder and all its files
#[tauri::command]
async fn delete_book_folder(book_id: String) -> Result<(), String> {
    let mut path = get_trace_docs_path();
    path.push(&book_id);
    
    if path.exists() {
        std::fs::remove_dir_all(&path)
            .map_err(|e| format!("Failed to delete book folder: {}", e))?;
    }
    
    Ok(())
}

/// Tauri command: Select files using native file dialog
#[tauri::command]
async fn select_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let files = app.dialog()
        .file()
        .add_filter("Documents", &["pdf", "docx", "doc", "pptx", "ppt", "txt"])
        .set_title("Select Files to Upload")
        .blocking_pick_files();
    
    match files {
        Some(paths) => {
            let file_paths: Vec<String> = paths
                .into_iter()
                .map(|p| p.to_string())
                .collect();
            Ok(file_paths)
        }
        None => Ok(Vec::new()),
    }
}

/// Tauri command: Copy file to book folder
#[tauri::command]
async fn copy_file_to_book(file_path: String, book_id: String) -> Result<String, String> {
    use std::path::Path;
    
    let source = Path::new(&file_path);
    if !source.exists() {
        return Err(format!("Source file does not exist: {}", file_path));
    }
    
    let file_name = source
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();
    
    let mut dest_dir = get_trace_docs_path();
    dest_dir.push(&book_id);
    
    // Create book folder if it doesn't exist
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Failed to create book folder: {}", e))?;
    
    let mut dest_path = dest_dir.clone();
    dest_path.push(&file_name);
    
    // Handle duplicate file names
    let mut counter = 1;
    let stem = source.file_stem().unwrap().to_string_lossy().to_string();
    let extension = source.extension().map(|e| e.to_string_lossy().to_string());
    
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
    
    // Copy the file
    std::fs::copy(&source, &dest_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;
    
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

/// Tauri command: List files in a specific book folder
#[tauri::command]
async fn list_book_files(book_id: String) -> Result<Vec<SearchResult>, String> {
    let mut book_path = get_trace_docs_path();
    book_path.push(&book_id);
    
    if !book_path.exists() {
        return Ok(Vec::new());
    }
    
    // Get all files and filter by book path
    let all_files = SEARCH_ENGINE
        .search("*", 1000)
        .or_else(|_| SEARCH_ENGINE.search("", 1000))
        .map_err(|e| e.to_string())?;
    
    let book_path_str = book_path.to_string_lossy().to_string();
    let filtered: Vec<SearchResult> = all_files
        .into_iter()
        .filter(|f| f.path.starts_with(&book_path_str))
        .collect();
    
    Ok(filtered)
}

#[tauri::command]
async fn create_note(database_url: &str, note: Note) -> Result<(), String> {
    let db = Database::new(database_url).await.map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO notes (book_id, title, content_json, plain_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);"
    )
    .bind(note.book_id)
    .bind(&note.title)
    .bind(&note.content_json)
    .bind(&note.plain_text)
    .bind(&note.created_at)
    .bind(&note.updated_at)
    .execute(&db.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn list_notes_by_book(database_url: &str, book_id: i64) -> Result<Vec<Note>, String> {
    let db = Database::new(database_url).await.map_err(|e| e.to_string())?;
    let notes = sqlx::query_as!(Note, "SELECT * FROM notes WHERE book_id = ?", book_id)
        .fetch_all(&db.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(notes)
}

#[tauri::command]
async fn build_ai_context(database_url: &str, note_id: i64) -> Result<String, String> {
    let db = Database::new(database_url).await.map_err(|e| e.to_string())?;
    let note_sources = sqlx::query_as!(NoteSource, "SELECT * FROM note_sources WHERE note_id = ?", note_id)
        .fetch_all(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let context = note_sources
        .into_iter()
        .map(|source| format!("File ID: {}, Chunk ID: {}, Quote: {}", source.file_id, source.chunk_id, source.quote_text))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(context)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            
            // Apply vibrancy effects
            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            #[cfg(target_os = "windows")]
            apply_vibrancy(&window, None)
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on Windows");

            // Initialize search engine and index files
            let docs_path = get_trace_docs_path();
            println!("TraceDocs folder: {:?}", docs_path);
            
            // Index existing files on startup
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
                        // Keep the watcher alive
                        loop {
                            std::thread::sleep(std::time::Duration::from_secs(1));
                        }
                    }
                    Err(e) => eprintln!("Failed to start file watcher: {}", e),
                }
            });

                    // Initialize or migrate local SQLite DB (create tables)
                    let docs_path_for_db = docs_path.clone();
                    tauri::async_runtime::spawn(async move {
                        let mut db_path = docs_path_for_db;
                        db_path.push("trace.db");
                        let db_url = format!("sqlite://{}", db_path.to_string_lossy());

                        match Database::new(&db_url).await {
                            Ok(db) => {
                                if let Err(e) = db.create_tables().await {
                                    eprintln!("Failed to create core tables: {:?}", e);
                                }
                                if let Err(e) = db.create_block_table().await {
                                    eprintln!("Failed to create block/version tables: {:?}", e);
                                }
                            }
                            Err(e) => eprintln!("Failed to initialize DB: {:?}", e),
                        }
                    });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            create_note,
            list_notes_by_book,
            build_ai_context,
            create_block,
            list_blocks_by_note,
            create_snapshot,
            list_snapshots_by_note,
            restore_snapshot,
            save_session,
            list_recent_sessions,
            restore_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

