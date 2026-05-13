use anyhow::Result;
use serde::{Deserialize, Serialize};
use crate::db::Database;
use crate::models::*;

/// Truncate `s` to at most `max_len` bytes on a valid UTF-8 character boundary.
fn safe_truncate(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len { return s; }
    let mut end = max_len;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Build a context prompt from selected files and their chunks.
pub fn build_ai_context(db: &Database, request: &AIRequest) -> Result<String> {
    let mut context = String::new();
    context.push_str("## Document Context\n\n");

    for file_id in &request.context_file_ids {
        if let Some(doc) = db.get_document(file_id)? {
            context.push_str(&format!("### File: {}\n", file_id));
            context.push_str(&format!("Summary: {}\n", doc.summary));
            context.push_str(&format!("Word count: {}\n", doc.word_count));

            // Include headings
            let headings: Vec<String> = serde_json::from_str(&doc.headings_json).unwrap_or_default();
            if !headings.is_empty() {
                context.push_str("Headings:\n");
                for h in &headings {
                    context.push_str(&format!("  - {}\n", h));
                }
            }
            context.push('\n');
        }

        // Include chunks
        let chunks = db.get_chunks(file_id)?;
        if !chunks.is_empty() {
            context.push_str(&format!("### Chunks for: {}\n", file_id));
            for chunk in chunks.iter().take(10) {
                let snippet = safe_truncate(&chunk.text, 500);
                context.push_str(&format!("{}\n---\n", snippet));
            }
            context.push('\n');
        }
    }

    if request.context_file_ids.is_empty() {
        context.push_str("No specific documents selected.\n");
    }

    // Append the user prompt
    if let Some(prompt) = &request.prompt {
        context.push_str("## User Request\n\n");
        context.push_str(prompt);
        context.push('\n');
    }

    // Append style instruction
    if let Some(style) = &request.style {
        let style_instruction = get_style_instruction(style);
        context.push_str(&format!("\n## Style: {}\n{}\n", style, style_instruction));
    }

    Ok(context)
}

fn get_style_instruction(style: &str) -> &str {
    match style {
        "academic" => "Write in a formal, academic tone. Use precise terminology, structured arguments, and cite sources where relevant.",
        "analytical" => "Write in an analytical tone. Focus on data, evidence, and logical reasoning. Be objective and systematic.",
        "concise" => "Write concisely. Use short sentences and paragraphs. Get to the point quickly with minimal preamble.",
        "my_style" => "Write in the user's personal style based on their writing history.",
        _ => "Write in a balanced, helpful tone suitable for general use.",
    }
}

/// Format for the AI generation response (streaming)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIStreamChunk {
    #[serde(rename = "type")]
    pub event_type: String, // "token", "source", "done", "error"
    pub content: Option<String>,
    pub source: Option<AISourceCitation>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AISourceCitation {
    pub file_id: String,
    pub file_name: String,
    pub chunk_id: Option<String>,
    pub quote: String,
}
