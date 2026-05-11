use crate::state;
use crate::services::style_profile;
use std::collections::HashSet;

use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingTask {
    pub scene: String,
    pub stage: String,
    pub target_audience: String,
    pub purpose: String,
    pub tone: String,
    pub word_count_target: Option<usize>,
    pub must_include: Vec<String>,
    pub must_exclude: Vec<String>,
    pub file_scope: Option<Vec<i64>>,
    pub user_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredOutput {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub body: String,
    pub citations: Vec<String>,
}

// ═══════════════════════════════════════════════════════════════
// Scene templates
// ═══════════════════════════════════════════════════════════════

struct SceneTemplate {
    prompt_prefix: &'static str,
    output_schema: &'static str,
    _default_tone: &'static str,
    _typical_word_count: (usize, usize),
}

fn get_scene_template(scene: &str) -> SceneTemplate {
    match scene {
        "wechat_article" => SceneTemplate {
            prompt_prefix: "Write a WeChat public account article. Use short paragraphs, engaging subheadings, and a conversational tone. Include a compelling headline, an engaging opening, well-structured body sections, and a clear call-to-action at the end.",
            output_schema: "## Title\n[Compelling headline]\n\n## Body\n[Lede paragraph]\n[Section with subheading]\n[Section with subheading]\n[Closing call-to-action]",
            _default_tone: "conversational",
            _typical_word_count: (1500, 3000),
        },
        "long_email" => SceneTemplate {
            prompt_prefix: "Compose a professional long-form email. Use a clear subject line, appropriate greeting, well-organized body paragraphs, and a professional closing with signature block.",
            output_schema: "## Subject\n[Email subject line]\n\n## Body\n[Greeting]\n[Opening context]\n[Main content with clear paragraphs]\n[Call to action or next steps]\n[Closing]",
            _default_tone: "professional",
            _typical_word_count: (500, 1500),
        },
        "course_paper" => SceneTemplate {
            prompt_prefix: "Write an academic course paper. Use formal academic language, clear thesis statement, structured argumentation, proper section headings, and references.",
            output_schema: "## Title\n[Academic title]\n\n## Abstract\n[150-250 word abstract]\n\n## Introduction\n[Background and thesis]\n\n## Body Sections\n[Multiple sections with headings]\n\n## Conclusion\n[Summary and implications]\n\n## References\n[Cited works]",
            _default_tone: "academic",
            _typical_word_count: (3000, 8000),
        },
        "homework" => SceneTemplate {
            prompt_prefix: "Write a homework assignment response. Answer the question clearly with supporting arguments, examples, and a structured conclusion. Use an academic but accessible tone.",
            output_schema: "## Title\n[Assignment title or question]\n\n## Answer\n[Direct response]\n\n## Analysis\n[Supporting arguments and evidence]\n\n## Conclusion\n[Summary of findings]",
            _default_tone: "academic",
            _typical_word_count: (1000, 3000),
        },
        "business_proposal" => SceneTemplate {
            prompt_prefix: "Write a business proposal. Include an executive summary, problem statement, proposed solution, timeline, budget considerations, and a persuasive conclusion. Use professional, confident language.",
            output_schema: "## Executive Summary\n[One-paragraph overview]\n\n## Problem Statement\n[Current challenge]\n\n## Proposed Solution\n[Detailed approach]\n\n## Timeline\n[Implementation phases]\n\n## Budget\n[Cost considerations]\n\n## Conclusion\n[Call to action]",
            _default_tone: "persuasive",
            _typical_word_count: (1500, 4000),
        },
        "social_media" => SceneTemplate {
            prompt_prefix: "Write a social media post. Use an attention-grabbing hook, concise body, relevant hashtags, and an engagement prompt. Keep it brief and impactful.",
            output_schema: "## Hook\n[First line that grabs attention]\n\n## Body\n[2-4 sentences of main content]\n\n## Call to Action\n[Engagement question or prompt]\n\n## Hashtags\n[3-5 relevant tags]",
            _default_tone: "casual",
            _typical_word_count: (100, 500),
        },
        _ => SceneTemplate {
            prompt_prefix: "Write with clarity, purpose, and appropriate structure for the context.",
            output_schema: "## Title\n[Title]\n\n## Body\n[Main content]",
            _default_tone: "professional",
            _typical_word_count: (500, 2000),
        },
    }
}

// ═══════════════════════════════════════════════════════════════
// Stage modifiers
// ═══════════════════════════════════════════════════════════════

fn get_stage_instructions(stage: &str) -> &'static str {
    match stage {
        "outline" => "Produce a structured outline only. Use hierarchical numbering (1, 1.1, 1.2, 2, ...). Do NOT write full prose paragraphs. Each outline point should be a concise phrase or sentence summarizing what that section will cover.",
        "expand" => "Take the provided text and flesh it out with more detail, examples, data, and explanation. Preserve the original structure and all key points. Add depth and richness without changing the core message.",
        "rewrite" => "Restructure and rewrite the provided text with a different organization. Change the flow and arrangement while preserving ALL key points and facts. Vary sentence patterns and paragraph structure.",
        "polish" => "Improve the language quality: fix grammar errors, enhance vocabulary choices, smooth sentence flow, eliminate redundancy. Do NOT change the structure or add new substantive content. Focus purely on language refinement.",
        "de_ai" => "Rewrite to sound naturally human-written. Remove AI-typical patterns: avoid excessive hedging ('may', 'might', 'could'), remove overused transitions ('Furthermore', 'Moreover', 'In conclusion'), vary sentence length significantly, use concrete and specific language, add occasional personality.",
        "compress" => "Shorten the text while preserving ALL key points and the core message. Remove redundancy, filler words, and unnecessary elaboration. Target approximately half the original length. Every sentence should earn its place.",
        "title_gen" => "Generate multiple title/headline options ONLY. Produce 5-10 creative, accurate, and varied titles. Consider different angles: descriptive, provocative, question-based, how-to, numbered list. Do NOT write any body content.",
        "summary" => "Produce a concise summary capturing the main thesis and key supporting points. Keep to approximately 15-20% of the original length. Focus on the most important ideas; omit examples and minor details.",
        "continue" => "Continue writing naturally from where the current text ends. Match the existing tone, style, vocabulary level, and structural patterns. The continuation should be seamless — a reader should not be able to tell where the original ends and the new content begins.",
        _ => "Write with clarity and purpose, matching the requested tone and structure.",
    }
}

