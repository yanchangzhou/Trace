use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::models::*;

pub struct Database {
    conn: Mutex<Connection>,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

impl Database {
    pub fn new(path: &PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Self { conn: Mutex::new(conn) };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                extension TEXT NOT NULL DEFAULT '',
                size INTEGER NOT NULL DEFAULT 0,
                hash TEXT,
                status TEXT NOT NULL DEFAULT 'ready',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
                summary TEXT NOT NULL DEFAULT '',
                word_count INTEGER NOT NULL DEFAULT 0,
                page_count INTEGER,
                slide_count INTEGER,
                headings_json TEXT NOT NULL DEFAULT '[]',
                parsed_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS document_chunks (
                id TEXT PRIMARY KEY,
                file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                token_count INTEGER NOT NULL DEFAULT 0,
                locator_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                title TEXT NOT NULL DEFAULT 'Untitled Note',
                content_json TEXT NOT NULL DEFAULT '{}',
                plain_text TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS note_sources (
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                chunk_id TEXT,
                quote_text TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (note_id, file_id, quote_text)
            );

            CREATE TABLE IF NOT EXISTS note_versions (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                version_number INTEGER NOT NULL,
                content_json TEXT NOT NULL,
                plain_text TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS note_sessions (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                started_at INTEGER NOT NULL,
                ended_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_files_book ON files(book_id);
            CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
            CREATE INDEX IF NOT EXISTS idx_chunks_file ON document_chunks(file_id);
            CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(book_id);
            CREATE INDEX IF NOT EXISTS idx_versions_note ON note_versions(note_id);
            ",
        )?;
        Ok(())
    }

    // ── Books ──

    pub fn list_books(&self) -> Result<Vec<Book>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at, updated_at FROM books ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Book {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn create_book(&self, name: &str) -> Result<Book> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_secs();
        conn.execute(
            "INSERT INTO books (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, now, now],
        )?;
        Ok(Book { id, name: name.to_string(), created_at: now, updated_at: now })
    }

    pub fn rename_book(&self, book_id: &str, new_name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE books SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_name, now_secs(), book_id],
        )?;
        Ok(())
    }

    pub fn delete_book(&self, book_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM books WHERE id = ?1", params![book_id])?;
        Ok(())
    }

    // ── Files ──

    pub fn list_files_by_book(&self, book_id: &str) -> Result<Vec<FileRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, book_id, name, path, extension, size, hash, status, created_at, updated_at
             FROM files WHERE book_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![book_id], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                book_id: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                extension: row.get(4)?,
                size: row.get(5)?,
                hash: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn add_file(&self, file: &FileRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO files (id, book_id, name, path, extension, size, hash, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                file.id, file.book_id, file.name, file.path, file.extension,
                file.size, file.hash, file.status, file.created_at, file.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_file_by_path(&self, path: &str) -> Result<Option<FileRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, book_id, name, path, extension, size, hash, status, created_at, updated_at
             FROM files WHERE path = ?1",
        )?;
        let mut rows = stmt.query_map(params![path], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                book_id: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                extension: row.get(4)?,
                size: row.get(5)?,
                hash: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn delete_file(&self, file_id: &str, file_path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM files WHERE id = ?1 OR path = ?2",
            params![file_id, file_path],
        )?;
        Ok(())
    }

    // ── Documents ──

    pub fn upsert_document(&self, doc: &DocumentRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO documents (file_id, summary, word_count, page_count, slide_count, headings_json, parsed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                doc.file_id, doc.summary, doc.word_count, doc.page_count,
                doc.slide_count, doc.headings_json, doc.parsed_at
            ],
        )?;
        Ok(())
    }

