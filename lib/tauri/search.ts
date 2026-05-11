import { invoke } from '@tauri-apps/api/core';
import type { SearchResult, DocumentSearchResult, ParsedDocument, IndexStats } from './types';

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

// ── Document parsing ──

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
