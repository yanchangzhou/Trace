import { invoke } from '@tauri-apps/api/core';

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

/**
 * Search local files using the Rust backend
 */
export async function searchLocalFiles(query: string): Promise<SearchResult[]> {
  return await invoke<SearchResult[]>('search_local_files', { query });
}

/**
 * Get the TraceDocs folder path
 */
export async function getDocsFolder(): Promise<string> {
  return await invoke<string>('get_docs_folder');
}

/**
 * Reindex all files in TraceDocs
 */
export async function reindexFiles(): Promise<number> {
  return await invoke<number>('reindex_files');
}

export async function listBooks(databaseUrl: string): Promise<Book[]> {
  return await invoke<Book[]>('list_books', { database_url: databaseUrl });
}

export async function createBook(databaseUrl: string, name: string): Promise<number> {
  return await invoke<number>('create_book', { database_url: databaseUrl, name });
}

export async function renameBook(databaseUrl: string, bookId: number, newName: string): Promise<void> {
  return await invoke<void>('rename_book', { database_url: databaseUrl, book_id: bookId, new_name: newName });
}

export async function deleteBook(databaseUrl: string, bookId: number): Promise<void> {
  return await invoke<void>('delete_book', { database_url: databaseUrl, book_id: bookId });
}

export async function listFilesByBook(databaseUrl: string, bookId: number): Promise<FileRecord[]> {
  return await invoke<FileRecord[]>('list_files_by_book', { database_url: databaseUrl, book_id: bookId });
}

export async function getFileDetail(databaseUrl: string, fileId: number): Promise<FileRecord | null> {
  return await invoke<FileRecord | null>('get_file_detail', { database_url: databaseUrl, file_id: fileId });
}

export async function deleteFile(databaseUrl: string, fileId: number): Promise<void> {
  return await invoke<void>('delete_file', { database_url: databaseUrl, file_id: fileId });
}

export async function syncLibrary(databaseUrl: string, bookId: number, bookPath: string): Promise<void> {
  return await invoke<void>('sync_library', { database_url: databaseUrl, book_id: bookId, book_path: bookPath });
}

export async function searchDocuments(query: string, scope?: string, limit?: number): Promise<DocumentSearchResult[]> {
  return await invoke<DocumentSearchResult[]>('search_documents', { query, scope, limit });
}

export async function getDocumentChunks(filePath: string, chunkSize?: number): Promise<string[]> {
  return await invoke<string[]>('get_document_chunks', { file_path: filePath, chunk_size: chunkSize });
}

export async function summarizeDocument(filePath: string): Promise<string> {
  return await invoke<string>('summarize_document', { file_path: filePath });
}

export async function getNote(databaseUrl: string, noteId: number): Promise<any> {
  return await invoke<any>('get_note', { database_url: databaseUrl, note_id: noteId });
}

export async function updateNote(databaseUrl: string, note: any): Promise<void> {
  return await invoke<void>('update_note', { database_url: databaseUrl, note });
}

export async function generateWithContext(databaseUrl: string, noteId: number, prompt: string): Promise<string> {
  return await invoke<string>('generate_with_context', { database_url: databaseUrl, note_id: noteId, prompt });
}

export async function retryGeneration(generationId?: string): Promise<string> {
  return await invoke<string>('retry_generation', { generation_id: generationId });
}

/**
 * Open a file in the default application
 */
export async function openFile(path: string): Promise<void> {
  return await invoke<void>('open_file', { path });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format timestamp for display
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Less than 1 minute
  if (diff < 60000) return 'Just now';
  
  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  
  // Less than 1 day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  
  // Less than 1 week
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  
  // Format as date
  return date.toLocaleDateString();
}
