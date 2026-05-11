use anyhow::{anyhow, Result};
use std::collections::HashMap;
use crate::db::Database;
use crate::models::*;

/// Extract a style profile from the user's historical notes.
/// Analyzes: average sentence length, frequent words, heading density,
/// term density, paragraph length distribution.
pub fn extract_style_profile(db: &Database) -> Result<StyleProfile> {
    // Collect all notes
    let mut all_text = String::new();
    let mut all_plain_texts: Vec<String> = Vec::new();

    let books = db.list_books()?;
    for book in &books {
        let book_notes = db.list_notes_by_book(&book.id)?;
        for note in &book_notes {
            if !note.plain_text.is_empty() {
                all_text.push_str(&note.plain_text);
                all_text.push(' ');
                all_plain_texts.push(note.plain_text.clone());
            }
        }
    }

    if all_text.is_empty() {
        return Ok(StyleProfile {
            style: "my_style".to_string(),
            label: "My Style".to_string(),
            description: "Your writing style (not enough data yet)".to_string(),
            constraints: vec![],
        });
    }

    let mut constraints = Vec::new();

    // 1. Average sentence length
    let sentences: Vec<&str> = all_text
        .split(|c| c == '.' || c == '!' || c == '?' || c == '。')
        .filter(|s| !s.trim().is_empty())
        .collect();
    let total_words: usize = all_text.split_whitespace().count();
    let avg_sentence_len = if sentences.is_empty() {
        0.0
    } else {
        total_words as f64 / sentences.len() as f64
    };
    constraints.push(StyleConstraint {
        name: "Average sentence length".to_string(),
        value: format!("{:.0} words", avg_sentence_len),
        explanation: format!("Calculated from {} sentences across {} notes", sentences.len(), all_plain_texts.len()),
    });

    // 2. High-frequency words (top 10, excluding stop words)
    let stop_words: Vec<&str> = vec![
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "shall",
        "should", "may", "might", "must", "can", "could", "i", "you", "he",
        "she", "it", "we", "they", "me", "him", "her", "us", "them", "my",
        "your", "his", "its", "our", "their", "this", "that", "these", "those",
        "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
        "and", "but", "or", "not", "no", "if", "then", "so", "than", "too",
        "very", "just", "about", "also", "into", "over", "after", "before",
    ];
    let stop_set: std::collections::HashSet<&str> = stop_words.into_iter().collect();

    let mut word_freq: HashMap<String, usize> = HashMap::new();
    for word in all_text.to_lowercase().split_whitespace() {
        let cleaned: String = word
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect();
        if cleaned.len() > 2 && !stop_set.contains(cleaned.as_str()) {
            *word_freq.entry(cleaned).or_insert(0) += 1;
        }
    }

    let mut freq_vec: Vec<(String, usize)> = word_freq.into_iter().collect();
    freq_vec.sort_by(|a, b| b.1.cmp(&a.1));

    let top_words: Vec<String> = freq_vec
        .iter()
        .take(10)
        .map(|(word, count)| format!("{} ({}x)", word, count))
        .collect();
    constraints.push(StyleConstraint {
        name: "Top frequent words".to_string(),
        value: top_words.join(", "),
        explanation: "Most used content words across your notes".to_string(),
    });

    // 3. Heading density
    let total_chars = all_text.chars().count();
    let heading_count = all_text
        .lines()
        .filter(|l| {
            let trimmed = l.trim();
            trimmed.len() > 5 && trimmed.len() < 100 && {
                let first = trimmed.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
                let has_no_punct = !trimmed.ends_with('.') && !trimmed.ends_with(',');
                first && has_no_punct
            }
        })
        .count() as f64;

    let heading_density = if total_chars > 0 {
        heading_count / (total_chars as f64 / 200.0)
    } else {
        0.0
    };
    constraints.push(StyleConstraint {
        name: "Heading density".to_string(),
        value: format!("1 per {:.0} words", if heading_density > 0.0 { total_words as f64 / heading_count } else { total_words as f64 }),
        explanation: "How frequently you use section headings".to_string(),
    });

    // 4. Term density (unique words / total words)
    let unique_words: std::collections::HashSet<&str> = all_text
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|w| w.len() > 2)
        .collect();
    let term_density = if total_words > 0 {
        unique_words.len() as f64 / total_words as f64
    } else {
        0.0
    };
    constraints.push(StyleConstraint {
        name: "Vocabulary richness".to_string(),
        value: format!("{:.1}% unique words", term_density * 100.0),
        explanation: "Ratio of unique words to total words".to_string(),
    });

    // 5. Paragraph length distribution
    let paragraphs: Vec<&str> = all_text
        .split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .collect();
    let para_lengths: Vec<usize> = paragraphs
        .iter()
        .map(|p| p.split_whitespace().count())
        .collect();
    let avg_para_len = if para_lengths.is_empty() {
        0.0
    } else {
        para_lengths.iter().sum::<usize>() as f64 / para_lengths.len() as f64
    };
    let min_para = para_lengths.iter().min().copied().unwrap_or(0);
    let max_para = para_lengths.iter().max().copied().unwrap_or(0);

    constraints.push(StyleConstraint {
        name: "Paragraph length".to_string(),
        value: format!("avg {:.0} words (range {}-{})", avg_para_len, min_para, max_para),
        explanation: "Distribution of paragraph lengths".to_string(),
    });

    // 6. Preferred tone (simple heuristic)
    let passive_indicators = ["is ", "are ", "was ", "were ", "be ", "been ", "being "];
    let passive_count: usize = passive_indicators
        .iter()
        .map(|indicator| all_text.to_lowercase().matches(indicator).count())
        .sum();
    let tone = if passive_count as f64 / total_words.max(1) as f64 > 0.1 {
        "Formal/descriptive"
    } else {
        "Active/direct"
    };
    constraints.push(StyleConstraint {
        name: "Tone".to_string(),
        value: tone.to_string(),
        explanation: "Detected from voice pattern analysis".to_string(),
    });

    Ok(StyleProfile {
        style: "my_style".to_string(),
        label: "My Style".to_string(),
        description: format!("Personal style profile extracted from {} notes", all_plain_texts.len()),
        constraints,
    })
}

