import { invoke } from '@tauri-apps/api/core';

// ── Types ──

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
  profile_json: string;
  created_at: string;
}

export interface IndexStats {
  num_docs: number;
  num_segments: number;
  index_size_mb: number;
}

// ── Search & Index ──

export async function searchLocalFiles(query: string): Promise<SearchResult[]> {
  return await invoke<SearchResult[]>('search_local_files', { query });
}

export async function getDocsFolder(): Promise<string> {
  return await invoke<string>('get_docs_folder');
}

export async function reindexFiles(): Promise<number> {
  return await invoke<number>('reindex_files');
}

export async function openFile(path: string): Promise<void> {
  return await invoke<void>('open_file', { path });
}

export async function compactIndex(): Promise<string> {
  return await invoke<string>('compact_index');
}

export async function cleanupOldEntries(): Promise<number> {
  return await invoke<number>('cleanup_old_entries');
}

export async function getIndexStats(): Promise<IndexStats> {
  return await invoke<IndexStats>('get_index_stats');
}

export async function listAllFiles(): Promise<SearchResult[]> {
  return await invoke<SearchResult[]>('list_all_files');
}

// ── Document Parsing ──

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  return await invoke<ParsedDocument>('parse_document', { file_path: filePath });
}

export async function getFileSummary(filePath: string): Promise<string> {
  return await invoke<string>('get_file_summary', { file_path: filePath });
}

export async function searchDocuments(
  query: string,
  scope?: string,
  limit?: number,
): Promise<DocumentSearchResult[]> {
  return await invoke<DocumentSearchResult[]>('search_documents', { query, scope, limit });
}

export async function getDocumentChunks(
  filePath: string,
  chunkSize?: number,
): Promise<string[]> {
  return await invoke<string[]>('get_document_chunks', {
    file_path: filePath,
    chunk_size: chunkSize,
  });
}

export async function summarizeDocument(filePath: string): Promise<string> {
  return await invoke<string>('summarize_document', { file_path: filePath });
}

export async function getRelatedDocuments(
  filePath: string,
  limit?: number,
): Promise<string[]> {
  return await invoke<string[]>('get_related_documents', {
    file_path: filePath,
    limit,
  });
}

// ── Books ──

export async function listBooks(): Promise<Book[]> {
  return await invoke<Book[]>('list_books');
}

export async function createBook(name: string): Promise<number> {
  return await invoke<number>('create_book', { name });
}

export async function renameBook(bookId: number, newName: string): Promise<void> {
  return await invoke<void>('rename_book', { book_id: bookId, new_name: newName });
}

export async function deleteBook(bookId: number): Promise<void> {
  return await invoke<void>('delete_book', { book_id: bookId });
}

export async function createBookFolder(bookId: string): Promise<string> {
  return await invoke<string>('create_book_folder', { book_id: bookId });
}

export async function deleteBookFolder(bookId: string): Promise<void> {
  return await invoke<void>('delete_book_folder', { book_id: bookId });
}

// ── Files ──

export async function listFilesByBook(bookId: number): Promise<FileRecord[]> {
  return await invoke<FileRecord[]>('list_files_by_book', { book_id: bookId });
}

export async function getFileDetail(fileId: number): Promise<FileRecord | null> {
  return await invoke<FileRecord | null>('get_file_detail', { file_id: fileId });
}

export async function deleteFile(fileId: number): Promise<void> {
  return await invoke<void>('delete_file', { file_id: fileId });
}

export async function syncLibrary(bookId: number, bookPath: string): Promise<number> {
  return await invoke<number>('sync_library', { book_id: bookId, book_path: bookPath });
}

export async function selectFiles(): Promise<string[]> {
  return await invoke<string[]>('select_files');
}

export async function copyFileToBook(filePath: string, bookId: string): Promise<string> {
  return await invoke<string>('copy_file_to_book', { file_path: filePath, book_id: bookId });
}

export async function listBookFiles(bookId: string): Promise<SearchResult[]> {
  return await invoke<SearchResult[]>('list_book_files', { book_id: bookId });
}

// ── Document Persistence ──

export async function parseAndStoreDocument(
  fileId: number,
  filePath: string,
): Promise<DocumentData> {
  return await invoke<DocumentData>('parse_and_store_document', {
    file_id: fileId,
    file_path: filePath,
  });
}

export async function getDocumentChunksFromDb(fileId: number): Promise<DocumentChunk[]> {
  return await invoke<DocumentChunk[]>('get_document_chunks_from_db', { file_id: fileId });
}

