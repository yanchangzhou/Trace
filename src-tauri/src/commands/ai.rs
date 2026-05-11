use crate::services::generation::{self, WritingTask, StructuredOutput};
use crate::state;

#[tauri::command]
pub(crate) async fn assemble_ai_prompt(note_id: i64, task: WritingTask) -> Result<String, String> {
    generation::assemble_prompt(note_id, &task).await
}

#[tauri::command]
pub(crate) async fn parse_ai_output(raw_output: String) -> Result<StructuredOutput, String> {
    Ok(generation::parse_structured_output(&raw_output))
}

#[tauri::command]
pub(crate) async fn save_generation_run(
    note_id: i64,
    scene: String,
    stage: String,
    input_json: String,
    prompt_full: String,
) -> Result<i64, String> {
    let db = state::get_db().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let run = crate::db::GenerationRun {
        id: 0,
        note_id,
        scene,
        stage,
        input_json,
        prompt_full,
        output_raw: None,
        output_json: None,
        user_adopted: 0,
        created_at: now,
    };
    db.insert_generation_run(&run).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn list_generation_runs(note_id: i64) -> Result<Vec<crate::db::GenerationRun>, String> {
    let db = state::get_db().await?;
    db.list_generation_runs_by_note(note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn update_generation_output(
    run_id: i64,
    output_raw: String,
    output_json: String,
) -> Result<(), String> {
    let db = state::get_db().await?;
    db.update_generation_output(run_id, &output_raw, &output_json).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn mark_generation_adopted(run_id: i64) -> Result<(), String> {
    let db = state::get_db().await?;
    db.mark_generation_adopted(run_id).await.map_err(|e| e.to_string())
}
