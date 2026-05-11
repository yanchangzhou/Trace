// Re-export all types
export type {
  SearchResult,
  Book,
  FileRecord,
  DocumentSearchResult,
  ParsedDocument,
  DocumentRecord,
  DocumentChunk,
  DocumentData,
  ChunkData,
  Note,
  NoteSource,
  Block,
  VersionHistory,
  Session,
  StyleProfile,
  StyleExample,
  IndexStats,
  WritingTask,
  StructuredOutput,
  GenerationRun,
} from './types';

// Books & files
export {
  listBooks,
  createBook,
  renameBook,
  deleteBook,
  createBookFolder,
  deleteBookFolder,
  listFilesByBook,
  getFileDetail,
  deleteFile,
  syncLibrary,
  selectFiles,
  copyFileToBook,
  listBookFiles,
  parseAndStoreDocument,
  getDocumentChunksFromDb,
  getDocumentMetadata,
} from './books';

// Search, index & document parsing
export {
  searchLocalFiles,
  getDocsFolder,
  reindexFiles,
  openFile,
  compactIndex,
  cleanupOldEntries,
  getIndexStats,
  listAllFiles,
  parseDocument,
  getFileSummary,
  searchDocuments,
  getDocumentChunks,
  summarizeDocument,
  getRelatedDocuments,
} from './search';

// Notes, blocks, snapshots & sessions
export {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotesByBook,
  addNoteSource,
  getNoteSources,
  removeNoteSource,
  createBlock,
  updateBlock,
  deleteBlock,
  listBlocksByNote,
  reorderBlocks,
  createSnapshot,
  listSnapshotsByNote,
  getSnapshot,
  restoreSnapshot,
  saveSession,
  listRecentSessions,
  restoreSession,
} from './notes';

// AI generation & style profiles
export {
  assembleAiPrompt,
  parseAiOutput,
  saveGenerationRun,
  listGenerationRuns,
  updateGenerationOutput,
  markGenerationAdopted,
  extractStyleProfile,
  getStyleProfile,
  listStyleProfiles,
  getStyleExamples,
  deleteStyleProfile,
} from './ai';

// Settings (API key)
export {
  setApiKey,
  hasApiKey,
  getMaskedApiKey,
  deleteApiKey,
  getStorageLocation,
} from './settings';

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
