use serde::{Deserialize, Serialize};

// ── Stage 1: Books & Files ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: String,
    pub book_id: String,
    pub name: String,
    pub path: String,
    pub extension: String,
    pub size: u64,
    pub hash: Option<String>,
    pub status: String,
    #[serde(default = "default_file_role")]
    pub role: String,
    #[serde(default = "default_parse_status")]
    pub parse_status: String,
    pub parse_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn default_file_role() -> String {
    "source".to_string()
}

fn default_parse_status() -> String {
    "pending".to_string()
}

// ── Stage 2: Documents & Chunks ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentRecord {
    pub file_id: String,
    pub summary: String,
    pub word_count: usize,
    pub page_count: Option<usize>,
    pub slide_count: Option<usize>,
    pub headings_json: String,
    pub parsed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChunk {
    pub id: String,
    pub file_id: String,
    pub chunk_index: usize,
    pub text: String,
    pub token_count: usize,
    pub locator_json: String,
}

// ── Stage 3: Notes & AI ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub book_id: String,
    pub title: String,
    pub content_json: String,
    pub plain_text: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIRequest {
    pub action: String,
    pub context_file_ids: Vec<String>,
    pub style: Option<String>,
    pub prompt: Option<String>,
    pub task_type: Option<String>,
    pub style_profile_id: Option<String>,
    pub output_mode: Option<String>,
    pub audience: Option<String>,
    pub goal: Option<String>,
    pub length: Option<String>,
    pub language: Option<String>,
    pub constraints: Option<Vec<String>>,
}

// ── Stage 4: Version History & Sessions ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteVersion {
    pub id: String,
    pub note_id: String,
    pub version_number: i64,
    pub content_json: String,
    pub plain_text: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteSession {
    pub id: String,
    pub note_id: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
}

// ── Stage 5: Style Profiles ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleProfile {
    pub style: String,
    pub label: String,
    pub description: String,
    pub constraints: Vec<StyleConstraint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleConstraint {
    pub name: String,
    pub value: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedStyleProfile {
    pub id: String,
    pub name: String,
    pub source_scope: String,
    pub language: Option<String>,
    pub profile_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleExample {
    pub id: String,
    pub profile_id: String,
    pub file_id: Option<String>,
    pub note_id: Option<String>,
    pub text: String,
    pub tags_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationRun {
    pub id: String,
    pub task_type: String,
    pub style_profile_id: Option<String>,
    pub source_file_ids_json: String,
    pub model: String,
    pub prompt_json: String,
    pub output_text: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}
