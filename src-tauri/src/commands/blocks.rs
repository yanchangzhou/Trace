use crate::db::Block;
use crate::state;

#[tauri::command]
pub(crate) async fn create_block(note_id: i64, content: String, order: i32) -> Result<i64, String> {
    let db = state::get_db().await?;
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
pub(crate) async fn update_block(block: Block) -> Result<(), String> {
    let db = state::get_db().await?;
    db.update_block(&Block { updated_at: chrono::Utc::now().to_rfc3339(), ..block })
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn delete_block(block_id: i64) -> Result<(), String> {
    let db = state::get_db().await?;
    db.delete_block(block_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn list_blocks_by_note(note_id: i64) -> Result<Vec<Block>, String> {
    let db = state::get_db().await?;
    db.list_blocks_by_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn reorder_blocks(note_id: i64, block_ids: Vec<i64>) -> Result<(), String> {
    let db = state::get_db().await?;
    db.reorder_blocks(note_id, block_ids).await.map_err(|e| e.to_string())
}
