import { invoke as tauriInvoke, Channel } from '@tauri-apps/api/core';
import type { Book, SourceFile, ContentSearchResult, DocumentChunk, Note, NoteSource, AIRequest, AIStreamEvent } from '@/types';

// Safe invoke wrapper — throws with a clear error when Tauri is not available
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnvironment()) {
    throw new Error(`Tauri command "${command}" is not available outside the Tauri desktop app.`);
  }
  return await tauriInvoke<T>(command, args);
}

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
    return await safeInvoke<T>(command, args);
  } catch (error) {
    console.warn(`Tauri command \"${command}\" unavailable or failed`, error);
    return null;
  }
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI__?: unknown }).__TAURI__);
}

export async function searchLocalFiles(query: string): Promise<SearchResult[]> {
  return await safeInvoke<SearchResult[]>('search_local_files', { query });
}

export async function getDocsFolder(): Promise<string> {
  return await safeInvoke<string>('get_docs_folder');
}

export async function reindexFiles(): Promise<number> {
  return await safeInvoke<number>('reindex_files');
}

export async function openFile(path: string): Promise<void> {
  return await safeInvoke<void>('open_file', { path });
}

async function listAllFiles(): Promise<SearchResult[]> {
  return await safeInvoke<SearchResult[]>('list_all_files');
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
  await safeInvoke<string>('create_book_folder', { bookId });

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

  await safeInvoke<void>('delete_book_folder', { bookId });
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

// ── Stage 2: Content search & document retrieval ──

export async function searchDocuments(query: string, scope?: string): Promise<ContentSearchResult[]> {
  return await safeInvoke<ContentSearchResult[]>('search_documents', { query, scope });
}

export async function getDocumentChunks(fileId: string): Promise<DocumentChunk[]> {
  return await safeInvoke<DocumentChunk[]>('get_document_chunks', { fileId });
}

export async function summarizeDocument(fileId: string): Promise<string> {
  return await safeInvoke<string>('summarize_document', { fileId });
}

export async function getIndexStats(): Promise<{
  total_documents: number;
  total_chunks: number;
  index_size_bytes: number;
  last_indexed_at: number;
}> {
  return await safeInvoke('get_index_stats');
}

// ── Stage 3: Notes & AI ──

// Browser-mode localStorage fallback for notes
const BROWSER_NOTES_KEY = 'trace_browser_notes';

interface BrowserNoteStore {
  [noteId: string]: { bookId: string; title: string; contentJson: string; plainText: string; createdAt: number; updatedAt: number };
}

function getBrowserNotes(): BrowserNoteStore {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(BROWSER_NOTES_KEY) || '{}');
  } catch { return {}; }
}

function setBrowserNotes(store: BrowserNoteStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BROWSER_NOTES_KEY, JSON.stringify(store));
}

function browserNoteId(): string {
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createNote(bookId: string, title: string, contentJson: string, plainText: string): Promise<Note> {
  if (!isTauriEnvironment()) {
    const id = browserNoteId();
    const now = Date.now();
    const store = getBrowserNotes();
    store[id] = { bookId, title, contentJson, plainText, createdAt: now, updatedAt: now };
    setBrowserNotes(store);
    return { id, book_id: bookId, title, content_json: contentJson, plain_text: plainText, created_at: now, updated_at: now };
  }
  return await safeInvoke<Note>('create_note', { bookId, title, contentJson, plainText });
}

export async function updateNote(noteId: string, title: string, contentJson: string, plainText: string): Promise<Note> {
  if (!isTauriEnvironment()) {
    const store = getBrowserNotes();
    const entry = store[noteId];
    if (!entry) throw new Error(`Note ${noteId} not found`);
    const now = Date.now();
    store[noteId] = { ...entry, title, contentJson, plainText, updatedAt: now };
    setBrowserNotes(store);
    return { id: noteId, book_id: entry.bookId, title, content_json: contentJson, plain_text: plainText, created_at: entry.createdAt, updated_at: now };
  }
  return await safeInvoke<Note>('update_note', { noteId, title, contentJson, plainText });
}

export async function getNote(noteId: string): Promise<Note> {
  if (!isTauriEnvironment()) {
    const store = getBrowserNotes();
    const entry = store[noteId];
    if (!entry) throw new Error(`Note ${noteId} not found`);
    return { id: noteId, book_id: entry.bookId, title: entry.title, content_json: entry.contentJson, plain_text: entry.plainText, created_at: entry.createdAt, updated_at: entry.updatedAt };
  }
  return await safeInvoke<Note>('get_note', { noteId });
}

export async function listNotesByBook(bookId: string): Promise<Note[]> {
  if (!isTauriEnvironment()) {
    const store = getBrowserNotes();
    return Object.entries(store)
      .filter(([, v]) => v.bookId === bookId)
      .map(([id, v]) => ({ id, book_id: v.bookId, title: v.title, content_json: v.contentJson, plain_text: v.plainText, created_at: v.createdAt, updated_at: v.updatedAt }));
  }
  return await safeInvoke<Note[]>('list_notes_by_book', { bookId });
}

export async function buildAIContext(request: AIRequest): Promise<string> {
  return await safeInvoke<string>('build_ai_context', { request });
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface FileInfo {
  name: string;
  extension: string;
  size?: number;
}

async function callDeepSeekBrowser(
  messages: ChatMessage[],
  onToken: (token: string) => void,
): Promise<string> {
  const response = await fetch('/api/ai/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const chunk = JSON.parse(data);
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          onToken(content);
        }
      } catch {
        // skip malformed JSON lines
      }
    }
  }

  return fullResponse;
}

