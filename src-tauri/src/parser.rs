use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read};
use std::path::Path;
use unicode_segmentation::UnicodeSegmentation;

const MAX_SUMMARY_SIZE: usize = 2048;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDocument {
    pub file_path: String,
    pub file_type: String,
    pub summary: String,
    pub metadata: DocumentMetadata,
    pub content_preview: String,
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
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "pdf" => extract_pdf_text(file_path),
        "docx" => extract_docx_text(file_path),
        "pptx" => extract_pptx_text(file_path),
        "txt" | "md" => extract_text_text(file_path),
        _ => Err(anyhow::anyhow!("Unsupported file type: {}", extension)),
    }
}

fn extract_pdf_text(file_path: &Path) -> Result<String> {
    let bytes = std::fs::read(file_path)?;
    match pdf_extract::extract_text_from_mem(&bytes) {
        Ok(text) => Ok(text),
        Err(e) => {
            eprintln!("PDF text extraction failed for {:?}: {}", file_path, e);
            Ok(String::new())
        }
    }
}

fn extract_docx_text(file_path: &Path) -> Result<String> {
    let bytes = std::fs::read(file_path)?;
    let docx = docx_rs::read_docx(&bytes)?;
    let mut text = String::new();
    for child in &docx.document.children {
        if let docx_rs::DocumentChild::Paragraph(para) = child {
            for c in &para.children {
                if let docx_rs::ParagraphChild::Run(run) = c {
                    for rc in &run.children {
                        if let docx_rs::RunChild::Text(t) = rc {
                            text.push_str(&t.text);
                        }
                    }
                }
            }
            text.push('\n');
        }
    }
    Ok(text)
}

fn extract_pptx_text(file_path: &Path) -> Result<String> {
    let bytes = std::fs::read(file_path)?;
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)?;
    let mut text = String::new();
    let mut slide_number = 1;
    loop {
        let slide_path = format!("ppt/slides/slide{}.xml", slide_number);
        match archive.by_name(&slide_path) {
            Ok(mut slide_file) => {
                let mut content = String::new();
                slide_file.read_to_string(&mut content)?;
                let slide_text = extract_text_from_xml(&content);
                if !slide_text.is_empty() {
                    text.push_str(&slide_text);
                    text.push('\n');
                }
                slide_number += 1;
            }
            Err(_) => break,
        }
    }
    Ok(text)
}

