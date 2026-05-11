import { invoke } from '@tauri-apps/api/core';
import type { Book, SourceFile, ContentSearchResult, DocumentChunk, Note, AIRequest, SavedStyleProfile } from '@/types';

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
  role?: 'source' | 'style_sample' | 'both';
  parse_status?: 'pending' | 'parsing' | 'ready' | 'failed';
  parse_error?: string | null;
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
    role: file.role || 'source',
    parseStatus: file.parse_status || (file.status === 'ready' ? 'ready' : 'pending'),
    parseError: file.parse_error ?? null,
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

export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

async function invokeOptional<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    // Browser (non-Tauri) failures are expected and should not flood the console.
    if (isTauriEnvironment()) {
      console.warn(`Tauri command "${command}" unavailable or failed`, error);
    }
    return null;
  }
}

export async function searchLocalFiles(query: string): Promise<SearchResult[]> {
  if (!isTauriEnvironment()) return [];
  return await invoke<SearchResult[]>('search_local_files', { query });
}

export async function getDocsFolder(): Promise<string> {
  if (!isTauriEnvironment()) return '';
  return await invoke<string>('get_docs_folder');
}

export async function reindexFiles(): Promise<number> {
  if (!isTauriEnvironment()) return 0;
  return await invoke<number>('reindex_files');
}

export async function selectFiles(): Promise<string[]> {
  if (!isTauriEnvironment()) return [];
  return await invoke<string[]>('select_files');
}

export async function copyFileToBook(filePath: string, bookId: string): Promise<string> {
  if (!isTauriEnvironment()) throw new Error('copyFileToBook requires the desktop app');
  return await invoke<string>('copy_file_to_book', { filePath, bookId });
}

export async function retryFileParse(fileId: string, filePath: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke<void>('retry_file_parse', { fileId, filePath });
}

