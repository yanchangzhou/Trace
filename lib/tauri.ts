import { invoke } from '@tauri-apps/api/core';
import type { Book, SourceFile } from '@/types';

export interface SearchResult {
  name: string;
  path: string;
  extension: string;
  size: number;
  last_modified: number;
  score: number;
}

interface TauriBookRecord {
  id: string;
  name: string;
  created_at?: number | string;
  updated_at?: number | string;
}

interface TauriFileRecord {
  id?: string;
  file_id?: string;
  name: string;
  path: string;
  extension?: string;
  book_id?: string;
  added_at?: number | string;
  created_at?: number | string;
  updated_at?: number | string;
  size?: number;
  status?: string;
}

const CURRENT_BOOK_KEY = 'trace_current_book';

function normalizeTimestamp(value?: number | string): number {
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function getFileExtension(name: string, fallback?: string): string {
  if (fallback) {
    return fallback.toLowerCase();
  }

  return name.split('.').pop()?.toLowerCase() || '';
}

function normalizeFileRecord(file: TauriFileRecord, bookId: string): SourceFile {
  return {
    id: file.id || file.file_id || file.path,
    name: file.name,
    path: file.path,
    extension: getFileExtension(file.name, file.extension),
    bookId: file.book_id || bookId,
    addedAt: normalizeTimestamp(file.added_at || file.created_at || file.updated_at),
    size: file.size,
    status: file.status,
  };
}

function normalizeBookRecord(book: TauriBookRecord, files: SourceFile[] = []): Book {
  return {
    id: book.id,
    name: book.name,
    createdAt: normalizeTimestamp(book.created_at || book.updated_at),
    files,
  };
}

function extractBookIdFromPath(path: string, docsFolder: string): string | null {
  const normalizedDocsFolder = docsFolder.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedPath = path.replace(/\\/g, '/');

  if (!normalizedPath.startsWith(normalizedDocsFolder + '/')) {
    return null;
  }

  const relativePath = normalizedPath.slice(normalizedDocsFolder.length + 1);
  const [bookId] = relativePath.split('/');
  return bookId || null;
}

async function invokeOptional<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.warn(`Tauri command \"${command}\" unavailable or failed`, error);
    return null;
  }
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI__?: unknown }).__TAURI__);
}

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

async function listAllFiles(): Promise<SearchResult[]> {
  return await invoke<SearchResult[]>('list_all_files');
}

export async function listFilesByBook(bookId: string): Promise<SourceFile[]> {
  const primary = await invokeOptional<TauriFileRecord[]>('list_files_by_book', { bookId });
  if (primary) {
    return primary.map((file) => normalizeFileRecord(file, bookId));
  }

  const fallback = await invokeOptional<SearchResult[]>('list_book_files', { bookId });
  if (!fallback) {
    return [];
  }

  return fallback.map((file) => ({
    id: file.path,
    name: file.name,
    path: file.path,
    extension: getFileExtension(file.name, file.extension),
    bookId,
    addedAt: file.last_modified * 1000,
    size: file.size,
    status: 'ready',
  }));
}

export async function listBooks(): Promise<Book[]> {
  const primary = await invokeOptional<TauriBookRecord[]>('list_books');
  if (primary) {
    const booksWithFiles = await Promise.all(
      primary.map(async (book) => normalizeBookRecord(book, await listFilesByBook(book.id))),
    );

    return booksWithFiles.sort((a, b) => a.createdAt - b.createdAt);
  }

  const [docsFolder, indexedFiles] = await Promise.all([getDocsFolder(), listAllFiles()]);
  const filesByBook = new Map<string, SourceFile[]>();

  for (const file of indexedFiles) {
    const bookId = extractBookIdFromPath(file.path, docsFolder);
    if (!bookId) {
      continue;
    }

    const fileList = filesByBook.get(bookId) || [];
    fileList.push({
      id: file.path,
      name: file.name,
      path: file.path,
      extension: getFileExtension(file.name, file.extension),
      bookId,
      addedAt: file.last_modified * 1000,
      size: file.size,
      status: 'ready',
    });
    filesByBook.set(bookId, fileList);
  }

  return Array.from(filesByBook.entries())
    .map(([bookId, files]) => ({
      id: bookId,
      name: bookId,
      createdAt: files.reduce((earliest, file) => Math.min(earliest, file.addedAt), Date.now()),
      files: files.sort((a, b) => b.addedAt - a.addedAt),
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function generateBookId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'book';

  return `${slug}-${Date.now().toString(36)}`;
}

export async function createLibraryBook(name: string): Promise<{ book: Book; persisted: boolean }> {
  const primary = await invokeOptional<TauriBookRecord>('create_book', { name });
  if (primary) {
    return {
      book: normalizeBookRecord(primary, []),
      persisted: true,
    };
  }

  const bookId = generateBookId(name);
  await invoke<string>('create_book_folder', { bookId });

  return {
    book: {
      id: bookId,
      name,
      createdAt: Date.now(),
      files: [],
    },
    persisted: false,
  };
}

export async function renameLibraryBook(bookId: string, newName: string): Promise<boolean> {
  const result = await invokeOptional<unknown>('rename_book', { bookId, newName });
  return result !== null;
}

export async function deleteLibraryBook(bookId: string): Promise<void> {
  const deleted = await invokeOptional<unknown>('delete_book', { bookId });
  if (deleted !== null) {
    return;
  }

  await invoke<void>('delete_book_folder', { bookId });
}

export async function deleteLibraryFile(file: SourceFile): Promise<void> {
  const deleted = await invokeOptional<unknown>('delete_file', {
    fileId: file.id,
    filePath: file.path,
    bookId: file.bookId,
  });

  if (deleted === null) {
    throw new Error('delete_file Tauri command is not available yet');
  }
}

export async function syncLibrary(): Promise<void> {
  const synced = await invokeOptional<unknown>('sync_library');
  if (synced !== null) {
    return;
  }

  await reindexFiles();
}

export function getStoredCurrentBookId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(CURRENT_BOOK_KEY);
}

export function storeCurrentBookId(bookId: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!bookId) {
    window.localStorage.removeItem(CURRENT_BOOK_KEY);
    return;
  }

  window.localStorage.setItem(CURRENT_BOOK_KEY, bookId);
}

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
