use crate::db::{VersionHistory, Session};
use crate::state;

// ── Snapshots ──

#[tauri::command]
pub(crate) async fn create_snapshot(note_id: i64, snapshot: String) -> Result<i64, String> {
    let db = state::get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let vh = VersionHistory { id: 0, note_id, snapshot, created_at: now };
    db.save_version_history(&vh).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn list_snapshots_by_note(note_id: i64) -> Result<Vec<VersionHistory>, String> {
    let db = state::get_db().await?;
    db.list_snapshots_by_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_snapshot(snapshot_id: i64) -> Result<VersionHistory, String> {
    let db = state::get_db().await?;
    db.get_snapshot(snapshot_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn restore_snapshot(snapshot_id: i64) -> Result<String, String> {
    let db = state::get_db().await?;
    let snap = db.get_snapshot(snapshot_id).await.map_err(|e| e.to_string())?;
    Ok(snap.snapshot)
}

// ── Sessions ──

#[tauri::command]
pub(crate) async fn save_session(note_id: i64, session_data: String) -> Result<i64, String> {
    let db = state::get_db().await?;
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
pub(crate) async fn list_recent_sessions(note_id: i64, limit: Option<i64>) -> Result<Vec<Session>, String> {
    let db = state::get_db().await?;
    let lim = limit.unwrap_or(10);
    db.list_recent_sessions(note_id, lim).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn restore_session(session_id: i64) -> Result<String, String> {
    let db = state::get_db().await?;
    let session = db.get_session(session_id).await.map_err(|e| e.to_string())?;
    Ok(session.session_data)
}
