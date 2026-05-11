use crate::state;
use crate::services::style_profile;

#[tauri::command]
pub(crate) async fn extract_style_profile(
    book_id: i64,
    name: String,
    source_scope: String,
    language: String,
) -> Result<String, String> {
    style_profile::extract(book_id, &name, &source_scope, &language).await
}

#[tauri::command]
pub(crate) async fn get_style_profile(book_id: i64) -> Result<Option<crate::db::StyleProfile>, String> {
    let db = state::get_db().await?;
    db.get_style_profile(book_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn list_style_profiles(book_id: i64) -> Result<Vec<crate::db::StyleProfile>, String> {
    let db = state::get_db().await?;
    db.list_style_profiles_by_book(book_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_style_examples(profile_id: i64) -> Result<Vec<crate::db::StyleExample>, String> {
    let db = state::get_db().await?;
    db.get_style_examples(profile_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn delete_style_profile(profile_id: i64) -> Result<(), String> {
    let db = state::get_db().await?;
    db.delete_style_profile(profile_id).await.map_err(|e| e.to_string())
}
