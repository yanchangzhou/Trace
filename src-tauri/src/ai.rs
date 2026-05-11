use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db::Database;
use crate::models::*;
use crate::search::SearchEngine;
use crate::style;

pub struct GenerationPrompt {
    pub task_type: String,
    pub model: String,
    pub base_url: String,
    pub system: String,
    pub user: String,
    pub source_file_ids_json: String,
    pub prompt_json: String,
}

fn action_instruction(task_type: &str) -> &'static str {
    match task_type {
        "wechat_article" => "Write a WeChat public account article. Produce a usable draft with title options, outline, and body.",
        "long_email" => "Write a long-form email. Preserve intent, recipient relationship, and an appropriate closing.",
        "course_paper" => "Assist with a course paper. Focus on structure, thesis, evidence, and academic integrity. Do not fabricate citations.",
        "summarize" => "Summarize the provided documents concisely.",
        "compare" => "Compare the provided documents, highlighting similarities and differences.",
        "outline" => "Generate a structured outline based on the provided documents.",
        _ => "Answer the user's question based on the provided documents.",
    }
}

fn profile_section(db: &Database, request: &AIRequest) -> Result<String> {
    if let Some(profile_id) = &request.style_profile_id {
        return Ok(db
            .get_style_profile_record(profile_id)?
            .map(|profile| format!("\n\n## Saved Style Profile: {}\n{}", profile.name, profile.profile_json))
            .unwrap_or_default());
    }

    if request.style.as_deref() != Some("my_style") {
        return Ok(String::new());
    }

    let profile = style::extract_style_profile(db)?;
    if profile.constraints.is_empty() {
        return Ok(String::new());
    }

    Ok(format!(
        "\n\n## Inferred Personal Style Profile\n{}",
        serde_json::to_string_pretty(&profile)?
    ))
}

pub fn build_generation_prompt(
    db: &Database,
    search_engine: Option<&SearchEngine>,
    request: &AIRequest,
) -> Result<GenerationPrompt> {
    let context = build_ai_context(db, search_engine, request)?;
    let task_type = request.task_type.as_deref().unwrap_or(request.action.as_str());
    let style_instruction = request
        .style
        .as_deref()
        .map(get_style_instruction)
        .unwrap_or("Use a balanced, helpful tone.");
    let task_details = serde_json::json!({
        "task_type": task_type,
        "output_mode": request.output_mode,
        "audience": request.audience,
        "goal": request.goal,
        "length": request.length,
        "language": request.language,
        "constraints": request.constraints,
    });

    let system = format!(
        "{}\n\n## Style Instruction\n{}\n{}\n\n## Task Details\n{}\n\n{}",
        action_instruction(task_type),
        style_instruction,
        profile_section(db, request)?,
        serde_json::to_string_pretty(&task_details).unwrap_or_default(),
        context
    );
    let user = request.prompt.clone().unwrap_or_else(|| "Please proceed.".to_string());
    let prompt_json = serde_json::json!({ "system": system, "user": user }).to_string();

    // Read model provider settings from DB
    let model = db
        .get_setting("model_name")
        .ok()
        .flatten()
        .unwrap_or_else(|| "gpt-4o-mini".to_string());
    let base_url = db
        .get_setting("model_base_url")
        .ok()
        .flatten()
        .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());

    Ok(GenerationPrompt {
        task_type: task_type.to_string(),
        model,
        base_url,
        system,
        user,
        source_file_ids_json: serde_json::to_string(&request.context_file_ids).unwrap_or_else(|_| "[]".to_string()),
        prompt_json,
    })
}

