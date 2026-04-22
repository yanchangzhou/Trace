use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read};
use std::path::Path;

/// Maximum content size to parse (2KB summary)
const MAX_SUMMARY_SIZE: usize = 2048;

/// Parsed document content with structured metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDocument {
    pub file_path: String,
    pub file_type: String,
    pub summary: String,
    pub metadata: DocumentMetadata,
    pub content_preview: String,
    /// Raw file bytes for PDF / Office previews on the frontend (no heavy Rust parsing for PDF).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_bytes: Option<Vec<u8>>,
}

/// Document metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub page_count: Option<usize>,
    pub slide_count: Option<usize>,
    pub word_count: usize,
    pub has_images: bool,
    pub headings: Vec<String>,
}

/// PPTX slide structure
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

/// Parse PDF: read bytes only; rendering is done in the webview with pdf.js (avoids pdf-extract / path issues).
fn parse_pdf(file_path: &Path) -> Result<ParsedDocument> {
    println!("Loading PDF bytes: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let summary = "PDF — preview is rendered below in the panel.".to_string();
    Ok(ParsedDocument {
        file_path: file_path.to_string_lossy().to_string(),
        file_type: "pdf".to_string(),
        summary,
        metadata: DocumentMetadata {
            page_count: None,
            slide_count: None,
            word_count: 0,
            has_images: true,
            headings: Vec::new(),
        },
        content_preview: String::new(),
        content_bytes: Some(bytes),
    })
}

/// Parse DOCX files — attach full bytes for docx-preview; optional text extraction for metadata only.
fn parse_docx(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing DOCX: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let docx = docx_rs::read_docx(&bytes)?;
    
    // Extract text from paragraphs
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
                // Check if it's a heading (simple heuristic)
                if para_text.len() < 100 && para_text.chars().next().map_or(false, |c| c.is_uppercase()) {
                    headings.push(para_text.clone());
                }
                text.push_str(&para_text);
                text.push('\n');
            }
        }
    }
    
    let word_count = text.split_whitespace().count();
    
    // Create summary (ensure we don't split in the middle of a UTF-8 character)
    let summary = if text.len() > MAX_SUMMARY_SIZE {
        let mut end = MAX_SUMMARY_SIZE;
        while end > 0 && !text.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...", &text[..end])
    } else {
        text.clone()
    };
    
    // Content preview (ensure we don't split in the middle of a UTF-8 character)
    let content_preview = if text.len() > 500 {
        let mut end = 500;
        while end > 0 && !text.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...", &text[..end])
    } else {
        text.clone()
    };
    
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

/// Parse PPTX files (PowerPoint)
fn parse_pptx(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing PPTX: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let cursor = Cursor::new(bytes.clone());
    let mut archive = zip::ZipArchive::new(cursor)?;
    
    let mut slides = Vec::new();
    let mut slide_number = 1;
    
    // Iterate through slides
    loop {
        let slide_path = format!("ppt/slides/slide{}.xml", slide_number);
        
        match archive.by_name(&slide_path) {
            Ok(mut slide_file) => {
                let mut content = String::new();
                slide_file.read_to_string(&mut content)?;
                
                // Extract text from XML (simple approach)
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
    
    // Create summary
    let summary_text = if slide_count > 0 {
        format!(
            "This presentation has {} slides. Topics: {}",
            slide_count,
            slides
                .iter()
                .take(3)
                .map(|s| {
                    let preview = s.content.split_whitespace().take(5).collect::<Vec<_>>().join(" ");
                    format!("Slide {}: {}", s.slide_number, preview)
                })
                .collect::<Vec<_>>()
                .join("; ")
        )
    } else {
        "Empty presentation".to_string()
    };
    
    // Ensure summary respects UTF-8 boundaries
    let summary = if summary_text.len() > MAX_SUMMARY_SIZE {
        let mut end = MAX_SUMMARY_SIZE;
        while end > 0 && !summary_text.is_char_boundary(end) {
            end -= 1;
        }
        summary_text[..end].to_string()
    } else {
        summary_text
    };
    
    // Content preview (first 3 slides)
    let preview_text = slides
        .iter()
        .take(3)
        .map(|s| format!("Slide {}:\n{}\n", s.slide_number, s.content))
        .collect::<String>();
    
    // Ensure content preview respects UTF-8 boundaries
    let content_preview = if preview_text.len() > 500 {
        let mut end = 500;
        while end > 0 && !preview_text.is_char_boundary(end) {
            end -= 1;
        }
        preview_text[..end].to_string()
    } else {
        preview_text
    };
    
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

/// Parse plain text files
fn parse_text(file_path: &Path) -> Result<ParsedDocument> {
    println!("Parsing text file: {:?}", file_path);
    let bytes = std::fs::read(file_path)?;
    let text = String::from_utf8_lossy(&bytes).to_string();
    
    let word_count = text.split_whitespace().count();
    
    // Create summary (respecting UTF-8 boundaries)
    let summary = if text.len() > MAX_SUMMARY_SIZE {
        let mut end = MAX_SUMMARY_SIZE;
        while end > 0 && !text.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...", &text[..end])
    } else {
        text.clone()
    };
    
    // Content preview (respecting UTF-8 boundaries)
    let content_preview = if text.len() > 500 {
        let mut end = 500;
        while end > 0 && !text.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...", &text[..end])
    } else {
        text.clone()
    };
    
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

/// Extract text from XML content (simple approach)
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

/// Get a quick summary for a file (async-friendly)
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