// ═══════════════════════════════════════════════════════════════
// Context builder — hybrid: note_sources + search-based retrieval
// ═══════════════════════════════════════════════════════════════

struct ContextEntry {
    source_num: usize,
    file_id: i64,
    file_name: String,
    chunk_id: i64,
    text: String,
    locator: String,
    score: f32,
}

/// Simple tokenizer: splits on whitespace and ASCII punctuation, lowercases.
/// Works well for English; Chinese would benefit from a segmenter but this
/// gives usable overlap for mixed-language prompts.
fn simple_tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
        .map(|s| s.to_lowercase())
        .filter(|s| !s.is_empty() && s.len() >= 2)
        .collect()
}

/// Score a chunk against a query using token overlap.
/// Returns 0–100 where higher means more relevant.
fn relevance_score(query: &str, text: &str) -> f32 {
    let query_tokens = simple_tokenize(query);
    let text_tokens = simple_tokenize(text);

    if query_tokens.is_empty() || text_tokens.is_empty() {
        return 0.0;
    }

    let text_set: HashSet<&String> = text_tokens.iter().collect();
    let overlap = query_tokens.iter().filter(|t| text_set.contains(t)).count();

    (overlap as f32) / (query_tokens.len() as f32).sqrt() * 100.0
}

/// Maximum total context characters (≈3000 tokens for English prose).
const MAX_CONTEXT_CHARS: usize = 12_000;