export async function generateAIStream(
  messages: ChatMessage[],
  request: AIRequest | null,
  onToken: (token: string) => void,
  onDone: (fullResponse: string) => void,
  onError: (error: string) => void,
  files: FileInfo[] = [],
): Promise<void> {
  if (isTauriEnvironment()) {
    // Use Tauri backend — Rust builds context from actual DB data, API key stays in Rust
    try {
      const channel = new Channel<AIStreamEvent>();
      channel.onmessage = (chunk: AIStreamEvent) => {
        switch (chunk.type) {
          case 'token':
            if (chunk.content) onToken(chunk.content);
            break;
          case 'done':
            if (chunk.content) onDone(chunk.content);
            break;
          case 'error':
            if (chunk.error) onError(chunk.error);
            break;
        }
      };

      await safeInvoke<string>('generate_ai_stream', {
        messagesJson: JSON.stringify(messages),
        request,
        onChunk: channel,
      });
    } catch (err) {
      onError(String(err));
    }
  } else {
    // Browser fallback: build a context prompt with file info + call DeepSeek directly
    try {
      let apiMessages = messages;
      if (request && (request.context_file_ids.length > 0 || request.prompt || files.length > 0)) {
        const contextPrompt = buildSimpleContextPrompt(request, files);
        apiMessages = [
          { role: 'system', content: contextPrompt },
          ...apiMessages,
        ];
      }

      const fullResponse = await callDeepSeekBrowser(apiMessages, onToken);
      onDone(fullResponse);
    } catch (err) {
      onError(String(err));
    }
  }
}

function buildSimpleContextPrompt(request: AIRequest, files: FileInfo[]): string {
  const actionPrompts: Record<string, string> = {
    summarize: 'Summarize the provided documents concisely.',
    compare: 'Compare the provided documents, highlighting similarities and differences.',
    outline: 'Generate a structured outline based on the provided documents.',
    free: 'Answer the user\'s question helpfully.',
  };
  const stylePrompts: Record<string, string> = {
    academic: 'Use a formal, academic tone with precise terminology.',
    analytical: 'Use an analytical tone focused on data and logical reasoning.',
    concise: 'Be brief and direct. Use short sentences.',
    my_style: 'Match the user\'s writing style from their notes.',
  };

  const action = actionPrompts[request.action] || actionPrompts.free;
  const style = request.style && stylePrompts[request.style] ? `\n\nStyle: ${stylePrompts[request.style]}` : '';

  // Include file information in the context
  let fileContext = '';
  if (files.length > 0) {
    fileContext = '\n\n## Available Files\n';
    for (const f of files) {
      const size = f.size ? ` (${formatFileSize(f.size)})` : '';
      fileContext += `- ${f.name} [${f.extension}]${size}\n`;
    }
    fileContext += '\nUse the information from these files to answer the user\'s question. If you need specific content from a file, ask the user to paste the relevant text.';
  }

  const prompt = request.prompt ? `\n\nUser Request: ${request.prompt}` : '';

  return `${action}${style}${fileContext}${prompt}`;
}

// ── Stage 5: Style profiles ──

export async function getStyleProfile(style: string): Promise<import('@/types').StyleProfile | null> {
  return await invokeOptional<import('@/types').StyleProfile>('get_style_profile', { style });
}

export async function extractMyStyle(): Promise<import('@/types').StyleProfile | null> {
  return await invokeOptional<import('@/types').StyleProfile>('extract_my_style');
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