/// Build a context prompt from selected files and their chunks.
/// When a user prompt and search engine are available, uses relevance-based
/// retrieval instead of blindly taking the first N chunks per file.
pub fn build_ai_context(
    db: &Database,
    search_engine: Option<&SearchEngine>,
    request: &AIRequest,
) -> Result<String> {
    let mut context = String::new();
    context.push_str("## Document Context\n\n");

    // Try relevance-based retrieval when the user provided a query
    let query = request.prompt.as_deref().unwrap_or("").trim().to_string();
    let use_relevance = search_engine.is_some()
        && !query.is_empty()
        && !request.context_file_ids.is_empty();

    if use_relevance {
        let se = search_engine.unwrap();
        if let Ok(search_results) = se.search_content(&query, 15) {
            // Filter to only chunks from selected files
            let selected_ids: std::collections::HashSet<&str> =
                request.context_file_ids.iter().map(|s| s.as_str()).collect();
            let relevant: Vec<_> = search_results
                .into_iter()
                .filter(|r| selected_ids.contains(r.file_id.as_str()))
                .collect();

            if !relevant.is_empty() {
                context.push_str("The following excerpts are the most relevant to your query:\n\n");
                for r in &relevant {
                    context.push_str(&format!(
                        "### {} (relevance: {:.0}%)\n{}\n---\n",
                        r.file_name,
                        r.score * 100.0,
                        r.snippet,
                    ));
                }
                context.push('\n');
            }
        }
    }

    // Always include document metadata for context files
    for file_id in &request.context_file_ids {
        if let Some(doc) = db.get_document(file_id)? {
            // Skip file-level chunk dump when we already have relevance results
            if use_relevance {
                context.push_str(&format!(
                    "### File: {} ({} words)\nSummary: {}\n\n",
                    file_id, doc.word_count, doc.summary
                ));
                continue;
            }

            context.push_str(&format!("### File: {}\n", file_id));
            context.push_str(&format!("Summary: {}\n", doc.summary));
            context.push_str(&format!("Word count: {}\n", doc.word_count));

            let headings: Vec<String> =
                serde_json::from_str(&doc.headings_json).unwrap_or_default();
            if !headings.is_empty() {
                context.push_str("Headings:\n");
                for h in &headings {
                    context.push_str(&format!("  - {}\n", h));
                }
            }
            context.push('\n');
        }

        if !use_relevance {
            let chunks = db.get_chunks(file_id)?;
            if !chunks.is_empty() {
                context.push_str(&format!("### Content chunks for: {}\n", file_id));
                for chunk in chunks.iter().take(10) {
                    let text: String = chunk.text.chars().take(500).collect();
                    context.push_str(&format!(
                        "[chunk_id: {}, locator: {}]\n{}\n---\n",
                        chunk.id, chunk.locator_json, text
                    ));
                }
                context.push('\n');
            }
        }
    }

    if request.context_file_ids.is_empty() {
        context.push_str("No specific documents selected.\n");
    }

    if let Some(style) = &request.style {
        let style_instruction = get_style_instruction(style);
        context.push_str(&format!("\n## Style: {}\n{}\n", style, style_instruction));
    }

    Ok(context)
}

pub fn get_style_instruction(style: &str) -> &str {
    match style {
        "academic" => "Write in a formal, academic tone. Use precise terminology, structured arguments, and cite sources where relevant.",
        "analytical" => "Write in an analytical tone. Focus on data, evidence, and logical reasoning. Be objective and systematic.",
        "concise" => "Write concisely. Use short sentences and paragraphs. Get to the point quickly with minimal preamble.",
        "my_style" => "Write in the user's personal style based on their writing history.",
        _ => "Write in a balanced, helpful tone suitable for general use.",
    }
}

/// Events emitted to the frontend during streaming.
/// Frontend listens on `ai-stream-{stream_id}`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AIStreamEvent {
    Token { content: String },
    Done,
    Error { message: String },
}

/// Calls the OpenAI Chat Completions API (or compatible) with streaming enabled
/// and emits `AIStreamEvent` payloads via Tauri events on `ai-stream-{stream_id}`.
pub async fn stream_ai_response(
    app: &AppHandle,
    api_key: &str,
    base_url: &str,
    model: &str,
    system_prompt: &str,
    user_message: &str,
    stream_id: &str,
) -> Result<String> {
    let event_name = format!("ai-stream-{}", stream_id);
    let mut accumulated = String::new();

    let body = serde_json::json!({
        "model": model,
        "stream": true,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": user_message  }
        ]
    });

    let client = Client::new();
    let response = client
        .post(base_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        return Err(anyhow!("API error {}: {}", status, error_body));
    }

    let mut byte_stream = response.bytes_stream();
    // Buffer for incomplete SSE lines split across chunks.
    let mut line_buffer = String::new();

    while let Some(chunk_result) = byte_stream.next().await {
        let chunk = chunk_result?;
        let text = String::from_utf8_lossy(&chunk);
        line_buffer.push_str(&text);

        // Process every complete line from the buffer.
        loop {
            let Some(newline_pos) = line_buffer.find('\n') else { break };
            let raw_line = line_buffer[..newline_pos]
                .trim_end_matches('\r')
                .to_string();
            line_buffer = line_buffer[newline_pos + 1..].to_string();

            let Some(data) = raw_line.strip_prefix("data: ") else { continue };

            if data.trim() == "[DONE]" {
                app.emit(&event_name, AIStreamEvent::Done)?;
                return Ok(accumulated);
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = json
                    .pointer("/choices/0/delta/content")
                    .and_then(|v| v.as_str())
                {
                    if !content.is_empty() {
                        accumulated.push_str(content);
                        app.emit(
                            &event_name,
                            AIStreamEvent::Token {
                                content: content.to_string(),
                            },
                        )?;
                    }
                }
            }
        }
    }

    // Stream ended without a [DONE] line (shouldn't normally happen).
    app.emit(&event_name, AIStreamEvent::Done)?;
    Ok(accumulated)
}

