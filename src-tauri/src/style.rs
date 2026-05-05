use anyhow::Result;
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

    // We need to query notes directly - simplified via DB
    // Use the notes table to gather text
    let _notes = db.list_notes_by_book("")?; // will be filtered differently in practice

    // Since listing by empty book_id is unlikely to work well,
    // we use a direct approach: iterate all books and gather notes
    // For now, we'll build profile from whatever notes we can get
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