    pub fn get_document(&self, file_id: &str) -> Result<Option<DocumentRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT file_id, summary, word_count, page_count, slide_count, headings_json, parsed_at
             FROM documents WHERE file_id = ?1",
        )?;
        let mut rows = stmt.query_map(params![file_id], |row| {
            Ok(DocumentRecord {
                file_id: row.get(0)?,
                summary: row.get(1)?,
                word_count: row.get(2)?,
                page_count: row.get(3)?,
                slide_count: row.get(4)?,
                headings_json: row.get(5)?,
                parsed_at: row.get(6)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    // ── Document Chunks ──

    pub fn insert_chunk(&self, chunk: &DocumentChunk) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO document_chunks (id, file_id, chunk_index, text, token_count, locator_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![chunk.id, chunk.file_id, chunk.chunk_index, chunk.text, chunk.token_count, chunk.locator_json],
        )?;
        Ok(())
    }

    pub fn insert_chunks(&self, chunks: &[DocumentChunk]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO document_chunks (id, file_id, chunk_index, text, token_count, locator_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        for chunk in chunks {
            stmt.execute(params![chunk.id, chunk.file_id, chunk.chunk_index, chunk.text, chunk.token_count, chunk.locator_json])?;
        }
        Ok(())
    }

    pub fn get_chunks(&self, file_id: &str) -> Result<Vec<DocumentChunk>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, file_id, chunk_index, text, token_count, locator_json
             FROM document_chunks WHERE file_id = ?1 ORDER BY chunk_index ASC",
        )?;
        let rows = stmt.query_map(params![file_id], |row| {
            Ok(DocumentChunk {
                id: row.get(0)?,
                file_id: row.get(1)?,
                chunk_index: row.get(2)?,
                text: row.get(3)?,
                token_count: row.get(4)?,
                locator_json: row.get(5)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn delete_chunks_for_file(&self, file_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM document_chunks WHERE file_id = ?1", params![file_id])?;
        Ok(())
    }

    // ── Notes ──

    pub fn create_note(&self, book_id: &str, title: &str, content_json: &str, plain_text: &str) -> Result<Note> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_secs();
        conn.execute(
            "INSERT INTO notes (id, book_id, title, content_json, plain_text, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, book_id, title, content_json, plain_text, now, now],
        )?;
        Ok(Note {
            id, book_id: book_id.to_string(), title: title.to_string(),
            content_json: content_json.to_string(), plain_text: plain_text.to_string(),
            created_at: now, updated_at: now,
        })
    }

    pub fn update_note(&self, note_id: &str, title: &str, content_json: &str, plain_text: &str) -> Result<Note> {
        let conn = self.conn.lock().unwrap();
        let now = now_secs();
        conn.execute(
            "UPDATE notes SET title = ?1, content_json = ?2, plain_text = ?3, updated_at = ?4 WHERE id = ?5",
            params![title, content_json, plain_text, now, note_id],
        )?;
        Ok(Note {
            id: note_id.to_string(), book_id: String::new(), title: title.to_string(),
            content_json: content_json.to_string(), plain_text: plain_text.to_string(),
            created_at: 0, updated_at: now,
        })
    }

    pub fn get_note(&self, note_id: &str) -> Result<Option<Note>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, book_id, title, content_json, plain_text, created_at, updated_at
             FROM notes WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![note_id], |row| {
            Ok(Note {
                id: row.get(0)?,
                book_id: row.get(1)?,
                title: row.get(2)?,
                content_json: row.get(3)?,
                plain_text: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn list_notes_by_book(&self, book_id: &str) -> Result<Vec<Note>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, book_id, title, content_json, plain_text, created_at, updated_at
             FROM notes WHERE book_id = ?1 ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![book_id], |row| {
            Ok(Note {
                id: row.get(0)?,
                book_id: row.get(1)?,
                title: row.get(2)?,
                content_json: row.get(3)?,
                plain_text: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ── Note Sources ──

    pub fn add_note_source(&self, source: &NoteSource) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO note_sources (note_id, file_id, chunk_id, quote_text)
             VALUES (?1, ?2, ?3, ?4)",
            params![source.note_id, source.file_id, source.chunk_id, source.quote_text],
        )?;
        Ok(())
    }

    // ── Note Versions ──

    pub fn save_version(&self, note_id: &str, content_json: &str, plain_text: &str) -> Result<NoteVersion> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_secs();
        // Get next version number
        let max_ver: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version_number), 0) FROM note_versions WHERE note_id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let version_number = max_ver + 1;
        conn.execute(
            "INSERT INTO note_versions (id, note_id, version_number, content_json, plain_text, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, note_id, version_number, content_json, plain_text, now],
        )?;
        Ok(NoteVersion {
            id, note_id: note_id.to_string(), version_number,
            content_json: content_json.to_string(), plain_text: plain_text.to_string(), created_at: now,
        })
    }

    pub fn list_versions(&self, note_id: &str) -> Result<Vec<NoteVersion>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, note_id, version_number, content_json, plain_text, created_at
             FROM note_versions WHERE note_id = ?1 ORDER BY version_number DESC",
        )?;
        let rows = stmt.query_map(params![note_id], |row| {
            Ok(NoteVersion {
                id: row.get(0)?,
                note_id: row.get(1)?,
                version_number: row.get(2)?,
                content_json: row.get(3)?,
                plain_text: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn restore_version(&self, note_id: &str, version_number: i64) -> Result<Option<Note>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT content_json, plain_text FROM note_versions
             WHERE note_id = ?1 AND version_number = ?2",
        )?;
        let mut rows = stmt.query_map(params![note_id, version_number], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        if let Some(row) = rows.next() {
            let (content_json, plain_text) = row?;
            let note = self.get_note(note_id)?.context("Note not found")?;
            // Update note with version content
            conn.execute(
                "UPDATE notes SET content_json = ?1, plain_text = ?2, updated_at = ?3 WHERE id = ?4",
                params![content_json, plain_text, now_secs(), note_id],
            )?;
            Ok(Some(Note {
                id: note.id, book_id: note.book_id, title: note.title,
                content_json, plain_text,
                created_at: note.created_at, updated_at: now_secs(),
            }))
        } else {
            Ok(None)
        }
    }

    // ── Sessions ──

    pub fn start_session(&self, note_id: &str) -> Result<NoteSession> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_secs();
        conn.execute(
            "INSERT INTO note_sessions (id, note_id, started_at) VALUES (?1, ?2, ?3)",
            params![id, note_id, now],
        )?;
        Ok(NoteSession { id, note_id: note_id.to_string(), started_at: now, ended_at: None })
    }

    pub fn end_session(&self, session_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE note_sessions SET ended_at = ?1 WHERE id = ?2",
            params![now_secs(), session_id],
        )?;
        Ok(())
    }

    // ── Stats ──

    pub fn get_document_count(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.query_row("SELECT COUNT(*) FROM documents", [], |r| r.get::<_, usize>(0))?)
    }

    pub fn get_chunk_count(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.query_row("SELECT COUNT(*) FROM document_chunks", [], |r| r.get::<_, usize>(0))?)
    }
}
