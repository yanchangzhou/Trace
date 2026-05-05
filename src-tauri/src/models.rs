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
    pub created_at: i64,
    pub updated_at: i64,
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
pub struct NoteSource {
    pub note_id: String,
    pub file_id: String,
    pub chunk_id: Option<String>,
    pub quote_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIRequest {
    pub action: String,
    pub context_file_ids: Vec<String>,
    pub style: Option<String>,
    pub prompt: Option<String>,
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
