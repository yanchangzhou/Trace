import { invoke } from '@tauri-apps/api/core';
import type { Note, NoteSource, Block, VersionHistory, Session } from './types';

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

// ── Note sources ──

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
