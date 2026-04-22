// Source types for the Source Rail
export interface SourceCard {
  id: string;
  name: string;
  type: 'pdf' | 'ppt' | 'image' | 'doc' | 'video' | 'audio';
  preview?: string;
  size?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Canvas document types
export interface Document {
  id: string;
  title: string;
  content: string;
  sources: string[]; // Array of source IDs
  createdAt: Date;
  updatedAt: Date;
}

// AI Assistant types
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Theme types
export type Theme = 'light' | 'dark' | 'system';

// Search and parsing types
export interface SearchResult {
  name: string;
  path: string;
  extension: string;
  size: number;
  last_modified: number;
  score: number;
}

export interface ParsedDocument {
  file_path: string;
  file_type: string;
  summary: string;
  metadata: DocumentMetadata;
  content_preview: string;
  /** From Tauri: raw file bytes for in-app preview (PDF / Office / text). */
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

// Book management types
export interface Book {
  id: string;
  name: string;
  createdAt: number;
  files: SourceFile[];
}

export interface SourceFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  bookId: string;
  addedAt: number;
  file?: File; // Store original File object for browser mode
}