/// Extract a style profile from selected source files. This is the product path
/// for user-uploaded writing samples; notes remain a fallback for "my_style".
pub fn extract_style_profile_from_files(db: &Database, file_ids: &[String]) -> Result<(StyleProfile, Vec<StyleExample>)> {
    let mut all_text = String::new();
    let mut examples = Vec::new();

    for file_id in file_ids {
        let chunks = db.get_chunks(file_id)?;
        for chunk in chunks.iter().take(6) {
            let snippet = chunk.text.trim();
            if snippet.is_empty() {
                continue;
            }

            all_text.push_str(snippet);
            all_text.push_str("\n\n");

            if examples.len() < 8 {
                examples.push(StyleExample {
                    id: uuid::Uuid::new_v4().to_string(),
                    profile_id: String::new(),
                    file_id: Some(file_id.clone()),
                    note_id: None,
                    text: snippet.chars().take(600).collect(),
                    tags_json: "[\"sample\"]".to_string(),
                });
            }
        }
    }

    if all_text.trim().is_empty() {
        return Ok((
            StyleProfile {
                style: "my_style".to_string(),
                label: "Uploaded Sample Style".to_string(),
                description: "No usable text was found in the selected samples.".to_string(),
                constraints: vec![],
            },
            examples,
        ));
    }

    let profile = extract_style_profile_from_text(&all_text, file_ids.len());
    Ok((profile, examples))
}

