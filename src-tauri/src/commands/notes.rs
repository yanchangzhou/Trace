use crate::db::{Note, NoteSource};
use crate::state;

#[tauri::command]
pub(crate) async fn create_note(book_id: i64, title: String, content_json: String, plain_text: String) -> Result<i64, String> {
    let db = state::get_db().await?;
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
pub(crate) async fn get_note(note_id: i64) -> Result<Note, String> {
    let db = state::get_db().await?;
    db.get_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn update_note(note: Note) -> Result<(), String> {
    let db = state::get_db().await?;
    db.update_note(&Note { updated_at: chrono::Utc::now().to_rfc3339(), ..note })
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn delete_note(note_id: i64) -> Result<(), String> {
    let db = state::get_db().await?;
    db.delete_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn list_notes_by_book(book_id: i64) -> Result<Vec<Note>, String> {
    let db = state::get_db().await?;
    db.list_notes_by_book(book_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn add_note_source(note_id: i64, file_id: i64, chunk_id: i64, quote_text: String) -> Result<(), String> {
    let db = state::get_db().await?;
    let source = NoteSource { note_id, file_id, chunk_id, quote_text };
    db.add_note_source(&source).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_note_sources(note_id: i64) -> Result<Vec<NoteSource>, String> {
    let db = state::get_db().await?;
    db.get_note_sources(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn remove_note_source(note_id: i64, file_id: i64, chunk_id: i64) -> Result<(), String> {
    let db = state::get_db().await?;
    db.remove_note_source(note_id, file_id, chunk_id).await.map_err(|e| e.to_string())
}