export async function getDocumentMetadata(fileId: number): Promise<DocumentRecord | null> {
  return await invoke<DocumentRecord | null>('get_document_metadata', { file_id: fileId });
}

// ── Notes ──

export async function createNote(
  bookId: number,
  title: string,
  contentJson: string,
  plainText: string,
): Promise<number> {
  return await invoke<number>('create_note', {
    book_id: bookId,
    title,
    content_json: contentJson,
    plain_text: plainText,
  });
}

export async function getNote(noteId: number): Promise<Note> {
  return await invoke<Note>('get_note', { note_id: noteId });
}

export async function updateNote(note: Note): Promise<void> {
  return await invoke<void>('update_note', { note });
}

export async function deleteNote(noteId: number): Promise<void> {
  return await invoke<void>('delete_note', { note_id: noteId });
}

export async function listNotesByBook(bookId: number): Promise<Note[]> {
  return await invoke<Note[]>('list_notes_by_book', { book_id: bookId });
}

// ── Note Sources ──

export async function addNoteSource(
  noteId: number,
  fileId: number,
  chunkId: number,
  quoteText: string,
): Promise<void> {
  return await invoke<void>('add_note_source', {
    note_id: noteId,
    file_id: fileId,
    chunk_id: chunkId,
    quote_text: quoteText,
  });
}

export async function getNoteSources(noteId: number): Promise<NoteSource[]> {
  return await invoke<NoteSource[]>('get_note_sources', { note_id: noteId });
}

export async function removeNoteSource(
  noteId: number,
  fileId: number,
  chunkId: number,
): Promise<void> {
  return await invoke<void>('remove_note_source', {
    note_id: noteId,
    file_id: fileId,
    chunk_id: chunkId,
  });
}

// ── AI Context ──

export async function buildAiContext(noteId: number): Promise<string> {
  return await invoke<string>('build_ai_context', { note_id: noteId });
}

export async function generateWithContext(noteId: number, prompt: string): Promise<string> {
  return await invoke<string>('generate_with_context', { note_id: noteId, prompt });
}

export async function retryGeneration(previousPrompt?: string): Promise<string> {
  return await invoke<string>('retry_generation', { previous_prompt: previousPrompt });
}

// ── Blocks ──

export async function createBlock(noteId: number, content: string, order: number): Promise<number> {
  return await invoke<number>('create_block', { note_id: noteId, content, order });
}

export async function updateBlock(block: Block): Promise<void> {
  return await invoke<void>('update_block', { block });
}

export async function deleteBlock(blockId: number): Promise<void> {
  return await invoke<void>('delete_block', { block_id: blockId });
}

export async function listBlocksByNote(noteId: number): Promise<Block[]> {
  return await invoke<Block[]>('list_blocks_by_note', { note_id: noteId });
}

export async function reorderBlocks(noteId: number, blockIds: number[]): Promise<void> {
  return await invoke<void>('reorder_blocks', { note_id: noteId, block_ids: blockIds });
}

// ── Snapshots ──

export async function createSnapshot(noteId: number, snapshot: string): Promise<number> {
  return await invoke<number>('create_snapshot', { note_id: noteId, snapshot });
}

export async function listSnapshotsByNote(noteId: number): Promise<VersionHistory[]> {
  return await invoke<VersionHistory[]>('list_snapshots_by_note', { note_id: noteId });
}

export async function getSnapshot(snapshotId: number): Promise<VersionHistory> {
  return await invoke<VersionHistory>('get_snapshot', { snapshot_id: snapshotId });
}

export async function restoreSnapshot(snapshotId: number): Promise<string> {
  return await invoke<string>('restore_snapshot', { snapshot_id: snapshotId });
}

// ── Sessions ──

export async function saveSession(noteId: number, sessionData: string): Promise<number> {
  return await invoke<number>('save_session', { note_id: noteId, session_data: sessionData });
}

export async function listRecentSessions(
  noteId: number,
  limit?: number,
): Promise<Session[]> {
  return await invoke<Session[]>('list_recent_sessions', { note_id: noteId, limit });
}

export async function restoreSession(sessionId: number): Promise<string> {
  return await invoke<string>('restore_session', { session_id: sessionId });
}

// ── Style Profile ──

export async function extractStyleProfile(bookId: number): Promise<string> {
  return await invoke<string>('extract_style_profile', { book_id: bookId });
}

export async function getStyleProfile(bookId: number): Promise<StyleProfile | null> {
  return await invoke<StyleProfile | null>('get_style_profile', { book_id: bookId });
}

// ── Utility ──

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  return date.toLocaleDateString();
}
