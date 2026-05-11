// ── All shared interfaces for the Tauri API layer ──

export interface SearchResult {
  name: string;
  path: string;
  extension: string;
  size: number;
  last_modified: number;
  score: number;
}

export interface Book {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface FileRecord {
  id: number;
  book_id: number;
  name: string;
  path: string;
  extension: string;
  size: number;
  hash: string;
  status: string;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentSearchResult {
  file_id: string;
  file_name: string;
  chunk_id?: number | null;
  snippet: string;
  score: number;
  locator?: string | null;
  matched_terms: string[];
}

export interface ParsedDocument {
  file_path: string;
  file_type: string;
  summary: string;
  metadata: {
    page_count?: number | null;
    slide_count?: number | null;
    word_count: number;
    has_images: boolean;
    headings: string[];
  };
  content_preview: string;
  full_text: string;
  content_bytes?: number[] | null;
}

export interface DocumentRecord {
  file_id: number;
  summary: string;
  word_count: number;
  page_count?: number | null;
  slide_count?: number | null;
  headings_json: string;
  parsed_at: string;
}

export interface DocumentChunk {
  id: number;
  file_id: number;
  chunk_index: number;
  text: string;
  token_count: number;
  locator_json: string;
}

export interface DocumentData {
  file_type: string;
  summary: string;
  word_count: number;
  page_count?: number | null;
  slide_count?: number | null;
  headings_json: string;
  chunks: ChunkData[];
}

export interface ChunkData {
  chunk_index: number;
  text: string;
  token_count: number;
  locator_json: string;
}

export interface Note {
  id: number;
  book_id: number;
  title: string;
  content_json: string;
  plain_text: string;
  created_at: string;
  updated_at: string;
}

export interface NoteSource {
  note_id: number;
  file_id: number;
  chunk_id: number;
  quote_text: string;
}

export interface Block {
  id: number;
  note_id: number;
  content: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface VersionHistory {
  id: number;
  note_id: number;
  snapshot: string;
  created_at: string;
}

export interface Session {
  id: number;
  note_id: number;
  session_data: string;
  last_active: string;
  created_at: string;
}

export interface StyleProfile {
  id: number;
  book_id: number;
  name: string;
  source_scope: string;
  language: string;
  profile_json: string;
  created_at: string;
  updated_at: string;
}

export interface StyleExample {
  id: number;
  profile_id: number;
  file_id: number | null;
  note_id: number | null;
  text: string;
  tags_json: string;
}

export interface IndexStats {
  num_docs: number;
  num_segments: number;
  index_size_mb: number;
}

export interface WritingTask {
  scene: string;
  stage: string;
  target_audience: string;
  purpose: string;
  tone: string;
  word_count_target?: number | null;
  must_include: string[];
  must_exclude: string[];
  file_scope?: number[] | null;
  user_prompt: string;
}

export interface StructuredOutput {
  title?: string | null;
  summary?: string | null;
  body: string;
  citations: string[];
}

export interface GenerationRun {
  id: number;
  note_id: number;
  scene: string;
  stage: string;
  input_json: string;
  prompt_full: string;
  output_raw?: string | null;
  output_json?: string | null;
  user_adopted: number;
  created_at: string;
}