fn extract_style_profile_from_text(text: &str, sample_count: usize) -> StyleProfile {
    let sentences: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?' || c == '。' || c == '！' || c == '？')
        .filter(|s| !s.trim().is_empty())
        .collect();
    let total_words = text.split_whitespace().count();
    let avg_sentence_len = if sentences.is_empty() {
        0.0
    } else {
        total_words as f64 / sentences.len() as f64
    };

    let paragraphs: Vec<&str> = text.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
    let avg_para_len = if paragraphs.is_empty() {
        0.0
    } else {
        paragraphs
            .iter()
            .map(|p| p.split_whitespace().count())
            .sum::<usize>() as f64
            / paragraphs.len() as f64
    };

    let question_count = text.matches('?').count() + text.matches('？').count();
    let exclamation_count = text.matches('!').count() + text.matches('！').count();
    let colon_count = text.matches(':').count() + text.matches('：').count();

    let mut word_freq: HashMap<String, usize> = HashMap::new();
    for word in text.to_lowercase().split_whitespace() {
        let cleaned: String = word.chars().filter(|c| c.is_alphanumeric()).collect();
        if cleaned.len() > 2 {
            *word_freq.entry(cleaned).or_insert(0) += 1;
        }
    }
    let mut freq_vec: Vec<(String, usize)> = word_freq.into_iter().collect();
    freq_vec.sort_by(|a, b| b.1.cmp(&a.1));
    let top_words = freq_vec
        .iter()
        .take(12)
        .map(|(word, count)| format!("{} ({}x)", word, count))
        .collect::<Vec<_>>()
        .join(", ");

    let tone = if avg_sentence_len > 24.0 {
        "Long-form / explanatory"
    } else if question_count > sentences.len().saturating_div(8) {
        "Conversational / question-led"
    } else if exclamation_count > sentences.len().saturating_div(10) {
        "Expressive / emphatic"
    } else {
        "Direct / controlled"
    };

    StyleProfile {
        style: "my_style".to_string(),
        label: "Uploaded Sample Style".to_string(),
        description: format!(
            "Style profile extracted from {} uploaded sample file(s), {} paragraphs, {} sentences.",
            sample_count,
            paragraphs.len(),
            sentences.len()
        ),
        constraints: vec![
            StyleConstraint {
                name: "Average sentence length".to_string(),
                value: format!("{:.0} words", avg_sentence_len),
                explanation: "Use this as a rhythm target when generating drafts.".to_string(),
            },
            StyleConstraint {
                name: "Average paragraph length".to_string(),
                value: format!("{:.0} words", avg_para_len),
                explanation: "Approximate paragraph size found in uploaded samples.".to_string(),
            },
            StyleConstraint {
                name: "Tone".to_string(),
                value: tone.to_string(),
                explanation: "Heuristic tone inferred from sentence rhythm and punctuation.".to_string(),
            },
            StyleConstraint {
                name: "Frequent words".to_string(),
                value: top_words,
                explanation: "Candidate recurring terms from the sample set; review before using as hard rules.".to_string(),
            },
            StyleConstraint {
                name: "Punctuation habits".to_string(),
                value: format!("questions: {}, exclamations: {}, colons: {}", question_count, exclamation_count, colon_count),
                explanation: "Useful for avoiding a generated draft that feels structurally unlike the samples.".to_string(),
            },
        ],
    }
}

/// Get a predefined style profile
pub fn get_style_profile(style: &str) -> Result<Option<StyleProfile>> {
    match style {
        "academic" => Ok(Some(StyleProfile {
            style: "academic".to_string(),
            label: "Academic".to_string(),
            description: "Formal, precise, well-structured academic writing".to_string(),
            constraints: vec![
                StyleConstraint {
                    name: "Sentence length".to_string(),
                    value: "15-25 words".to_string(),
                    explanation: "Academic writing uses moderate to long sentences".to_string(),
                },
                StyleConstraint {
                    name: "Vocabulary".to_string(),
                    value: "Formal, discipline-specific".to_string(),
                    explanation: "Use precise terminology and avoid colloquialisms".to_string(),
                },
                StyleConstraint {
                    name: "Structure".to_string(),
                    value: "Introduction-Body-Conclusion".to_string(),
                    explanation: "Clear thesis, supporting arguments, and summary".to_string(),
                },
                StyleConstraint {
                    name: "Citations".to_string(),
                    value: "Include references".to_string(),
                    explanation: "Cite sources to support claims".to_string(),
                },
            ],
        })),
        "analytical" => Ok(Some(StyleProfile {
            style: "analytical".to_string(),
            label: "Analytical".to_string(),
            description: "Data-driven, objective, systematic analysis".to_string(),
            constraints: vec![
                StyleConstraint {
                    name: "Sentence length".to_string(),
                    value: "12-20 words".to_string(),
                    explanation: "Clear, direct sentences for analytical writing".to_string(),
                },
                StyleConstraint {
                    name: "Evidence".to_string(),
                    value: "Data-backed claims".to_string(),
                    explanation: "Every claim should be supported by evidence".to_string(),
                },
                StyleConstraint {
                    name: "Objectivity".to_string(),
                    value: "Neutral tone".to_string(),
                    explanation: "Avoid subjective language and emotional appeals".to_string(),
                },
            ],
        })),
        "concise" => Ok(Some(StyleProfile {
            style: "concise".to_string(),
            label: "Concise".to_string(),
            description: "Brief, to-the-point, minimal preamble".to_string(),
            constraints: vec![
                StyleConstraint {
                    name: "Sentence length".to_string(),
                    value: "8-15 words".to_string(),
                    explanation: "Short, punchy sentences".to_string(),
                },
                StyleConstraint {
                    name: "Structure".to_string(),
                    value: "Key point first".to_string(),
                    explanation: "Lead with the main point, minimize setup".to_string(),
                },
                StyleConstraint {
                    name: "Word economy".to_string(),
                    value: "Remove filler words".to_string(),
                    explanation: "Eliminate unnecessary adjectives and adverbs".to_string(),
                },
            ],
        })),
        "default" => Ok(Some(StyleProfile {
            style: "default".to_string(),
            label: "Default".to_string(),
            description: "Balanced, helpful tone suitable for general use".to_string(),
            constraints: vec![
                StyleConstraint {
                    name: "Sentence length".to_string(),
                    value: "10-20 words".to_string(),
                    explanation: "Natural sentence length for readability".to_string(),
                },
                StyleConstraint {
                    name: "Tone".to_string(),
                    value: "Balanced and helpful".to_string(),
                    explanation: "Professional but approachable".to_string(),
                },
            ],
        })),
        _ => Ok(None),
    }
}