export async function openFile(path: string): Promise<void> {
  if (!isTauriEnvironment()) return;
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
    role: 'source',
    parseStatus: 'ready',
    parseError: null,
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
      role: 'source',
      parseStatus: 'ready',
      parseError: null,
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

export async function updateLibraryFileRole(fileId: string, role: 'source' | 'style_sample' | 'both'): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke<void>('update_file_role', { fileId, role });
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

// ── Stage 2: Content search & document retrieval ──

export async function searchDocuments(query: string, scope?: string): Promise<ContentSearchResult[]> {
  if (!isTauriEnvironment()) return [];
  return await invoke<ContentSearchResult[]>('search_documents', { query, scope });
}

export async function getDocumentChunks(fileId: string): Promise<DocumentChunk[]> {
  if (!isTauriEnvironment()) return [];
  return await invoke<DocumentChunk[]>('get_document_chunks', { fileId });
}

export async function summarizeDocument(fileId: string): Promise<string> {
  if (!isTauriEnvironment()) return '';
  return await invoke<string>('summarize_document', { fileId });
}

export async function getIndexStats(): Promise<{
  total_documents: number;
  total_chunks: number;
  index_size_bytes: number;
  last_indexed_at: number;
} | null> {
  if (!isTauriEnvironment()) return null;
  return await invoke('get_index_stats');
}

// ── Stage 3: Notes & AI ──

export async function createNote(bookId: string, title: string, contentJson: string, plainText: string): Promise<Note> {
  if (!isTauriEnvironment()) throw new Error('createNote requires the desktop app');
  return await invoke<Note>('create_note', { bookId, title, contentJson, plainText });
}

export async function updateNote(noteId: string, title: string, contentJson: string, plainText: string): Promise<Note> {
  if (!isTauriEnvironment()) throw new Error('updateNote requires the desktop app');
  return await invoke<Note>('update_note', { noteId, title, contentJson, plainText });
}

export async function getNote(noteId: string): Promise<Note> {
  if (!isTauriEnvironment()) throw new Error('getNote requires the desktop app');
  return await invoke<Note>('get_note', { noteId });
}

export async function listNotesByBook(bookId: string): Promise<Note[]> {
  if (!isTauriEnvironment()) return [];
  return await invoke<Note[]>('list_notes_by_book', { bookId });
}

export async function buildAIContext(request: AIRequest): Promise<string> {
  if (!isTauriEnvironment()) return '';
  return await invoke<string>('build_ai_context', { request });
}

// ── API key management ──

export async function saveApiKey(key: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return await invoke<void>('save_api_key', { key });
}

export async function getApiKey(): Promise<string | null> {
  return await invokeOptional<string>('get_api_key');
}

// ── Real streaming AI via Tauri events ──
// The Rust command `stream_generate` fires and returns immediately.
// Actual tokens arrive as events named `ai-stream-{streamId}`.

/** Shape of the Tauri event payload from the Rust stream_generate command. */
export interface TauriStreamPayload {
  type: 'token' | 'done' | 'error';
  content?: string;
  message?: string;
}

/**
 * Start a streaming AI generation. Returns a cancel function.
 * Calls onToken for each token, onDone when complete, onError on failure.
 */
export async function streamGenerate(
  request: AIRequest,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
): Promise<() => void> {
  if (!isTauriEnvironment()) {
    onError('AI generation requires the desktop app.');
    return () => {};
  }

  const streamId = crypto.randomUUID();
  const eventName = `ai-stream-${streamId}`;
  let unlisten: (() => void) | undefined;

  try {
    const { listen } = await import('@tauri-apps/api/event');
    unlisten = await listen<TauriStreamPayload>(eventName, (event) => {
      const payload = event.payload;
      if (payload.type === 'token' && payload.content) {
        onToken(payload.content);
      } else if (payload.type === 'done') {
        unlisten?.();
        onDone();
      } else if (payload.type === 'error') {
        unlisten?.();
        onError(payload.message ?? 'Unknown error');
      }
    });
    await invoke<void>('stream_generate', { request, streamId });
  } catch (err) {
    unlisten?.();
    onError(err instanceof Error ? err.message : String(err));
    return () => {};
  }

  return () => unlisten?.();
}

// ── Stage 5: Style profiles ──

export async function getStyleProfile(style: string): Promise<import('@/types').StyleProfile | null> {
  return await invokeOptional<import('@/types').StyleProfile>('get_style_profile', { style });
}

export async function extractMyStyle(): Promise<import('@/types').StyleProfile | null> {
  return await invokeOptional<import('@/types').StyleProfile>('extract_my_style');
}

export async function createStyleProfileFromSamples(name: string, fileIds: string[]): Promise<SavedStyleProfile | null> {
  return await invokeOptional<SavedStyleProfile>('create_style_profile_from_samples', { name, fileIds });
}

export async function listSavedStyleProfiles(): Promise<SavedStyleProfile[]> {
  if (!isTauriEnvironment()) return [];
  return await invoke<SavedStyleProfile[]>('list_style_profiles');
}

export async function updateSavedStyleProfile(profileId: string, name: string, profileJson: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return await invoke<void>('update_saved_style_profile', { profileId, name, profileJson });
}

export async function deleteSavedStyleProfile(profileId: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return await invoke<void>('delete_style_profile', { profileId });
}

// ── LLM-Powered Style Analysis ──

export async function analyzeStyleWithLLM(fileIds: string[], profileName: string): Promise<SavedStyleProfile | null> {
  return await invokeOptional<SavedStyleProfile>('analyze_style_with_llm', { fileIds, profileName });
}

// ── Model Provider Settings ──

export async function saveModelSettings(provider: string, modelName: string, baseUrl: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return await invoke<void>('save_model_settings', { provider, modelName, baseUrl });
}

export async function getModelSettings(): Promise<{
  provider: string;
  model_name: string;
  base_url: string;
} | null> {
  return await invokeOptional('get_model_settings');
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
