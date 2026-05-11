use std::path::PathBuf;

use crate::parser::{ParsedDocument, DocumentData};
use crate::state;
use crate::services::document_pipeline;

#[tauri::command]
pub(crate) async fn parse_document(file_path: String) -> Result<ParsedDocument, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {:?}", path));
    }
    crate::parser::parse_document(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_file_summary(file_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    Ok(crate::parser::get_file_summary(path))
}

#[tauri::command]
pub(crate) async fn parse_and_store_document(file_id: i64, file_path: String) -> Result<DocumentData, String> {
    document_pipeline::parse_and_store(file_id, &file_path).await
}

#[tauri::command]
pub(crate) async fn get_document_chunks_from_db(file_id: i64) -> Result<Vec<crate::db::DocumentChunk>, String> {
    let db = state::get_db().await?;
    db.get_document_chunks(file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_document_metadata(file_id: i64) -> Result<Option<crate::db::Document>, String> {
    let db = state::get_db().await?;
    db.get_document_metadata(file_id).await.map_err(|e| e.to_string())
}