/// Use the LLM to produce a structured, readable style profile from sample text.
/// Falls back to the statistical extractor when the LLM is unavailable.
pub async fn analyze_style_with_llm(
    db: &Database,
    file_ids: &[String],
    api_key: &str,
    base_url: &str,
    model: &str,
) -> Result<(StyleProfile, Vec<StyleExample>)> {
    // 1. Collect sample text
    let mut all_text = String::new();
    let mut examples = Vec::new();

    for file_id in file_ids {
        let chunks = db.get_chunks(file_id)?;
        for chunk in chunks.iter().take(8) {
            let snippet = chunk.text.trim();
            if snippet.is_empty() {
                continue;
            }
            all_text.push_str(snippet);
            all_text.push_str("\n\n");

            if examples.len() < 8 {
                examples.push(StyleExample {
                    id: uuid::Uuid::new_v4().to_string(),
                    profile_id: String::new(),
                    file_id: Some(file_id.clone()),
                    note_id: None,
                    text: snippet.chars().take(600).collect(),
                    tags_json: "[\"sample\"]".to_string(),
                });
            }
        }
    }

    if all_text.trim().len() < 100 {
        return Ok((
            StyleProfile {
                style: "my_style".to_string(),
                label: "Insufficient Data".to_string(),
                description: "Not enough text in selected samples for LLM analysis.".to_string(),
                constraints: vec![],
            },
            examples,
        ));
    }

    // 2. Try LLM analysis
    let truncated: String = all_text.chars().take(6000).collect();
    let analysis_prompt = format!(
        r#"Analyze the following writing samples and produce a structured style profile in JSON.

Return ONLY valid JSON with this exact structure:
```json
{{
  "tone": {{
    "formality": "casual|semi-formal|formal|academic",
    "emotion": "brief description (1 sentence)",
    "confidence": "tentative|balanced|assertive|authoritative"
  }},
  "structure": {{
    "opening_style": "brief description of how the writer typically opens",
    "paragraph_style": "brief description of paragraph patterns",
    "ending_style": "brief description of how the writer typically closes"
  }},
  "sentence_style": {{
    "typical_length": "short|medium|long|varied",
    "rhythm": "brief description of sentence rhythm patterns"
  }},
  "vocabulary": {{
    "level": "simple|everyday|professional|academic|technical",
    "signature_phrases": ["phrase1", "phrase2"],
    "avoid_if_generating": ["thing to avoid 1"]
  }},
  "generation_rules": [
    "concrete rule for generating text in this style",
    "another rule"
  ]
}}
```

Writing samples to analyze:
{}
"#,
        truncated
    );

    match call_llm_api(api_key, base_url, model, &analysis_prompt).await {
        Ok(response) => {
            if let Ok(profile) = parse_llm_style_response(&response, file_ids.len()) {
                return Ok((profile, examples));
            }
        }
        Err(e) => eprintln!("LLM style analysis failed, falling back to statistics: {}", e),
    }

    // 3. Fallback to statistical analysis
    let profile = extract_style_profile_from_text(&all_text, file_ids.len());
    Ok((profile, examples))
}

