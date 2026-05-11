use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read};
use std::path::Path;
use unicode_segmentation::UnicodeSegmentation;

const MAX_SUMMARY_SIZE: usize = 2048;
const MAX_PREVIEW_SIZE: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDocument {
    pub file_path: String,
    pub file_type: String,
    pub summary: String,
    pub metadata: DocumentMetadata,
    pub content_preview: String,
    pub full_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_bytes: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub page_count: Option<usize>,
    pub slide_count: Option<usize>,
    pub word_count: usize,
    pub has_images: bool,
    pub headings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PptxSlide {
    pub slide_number: i32,
    pub content: String,
    pub notes: String,
    pub layout_summary: String,
}

/// Parse a document based on its file extension
pub fn parse_document(file_path: &Path) -> Result<ParsedDocument> {
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "pdf" => parse_pdf(file_path),
        "docx" => parse_docx(file_path),
        "pptx" => parse_pptx(file_path),
        "txt" | "md" => parse_text(file_path),
        _ => Err(anyhow::anyhow!("Unsupported file type: {}", extension)),
    }
}

/// Extract full text from any supported document for indexing
pub fn extract_full_text(file_path: &Path) -> Result<String> {
    match parse_document(file_path) {
        Ok(doc) => Ok(doc.full_text),
        Err(e) => Err(e),
    }
}

// ═══════════════════════════════════════════════════════════════
// PDF
// ═══════════════════════════════════════════════════════════════