fn extract_text_text(file_path: &Path) -> Result<String> {
    let bytes = std::fs::read(file_path)?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn parse_pdf(file_path: &Path) -> Result<ParsedDocument> {
    println!("Loading PDF: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    // Try to extract text for summary
    let pdf_text = pdf_extract::extract_text_from_mem(&bytes).unwrap_or_default();
    let word_count = pdf_text.split_whitespace().count();
    let summary = safe_truncate(&pdf_text, MAX_SUMMARY_SIZE);
    let content_preview = safe_truncate(&pdf_text, 500);

    Ok(ParsedDocument {
        file_path: file_path.to_string_lossy().to_string(),
        file_type: "pdf".to_string(),
        summary,
        metadata: DocumentMetadata {
            page_count: None,
            slide_count: None,
            word_count,
            has_images: true,
            headings: Vec::new(),
        },
        content_preview,
        content_bytes: Some(bytes),
    })
}

fn parse_docx(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing DOCX: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let docx = docx_rs::read_docx(&bytes)?;

    let mut text = String::new();
    let mut headings = Vec::new();

    for child in &docx.document.children {
        if let docx_rs::DocumentChild::Paragraph(para) = child {
            let para_text: String = para
                .children
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
                .collect();

            if !para_text.is_empty() {
                if para_text.len() < 100 && para_text.chars().next().map_or(false, |c| c.is_uppercase()) {
                    headings.push(para_text.clone());
                }
                text.push_str(&para_text);
                text.push('\n');
            }
        }
    }

    let word_count = text.split_whitespace().count();
    let summary = safe_truncate(&text, MAX_SUMMARY_SIZE);
    let content_preview = safe_truncate(&text, 500);

    Ok(ParsedDocument {
        file_path: file_path.to_string_lossy().to_string(),
        file_type: "docx".to_string(),
        summary,
        metadata: DocumentMetadata {
            page_count: None,
            slide_count: None,
            word_count,
            has_images: false,
            headings: headings.into_iter().take(10).collect(),
        },
        content_preview,
        content_bytes: Some(bytes),
    })
}

fn parse_pptx(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing PPTX: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let cursor = Cursor::new(bytes.clone());
    let mut archive = zip::ZipArchive::new(cursor)?;

    let mut slides = Vec::new();
    let mut slide_number = 1;

    loop {
        let slide_path = format!("ppt/slides/slide{}.xml", slide_number);
        match archive.by_name(&slide_path) {
            Ok(mut slide_file) => {
                let mut content = String::new();
                slide_file.read_to_string(&mut content)?;
                let text = extract_text_from_xml(&content);
                if !text.is_empty() {
                    slides.push(PptxSlide {
                        slide_number: slide_number as i32,
                        content: text.clone(),
                        layout_summary: format!("Slide {} layout", slide_number),
                    });
                }
                slide_number += 1;
            }
            Err(_) => break,
        }
    }

    let slide_count = slides.len();
    let summary_text = if slide_count > 0 {
        format!(
            "This presentation has {} slides. Topics: {}",
            slide_count,
            slides.iter().take(3).map(|s| {
                let preview = s.content.split_whitespace().take(5).collect::<Vec<_>>().join(" ");
                format!("Slide {}: {}", s.slide_number, preview)
            }).collect::<Vec<_>>().join("; ")
        )
    } else {
        "Empty presentation".to_string()
    };

    let summary = safe_truncate(&summary_text, MAX_SUMMARY_SIZE);
    let preview_text = slides.iter().take(3)
        .map(|s| format!("Slide {}:\n{}\n", s.slide_number, s.content))
        .collect::<String>();
    let content_preview = safe_truncate(&preview_text, 500);
    let word_count: usize = slides.iter().map(|s| s.content.split_whitespace().count()).sum();

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
        content_bytes: Some(bytes),
    })
}

fn parse_text(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing text file: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let text = String::from_utf8_lossy(&bytes).to_string();
    let word_count = text.split_whitespace().count();
    let summary = safe_truncate(&text, MAX_SUMMARY_SIZE);
    let content_preview = safe_truncate(&text, 500);

    Ok(ParsedDocument {
        file_path: file_path.to_string_lossy().to_string(),
        file_type: "text".to_string(),
        summary,
        metadata: DocumentMetadata {
            page_count: None,
            slide_count: None,
            word_count,
            has_images: false,
            headings: Vec::new(),
        },
        content_preview,
        content_bytes: Some(bytes),
    })
}

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

/// Split text into chunks by word boundaries (sentence-aware)
pub fn chunk_text(text: &str, max_chunk_size: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let words: Vec<&str> = text.split_whitespace().collect();

    if words.is_empty() {
        return chunks;
    }

    let mut current_chunk = Vec::new();
    let mut current_len = 0;

    for word in &words {
        if current_len + word.len() > max_chunk_size && !current_chunk.is_empty() {
            chunks.push(current_chunk.join(" "));
            current_chunk = Vec::new();
            current_len = 0;
        }
        current_chunk.push(*word);
        current_len += word.len() + 1; // +1 for space
    }

    if !current_chunk.is_empty() {
        chunks.push(current_chunk.join(" "));
    }

    chunks
}

/// Extract character-based chunks (for backward compatibility)
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

/// Extract full text with metadata for document persistence
pub fn extract_document_data(file_path: &Path) -> Result<DocumentData> {
    let text = extract_full_text(file_path)?;
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let file_type: &str = match extension.as_str() {
        "pdf" => "pdf",
        "docx" => "docx",
        "pptx" => "pptx",
        "txt" | "md" => "text",
        _ => "unknown",
    };

    let word_count = text.split_whitespace().count() as i64;
    let headings: Vec<String> = text
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed.len() < 100 && trimmed.len() > 3 && !trimmed.ends_with('.')
        })
        .take(20)
        .map(|s| s.trim().to_string())
        .collect();

    let chunks = chunk_text(&text, 1000)
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
        file_type: file_type.to_string(),
        summary: safe_truncate(&text, 500),
        word_count,
        page_count: None,
        slide_count: None,
        headings_json: serde_json::to_string(&headings).unwrap_or_default(),
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
