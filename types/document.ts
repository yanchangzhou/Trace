export interface ParsedDocument {
  file_path: string;
  file_type: string;
  summary: string;
  metadata: DocumentMetadata;
  content_preview: string;
  content_bytes?: number[];
}

export interface DocumentMetadata {
  page_count?: number;
  slide_count?: number;
  word_count: number;
  has_images: boolean;
  headings: string[];
}

export interface PptxSlide {
  slide_number: number;
  content: string;
  layout_summary: string;
}

export interface DocumentChunk {
  id: string;
  file_id: string;
  chunk_index: number;
  text: string;
  token_count: number;
  locator_json: string;
}