async fn call_llm_api(
    api_key: &str,
    base_url: &str,
    model: &str,
    prompt: &str,
) -> Result<String> {
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": "You are a writing style analyzer. Always respond with valid JSON only." },
            { "role": "user", "content": prompt }
        ]
    });

    let client = reqwest::Client::new();
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

    let json: serde_json::Value = response.json().await?;
    let content = json
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Unexpected API response structure"))?;

    Ok(content.to_string())
}

fn parse_llm_style_response(response: &str, sample_count: usize) -> Result<StyleProfile> {
    // Strip markdown code fences if present
    let json_str = response
        .trim()
        .strip_prefix("```json")
        .or_else(|| response.trim().strip_prefix("```"))
        .map(|s| s.strip_suffix("```").unwrap_or(s))
        .unwrap_or(response)
        .trim();

    let parsed: serde_json::Value = serde_json::from_str(json_str)?;

    let tone = &parsed["tone"];
    let structure = &parsed["structure"];
    let sentence_style = &parsed["sentence_style"];
    let vocabulary = &parsed["vocabulary"];
    let generation_rules = &parsed["generation_rules"];

    let mut constraints = Vec::new();

    if let Some(v) = tone["formality"].as_str() {
        constraints.push(StyleConstraint {
            name: "Formality".to_string(),
            value: v.to_string(),
            explanation: format!("LLM-detected tone formality from {} sample files", sample_count),
        });
    }
    if let Some(v) = tone["emotion"].as_str() {
        constraints.push(StyleConstraint {
            name: "Emotional Tone".to_string(),
            value: v.to_string(),
            explanation: "LLM-detected emotional quality".to_string(),
        });
    }
    if let Some(v) = structure["opening_style"].as_str() {
        constraints.push(StyleConstraint {
            name: "Opening Style".to_string(),
            value: v.to_string(),
            explanation: "How the writer typically begins".to_string(),
        });
    }
    if let Some(v) = structure["paragraph_style"].as_str() {
        constraints.push(StyleConstraint {
            name: "Paragraph Style".to_string(),
            value: v.to_string(),
            explanation: "Paragraph patterns detected by LLM".to_string(),
        });
    }
    if let Some(v) = sentence_style["rhythm"].as_str() {
        constraints.push(StyleConstraint {
            name: "Sentence Rhythm".to_string(),
            value: v.to_string(),
            explanation: "LLM-detected sentence rhythm pattern".to_string(),
        });
    }
    if let Some(v) = vocabulary["level"].as_str() {
        constraints.push(StyleConstraint {
            name: "Vocabulary Level".to_string(),
            value: v.to_string(),
            explanation: "Vocabulary sophistication detected by LLM".to_string(),
        });
    }

    let rules: Vec<String> = if let Some(arr) = generation_rules.as_array() {
        arr.iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect()
    } else {
        Vec::new()
    };

    for (i, rule) in rules.iter().enumerate() {
        constraints.push(StyleConstraint {
            name: format!("Generation Rule {}", i + 1),
            value: rule.clone(),
            explanation: "LLM-suggested rule for matching this style".to_string(),
        });
    }

    let signature_phrases: Vec<String> = vocabulary["signature_phrases"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default();

    Ok(StyleProfile {
        style: "my_style".to_string(),
        label: "LLM-Analyzed Style".to_string(),
        description: format!(
            "Style profile from {} sample file(s) using LLM analysis. Signature phrases: {}",
            sample_count,
            if signature_phrases.is_empty() {
                "none detected".to_string()
            } else {
                signature_phrases.join(", ")
            }
        ),
        constraints,
    })
}

#[cfg(test)]
mod tests {
    use super::extract_style_profile;
    use crate::db::Database;

    fn temp_db_path(name: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "trace-style-{}-{}.db",
            name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        path
    }

    #[test]
    fn extract_style_profile_handles_empty_database() {
        let path = temp_db_path("empty");
        let db = Database::new(&path).expect("database should migrate");
        let profile = extract_style_profile(&db).expect("empty style extraction should not fail");

        assert_eq!(profile.style, "my_style");
        assert!(profile.constraints.is_empty());

        drop(db);
        let _ = std::fs::remove_file(path);
    }
}
