use crate::state;
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════
// Serde structs for the style profile JSON
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleProfileData {
    pub version: u32,
    pub summary: StyleSummary,
    pub structure: StyleStructure,
    pub sentence_patterns: SentencePatterns,
    pub tone: ToneAnalysis,
    pub vocabulary: VocabularyAnalysis,
    pub style_clusters: Vec<StyleCluster>,
    pub generation_constraints: GenerationConstraints,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleSummary {
    pub source_scope: String,
    pub language: String,
    pub total_sections: usize,
    pub total_sentences: usize,
    pub total_characters: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleStructure {
    pub opening_patterns: Vec<PatternEntry>,
    pub paragraph_progression: ParagraphProgression,
    pub heading_preferences: HeadingPreferences,
    pub closing_patterns: Vec<PatternEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternEntry {
    #[serde(rename = "type")]
    pub pattern_type: String,
    pub frequency: f64,
    pub description: String,
    pub examples: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParagraphProgression {
    pub elaboration: f64,
    pub contrast: f64,
    pub example: f64,
    pub transition: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadingPreferences {
    pub total_headings: usize,
    pub max_depth: usize,
    pub avg_headings_per_section: f64,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentencePatterns {
    pub length_distribution: LengthDistribution,
    pub avg_sentence_length_chars: f64,
    pub parallelism_density: f64,
    pub rhetorical_question_density: f64,
    pub transition_density: f64,
    pub punctuation_patterns: PunctuationPatterns,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LengthDistribution {
    pub short: LengthBucket,
    pub medium: LengthBucket,
    pub long: LengthBucket,
    pub very_long: LengthBucket,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LengthBucket {
    pub range: String,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PunctuationPatterns {
    pub parentheses_per_100: f64,
    pub em_dashes_per_100: f64,
    pub colons_per_100: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToneAnalysis {
    pub formality: Formality,
    pub emotional_intensity: IntensityScore,
    pub certainty: Certainty,
    pub subjectivity: Subjectivity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Formality {
    pub level: String,
    pub score: f64,
    pub markers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntensityScore {
    pub score: f64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Certainty {
    pub definitive_ratio: f64,
    pub hedging_ratio: f64,
    pub neutral_ratio: f64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subjectivity {
    pub first_person_density: f64,
    pub opinion_marker_density: f64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabularyAnalysis {
    pub high_frequency: Vec<FreqExpression>,
    pub preferred_synonyms: serde_json::Value,
    pub domain_terminology: Vec<DomainTerm>,
    pub connector_profile: ConnectorProfile,
    pub avg_vocabulary_complexity: f64,
    pub type_token_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreqExpression {
    pub expression: String,
    pub count: usize,
    #[serde(rename = "type")]
    pub expr_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainTerm {
    pub term: String,
    pub count: usize,
    pub domain: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorProfile {
    pub additive: f64,
    pub adversative: f64,
    pub causal: f64,
    pub temporal: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleCluster {
    pub label: String,
    pub confidence: f64,
    pub characteristics: Vec<String>,
    pub sentence_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationConstraints {
    pub prefer: Vec<String>,
    pub avoid: Vec<String>,
}

// ═══════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════

pub(crate) async fn extract(
    book_id: i64,
    name: &str,
    source_scope: &str,
    language_hint: &str,
) -> Result<String, String> {
    let db = state::get_db().await?;

    // Collect text based on scope
    let notes_text = if source_scope == "book_notes" || source_scope == "both" {
        db.get_book_notes_text(book_id).await.map_err(|e| e.to_string())?
    } else {
        Vec::new()
    };

    let files_text = if source_scope == "book_files" || source_scope == "both" {
        db.get_book_files_text(book_id).await.map_err(|e| e.to_string())?
    } else {
        Vec::new()
    };

    let all_texts: Vec<String> = notes_text
        .into_iter()
        .chain(files_text.into_iter())
        .collect();

    if all_texts.is_empty() {
        return Ok(serde_json::json!({
            "status": "no_data",
            "message": "No text found for this book with the selected scope."
        }).to_string());
    }

    let combined = all_texts.join("\n\n");

    // Language detection
    let language = if language_hint == "auto" {
        detect_language(&combined)
    } else {
        language_hint.to_string()
    };

    // Split into sections and sentences
    let sections = split_into_sections(&combined);
    let sentences = split_sentences(&combined, &language);

    if sentences.is_empty() {
        return Ok(serde_json::json!({
            "status": "no_data",
            "message": "No sentences found in text."
        }).to_string());
    }

    let total_chars: usize = combined.chars().filter(|c| !c.is_whitespace()).count();

    // Run all 6 analyzers
    let headings = load_headings(book_id).await;
    let structure = analyze_structure(&sections, &sentences, &headings, &language);
    let sentence_patterns = analyze_sentence_patterns(&sentences, &language);
    let tone = analyze_tone(&sentences, &combined, &language);
    let vocabulary = analyze_vocabulary(&combined, &language);
    let style_clusters = detect_style_clusters(&sections, &structure, &sentence_patterns, &tone, &language);
    let generation_constraints = derive_generation_constraints(
        &structure, &sentence_patterns, &tone, &vocabulary, &style_clusters
    );

    let profile = StyleProfileData {
        version: 2,
        summary: StyleSummary {
            source_scope: source_scope.to_string(),
            language: language.clone(),
            total_sections: sections.len(),
            total_sentences: sentences.len(),
            total_characters: total_chars,
        },
        structure,
        sentence_patterns,
        tone,
        vocabulary,
        style_clusters,
        generation_constraints,
    };

    let profile_json = serde_json::to_string(&profile).map_err(|e| e.to_string())?;

    let profile_id = db
        .save_style_profile(book_id, name, source_scope, &language, &profile_json)
        .await
        .map_err(|e| e.to_string())?;

    // Extract and store examples for each dimension
    extract_and_store_examples(&db, profile_id, &all_texts, &language).await?;

    Ok(profile_json)
}

async fn load_headings(book_id: i64) -> Vec<String> {
    let db = match state::get_db().await {
        Ok(db) => db,
        Err(_) => return Vec::new(),
    };
    let heading_jsons = db.get_book_headings(book_id).await.unwrap_or_default();
    let mut all_headings = Vec::new();
    for json_str in heading_jsons {
        if let Ok(headings) = serde_json::from_str::<Vec<String>>(&json_str) {
            all_headings.extend(headings);
        }
    }
    all_headings
}

// ═══════════════════════════════════════════════════════════════
// Language detection
// ═══════════════════════════════════════════════════════════════

fn detect_language(text: &str) -> String {
    let cjk_count = text
        .chars()
        .filter(|c| matches!(c, '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}' | '\u{3000}'..='\u{303F}'))
        .count();
    let latin_count = text
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .count();
    let total = cjk_count + latin_count;
    if total == 0 { return "unknown".to_string(); }
    let cjk_ratio = cjk_count as f64 / total as f64;
    if cjk_ratio > 0.7 {
        "zh".to_string()
    } else if cjk_ratio < 0.3 {
        "en".to_string()
    } else {
        "mixed".to_string()
    }
}

// ═══════════════════════════════════════════════════════════════
// Sentence splitting
// ═══════════════════════════════════════════════════════════════

fn split_sentences(text: &str, language: &str) -> Vec<String> {
    let terminals: &[char] = if language == "zh" || language == "mixed" {
        &['。', '！', '？', '\n']
    } else {
        &['.', '!', '?', '\n']
    };

    let mut sentences = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if terminals.contains(&ch) {
            let trimmed = current.trim().to_string();
            if !trimmed.is_empty() {
                sentences.push(trimmed);
            }
            current = String::new();
        }
    }
    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        sentences.push(trimmed);
    }

    // Handle English abbreviation false splits (e.g. "Dr.", "Mr.")
    if language == "en" || language == "mixed" {
        sentences = merge_abbreviation_splits(sentences);
    }

    sentences
}

fn merge_abbreviation_splits(sentences: Vec<String>) -> Vec<String> {
    let abbrevs: &[&str] = &["Dr", "Mr", "Mrs", "Ms", "Prof", "Sr", "Jr", "vs", "etc", "i.e", "e.g"];
    let mut merged = Vec::new();
    let mut i = 0;
    while i < sentences.len() {
        let current = &sentences[i];
        let last_word = current.split_whitespace().last().unwrap_or("");
        let last_no_dot = last_word.trim_end_matches('.');
        if abbrevs.contains(&last_no_dot) && i + 1 < sentences.len() {
            merged.push(format!("{} {}", current.trim_end(), sentences[i + 1].trim()));
            i += 2;
        } else {
            merged.push(current.clone());
            i += 1;
        }
    }
    merged
}

fn split_into_sections(text: &str) -> Vec<String> {
    text.split("\n\n")
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

// ═══════════════════════════════════════════════════════════════
// 1. Structure analysis
// ═══════════════════════════════════════════════════════════════

fn analyze_structure(
    sections: &[String],
    sentences: &[String],
    headings: &[String],
    language: &str,
) -> StyleStructure {
    let is_zh = language == "zh" || language == "mixed";

    // Opening patterns
    let opening_patterns = analyze_openings(sections, is_zh);

    // Paragraph progression
    let progression = analyze_progression(sections, is_zh);

    // Heading preferences
    let heading_prefs = analyze_headings(headings, sections.len());

    // Closing patterns
    let closing_patterns = analyze_closings(sections, sentences, is_zh);

    StyleStructure {
        opening_patterns,
        paragraph_progression: progression,
        heading_preferences: heading_prefs,
        closing_patterns,
    }
}

fn analyze_openings(sections: &[String], is_zh: bool) -> Vec<PatternEntry> {
    let question_markers_zh: &[&str] = &["为什么", "如何", "怎么", "什么是", "你是否", "有没有"];
    let question_markers_en: &[&str] = &["Why", "How", "What", "When", "Where", "Who", "Is", "Do", "Can", "Have you"];
    let statistic_markers_zh: &[&str] = &["据统计", "数据显示", "调查表明", "根据"];
    let statistic_markers_en: &[&str] = &["According to", "Research shows", "Data indicates", "Studies"];
    let assertion_zh: &[&str] = &["我认为", "毫无疑问", "显然"];
    let assertion_en: &[&str] = &["There is", "It is", "Clearly", "Undoubtedly"];
    let anecdote_zh: &[&str] = &["有一次", "最近", "记得", "那天"];
    let anecdote_en: &[&str] = &["Recently", "Once", "Last", "I remember", "A few"];

    let question_markers: &[&str] = if is_zh { question_markers_zh } else { question_markers_en };
    let statistic_markers: &[&str] = if is_zh { statistic_markers_zh } else { statistic_markers_en };
    let assertion: &[&str] = if is_zh { assertion_zh } else { assertion_en };
    let anecdote: &[&str] = if is_zh { anecdote_zh } else { anecdote_en };

    let total = sections.len().max(1) as f64;
    let mut question_count = 0usize;
    let mut statistic_count = 0usize;
    let mut assertion_count = 0usize;
    let mut anecdote_count = 0usize;
    let mut question_examples = Vec::new();
    let mut statistic_examples = Vec::new();
    let mut assertion_examples = Vec::new();
    let mut anecdote_examples = Vec::new();

    for section in sections {
        let first = section.lines().next().unwrap_or("").trim();
        if first.is_empty() { continue; }

        let first_short = if first.len() > 80 { &first[..80] } else { first };

        if question_markers.iter().any(|m| first_short.contains(m)) {
            question_count += 1;
            if question_examples.len() < 3 { question_examples.push(first_short.to_string()); }
        } else if statistic_markers.iter().any(|m| first_short.contains(m)) {
            statistic_count += 1;
            if statistic_examples.len() < 3 { statistic_examples.push(first_short.to_string()); }
        } else if assertion.iter().any(|m| first_short.contains(m)) {
            assertion_count += 1;
            if assertion_examples.len() < 3 { assertion_examples.push(first_short.to_string()); }
        } else if anecdote.iter().any(|m| first_short.contains(m)) {
            anecdote_count += 1;
            if anecdote_examples.len() < 3 { anecdote_examples.push(first_short.to_string()); }
        }
    }

    let mut patterns = Vec::new();
    if question_count > 0 {
        patterns.push(PatternEntry {
            pattern_type: "question_opening".to_string(),
            frequency: question_count as f64 / total,
            description: format!("{:.0}% of sections start with a question", question_count as f64 / total * 100.0),
            examples: question_examples,
        });
    }
    if assertion_count > 0 {
        patterns.push(PatternEntry {
            pattern_type: "assertion_opening".to_string(),
            frequency: assertion_count as f64 / total,
            description: format!("{:.0}% of sections start with a definitive statement", assertion_count as f64 / total * 100.0),
            examples: assertion_examples,
        });
    }
    if statistic_count > 0 {
        patterns.push(PatternEntry {
            pattern_type: "statistic_opening".to_string(),
            frequency: statistic_count as f64 / total,
            description: format!("{:.0}% of sections start with data or research", statistic_count as f64 / total * 100.0),
            examples: statistic_examples,
        });
    }
    if anecdote_count > 0 {
        patterns.push(PatternEntry {
            pattern_type: "anecdote_opening".to_string(),
            frequency: anecdote_count as f64 / total,
            description: format!("{:.0}% of sections start with a story or time marker", anecdote_count as f64 / total * 100.0),
            examples: anecdote_examples,
        });
    }
    patterns
}

fn analyze_progression(sections: &[String], is_zh: bool) -> ParagraphProgression {
    let contrast_markers_zh: &[&str] = &["但是", "然而", "不过", "相反", "另一方面", "尽管"];
    let contrast_markers_en: &[&str] = &["However", "But", "Yet", "On the other hand", "Although", "Despite", "In contrast"];
    let example_markers_zh: &[&str] = &["例如", "比如", "举个例子", "正如"];
    let example_markers_en: &[&str] = &["For example", "For instance", "Such as", "Specifically", "To illustrate"];
    let transition_markers_zh: &[&str] = &["此外", "另外", "同时", "还有", "接下来"];
    let transition_markers_en: &[&str] = &["Furthermore", "Moreover", "In addition", "Additionally", "Also", "Next"];

    let contrast: &[&str] = if is_zh { contrast_markers_zh } else { contrast_markers_en };
    let example: &[&str] = if is_zh { example_markers_zh } else { example_markers_en };
    let transition: &[&str] = if is_zh { transition_markers_zh } else { transition_markers_en };

    let mut elaboration = 0;
    let mut contrast_count = 0;
    let mut example_count = 0;
    let mut transition_count = 0;
    let mut total = 0usize;

    for window in sections.windows(2) {
        let prev = &window[0];
        let next = &window[1];
        total += 1;

        if contrast.iter().any(|m| {
            next.lines().next().unwrap_or("").contains(m)
        }) {
            contrast_count += 1;
        } else if example.iter().any(|m| {
            next.lines().next().unwrap_or("").contains(m)
        }) {
            example_count += 1;
        } else if transition.iter().any(|m| {
            next.lines().next().unwrap_or("").contains(m)
        }) {
            transition_count += 1;
        } else {
            // Lexical overlap → elaboration
            let prev_words: Vec<&str> = prev.split_whitespace().collect();
            let next_words: Vec<&str> = next.split_whitespace().collect();
            let overlap = prev_words.iter().filter(|w| next_words.contains(w)).count();
            if overlap > 0 || total == 1 {
                elaboration += 1;
            } else {
                elaboration += 1; // default to elaboration
            }
        }
    }

    let t = total.max(1) as f64;
    ParagraphProgression {
        elaboration: elaboration as f64 / t,
        contrast: contrast_count as f64 / t,
        example: example_count as f64 / t,
        transition: transition_count as f64 / t,
    }
}

fn analyze_headings(headings: &[String], section_count: usize) -> HeadingPreferences {
    let total = headings.len();
    // Detect max depth by checking for multi-level numbering (1., 1.1, 1.1.1)
    let max_depth = headings
        .iter()
        .map(|h| {
            h.chars()
                .take(20)
                .filter(|c| *c == '.' || *c == '、')
                .count()
                .max(1)
        })
        .max()
        .unwrap_or(1);

    let format = if headings.iter().any(|h| {
        h.trim().starts_with(|c: char| c.is_ascii_digit())
    }) {
        "numbered".to_string()
    } else if headings.iter().any(|h| {
        h.trim().starts_with(|c: char| c == '一' || c == '二' || c == '三')
    }) {
        "chinese_numbered".to_string()
    } else {
        "plain".to_string()
    };

    let sc = section_count.max(1) as f64;
    HeadingPreferences {
        total_headings: total,
        max_depth,
        avg_headings_per_section: total as f64 / sc,
        format,
    }
}

fn analyze_closings(sections: &[String], _sentences: &[String], is_zh: bool) -> Vec<PatternEntry> {
    let summary_zh: &[&str] = &["总之", "综上所述", "总而言之", "概括", "归结"];
    let summary_en: &[&str] = &["In summary", "In conclusion", "To sum up", "Overall", "To conclude"];
    let cta_zh: &[&str] = &["让我们", "请", "欢迎", "期待", "希望能"];
    let cta_en: &[&str] = &["Let us", "Please", "I encourage", "I invite", "Consider"];
    let question_zh: &[&str] = &["？", "吗？", "呢？"];
    let question_en: &[&str] = &["?"];
    let transition_zh: &[&str] = &["接下来", "下一", "下面"];
    let transition_en: &[&str] = &["Next", "In the following", "Coming up"];

    let summary: &[&str] = if is_zh { summary_zh } else { summary_en };
    let cta: &[&str] = if is_zh { cta_zh } else { cta_en };
    let question: &[&str] = if is_zh { question_zh } else { question_en };
    let trans: &[&str] = if is_zh { transition_zh } else { transition_en };

    let total = sections.len().max(1) as f64;
    let mut summary_count = 0;
    let mut cta_count = 0;
    let mut question_count = 0;
    let mut trans_count = 0;
    let mut summary_ex = Vec::new();
    let mut cta_ex = Vec::new();
    let mut question_ex = Vec::new();
    let mut trans_ex = Vec::new();

    for section in sections {
        let last = section.lines().last().unwrap_or("").trim();
        if last.is_empty() { continue; }
        let last_short = if last.len() > 100 { &last[..100] } else { last };

        if summary.iter().any(|m| last_short.contains(m)) {
            summary_count += 1;
            if summary_ex.len() < 3 { summary_ex.push(last_short.to_string()); }
        } else if cta.iter().any(|m| last_short.contains(m)) {
            cta_count += 1;
            if cta_ex.len() < 3 { cta_ex.push(last_short.to_string()); }
        } else if question.iter().any(|m| last_short.contains(m)) {
            question_count += 1;
            if question_ex.len() < 3 { question_ex.push(last_short.to_string()); }
        } else if trans.iter().any(|m| last_short.contains(m)) {
            trans_count += 1;
            if trans_ex.len() < 3 { trans_ex.push(last_short.to_string()); }
        }
    }

    let mut patterns = Vec::new();
    if summary_count > 0 {
        patterns.push(PatternEntry {
            pattern_type: "summary".to_string(),
            frequency: summary_count as f64 / total,
            description: format!("{:.0}% of sections close with a summary", summary_count as f64 / total * 100.0),
            examples: summary_ex,
        });
    }
    if cta_count > 0 {
        patterns.push(PatternEntry {
            pattern_type: "call_to_action".to_string(),
            frequency: cta_count as f64 / total,
            description: format!("{:.0}% of sections close with a call to action", cta_count as f64 / total * 100.0),
            examples: cta_ex,
        });
    }
    if question_count > 0 {
        patterns.push(PatternEntry {
            pattern_type: "open_question".to_string(),
            frequency: question_count as f64 / total,
            description: format!("{:.0}% of sections close with an open question", question_count as f64 / total * 100.0),
            examples: question_ex,
        });
    }
    if trans_count > 0 {
        patterns.push(PatternEntry {
            pattern_type: "transition_to_next".to_string(),
            frequency: trans_count as f64 / total,
            description: format!("{:.0}% of sections transition to the next topic", trans_count as f64 / total * 100.0),
            examples: trans_ex,
        });
    }
    patterns
}

// ═══════════════════════════════════════════════════════════════
// 2. Sentence patterns analysis
// ═══════════════════════════════════════════════════════════════

fn analyze_sentence_patterns(sentences: &[String], language: &str) -> SentencePatterns {
    let is_zh = language == "zh" || language == "mixed";

    // Length distribution using char count (not word count)
    let lengths: Vec<usize> = sentences
        .iter()
        .map(|s| s.chars().filter(|c| !c.is_whitespace()).count())
        .collect();
    let total = lengths.len().max(1);

    let (short_range, med_range, long_range) = if is_zh {
        (20usize, 50usize, 100usize)
    } else {
        (80usize, 200usize, 400usize)
    };

    let short_count = lengths.iter().filter(|&&l| l <= short_range).count();
    let med_count = lengths.iter().filter(|&&l| l > short_range && l <= med_range).count();
    let long_count = lengths.iter().filter(|&&l| l > med_range && l <= long_range).count();
    let vlong_count = lengths.iter().filter(|&&l| l > long_range).count();

    let avg_len = lengths.iter().sum::<usize>() as f64 / total as f64;

    // Parallelism detection (consecutive sentence similarity)
    let parallelism = detect_parallelism(sentences);

    // Rhetorical question density
    let rhetorical = detect_rhetorical_questions(sentences, is_zh);
    let rhetorical_density = rhetorical as f64 / total as f64;

    // Transition density
    let transition_markers_zh: &[&str] = &["然而", "但是", "此外", "另外", "同时", "因此", "所以", "不过", "而且", "并且", "于是"];
    let transition_markers_en: &[&str] = &["However", "Moreover", "Therefore", "Furthermore", "Meanwhile", "Thus", "Hence", "Nevertheless", "Nonetheless", "Additionally"];
    let transitions: &[&str] = if is_zh { transition_markers_zh } else { transition_markers_en };
    let transition_count = sentences
        .iter()
        .filter(|s| transitions.iter().any(|m| s.trim().starts_with(m)))
        .count();
    let transition_density = transition_count as f64 / total as f64;

    // Punctuation patterns
    let paren_count = sentences.iter().filter(|s| s.contains('(') || s.contains('（')).count();
    let emdash_count = sentences.iter().filter(|s| s.contains('—') || s.contains('–')).count();
    let colon_count = sentences.iter().filter(|s| s.contains('：') || s.contains(':')).count();

    SentencePatterns {
        length_distribution: LengthDistribution {
            short: LengthBucket { range: format!("1-{}", short_range), percentage: short_count as f64 / total as f64 * 100.0 },
            medium: LengthBucket { range: format!("{}-{}", short_range + 1, med_range), percentage: med_count as f64 / total as f64 * 100.0 },
            long: LengthBucket { range: format!("{}-{}", med_range + 1, long_range), percentage: long_count as f64 / total as f64 * 100.0 },
            very_long: LengthBucket { range: format!("{}+", long_range + 1), percentage: vlong_count as f64 / total as f64 * 100.0 },
        },
        avg_sentence_length_chars: avg_len,
        parallelism_density: parallelism as f64 / total as f64,
        rhetorical_question_density: rhetorical_density,
        transition_density,
        punctuation_patterns: PunctuationPatterns {
            parentheses_per_100: paren_count as f64 / total as f64 * 100.0,
            em_dashes_per_100: emdash_count as f64 / total as f64 * 100.0,
            colons_per_100: colon_count as f64 / total as f64 * 100.0,
        },
    }
}

fn detect_parallelism(sentences: &[String]) -> usize {
    let mut count = 0;
    for window in sentences.windows(3) {
        let a: Vec<&str> = window[0].split_whitespace().take(3).collect();
        let b: Vec<&str> = window[1].split_whitespace().take(3).collect();
        let c: Vec<&str> = window[2].split_whitespace().take(3).collect();

        // Check if two of three share similar starting structure
        let ab_overlap = a.iter().filter(|w| b.contains(w)).count();
        let ac_overlap = a.iter().filter(|w| c.contains(w)).count();
        let bc_overlap = b.iter().filter(|w| c.contains(w)).count();

        if ab_overlap >= 2 || ac_overlap >= 2 || bc_overlap >= 2 {
            count += 1;
        }
    }
    count
}

fn detect_rhetorical_questions(sentences: &[String], is_zh: bool) -> usize {
    let dialogue_leads_zh: &[&str] = &["他说", "他问", "我问", "说：", "问：", "回答"];
    let dialogue_leads_en: &[&str] = &["he said", "she asked", "said", "asked", "replied"];
    let dialogue_leads: &[&str] = if is_zh { dialogue_leads_zh } else { dialogue_leads_en };

    sentences
        .iter()
        .filter(|s| {
            let s = s.trim();
            let has_question = if is_zh {
                s.ends_with('？') || s.ends_with('?')
            } else {
                s.ends_with('?')
            };
            let is_dialogue = dialogue_leads.iter().any(|d| s.to_lowercase().contains(d));
            has_question && !is_dialogue
        })
        .count()
}

// ═══════════════════════════════════════════════════════════════
// 3. Tone analysis
// ═══════════════════════════════════════════════════════════════

fn analyze_tone(sentences: &[String], _combined: &str, language: &str) -> ToneAnalysis {
    let is_zh = language == "zh" || language == "mixed";
    let total = sentences.len().max(1) as f64;

    // ── Formality ──
    let (formal_zh, informal_zh): (&[&str], &[&str]) = (
        &["之", "其", "所", "者", "也", "矣", "焉", "哉"],
        &["吧", "吗", "呢", "啊", "啦", "嘛", "咱们", "啥", "那啥"],
    );
    let (formal_en, informal_en): (&[&str], &[&str]) = (
        &["Furthermore", "Moreover", "Consequently", "Nevertheless", "Accordingly", "Hence"],
        &["don't", "can't", "won't", "we'll", "it's", "that's", "gonna", "wanna", "kinda"],
    );

    let formal_signals: usize;
    let informal_signals: usize;
    let mut formality_markers = Vec::new();

    if is_zh {
        formal_signals = sentences.iter().filter(|s| formal_zh.iter().any(|m| s.contains(m))).count();
        informal_signals = sentences.iter().filter(|s| informal_zh.iter().any(|m| s.contains(m))).count();
        if formal_signals as f64 / total > 0.05 {
            formality_markers.push("Uses classical Chinese particles (之/其/所/者)".to_string());
        }
        if informal_signals as f64 / total > 0.1 {
            formality_markers.push("Colloquial sentence-final particles (吧/吗/呢/啊)".to_string());
        }
    } else {
        formal_signals = sentences.iter().filter(|s| formal_en.iter().any(|m| s.contains(m))).count();
        informal_signals = sentences.iter().filter(|s| informal_en.iter().any(|m| s.to_lowercase().contains(m))).count();
        if informal_signals as f64 / total > 0.05 {
            formality_markers.push("Uses contractions freely".to_string());
        }
        if formal_signals as f64 / total > 0.05 {
            formality_markers.push("Frequent formal connectors".to_string());
        }
    }

    let formality_raw = if is_zh {
        (formal_signals as f64 - informal_signals as f64) / total
    } else {
        (formal_signals as f64 - informal_signals as f64) / total + 0.4 // bias toward formal for English
    };
    let formality_score = (formality_raw * 2.0 + 0.5).clamp(0.0, 1.0);

    let level = if formality_score > 0.65 {
        "formal".to_string()
    } else if formality_score > 0.35 {
        "semi-formal".to_string()
    } else {
        "casual".to_string()
    };

    // ── Emotional intensity ──
    let intense_zh: &[&str] = &["非常", "极其", "太", "超级", "无比", "极度", "惊人"];
    let intense_en: &[&str] = &["extremely", "incredibly", "absolutely", "remarkably", "amazingly", "extraordinarily"];
    let intense: &[&str] = if is_zh { intense_zh } else { intense_en };

    let exclamation_count = sentences.iter().filter(|s| s.trim().ends_with('！') || s.trim().ends_with('!')).count();
    let intense_count = sentences.iter().filter(|s| intense.iter().any(|m| s.contains(m))).count();
    let emotional_score = ((exclamation_count as f64 + intense_count as f64 * 2.0) / total * 5.0).min(1.0);

    let emotional_desc = if emotional_score > 0.5 {
        "Moderate-high — uses exclamation and emotionally charged language".to_string()
    } else if emotional_score > 0.2 {
        "Moderate — occasional emphasis, generally restrained".to_string()
    } else {
        "Low — mostly neutral and restrained expression".to_string()
    };

    // ── Certainty ──
    let hedging_zh: &[&str] = &["可能", "或许", "大概", "也许", "似乎", "好像", "一般来说", "通常"];
    let hedging_en: &[&str] = &["perhaps", "maybe", "might", "could", "seems", "generally", "tends to", "likely", "possibly"];
    let definitive_zh: &[&str] = &["一定", "必须", "无疑", "显然", "毫无疑问", "肯定"];
    let definitive_en: &[&str] = &["certainly", "must", "definitely", "clearly", "undoubtedly", "without doubt", "surely"];

    let hedging: &[&str] = if is_zh { hedging_zh } else { hedging_en };
    let definitive: &[&str] = if is_zh { definitive_zh } else { definitive_en };

    let hedging_count = sentences.iter().filter(|s| hedging.iter().any(|m| s.contains(m))).count();
    let definitive_count = sentences.iter().filter(|s| definitive.iter().any(|m| s.contains(m))).count();
    let neutral_count = total as usize - hedging_count - definitive_count;

    let def_ratio = definitive_count as f64 / total;
    let hed_ratio = hedging_count as f64 / total;
    let neu_ratio = neutral_count as f64 / total;

    let certainty_desc = if def_ratio > hed_ratio + 0.05 {
        "Generally confident and definitive".to_string()
    } else if hed_ratio > def_ratio + 0.05 {
        "Cautious with frequent hedging".to_string()
    } else {
        "Balanced between definitive and cautious statements".to_string()
    };

    // ── Subjectivity ──
    let first_person_zh: &[&str] = &["我", "我们", "我的", "我们的"];
    let first_person_en: &[&str] = &["I", "we", "my", "our", "me", "us"];
    let opinion_zh: &[&str] = &["我认为", "我觉得", "在我看来", "个人认为"];
    let opinion_en: &[&str] = &["I think", "I believe", "in my opinion", "personally", "I feel"];

    let first_person: &[&str] = if is_zh { first_person_zh } else { first_person_en };
    let opinion: &[&str] = if is_zh { opinion_zh } else { opinion_en };

    let fp_count = sentences.iter().filter(|s| {
        let s = s.trim();
        first_person.iter().any(|m| s.starts_with(m) || s.contains(&format!(" {}", m)))
    }).count();
    let op_count = sentences.iter().filter(|s| opinion.iter().any(|m| s.contains(m))).count();

    let fp_density = fp_count as f64 / total * 100.0;
    let op_density = op_count as f64 / total * 100.0;

    let subj_desc = if fp_density > 5.0 {
        "Moderately subjective — frequent first-person statements".to_string()
    } else if fp_density > 1.0 {
        "Lightly subjective — occasional personal perspective".to_string()
    } else {
        "Objective — minimal first-person references".to_string()
    };

    ToneAnalysis {
        formality: Formality {
            level,
            score: formality_score,
            markers: formality_markers,
        },
        emotional_intensity: IntensityScore {
            score: emotional_score,
            description: emotional_desc,
        },
        certainty: Certainty {
            definitive_ratio: def_ratio,
            hedging_ratio: hed_ratio,
            neutral_ratio: neu_ratio,
            description: certainty_desc,
        },
        subjectivity: Subjectivity {
            first_person_density: fp_density,
            opinion_marker_density: op_density,
            description: subj_desc,
        },
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. Vocabulary analysis
// ═══════════════════════════════════════════════════════════════

fn analyze_vocabulary(text: &str, language: &str) -> VocabularyAnalysis {
    let is_zh = language == "zh" || language == "mixed";

    // Tokenize
    let tokens: Vec<String> = if is_zh {
        // Sliding window bigrams/trigrams for Chinese
        let chars: Vec<char> = text.chars().filter(|c| !c.is_whitespace()).collect();
        let mut t = Vec::new();
        for w in chars.windows(2) {
            t.push(w.iter().collect::<String>());
        }
        for w in chars.windows(3) {
            t.push(w.iter().collect::<String>());
        }
        t
    } else {
        text.split_whitespace()
            .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase())
            .filter(|w| w.len() > 2)
            .collect()
    };

    let total_tokens = tokens.len().max(1);
    let stopwords: Vec<&str> = if is_zh {
        vec!["的", "是", "在", "和", "了", "有", "不", "这", "我", "他", "她", "就", "也", "都", "要", "会", "能", "对"]
    } else {
        vec!["the", "and", "that", "for", "with", "this", "was", "are", "from", "have", "not", "but", "they", "his", "her", "its"]
    };

    // High-frequency expressions
    let mut freq_map = std::collections::HashMap::new();
    for t in tokens.iter() {
        if !stopwords.contains(&t.as_str()) && t.chars().any(|c| c.is_alphabetic()) {
            *freq_map.entry(t.clone()).or_insert(0usize) += 1;
        }
    }
    let mut freq_vec: Vec<_> = freq_map.into_iter().collect();
    freq_vec.sort_by(|a, b| b.1.cmp(&a.1));

    // Classify into types
    let connectors_zh: &[&str] = &["然而", "但是", "此外", "因此", "所以", "而且", "并且", "同时", "另外"];
    let connectors_en: &[&str] = &["however", "moreover", "therefore", "furthermore", "thus", "hence", "nevertheless", "additionally"];
    let emphasis_zh: &[&str] = &["非常", "尤其", "特别", "极其", "绝对"];
    let emphasis_en: &[&str] = &["very", "especially", "particularly", "extremely", "absolutely"];

    let connectors: &[&str] = if is_zh { connectors_zh } else { connectors_en };
    let emphasis: &[&str] = if is_zh { emphasis_zh } else { emphasis_en };

    let high_frequency: Vec<FreqExpression> = freq_vec
        .iter()
        .take(40)
        .map(|(word, count)| {
            let expr_type = if connectors.contains(&word.as_str()) {
                "connector"
            } else if emphasis.contains(&word.as_str()) {
                "emphasis"
            } else {
                "general"
            };
            FreqExpression { expression: word.clone(), count: *count, expr_type: expr_type.to_string() }
        })
        .collect();

    // Preferred synonyms (hardcoded maps)
    let preferred_synonyms = if is_zh {
        serde_json::json!({
            "但是": config_synonym_counts(text, &["但是", "但", "然而", "不过"]),
            "因此": config_synonym_counts(text, &["因此", "所以", "故而", "于是"]),
            "重要": config_synonym_counts(text, &["重要", "关键", "核心", "首要"]),
        })
    } else {
        serde_json::json!({
            "however": config_synonym_counts(text, &["however", "but", "yet", "although"]),
            "therefore": config_synonym_counts(text, &["therefore", "thus", "hence", "so"]),
            "important": config_synonym_counts(text, &["important", "crucial", "key", "vital", "essential"]),
        })
    };

    // Domain terminology (capitalized for EN, high-frequency specialized for ZH)
    let domain_terminology: Vec<DomainTerm> = if is_zh {
        // Flag multi-char terms with high frequency that look domain-specific
        freq_vec
            .iter()
            .filter(|(w, c)| {
                w.chars().count() >= 3 && *c >= 2 && !stopwords.contains(&w.as_str())
            })
            .take(15)
            .map(|(term, count)| DomainTerm {
                term: term.clone(),
                count: *count,
                domain: "general".to_string(),
            })
            .collect()
    } else {
        // Capitalized sequences
        let mut cap_terms: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let words: Vec<&str> = text.split_whitespace().collect();
        for w in words.windows(2) {
            if w[0].chars().next().map_or(false, |c| c.is_uppercase())
                && w[1].chars().next().map_or(false, |c| c.is_uppercase())
            {
                let term = format!("{} {}", w[0], w[1]);
                *cap_terms.entry(term).or_insert(0) += 1;
            }
        }
        let mut terms: Vec<_> = cap_terms.into_iter().collect();
        terms.sort_by(|a, b| b.1.cmp(&a.1));
        terms.into_iter().take(15).map(|(term, count)| DomainTerm {
            term, count,
            domain: "general".to_string(),
        }).collect()
    };

    // Connector profile
    let additive_zh: &[&str] = &["此外", "另外", "并且", "而且", "还有"];
    let additive_en: &[&str] = &["and", "also", "furthermore", "moreover", "in addition", "additionally"];
    let adversative_zh: &[&str] = &["但是", "然而", "不过", "尽管", "虽然"];
    let adversative_en: &[&str] = &["but", "however", "yet", "although", "though", "despite", "nevertheless"];
    let causal_zh: &[&str] = &["因此", "所以", "因为", "故而", "于是"];
    let causal_en: &[&str] = &["because", "therefore", "thus", "hence", "consequently", "so"];
    let temporal_zh: &[&str] = &["然后", "接着", "首先", "其次", "最后", "之后"];
    let temporal_en: &[&str] = &["then", "first", "next", "finally", "after", "before", "subsequently"];

    let (additive, adversative, causal, temporal): (&[&str], &[&str], &[&str], &[&str]) = if is_zh {
        (additive_zh, adversative_zh, causal_zh, temporal_zh)
    } else {
        (additive_en, adversative_en, causal_en, temporal_en)
    };

    let count_connectors = |markers: &[&str]| -> usize {
        tokens.iter().filter(|t| markers.contains(&t.as_str())).count()
    };

    let add_c = count_connectors(additive);
    let adv_c = count_connectors(adversative);
    let cau_c = count_connectors(causal);
    let tmp_c = count_connectors(temporal);
    let conn_total = (add_c + adv_c + cau_c + tmp_c).max(1) as f64;

    // Type-token ratio
    let unique_tokens: std::collections::HashSet<_> = tokens.iter().collect();
    let ttr = unique_tokens.len() as f64 / total_tokens as f64;

    VocabularyAnalysis {
        high_frequency,
        preferred_synonyms,
        domain_terminology,
        connector_profile: ConnectorProfile {
            additive: add_c as f64 / conn_total,
            adversative: adv_c as f64 / conn_total,
            causal: cau_c as f64 / conn_total,
            temporal: tmp_c as f64 / conn_total,
        },
        avg_vocabulary_complexity: ttr,
        type_token_ratio: ttr,
    }
}

fn config_synonym_counts(text: &str, synonyms: &[&str]) -> serde_json::Value {
    serde_json::json!(synonyms.iter().map(|s| {
        let count = text.match_indices(s).count();
        serde_json::json!({"word": s, "count": count})
    }).collect::<Vec<_>>())
}

// ═══════════════════════════════════════════════════════════════
// 5. Style cluster detection
// ═══════════════════════════════════════════════════════════════

fn detect_style_clusters(
    sections: &[String],
    _structure: &StyleStructure,
    patterns: &SentencePatterns,
    tone: &ToneAnalysis,
    language: &str,
) -> Vec<StyleCluster> {
    if sections.len() < 3 {
        return vec![StyleCluster {
            label: "Default Style".to_string(),
            confidence: 1.0,
            characteristics: vec!["Insufficient text for clustering".to_string()],
            sentence_count: sections.len(),
        }];
    }

    let is_zh = language == "zh" || language == "mixed";

    // Extract feature vector per section
    let mut features: Vec<Vec<f64>> = Vec::new();
    for section in sections {
        let char_count = section.chars().count() as f64;
        let sentence_count = section.lines().count() as f64;
        let avg_sentence_len = if sentence_count > 0.0 { char_count / sentence_count } else { char_count };

        let fp_density = if is_zh {
            section.match_indices("我").count() as f64 / char_count.max(1.0) * 100.0
        } else {
            section.to_lowercase().match_indices("i ").count() as f64 / char_count.max(1.0) * 100.0
        };

        let paragraph_len = char_count;

        let heading_density = if section.lines().next().map_or(false, |l| {
            let t = l.trim();
            t.len() > 2 && t.len() < 80 && !t.ends_with('.')
        }) { 1.0 } else { 0.0 };

        let formality = if is_zh {
            let formal_count = ["之", "其", "所"].iter().filter(|m| section.contains(**m)).count() as f64;
            let informal_count = ["吧", "吗", "呢", "啊"].iter().filter(|m| section.contains(**m)).count() as f64;
            (formal_count - informal_count).clamp(-1.0, 1.0)
        } else {
            0.0
        };

        features.push(vec![
            avg_sentence_len / 100.0,
            fp_density / 10.0,
            paragraph_len / 2000.0,
            heading_density,
            formality,
            patterns.transition_density,
            tone.certainty.definitive_ratio,
            tone.emotional_intensity.score,
        ]);
    }

    // Simplified K-means (k=2 to 4)
    let max_k = sections.len().min(4).max(2);
    let mut best_clusters = Vec::new();
    let mut best_score = f64::MAX;

    for k in 2..=max_k {
        let (clusters, score) = simple_kmeans(&features, k);
        if score < best_score {
            best_score = score;
            best_clusters = clusters;
        }
    }

    // Label clusters
    best_clusters.into_iter().map(|indices| {
        let cluster_features: Vec<&Vec<f64>> = indices.iter().map(|&i| &features[i]).collect();
        let n = cluster_features.len();
        if n == 0 {
            return StyleCluster {
                label: "Unknown".to_string(),
                confidence: 0.0,
                characteristics: Vec::new(),
                sentence_count: 0,
            };
        }

        // Compute centroid
        let dim = cluster_features[0].len();
        let centroid: Vec<f64> = (0..dim)
            .map(|d| cluster_features.iter().map(|f| f[d]).sum::<f64>() / n as f64)
            .collect();

        // Compute within-cluster variance
        let variance: f64 = cluster_features.iter()
            .map(|f| (0..dim).map(|d| (f[d] - centroid[d]).powi(2)).sum::<f64>())
            .sum::<f64>() / n as f64;
        let confidence = (1.0 / (1.0 + variance)).clamp(0.0, 1.0);

        // Auto-label
        let avg_sent_len = centroid[0] * 100.0;
        let fp = centroid[1] * 10.0;
        let para_len = centroid[2] * 2000.0;
        let formality = centroid[4];

        let (label, characteristics) = if is_zh {
            if avg_sent_len > 35.0 && formality > 0.3 {
                ("正式长文".to_string(), vec![
                    "Longer sentences with formal tone".to_string(),
                    "Structured paragraph development".to_string(),
                ])
            } else if avg_sent_len < 20.0 && fp > 2.0 {
                ("随性短文".to_string(), vec![
                    "Short punchy sentences".to_string(),
                    "Frequent first-person perspective".to_string(),
                    "Conversational tone".to_string(),
                ])
            } else if para_len > 500.0 {
                ("结构化写作".to_string(), vec![
                    "Longer paragraphs with detailed exposition".to_string(),
                ])
            } else {
                ("均衡风格".to_string(), vec![
                    "Balanced sentence length and tone".to_string(),
                ])
            }
        } else {
            if avg_sent_len > 200.0 && formality > 0.3 {
                ("Formal Long-form".to_string(), vec![
                    "Extended sentences with formal register".to_string(),
                ])
            } else if avg_sent_len < 80.0 && fp > 2.0 {
                ("Casual Short-form".to_string(), vec![
                    "Short sentences, personal voice".to_string(),
                ])
            } else if para_len > 500.0 {
                ("Structured Document".to_string(), vec![
                    "Longer paragraphs with structured flow".to_string(),
                ])
            } else {
                ("Balanced Style".to_string(), vec![
                    "Moderate length and tone".to_string(),
                ])
            }
        };

        StyleCluster {
            label,
            confidence,
            characteristics,
            sentence_count: n,
        }
    }).collect()
}

/// Simplified K-means returning cluster assignments and within-cluster variance score.
fn simple_kmeans(data: &[Vec<f64>], k: usize) -> (Vec<Vec<usize>>, f64) {
    if data.is_empty() || k == 0 { return (Vec::new(), f64::MAX); }
    let n = data.len();
    let k = k.min(n);
    let dim = data[0].len();

    // Initialize centroids from data points
    let mut centroids: Vec<Vec<f64>> = Vec::new();
    for i in 0..k {
        centroids.push(data[i * n / k].clone());
    }

    // Run 10 iterations
    for _ in 0..10 {
        // Assign points to nearest centroid
        let mut assignments: Vec<Vec<usize>> = vec![Vec::new(); k];
        for (i, point) in data.iter().enumerate() {
            let mut min_dist = f64::MAX;
            let mut min_idx = 0;
            for (j, centroid) in centroids.iter().enumerate() {
                let dist: f64 = (0..dim).map(|d| (point[d] - centroid[d]).powi(2)).sum();
                if dist < min_dist {
                    min_dist = dist;
                    min_idx = j;
                }
            }
            assignments[min_idx].push(i);
        }

        // Update centroids
        for (j, cluster) in assignments.iter().enumerate() {
            if cluster.is_empty() { continue; }
            for d in 0..dim {
                centroids[j][d] = cluster.iter().map(|&i| data[i][d]).sum::<f64>() / cluster.len() as f64;
            }
        }
    }

    // Compute final assignments and variance score
    let mut assignments: Vec<Vec<usize>> = vec![Vec::new(); k];
    let mut total_variance = 0.0;
    for (i, point) in data.iter().enumerate() {
        let mut min_dist = f64::MAX;
        let mut min_idx = 0;
        for (j, centroid) in centroids.iter().enumerate() {
            let dist: f64 = (0..dim).map(|d| (point[d] - centroid[d]).powi(2)).sum();
            if dist < min_dist {
                min_dist = dist;
                min_idx = j;
            }
        }
        assignments[min_idx].push(i);
        total_variance += min_dist;
    }

    let score = total_variance / n as f64;
    let non_empty: Vec<Vec<usize>> = assignments.into_iter().filter(|c| !c.is_empty()).collect();
    (non_empty, score)
}

// ═══════════════════════════════════════════════════════════════
// 6. Generation constraints derivation
// ═══════════════════════════════════════════════════════════════

fn derive_generation_constraints(
    structure: &StyleStructure,
    patterns: &SentencePatterns,
    tone: &ToneAnalysis,
    vocab: &VocabularyAnalysis,
    clusters: &[StyleCluster],
) -> GenerationConstraints {
    let mut prefer = Vec::new();
    let mut avoid = Vec::new();

    // From opening patterns
    if let Some(op) = structure.opening_patterns.first() {
        match op.pattern_type.as_str() {
            "question_opening" => prefer.push("Open with a provocative question to engage readers".to_string()),
            "assertion_opening" => prefer.push("Start with a definitive, confident statement".to_string()),
            "statistic_opening" => prefer.push("Lead with data or research to establish credibility".to_string()),
            _ => {}
        }
    }

    // From sentence patterns
    if patterns.parallelism_density > 0.05 {
        prefer.push("Use parallel structures for emphasis and rhythm".to_string());
    }
    if patterns.rhetorical_question_density > 0.08 {
        prefer.push("Use rhetorical questions to guide reader reflection".to_string());
    }
    if patterns.avg_sentence_length_chars < 30.0 {
        prefer.push("Keep sentences concise and punchy".to_string());
    } else {
        prefer.push("Use mid-length sentences with periodic variation".to_string());
    }
    let short_pct = patterns.length_distribution.short.percentage;
    if short_pct < 20.0 {
        avoid.push("Overly short, choppy sentences — maintain flow".to_string());
    }
    if patterns.length_distribution.very_long.percentage > 15.0 {
        avoid.push("Excessively long sentences that may lose the reader".to_string());
    }

    // From tone
    match tone.formality.level.as_str() {
        "formal" => prefer.push("Maintain a formal, precise register throughout".to_string()),
        "casual" => prefer.push("Keep a conversational, approachable tone".to_string()),
        _ => prefer.push("Balance formal precision with approachable language".to_string()),
    }
    if tone.certainty.definitive_ratio > tone.certainty.hedging_ratio + 0.1 {
        avoid.push("Excessive hedging — state claims with confidence".to_string());
    }
    if tone.subjectivity.first_person_density < 2.0 {
        avoid.push("Overly personal perspective — maintain objectivity".to_string());
    }

    // From vocabulary
    if vocab.connector_profile.adversative > 0.3 {
        prefer.push("Use contrast and counterpoint to structure arguments".to_string());
    }
    if vocab.connector_profile.causal > 0.3 {
        prefer.push("Build logical chains with clear cause-and-effect connectors".to_string());
    }

    // From clusters
    if let Some(cluster) = clusters.first() {
        if cluster.confidence > 0.5 {
            prefer.push(format!("Target style: {} — {}", cluster.label, cluster.characteristics.join("; ")));
        }
    }

    // Fallback if too few constraints
    if prefer.is_empty() {
        prefer.push("Write with clarity and natural flow".to_string());
    }
    if avoid.is_empty() {
        avoid.push("Avoid jargon without explanation".to_string());
    }

    GenerationConstraints { prefer, avoid }
}

// ═══════════════════════════════════════════════════════════════
// Example extraction and storage
// ═══════════════════════════════════════════════════════════════

async fn extract_and_store_examples(
    db: &crate::db::Database,
    profile_id: i64,
    texts: &[String],
    language: &str,
) -> Result<(), String> {
    let is_zh = language == "zh" || language == "mixed";
    let sentences = split_sentences(&texts.join("\n\n"), language);

    // Collect tagged examples by scanning for markers
    let mut examples: Vec<(String, Vec<String>)> = Vec::new();

    let formal_zh: &[&str] = &["之", "其", "所", "者"];
    let formal_en: &[&str] = &["Furthermore", "Moreover", "Consequently", "Nevertheless"];

    for sentence in &sentences {
        let mut tags = Vec::new();

        // Tag formality
        if is_zh {
            if formal_zh.iter().any(|m| sentence.contains(m)) {
                tags.push("formal".to_string());
            }
        } else if formal_en.iter().any(|m| sentence.contains(m)) {
            tags.push("formal".to_string());
        }

        // Tag parallelism (simple heuristic: repeated structure)
        let words: Vec<&str> = sentence.split_whitespace().collect();
        let mut word_counts = std::collections::HashMap::new();
        for w in &words {
            *word_counts.entry(w.to_lowercase()).or_insert(0) += 1;
        }
        if word_counts.values().any(|&c| c >= 3) {
            tags.push("parallel_structure".to_string());
        }

        // Tag rhetorical question
        let is_question = if is_zh {
            sentence.ends_with('？') || sentence.ends_with('?')
        } else {
            sentence.ends_with('?')
        };
        if is_question {
            tags.push("rhetorical_question".to_string());
        }

        // Tag transition-heavy
        let transitions_zh: &[&str] = &["然而", "但是", "此外", "因此", "所以", "而且"];
        let transitions_en: &[&str] = &["However", "Therefore", "Moreover", "Furthermore", "Thus"];
        let transitions: &[&str] = if is_zh { transitions_zh } else { transitions_en };
        if transitions.iter().filter(|m| sentence.contains(**m)).count() >= 2 {
            tags.push("transition_heavy".to_string());
        }

        // Tag first-person
        let fp_zh: &[&str] = &["我", "我们"];
        let fp_en: &[&str] = &["I ", "we ", "my ", "our "];
        let fp: &[&str] = if is_zh { fp_zh } else { fp_en };
        if fp.iter().any(|m| sentence.contains(m)) {
            tags.push("first_person".to_string());
        }

        if !tags.is_empty() {
            examples.push((sentence.clone(), tags));
        }
    }

    // Deduplicate and take up to 30 examples
    examples.sort_by_key(|(_, tags)| -(tags.len() as i32));
    examples.dedup_by(|a, b| a.0 == b.0);
    examples.truncate(30);

    for (text, tags) in &examples {
        let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
        let _ = db.insert_style_example(profile_id, None, None, text, &tags_json).await;
    }

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// Prompt formatting for AI generation
// ═══════════════════════════════════════════════════════════════

pub(crate) fn format_style_for_prompt(profile: &StyleProfileData) -> String {
    let mut sections = Vec::new();

    // Structure
    let openings: Vec<String> = profile.structure.opening_patterns.iter().map(|p| p.description.clone()).collect();
    let closings: Vec<String> = profile.structure.closing_patterns.iter().map(|p| p.description.clone()).collect();
    sections.push(format!(
        "### Structure\n- Openings: {}\n- Paragraph flow: elaboration {:.0}%, contrast {:.0}%, examples {:.0}%, transitions {:.0}%\n- Headings: {} total, {} levels deep, {} format\n- Closings: {}",
        if openings.is_empty() { "varied".to_string() } else { openings.join("; ") },
        profile.structure.paragraph_progression.elaboration * 100.0,
        profile.structure.paragraph_progression.contrast * 100.0,
        profile.structure.paragraph_progression.example * 100.0,
        profile.structure.paragraph_progression.transition * 100.0,
        profile.structure.heading_preferences.total_headings,
        profile.structure.heading_preferences.max_depth,
        profile.structure.heading_preferences.format,
        if closings.is_empty() { "varied".to_string() } else { closings.join("; ") },
    ));

    // Sentence patterns
    sections.push(format!(
        "### Sentence Patterns\n- Length: {:.0}% short, {:.0}% medium, {:.0}% long, {:.0}% very long\n- Avg sentence length: {:.0} chars\n- Parallelism density: {:.2}\n- Rhetorical question density: {:.2}\n- Transition density: {:.2}\n- Punctuation per 100 sentences: parens {:.1}, em-dashes {:.1}, colons {:.1}",
        profile.sentence_patterns.length_distribution.short.percentage,
        profile.sentence_patterns.length_distribution.medium.percentage,
        profile.sentence_patterns.length_distribution.long.percentage,
        profile.sentence_patterns.length_distribution.very_long.percentage,
        profile.sentence_patterns.avg_sentence_length_chars,
        profile.sentence_patterns.parallelism_density,
        profile.sentence_patterns.rhetorical_question_density,
        profile.sentence_patterns.transition_density,
        profile.sentence_patterns.punctuation_patterns.parentheses_per_100,
        profile.sentence_patterns.punctuation_patterns.em_dashes_per_100,
        profile.sentence_patterns.punctuation_patterns.colons_per_100,
    ));

    // Tone
    sections.push(format!(
        "### Tone\n- Formality: {} (score {:.2})\n- Emotional intensity: {:.2} — {}\n- Certainty: definitive {:.0}%, hedging {:.0}%, neutral {:.0}% — {}\n- Subjectivity: first-person density {:.1}, opinion markers {:.1} — {}",
        profile.tone.formality.level,
        profile.tone.formality.score,
        profile.tone.emotional_intensity.score,
        profile.tone.emotional_intensity.description,
        profile.tone.certainty.definitive_ratio * 100.0,
        profile.tone.certainty.hedging_ratio * 100.0,
        profile.tone.certainty.neutral_ratio * 100.0,
        profile.tone.certainty.description,
        profile.tone.subjectivity.first_person_density,
        profile.tone.subjectivity.opinion_marker_density,
        profile.tone.subjectivity.description,
    ));

    // Vocabulary
    let top_expressions: Vec<String> = profile.vocabulary.high_frequency
        .iter()
        .take(8)
        .map(|fe| format!("{} ({}×, {})", fe.expression, fe.count, fe.expr_type))
        .collect();
    sections.push(format!(
        "### Vocabulary\n- Top expressions: {}\n- Connector profile: additive {:.0}%, adversative {:.0}%, causal {:.0}%, temporal {:.0}%\n- Complexity (type-token ratio): {:.2}",
        top_expressions.join(", "),
        profile.vocabulary.connector_profile.additive * 100.0,
        profile.vocabulary.connector_profile.adversative * 100.0,
        profile.vocabulary.connector_profile.causal * 100.0,
        profile.vocabulary.connector_profile.temporal * 100.0,
        profile.vocabulary.avg_vocabulary_complexity,
    ));

    // Clusters
    if !profile.style_clusters.is_empty() {
        let cluster_lines: Vec<String> = profile.style_clusters.iter().map(|c| {
            format!("  - {} (confidence: {:.0}%, {} sentences): {}", c.label, c.confidence * 100.0, c.sentence_count, c.characteristics.join(", "))
        }).collect();
        sections.push(format!("### Style Clusters\n{}", cluster_lines.join("\n")));
    }

    // Constraints
    sections.push(format!(
        "### Writing Constraints\n- DO: {}\n- AVOID: {}",
        profile.generation_constraints.prefer.join("; "),
        profile.generation_constraints.avoid.join("; "),
    ));

    sections.join("\n\n")
}
