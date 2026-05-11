use crate::state;
use crate::search::{SearchResult, DocumentSearchResult};

#[tauri::command]
pub(crate) async fn search_local_files(query: String) -> Result<Vec<SearchResult>, String> {
    state::SEARCH_ENGINE.search(&query, 50).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn get_docs_folder() -> Result<String, String> {
    Ok(state::get_trace_docs_path().to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) async fn reindex_files() -> Result<usize, String> {
    let docs_path = state::get_trace_docs_path();
    state::SEARCH_ENGINE.index_directory(&docs_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn open_file(path: String) -> Result<(), String> {
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
pub(crate) async fn compact_index() -> Result<String, String> {
    state::SEARCH_ENGINE.compact_index().map_err(|e| e.to_string())?;
    Ok("Index compaction complete".to_string())
}

#[tauri::command]
pub(crate) async fn cleanup_old_entries() -> Result<usize, String> {
    state::SEARCH_ENGINE.cleanup_old_entries().map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_index_stats() -> Result<crate::search::IndexStats, String> {
    state::SEARCH_ENGINE.get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn list_all_files() -> Result<Vec<SearchResult>, String> {
    state::SEARCH_ENGINE.search("*", 1000)
        .or_else(|_| state::SEARCH_ENGINE.search("", 1000))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn search_documents(query: String, scope: Option<String>, limit: Option<u32>) -> Result<Vec<DocumentSearchResult>, String> {
    let lim = limit.unwrap_or(10) as usize;
    state::SEARCH_ENGINE.search_documents(&query, scope.as_deref(), lim).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_document_chunks(file_path: String, chunk_size: Option<usize>) -> Result<Vec<String>, String> {
    let size = chunk_size.unwrap_or(1000);
    state::SEARCH_ENGINE.get_document_chunks(&file_path, size).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn summarize_document(file_path: String) -> Result<String, String> {
    state::SEARCH_ENGINE.summarize_document(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_related_documents(file_path: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let lim = limit.unwrap_or(5);
    state::SEARCH_ENGINE.get_related_documents(&file_path, lim).map_err(|e| e.to_string())
}
