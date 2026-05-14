// Re-export from split type files for backward compatibility.
export type { Book } from './book';
export type { SourceFile, SearchResult, ContentSearchResult } from './file';
export type { ParsedDocument, DocumentMetadata, PptxSlide, DocumentChunk } from './document';
export type { Note, NoteSource } from './note';
export type {
  AIMessage,
  AISource,
  WritingStyle,
  StyleProfile,
  SavedStyleProfile,
  StyleConstraint,
  AIRequest,
  AIStreamEvent,
} from './ai';

// Legacy types kept for backward compatibility
export interface SourceCard {
  id: string;
  name: string;
  type: 'pdf' | 'ppt' | 'image' | 'doc' | 'video' | 'audio';
  preview?: string;
  size?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  sources: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type Theme = 'light' | 'dark' | 'system';
