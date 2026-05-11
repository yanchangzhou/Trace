import { invoke } from '@tauri-apps/api/core';
import type { Book, FileRecord, SearchResult, DocumentData, DocumentChunk, DocumentRecord } from './types';

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

// ── Document persistence ──

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
