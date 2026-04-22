import { invoke } from '@tauri-apps/api/core';

export interface SearchResult {
  name: string;
  path: string;
  extension: string;
  size: number;
  last_modified: number;
  score: number;
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
