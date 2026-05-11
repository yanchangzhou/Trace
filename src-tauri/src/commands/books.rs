use crate::state;

#[tauri::command]
pub(crate) async fn list_books() -> Result<Vec<crate::db::Book>, String> {
    let db = state::get_db().await?;
    db.list_books().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn create_book(name: String) -> Result<i64, String> {
    let db = state::get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = db.create_book(&name, &now).await.map_err(|e| e.to_string())?;
    let mut folder = state::get_trace_docs_path();
    folder.push(&name);
    std::fs::create_dir_all(&folder).ok();
    Ok(id)
}

#[tauri::command]
pub(crate) async fn rename_book(book_id: i64, new_name: String) -> Result<(), String> {
    let db = state::get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    db.rename_book(book_id, &new_name, &now).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn delete_book(book_id: i64) -> Result<(), String> {
    let db = state::get_db().await?;
    db.delete_book(book_id).await.map_err(|e| e.to_string())
}