/// Build AI context for a note by merging:
/// 1. Explicit note_sources (user-attached quotations) — always included.
/// 2. Search-based retrieval from document chunks — when a user prompt exists.
///
/// Each entry includes file_id, file_name, chunk_id, locator_json for
/// source traceability. Results are sorted by relevance and capped.
pub(crate) async fn build_context(
    note_id: i64,
    user_prompt: Option<&str>,
    file_scope: Option<&[i64]>,
) -> Result<String, String> {
    let db = state::get_db().await?;
    let mut entries: Vec<ContextEntry> = Vec::new();
    let mut seen: HashSet<(i64, i64)> = HashSet::new(); // (file_id, chunk_id)

    // ── 1. Explicit note_sources (always included) ──
    let sources = db
        .get_note_sources(note_id)
        .await
        .map_err(|e| e.to_string())?;

    for (i, source) in sources.into_iter().enumerate() {
        let file_name = db
            .get_file_detail(source.file_id)
            .await
            .map_err(|e| e.to_string())?
            .map(|f| f.name)
            .unwrap_or_else(|| format!("File#{}", source.file_id));

        let locator = db
            .get_document_chunks(source.file_id)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|c| c.id == source.chunk_id)
            .map(|c| c.locator_json)
            .unwrap_or_else(|| "{}".to_string());

        seen.insert((source.file_id, source.chunk_id));

        entries.push(ContextEntry {
            source_num: i + 1,
            file_id: source.file_id,
            file_name,
            chunk_id: source.chunk_id,
            text: source.quote_text,
            locator,
            score: f32::MAX, // explicit sources rank highest
        });
    }

    // ── 2. Search-based retrieval from document chunks ──
    if let Some(prompt) = user_prompt {
        let trimmed = prompt.trim();
        if !trimmed.is_empty() {
            // Search Tantivy for top matching files
            let search_results = {
                let engine = &*crate::state::SEARCH_ENGINE;
                engine
                    .search_documents(trimmed, None, 10)
                    .map_err(|e| e.to_string())?
            };

            let mut source_num = entries.len() + 1;

            for result in &search_results {
                // Resolve DB file_id from the indexed path
                let file_record = db
                    .get_file_by_path(&result.file_id)
                    .await
                    .map_err(|e| e.to_string())?;

                let file_id = match file_record {
                    Some(ref f) => f.id,
                    None => continue,
                };

                // Honor file_scope filter
                if let Some(scope) = file_scope {
                    if !scope.contains(&file_id) {
                        continue;
                    }
                }

                // Get all chunks for this file
                let chunks = db
                    .get_document_chunks(file_id)
                    .await
                    .map_err(|e| e.to_string())?;

                // Score each chunk against the prompt
                let mut scored: Vec<(f32, &crate::db::DocumentChunk)> = chunks
                    .iter()
                    .map(|c| {
                        let base = relevance_score(trimmed, &c.text);
                        // Blend chunk relevance with file-level Tantivy score
                        let blended = base * (1.0 + result.score.min(1.0));
                        (blended, c)
                    })
                    .collect();

                scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

                // Take top 5 chunks per file
                for (score, chunk) in scored.into_iter().take(5) {
                    if score <= 0.0 {
                        continue;
                    }
                    if seen.contains(&(file_id, chunk.id)) {
                        continue;
                    }
                    seen.insert((file_id, chunk.id));

                    entries.push(ContextEntry {
                        source_num,
                        file_id,
                        file_name: result.file_name.clone(),
                        chunk_id: chunk.id,
                        text: chunk.text.clone(),
                        locator: chunk.locator_json.clone(),
                        score,
                    });
                    source_num += 1;
                }
            }
        }
    }

    // ── 3. Sort: explicit first (score = MAX), then search results by score desc ──
    entries.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // ── 4. Cap total context ──
    let mut total_chars = 0usize;
    let capped: Vec<&ContextEntry> = entries
        .iter()
        .take_while(|e| {
            let chars = e.text.chars().count();
            if total_chars == 0 || total_chars + chars <= MAX_CONTEXT_CHARS {
                total_chars += chars;
                true
            } else {
                false
            }
        })
        .collect();

    // ── 5. Format output ──
    let output = capped
        .into_iter()
        .map(|e| {
            let pct = if e.score == f32::MAX {
                100.0
            } else {
                (e.score / 10.0).min(99.9)
            };
            format!(
                "[Source {}] File: {} (file_id={})\nChunk: {} | Locator: {}\nRelevance: {:.0}%\nContent: {}\n",
                e.source_num, e.file_name, e.file_id, e.chunk_id, e.locator, pct, e.text,
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(output)
}

// ═══════════════════════════════════════════════════════════════
// Prompt assembly
// ═══════════════════════════════════════════════════════════════

/// Assemble a 3-segment prompt: System + Style + Task
pub(crate) async fn assemble_prompt(note_id: i64, task: &WritingTask) -> Result<String, String> {
    let db = state::get_db().await?;
    let note = db.get_note(note_id).await.map_err(|e| e.to_string())?;

    let system_segment = build_system_segment();
    let style_segment = build_style_segment(&db, note.book_id).await?;
    let task_segment = build_task_segment(&db, note_id, task).await?;

    Ok(format!(
        "{}\n\n---\n\n{}\n\n---\n\n{}",
        system_segment, style_segment, task_segment
    ))
}

fn build_system_segment() -> String {
    "## System Instructions\n\
     You are an AI writing assistant for the Trace application.\n\n\
     ### Product Rules\n\
     - You generate text based on user-provided source materials and style profiles.\n\
     - Never invent facts, statistics, or data not present in the provided source materials.\n\
     - Respect the user's requested format, tone, and structural preferences.\n\n\
     ### Privacy Rules\n\
     - Do not include any personally identifiable information (PII) in generated text.\n\
     - Treat all source materials as confidential.\n\n\
     ### Citation Rules\n\
     - When using specific data, quotes, or claims from source materials, reference them explicitly (e.g., \"[Source N]\").\n\
     - Distinguish clearly between source-derived content and AI-generated elaboration or analysis."
        .to_string()
}

async fn build_style_segment(db: &crate::db::Database, book_id: i64) -> Result<String, String> {
    match db.get_style_profile(book_id).await.map_err(|e| e.to_string())? {
        Some(profile) => {
            match serde_json::from_str::<style_profile::StyleProfileData>(&profile.profile_json) {
                Ok(data) => {
                    let body = style_profile::format_style_for_prompt(&data);
                    Ok(format!("## Style Profile: {}\n\n{}", profile.name, body))
                }
                Err(_) => Ok("## Style Profile\nNo valid style profile available. Write in a natural, clear style.".to_string()),
            }
        }
        None => Ok("## Style Profile\nNo style profile available. Write in a natural, clear style.".to_string()),
    }
}

async fn build_task_segment(
    _db: &crate::db::Database,
    note_id: i64,
    task: &WritingTask,
) -> Result<String, String> {
    let scene = get_scene_template(&task.scene);
    let stage_instructions = get_stage_instructions(&task.stage);
    let context = build_context(
        note_id,
        Some(&task.user_prompt),
        task.file_scope.as_deref(),
    )
    .await?;

    let mut parts = Vec::new();

    // Scene description
    let scene_label = match task.scene.as_str() {
        "wechat_article" => "WeChat Article",
        "long_email" => "Long Email",
        "course_paper" => "Course Paper",
        "homework" => "Homework Assignment",
        "business_proposal" => "Business Proposal",
        "social_media" => "Social Media Post",
        _ => "General Writing",
    };
    parts.push(format!(
        "## Writing Scene: {}\n{}",
        scene_label,
        scene.prompt_prefix
    ));

    // Stage
    let stage_label = match task.stage.as_str() {
        "outline" => "Generate Outline",
        "expand" => "Expand Text",
        "rewrite" => "Rewrite",
        "polish" => "Polish Language",
        "de_ai" => "De-AI / Humanize",
        "compress" => "Compress / Shorten",
        "title_gen" => "Generate Titles",
        "summary" => "Summarize",
        "continue" => "Continue Writing",
        _ => "General Writing",
    };
    parts.push(format!(
        "## Task Stage: {}\n{}",
        stage_label,
        stage_instructions
    ));

    // Structured input
    let mut params = format!(
        "- Target Audience: {}\n- Purpose: {}\n- Tone: {}",
        if task.target_audience.is_empty() { "General audience" } else { &task.target_audience },
        if task.purpose.is_empty() { "Inform and engage" } else { &task.purpose },
        if task.tone.is_empty() { "Professional" } else { &task.tone },
    );
    if let Some(wc) = task.word_count_target {
        params.push_str(&format!("\n- Word Count Target: {}", wc));
    }
    if !task.must_include.is_empty() {
        params.push_str(&format!("\n- Must Include: {}", task.must_include.join(", ")));
    }
    if !task.must_exclude.is_empty() {
        params.push_str(&format!("\n- Must Exclude: {}", task.must_exclude.join(", ")));
    }
    if !task.user_prompt.is_empty() {
        params.push_str(&format!("\n- Additional Instructions: {}", task.user_prompt));
    }
    parts.push(format!("## Writing Parameters\n{}", params));

    // Source materials
    if !context.is_empty() {
        parts.push(format!("## Source Materials\n{}", context));
    }

    // Output format
    parts.push(format!(
        "## Required Output Format\nPlease structure your response as follows:\n{}\n\nUse markdown formatting for headings, lists, and emphasis.",
        scene.output_schema
    ));

    Ok(parts.join("\n\n"))
}

// ═══════════════════════════════════════════════════════════════
// Structured output parser
// ═══════════════════════════════════════════════════════════════

pub(crate) fn parse_structured_output(raw: &str) -> StructuredOutput {
    let mut title = None;
    let mut summary = None;
    let mut citations = Vec::new();

    // Extract H1 or first ## Title as title
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") && title.is_none() {
            title = Some(trimmed.trim_start_matches("# ").to_string());
            break;
        }
        if (trimmed.starts_with("## Title") || trimmed.starts_with("## 标题")) && title.is_none() {
            // The title might be on the next line
            continue;
        }
    }
    // If no H1 found, try first non-empty line as title
    if title.is_none() {
        for line in raw.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() && !trimmed.starts_with('#') && trimmed.len() > 5 && trimmed.len() < 150 {
                title = Some(trimmed.to_string());
                break;
            }
        }
    }

    // Find Abstract/Summary section
    let summary_markers = ["## Abstract", "## Summary", "## 摘要", "## 总结", "## Executive Summary"];
    for marker in &summary_markers {
        if let Some(pos) = raw.find(marker) {
            let after_marker = &raw[pos + marker.len()..];
            // Take the first paragraph after the marker
            let summary_text = after_marker
                .trim()
                .split("\n\n")
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if summary_text.len() > 20 {
                summary = Some(summary_text);
                break;
            }
        }
    }

    // Collect citations: lines starting with [Source N], or a References/Citations section
    let mut in_references = false;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("## References")
            || trimmed.starts_with("## Citations")
            || trimmed.starts_with("## 参考文献")
        {
            in_references = true;
            continue;
        }
        if in_references && trimmed.starts_with("## ") {
            in_references = false;
        }
        if in_references && !trimmed.is_empty() {
            citations.push(trimmed.to_string());
        }
        if trimmed.starts_with("[Source") {
            citations.push(trimmed.to_string());
        }
    }

    StructuredOutput {
        title,
        summary,
        body: raw.to_string(),
        citations,
    }
}

/// Retry: re-run assembly with a different approach note
#[allow(dead_code)]
pub(crate) fn retry(previous_prompt: &str) -> Result<String, String> {
    Ok(format!(
        "[RETRY] Previous prompt:\n{}\n\n---\nPlease try again with a different approach.",
        previous_prompt
    ))
}