fn parse_pdf(file_path: &Path) -> Result<ParsedDocument> {
    println!("Loading PDF: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;

    // Extract text per page — gives us both text and page count
    let pages = pdf_extract::extract_text_from_mem_by_pages(&bytes)
        .unwrap_or_default();
    let page_count = if pages.is_empty() { None } else { Some(pages.len()) };
    let full_text = pages.join("\n\n");
    let word_count = full_text.split_whitespace().count();

    let summary = safe_truncate(&full_text, MAX_SUMMARY_SIZE);
    let content_preview = safe_truncate(&full_text, MAX_PREVIEW_SIZE);

    // Detect headings from first ~100 chars of pages
    let headings: Vec<String> = pages
        .iter()
        .filter_map(|page| {
            let first_line = page.lines().next().unwrap_or("").trim();
            if first_line.len() > 3 && first_line.len() < 100 {
                Some(first_line.to_string())
            } else {
                None
            }
        })
        .take(10)
        .collect();

    Ok(ParsedDocument {
        file_path: file_path.to_string_lossy().to_string(),
        file_type: "pdf".to_string(),
        summary,
        metadata: DocumentMetadata {
            page_count,
            slide_count: None,
            word_count,
            has_images: true,
            headings,
        },
        content_preview,
        full_text,
        content_bytes: Some(bytes),
    })
}

// ═══════════════════════════════════════════════════════════════
// DOCX
// ═══════════════════════════════════════════════════════════════

fn parse_docx(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing DOCX: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let docx = docx_rs::read_docx(&bytes)?;

    let mut full_text = String::new();
    let mut headings = Vec::new();
    let mut in_heading = false;

    for child in &docx.document.children {
        match child {
            docx_rs::DocumentChild::Paragraph(para) => {
                let style = para
                    .property
                    .style
                    .as_ref()
                    .map(|s| s.val.clone().to_lowercase())
                    .unwrap_or_default();

                let is_heading = style.starts_with("heading") || style.starts_with("heading1") || style.starts_with("heading2") || style.starts_with("heading3");

                let para_text = extract_paragraph_text(&para.children);

                if is_heading && !para_text.is_empty() {
                    headings.push(para_text.clone());
                    in_heading = true;
                }
                if !para_text.is_empty() {
                    // Add blank line before new section after heading
                    if !in_heading && !full_text.is_empty() && !full_text.ends_with("\n\n") {
                        full_text.push('\n');
                    }
                    full_text.push_str(&para_text);
                    full_text.push('\n');
                    in_heading = false;
                }
            }
            docx_rs::DocumentChild::Table(table) => {
                let table_text = extract_table_text(table);
                if !table_text.is_empty() {
                    full_text.push_str(&table_text);
                    full_text.push('\n');
                }
            }
            _ => {}
        }
    }

    let word_count = full_text.split_whitespace().count();
    let summary = safe_truncate(&full_text, MAX_SUMMARY_SIZE);
    let content_preview = safe_truncate(&full_text, MAX_PREVIEW_SIZE);

    Ok(ParsedDocument {
        file_path: file_path.to_string_lossy().to_string(),
        file_type: "docx".to_string(),
        summary,
        metadata: DocumentMetadata {
            page_count: None,
            slide_count: None,
            word_count,
            has_images: false,
            headings: headings.into_iter().take(20).collect(),
        },
        content_preview,
        full_text,
        content_bytes: Some(bytes),
    })
}

fn extract_paragraph_text(children: &[docx_rs::ParagraphChild]) -> String {
    children
        .iter()
        .filter_map(|c| {
            if let docx_rs::ParagraphChild::Run(run) = c {
                Some(
                    run.children
                        .iter()
                        .filter_map(|rc| {
                            if let docx_rs::RunChild::Text(t) = rc {
                                Some(t.text.clone())
                            } else {
                                None
                            }
                        })
                        .collect::<String>(),
                )
            } else {
                None
            }
        })
        .collect()
}

fn extract_table_text(table: &docx_rs::Table) -> String {
    let mut text = String::new();
    for row in &table.rows {
        let docx_rs::TableChild::TableRow(row) = row;
        let mut row_texts = Vec::new();
        for cell in &row.cells {
            let docx_rs::TableRowChild::TableCell(cell) = cell;
            let cell_text: String = cell
                .children
                .iter()
                .filter_map(|tc| {
                    if let docx_rs::TableCellContent::Paragraph(para) = tc {
                        Some(extract_paragraph_text(&para.children))
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");
            if !cell_text.is_empty() {
                row_texts.push(cell_text);
            }
        }
        if !row_texts.is_empty() {
            text.push_str(&row_texts.join("\t"));
            text.push('\n');
        }
    }
    text
}

// ═══════════════════════════════════════════════════════════════
// PPTX
// ═══════════════════════════════════════════════════════════════

fn parse_pptx(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing PPTX: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let cursor = Cursor::new(bytes.clone());
    let mut archive = zip::ZipArchive::new(cursor)?;

    let mut slides: Vec<PptxSlide> = Vec::new();
    let mut slide_number = 1;

    loop {
        let slide_path = format!("ppt/slides/slide{}.xml", slide_number);
        // Use a block to ensure slide_file borrow ends before we mutably borrow archive for notes
        let (slide_text, notes) = {
            let mut slide_file = match archive.by_name(&slide_path) {
                Ok(f) => f,
                Err(_) => break,
            };
            let mut content = String::new();
            slide_file.read_to_string(&mut content)?;
            let text = extract_text_from_xml(&content);
            drop(slide_file); // end immutable borrow on archive
            let notes = extract_slide_notes(&mut archive, slide_number);
            (text, notes)
        };

        if !slide_text.is_empty() {
            slides.push(PptxSlide {
                slide_number: slide_number as i32,
                content: slide_text,
                notes,
                layout_summary: format!("Slide {}", slide_number),
            });
        }
        slide_number += 1;
    }

    let slide_count = slides.len();
    let summary_text = if slide_count > 0 {
        format!(
            "This presentation has {} slides. Topics: {}",
            slide_count,
            slides
                .iter()
                .take(3)
                .map(|s| {
                    let preview = s
                        .content
                        .split_whitespace()
                        .take(5)
                        .collect::<Vec<_>>()
                        .join(" ");
                    format!("Slide {}: {}", s.slide_number, preview)
                })
                .collect::<Vec<_>>()
                .join("; ")
        )
    } else {
        "Empty presentation".to_string()
    };

    let summary = safe_truncate(&summary_text, MAX_SUMMARY_SIZE);
    let preview_text = slides
        .iter()
        .take(3)
        .map(|s| {
            let notes_note = if s.notes.is_empty() {
                String::new()
            } else {
                format!("\nSpeaker Notes: {}", safe_truncate(&s.notes, 200))
            };
            format!("Slide {}:\n{}{}\n", s.slide_number, s.content, notes_note)
        })
        .collect::<String>();
    let content_preview = safe_truncate(&preview_text, MAX_PREVIEW_SIZE);
    let word_count: usize = slides.iter().map(|s| s.content.split_whitespace().count()).sum();

    // Build full text: slides + notes
    let full_text = slides
        .iter()
        .map(|s| {
            if s.notes.is_empty() {
                s.content.clone()
            } else {
                format!("{}\n[Notes]: {}", s.content, s.notes)
            }
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(ParsedDocument {
        file_path: file_path.to_string_lossy().to_string(),
        file_type: "pptx".to_string(),
        summary,
        metadata: DocumentMetadata {
            page_count: None,
            slide_count: Some(slide_count),
            word_count,
            has_images: false,
            headings: Vec::new(),
        },
        content_preview,
        full_text,
        content_bytes: Some(bytes),
    })
}

fn extract_slide_notes(
    archive: &mut zip::ZipArchive<Cursor<Vec<u8>>>,
    slide_number: usize,
) -> String {
    let notes_path = format!("ppt/notesSlides/notesSlide{}.xml", slide_number);
    match archive.by_name(&notes_path) {
        Ok(mut notes_file) => {
            let mut content = String::new();
            if notes_file.read_to_string(&mut content).is_ok() {
                extract_text_from_xml(&content)
            } else {
                String::new()
            }
        }
        Err(_) => String::new(),
    }
}

// ═══════════════════════════════════════════════════════════════
// TXT / MD
// ═══════════════════════════════════════════════════════════════

fn parse_text(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing text file: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let full_text = String::from_utf8_lossy(&bytes).to_string();
    let word_count = full_text.split_whitespace().count();
    let summary = safe_truncate(&full_text, MAX_SUMMARY_SIZE);
    let content_preview = safe_truncate(&full_text, MAX_PREVIEW_SIZE);

    // Extract heading-like lines (short lines, no ending punctuation)
    let headings: Vec<String> = full_text
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed.len() > 3
                && trimmed.len() < 100
                && !trimmed.ends_with('.')
                && !trimmed.ends_with(',')
        })
        .take(10)
        .map(|s| s.trim().to_string())
        .collect();

    Ok(ParsedDocument {
        file_path: file_path.to_string_lossy().to_string(),
        file_type: "text".to_string(),
        summary,
        metadata: DocumentMetadata {
            page_count: None,
            slide_count: None,
            word_count,
            has_images: false,
            headings,
        },
        content_preview,
        full_text,
        content_bytes: Some(bytes),
    })
}

// ═══════════════════════════════════════════════════════════════
// XML text extraction
// ═══════════════════════════════════════════════════════════════

fn extract_text_from_xml(xml: &str) -> String {
    use xml::reader::{EventReader, XmlEvent};
    let parser = EventReader::from_str(xml);
    let mut text = String::new();
    for event in parser {
        if let Ok(XmlEvent::Characters(content)) = event {
            text.push_str(&content);
            text.push(' ');
        }
    }
    text.trim().to_string()
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

/// Truncate string safely at a character boundary
fn safe_truncate(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }
    let mut end = max_len;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    if end < text.len() {
        format!("{}...", &text[..end])
    } else {
        text.to_string()
    }
}

/// Get a quick summary for a file
pub fn get_file_summary(file_path: &Path) -> String {
    match parse_document(file_path) {
        Ok(parsed) => {
            format!(
                "{} - {} words{}",
                parsed.file_type.to_uppercase(),
                parsed.metadata.word_count,
                if let Some(slides) = parsed.metadata.slide_count {
                    format!(", {} slides", slides)
                } else if let Some(pages) = parsed.metadata.page_count {
                    format!(", {} pages", pages)
                } else {
                    String::new()
                }
            )
        }
        Err(e) => {
            eprintln!("Failed to parse {:?}: {}", file_path, e);
            "Unable to parse".to_string()
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// Structure-aware chunking
// ═══════════════════════════════════════════════════════════════

/// Chunk text by semantic structure: headings → sections → paragraphs → chunks.
/// Keeps heading context with its content, splits at paragraph boundaries,
/// and stays within max_chunk_size while preserving meaning.
pub fn chunk_text(text: &str, max_chunk_size: usize) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    // Step 1: split into sections by heading-like lines
    let sections = split_into_sections(text);

    for section in &sections {
        if section.len() <= max_chunk_size {
            chunks.push(section.clone());
        } else {
            // Step 2: split oversized section into paragraph groups
            let paras = split_paragraphs(section);
            let mut current = String::new();

            for para in &paras {
                if !current.is_empty() && current.len() + para.len() + 2 > max_chunk_size {
                    chunks.push(current.trim().to_string());
                    current = String::new();
                }
                if !current.is_empty() {
                    current.push_str("\n\n");
                }
                current.push_str(para);
            }

            // If a single paragraph is larger than max_chunk_size, split it by sentences
            if !current.is_empty() && current.len() > max_chunk_size {
                let sentence_chunks = split_by_sentences(&current, max_chunk_size);
                chunks.extend(sentence_chunks);
            } else if !current.is_empty() {
                chunks.push(current.trim().to_string());
            }
        }
    }

    if chunks.is_empty() {
        // Fallback: sentence-aware word-based chunking
        split_by_sentences(text, max_chunk_size)
    } else {
        chunks
    }
}

/// Split text into sections at heading-like boundaries
fn split_into_sections(text: &str) -> Vec<String> {
    let lines: Vec<&str> = text.lines().collect();
    let mut sections: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut found_heading = false;

    for (i, line) in lines.iter().enumerate() {
        let is_heading = looks_like_heading(line)
            && (i == 0 || lines[i - 1].trim().is_empty());

        if is_heading && found_heading && !current.trim().is_empty() {
            sections.push(current.trim().to_string());
            current = String::new();
        }

        if is_heading {
            found_heading = true;
        }

        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
    }

    if !current.trim().is_empty() {
        sections.push(current.trim().to_string());
    }

    if sections.is_empty() {
        vec![text.to_string()]
    } else {
        sections
    }
}

/// Check if a line looks like a heading (short, no sentence-ending punctuation)
fn looks_like_heading(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.len() > 2
        && trimmed.len() < 120
        && !trimmed.ends_with('.')
        && !trimmed.ends_with('?')
        && !trimmed.ends_with('!')
        && !trimmed.ends_with(',')
        && !trimmed.ends_with(':')
        && !trimmed.ends_with(';')
        && trimmed.chars().filter(|c| c.is_alphabetic()).count() as f64
            / trimmed.len().max(1) as f64
            > 0.3
}

/// Split text into paragraphs (separated by blank lines)
fn split_paragraphs(text: &str) -> Vec<String> {
    text.split("\n\n")
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

/// Split text into chunks by sentences, respecting max size
fn split_by_sentences(text: &str, max_size: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let sentences: Vec<&str> = text
        .split_inclusive(&['.', '!', '?', '。', '！', '？'])
        .collect();
    let mut current = String::new();

    for sentence in &sentences {
        if !current.is_empty() && current.len() + sentence.len() > max_size {
            chunks.push(current.trim().to_string());
            current = String::new();
        }
        current.push_str(sentence);
    }
    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }
    if chunks.is_empty() {
        // Last resort: character-based split
        text.graphemes(true)
            .collect::<Vec<_>>()
            .chunks(max_size)
            .map(|c| c.iter().map(|s| *s).collect::<String>())
            .collect()
    } else {
        chunks
    }
}

/// Character-based chunking for backward compatibility
#[allow(dead_code)]
pub fn extract_chunks(content: &str, chunk_size: usize) -> Vec<String> {
    content
        .graphemes(true)
        .collect::<Vec<_>>()
        .chunks(chunk_size)
        .map(|chunk| chunk.iter().map(|s| *s).collect::<String>())
        .collect()
}

/// Unified text extraction and chunking pipeline
pub fn parse_and_chunk(file_path: &Path, chunk_size: usize) -> Result<Vec<String>> {
    let text = extract_full_text(file_path)?;
    if text.is_empty() {
        return Ok(vec!["[No readable text content]".to_string()]);
    }
    Ok(chunk_text(&text, chunk_size))
}

// ═══════════════════════════════════════════════════════════════
// Document data extraction for persistence
// ═══════════════════════════════════════════════════════════════

/// Extract full text with metadata for document persistence
pub fn extract_document_data(file_path: &Path) -> Result<DocumentData> {
    let parsed = parse_document(file_path)?;
    let word_count = parsed.full_text.split_whitespace().count() as i64;
    let headings_json = serde_json::to_string(&parsed.metadata.headings).unwrap_or_default();

    let chunks = chunk_text(&parsed.full_text, 1000)
        .into_iter()
        .enumerate()
        .map(|(i, text)| ChunkData {
            chunk_index: i as i64,
            text,
            token_count: 0,
            locator_json: "{}".to_string(),
        })
        .collect();

    Ok(DocumentData {
        file_type: parsed.file_type,
        summary: safe_truncate(&parsed.full_text, 500),
        word_count,
        page_count: parsed.metadata.page_count.map(|c| c as i64),
        slide_count: parsed.metadata.slide_count.map(|c| c as i64),
        headings_json,
        chunks,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentData {
    pub file_type: String,
    pub summary: String,
    pub word_count: i64,
    pub page_count: Option<i64>,
    pub slide_count: Option<i64>,
    pub headings_json: String,
    pub chunks: Vec<ChunkData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkData {
    pub chunk_index: i64,
    pub text: String,
    pub token_count: i64,
    pub locator_json: String,
}
