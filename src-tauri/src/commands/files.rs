use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::search::SearchResult;
use crate::state;
use crate::services::document_pipeline;

#[tauri::command]
pub(crate) async fn list_files_by_book(book_id: i64) -> Result<Vec<crate::db::FileRecord>, String> {
    let db = state::get_db().await?;
    db.list_files_by_book(book_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_file_detail(file_id: i64) -> Result<Option<crate::db::FileRecord>, String> {
    let db = state::get_db().await?;
    db.get_file_detail(file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn delete_file(file_id: i64) -> Result<(), String> {
    let db = state::get_db().await?;
    db.delete_file(file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn sync_library(app: AppHandle, book_id: i64, book_path: String) -> Result<usize, String> {
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
    let db = state::get_db().await?;
    db.sync_files_for_book(book_id, files).await.map_err(|e| e.to_string())?;

    // Spawn async pipeline: parse chunks for newly-imported files → update status → emit events
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = document_pipeline::process_importing_files(book_id, app_clone).await {
            eprintln!("process_importing_files failed for book {}: {}", book_id, e);
        }
    });

    Ok(count)
}

#[tauri::command]
pub(crate) async fn create_book_folder(book_id: String) -> Result<String, String> {
    let mut path = state::get_trace_docs_path();
    path.push(&book_id);
    std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create book folder: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) async fn delete_book_folder(book_id: String) -> Result<(), String> {
    let mut path = state::get_trace_docs_path();
    path.push(&book_id);
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete book folder: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn select_files(app: AppHandle) -> Result<Vec<String>, String> {
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
pub(crate) async fn copy_file_to_book(app: AppHandle, file_path: String, book_id: String) -> Result<String, String> {
    let dest_path = document_pipeline::copy_and_index(&file_path, &book_id).await?;

    // Immediately insert a DB record with status='importing' so the file
    // is visible in the UI while parsing happens in the background.
    let db = state::get_db().await?;
    let books = db.list_books().await.map_err(|e| e.to_string())?;
    if let Some(book) = books.into_iter().find(|b| b.name == book_id) {
        let extension = std::path::Path::new(&dest_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();
        let size = std::fs::metadata(&dest_path).map(|m| m.len() as i64).unwrap_or(0);
        let files = vec![(dest_path.clone(), size, extension)];
        if let Err(e) = db.sync_files_for_book(book.id, files).await {
            eprintln!("Failed to sync file record for {:?}: {}", dest_path, e);
        } else {
            // Spawn async: parse → update status → emit events
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = document_pipeline::process_importing_files(book.id, app_clone).await {
                    eprintln!("process_importing_files failed for book {}: {}", book.id, e);
                }
            });
        }
    }

    Ok(dest_path)
}

#[tauri::command]
pub(crate) async fn list_book_files(book_id: String) -> Result<Vec<SearchResult>, String> {
    let mut book_path = state::get_trace_docs_path();
    book_path.push(&book_id);
    if !book_path.exists() {
        return Ok(Vec::new());
    }
    let all_files = state::SEARCH_ENGINE.search("*", 1000)
        .or_else(|_| state::SEARCH_ENGINE.search("", 1000))
        .map_err(|e| e.to_string())?;
    let book_path_str = book_path.to_string_lossy().to_string();
    Ok(all_files.into_iter().filter(|f| f.path.starts_with(&book_path_str)).collect())
}
