use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Row, Sqlite};
use anyhow::Result;
use std::path::Path;
use std::str::FromStr;

// ── Models ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Book {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct FileRecord {
    pub id: i64,
    pub book_id: i64,
    pub name: String,
    pub path: String,
    pub extension: String,
    pub size: i64,
    pub hash: String,
    pub status: String,
    pub error_message: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Document {
    pub file_id: i64,
    pub summary: String,
    pub word_count: i64,
    pub page_count: Option<i64>,
    pub slide_count: Option<i64>,
    pub headings_json: String,
    pub parsed_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct DocumentChunk {
    pub id: i64,
    pub file_id: i64,
    pub chunk_index: i64,
    pub text: String,
    pub token_count: i64,
    pub locator_json: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Note {
    pub id: i64,
    pub book_id: i64,
    pub title: String,
    pub content_json: String,
    pub plain_text: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct NoteSource {
    pub note_id: i64,
    pub file_id: i64,
    pub chunk_id: i64,
    pub quote_text: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Block {
    pub id: i64,
    pub note_id: i64,
    pub content: String,
    #[sqlx(rename = "order")]
    pub order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct VersionHistory {
    pub id: i64,
    pub note_id: i64,
    pub snapshot: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: i64,
    pub note_id: i64,
    pub session_data: String,
    pub last_active: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct StyleProfile {
    pub id: i64,
    pub book_id: i64,
    pub name: String,
    pub source_scope: String,
    pub language: String,
    pub profile_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct StyleExample {
    pub id: i64,
    pub profile_id: i64,
    pub file_id: Option<i64>,
    pub note_id: Option<i64>,
    pub text: String,
    pub tags_json: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct GenerationRun {
    pub id: i64,
    pub note_id: i64,
    pub scene: String,
    pub stage: String,
    pub input_json: String,
    pub prompt_full: String,
    pub output_raw: Option<String>,
    pub output_json: Option<String>,
    pub user_adopted: i32,
    pub created_at: String,
}

// ── Database ──

pub struct Database {
    pub pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new(db_path: &Path) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", db_path.to_string_lossy().replace('\\', "/")))?
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;
        Ok(Self { pool })
    }

    // ── Table creation ──

    pub async fn create_tables(&self) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                extension TEXT NOT NULL,
                size INTEGER NOT NULL,
                hash TEXT DEFAULT '',
                status TEXT DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(book_id) REFERENCES books(id)
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS documents (
                file_id INTEGER PRIMARY KEY,
                summary TEXT DEFAULT '',
                word_count INTEGER DEFAULT 0,
                page_count INTEGER,
                slide_count INTEGER,
                headings_json TEXT DEFAULT '[]',
                parsed_at TEXT,
                FOREIGN KEY(file_id) REFERENCES files(id)
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS document_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                token_count INTEGER DEFAULT 0,
                locator_json TEXT DEFAULT '{}',
                FOREIGN KEY(file_id) REFERENCES files(id)
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content_json TEXT NOT NULL DEFAULT '{}',
                plain_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS note_sources (
                note_id INTEGER NOT NULL,
                file_id INTEGER NOT NULL,
                chunk_id INTEGER NOT NULL,
                quote_text TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        ).execute(&self.pool).await?;

        Ok(())
    }

    pub async fn create_block_table(&self) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                \"order\" INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS version_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                snapshot TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                session_data TEXT NOT NULL,
                last_active TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS style_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                name TEXT NOT NULL DEFAULT 'Unnamed Profile',
                source_scope TEXT NOT NULL DEFAULT 'book_notes',
                language TEXT NOT NULL DEFAULT 'auto',
                profile_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(book_id) REFERENCES books(id)
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS style_examples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                file_id INTEGER,
                note_id INTEGER,
                text TEXT NOT NULL,
                tags_json TEXT NOT NULL DEFAULT '[]',
                FOREIGN KEY(profile_id) REFERENCES style_profiles(id) ON DELETE CASCADE
            );"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS generation_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                scene TEXT NOT NULL,
                stage TEXT NOT NULL,
                input_json TEXT NOT NULL,
                prompt_full TEXT NOT NULL,
                output_raw TEXT,
                output_json TEXT,
                user_adopted INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        ).execute(&self.pool).await?;

        Ok(())
    }

    // ── Book CRUD ──

    pub async fn list_books(&self) -> Result<Vec<Book>> {
        let books = sqlx::query_as::<_, Book>(
            "SELECT id, name, created_at, updated_at FROM books ORDER BY updated_at DESC"
        ).fetch_all(&self.pool).await?;
        Ok(books)
    }

    pub async fn create_book(&self, name: &str, created_at: &str) -> Result<i64> {
        let res = sqlx::query(
            "INSERT INTO books (name, created_at, updated_at) VALUES (?, ?, ?)"
        )
        .bind(name)
        .bind(created_at)
        .bind(created_at)
        .execute(&self.pool).await?;
        Ok(res.last_insert_rowid())
    }

    pub async fn rename_book(&self, book_id: i64, new_name: &str, updated_at: &str) -> Result<()> {
        sqlx::query("UPDATE books SET name = ?, updated_at = ? WHERE id = ?")
            .bind(new_name)
            .bind(updated_at)
            .bind(book_id)
            .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn delete_book(&self, book_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM note_sources WHERE note_id IN (SELECT id FROM notes WHERE book_id = ?)")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM blocks WHERE note_id IN (SELECT id FROM notes WHERE book_id = ?)")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM version_history WHERE note_id IN (SELECT id FROM notes WHERE book_id = ?)")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM sessions WHERE note_id IN (SELECT id FROM notes WHERE book_id = ?)")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM notes WHERE book_id = ?")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM document_chunks WHERE file_id IN (SELECT id FROM files WHERE book_id = ?)")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM documents WHERE file_id IN (SELECT id FROM files WHERE book_id = ?)")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM files WHERE book_id = ?")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM style_profiles WHERE book_id = ?")
            .bind(book_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM books WHERE id = ?")
            .bind(book_id).execute(&self.pool).await?;
        Ok(())
    }

    // ── File operations ──

    pub async fn list_files_by_book(&self, book_id: i64) -> Result<Vec<FileRecord>> {
        let files = sqlx::query_as::<_, FileRecord>(
            "SELECT id, book_id, name, path, extension, size, hash, status, created_at, updated_at FROM files WHERE book_id = ? ORDER BY updated_at DESC"
        ).bind(book_id).fetch_all(&self.pool).await?;
        Ok(files)
    }

    pub async fn get_file_detail(&self, file_id: i64) -> Result<Option<FileRecord>> {
        let file = sqlx::query_as::<_, FileRecord>(
            "SELECT id, book_id, name, path, extension, size, hash, status, created_at, updated_at FROM files WHERE id = ?"
        ).bind(file_id).fetch_optional(&self.pool).await?;
        Ok(file)
    }

    pub async fn get_file_by_path(&self, path: &str) -> Result<Option<FileRecord>> {
        let file = sqlx::query_as::<_, FileRecord>(
            "SELECT id, book_id, name, path, extension, size, hash, status, created_at, updated_at FROM files WHERE path = ?"
        ).bind(path).fetch_optional(&self.pool).await?;
        Ok(file)
    }

    pub async fn delete_file(&self, file_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM document_chunks WHERE file_id = ?")
            .bind(file_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM documents WHERE file_id = ?")
            .bind(file_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM note_sources WHERE file_id = ?")
            .bind(file_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM files WHERE id = ?")
            .bind(file_id).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn update_file_status(&self, file_id: i64, status: &str, error_message: &str) -> Result<()> {
        sqlx::query("UPDATE files SET status = ?, error_message = ? WHERE id = ?")
            .bind(status)
            .bind(error_message)
            .bind(file_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_file_by_path(&self, path: &str) -> Result<()> {
        let row = sqlx::query("SELECT id FROM files WHERE path = ?")
            .bind(path)
            .fetch_optional(&self.pool).await?;
        if let Some(r) = row {
            let id: i64 = r.get("id");
            self.delete_file(id).await?;
        }
        Ok(())
    }

    pub async fn sync_files_for_book(&self, book_id: i64, files: Vec<(String, i64, String)>) -> Result<()> {
        for (path, size, extension) in files {
            let name = std::path::Path::new(&path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            let now = chrono::Utc::now().to_rfc3339();

            let existing = sqlx::query("SELECT id FROM files WHERE path = ?")
                .bind(&path)
                .fetch_optional(&self.pool).await?;

            if let Some(rec) = existing {
                let id: i64 = rec.get("id");
                sqlx::query("UPDATE files SET name = ?, size = ?, extension = ?, updated_at = ? WHERE id = ?")
                    .bind(&name)
                    .bind(size)
                    .bind(&extension)
                    .bind(&now)
                    .bind(id)
                    .execute(&self.pool).await?;
            } else {
                sqlx::query(
                    "INSERT INTO files (book_id, name, path, extension, size, hash, status, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', 'importing', '', ?, ?)"
                )
                .bind(book_id)
                .bind(&name)
                .bind(&path)
                .bind(&extension)
                .bind(size)
                .bind(&now)
                .bind(&now)
                .execute(&self.pool).await?;
            }
        }
        Ok(())
    }

    // ── Document metadata ──

    pub async fn save_document_metadata(&self, file_id: i64, summary: &str, word_count: i64, page_count: Option<i64>, slide_count: Option<i64>, headings_json: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT OR REPLACE INTO documents (file_id, summary, word_count, page_count, slide_count, headings_json, parsed_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(file_id)
        .bind(summary)
        .bind(word_count)
        .bind(page_count)
        .bind(slide_count)
        .bind(headings_json)
        .bind(&now)
        .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn get_document_metadata(&self, file_id: i64) -> Result<Option<Document>> {
        let doc = sqlx::query_as::<_, Document>(
            "SELECT file_id, summary, word_count, page_count, slide_count, headings_json, parsed_at FROM documents WHERE file_id = ?"
        ).bind(file_id).fetch_optional(&self.pool).await?;
        Ok(doc)
    }

    // ── Document chunks ──

    pub async fn save_document_chunks(&self, file_id: i64, chunks: Vec<(i64, String, i64, String)>) -> Result<()> {
        sqlx::query("DELETE FROM document_chunks WHERE file_id = ?")
            .bind(file_id).execute(&self.pool).await?;

        for (chunk_index, text, token_count, locator_json) in chunks {
            sqlx::query(
                "INSERT INTO document_chunks (file_id, chunk_index, text, token_count, locator_json) VALUES (?, ?, ?, ?, ?)"
            )
            .bind(file_id)
            .bind(chunk_index)
            .bind(&text)
            .bind(token_count)
            .bind(&locator_json)
            .execute(&self.pool).await?;
        }
        Ok(())
    }

    pub async fn get_document_chunks(&self, file_id: i64) -> Result<Vec<DocumentChunk>> {
        let chunks = sqlx::query_as::<_, DocumentChunk>(
            "SELECT id, file_id, chunk_index, text, token_count, locator_json FROM document_chunks WHERE file_id = ? ORDER BY chunk_index"
        ).bind(file_id).fetch_all(&self.pool).await?;
        Ok(chunks)
    }

    // ── Note operations ──

    pub async fn create_note(&self, note: &Note) -> Result<i64> {
        let res = sqlx::query(
            "INSERT INTO notes (book_id, title, content_json, plain_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(note.book_id)
        .bind(&note.title)
        .bind(&note.content_json)
        .bind(&note.plain_text)
        .bind(&note.created_at)
        .bind(&note.updated_at)
        .execute(&self.pool).await?;
        Ok(res.last_insert_rowid())
    }

    pub async fn get_note(&self, note_id: i64) -> Result<Note> {
        let note = sqlx::query_as::<_, Note>(
            "SELECT id, book_id, title, content_json, plain_text, created_at, updated_at FROM notes WHERE id = ?"
        ).bind(note_id).fetch_one(&self.pool).await?;
        Ok(note)
    }

    pub async fn update_note(&self, note: &Note) -> Result<()> {
        sqlx::query(
            "UPDATE notes SET title = ?, content_json = ?, plain_text = ?, updated_at = ? WHERE id = ?"
        )
        .bind(&note.title)
        .bind(&note.content_json)
        .bind(&note.plain_text)
        .bind(&note.updated_at)
        .bind(note.id)
        .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn list_notes_by_book(&self, book_id: i64) -> Result<Vec<Note>> {
        let notes = sqlx::query_as::<_, Note>(
            "SELECT id, book_id, title, content_json, plain_text, created_at, updated_at FROM notes WHERE book_id = ? ORDER BY updated_at DESC"
        ).bind(book_id).fetch_all(&self.pool).await?;
        Ok(notes)
    }

    pub async fn delete_note(&self, note_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM note_sources WHERE note_id = ?").bind(note_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM blocks WHERE note_id = ?").bind(note_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM version_history WHERE note_id = ?").bind(note_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM sessions WHERE note_id = ?").bind(note_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM generation_runs WHERE note_id = ?").bind(note_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM notes WHERE id = ?").bind(note_id).execute(&self.pool).await?;
        Ok(())
    }

    // ── Note sources ──

    pub async fn add_note_source(&self, source: &NoteSource) -> Result<()> {
        sqlx::query(
            "INSERT INTO note_sources (note_id, file_id, chunk_id, quote_text) VALUES (?, ?, ?, ?)"
        )
        .bind(source.note_id)
        .bind(source.file_id)
        .bind(source.chunk_id)
        .bind(&source.quote_text)
        .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn get_note_sources(&self, note_id: i64) -> Result<Vec<NoteSource>> {
        let sources = sqlx::query_as::<_, NoteSource>(
            "SELECT note_id, file_id, chunk_id, quote_text FROM note_sources WHERE note_id = ?"
        ).bind(note_id).fetch_all(&self.pool).await?;
        Ok(sources)
    }

    pub async fn remove_note_source(&self, note_id: i64, file_id: i64, chunk_id: i64) -> Result<()> {
        sqlx::query(
            "DELETE FROM note_sources WHERE note_id = ? AND file_id = ? AND chunk_id = ?"
        )
        .bind(note_id)
        .bind(file_id)
        .bind(chunk_id)
        .execute(&self.pool).await?;
        Ok(())
    }

    // ── Blocks ──

    pub async fn add_block(&self, block: &Block) -> Result<i64> {
        let res = sqlx::query(
            "INSERT INTO blocks (note_id, content, \"order\", created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(block.note_id)
        .bind(&block.content)
        .bind(block.order)
        .bind(&block.created_at)
        .bind(&block.updated_at)
        .execute(&self.pool).await?;
        Ok(res.last_insert_rowid())
    }

    pub async fn update_block(&self, block: &Block) -> Result<()> {
        sqlx::query(
            "UPDATE blocks SET content = ?, \"order\" = ?, updated_at = ? WHERE id = ?"
        )
        .bind(&block.content)
        .bind(block.order)
        .bind(&block.updated_at)
        .bind(block.id)
        .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn delete_block(&self, block_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM blocks WHERE id = ?").bind(block_id).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn list_blocks_by_note(&self, note_id: i64) -> Result<Vec<Block>> {
        let blocks = sqlx::query_as::<_, Block>(
            r#"SELECT id, note_id, content, "order", created_at, updated_at FROM blocks WHERE note_id = ? ORDER BY "order" ASC"#
        ).bind(note_id).fetch_all(&self.pool).await?;
        Ok(blocks)
    }

    pub async fn reorder_blocks(&self, note_id: i64, block_ids: Vec<i64>) -> Result<()> {
        for (i, block_id) in block_ids.iter().enumerate() {
            sqlx::query("UPDATE blocks SET \"order\" = ? WHERE id = ? AND note_id = ?")
                .bind(i as i32)
                .bind(block_id)
                .bind(note_id)
                .execute(&self.pool).await?;
        }
        Ok(())
    }

    // ── Version history (snapshots) ──

    pub async fn save_version_history(&self, history: &VersionHistory) -> Result<i64> {
        let res = sqlx::query(
            "INSERT INTO version_history (note_id, snapshot, created_at) VALUES (?, ?, ?)"
        )
        .bind(history.note_id)
        .bind(&history.snapshot)
        .bind(&history.created_at)
        .execute(&self.pool).await?;
        Ok(res.last_insert_rowid())
    }

    pub async fn list_snapshots_by_note(&self, note_id: i64) -> Result<Vec<VersionHistory>> {
        let snaps = sqlx::query_as::<_, VersionHistory>(
            "SELECT id, note_id, snapshot, created_at FROM version_history WHERE note_id = ? ORDER BY created_at DESC"
        ).bind(note_id).fetch_all(&self.pool).await?;
        Ok(snaps)
    }

    pub async fn get_snapshot(&self, snapshot_id: i64) -> Result<VersionHistory> {
        let snap = sqlx::query_as::<_, VersionHistory>(
            "SELECT id, note_id, snapshot, created_at FROM version_history WHERE id = ?"
        ).bind(snapshot_id).fetch_one(&self.pool).await?;
        Ok(snap)
    }

    // ── Sessions ──

    pub async fn save_session(&self, session: &Session) -> Result<i64> {
        let existing = sqlx::query(
            "SELECT id FROM sessions WHERE note_id = ? ORDER BY last_active DESC LIMIT 1"
        )
        .bind(session.note_id)
        .fetch_optional(&self.pool).await?;

        if let Some(rec) = existing {
            let id: i64 = rec.get("id");
            sqlx::query("UPDATE sessions SET session_data = ?, last_active = ? WHERE id = ?")
                .bind(&session.session_data)
                .bind(&session.last_active)
                .bind(id)
                .execute(&self.pool).await?;
            Ok(id)
        } else {
            let res = sqlx::query(
                "INSERT INTO sessions (note_id, session_data, last_active, created_at) VALUES (?, ?, ?, ?)"
            )
            .bind(session.note_id)
            .bind(&session.session_data)
            .bind(&session.last_active)
            .bind(&session.created_at)
            .execute(&self.pool).await?;
            Ok(res.last_insert_rowid())
        }
    }

    pub async fn list_recent_sessions(&self, note_id: i64, limit: i64) -> Result<Vec<Session>> {
        let sessions = sqlx::query_as::<_, Session>(
            "SELECT id, note_id, session_data, last_active, created_at FROM sessions WHERE note_id = ? ORDER BY last_active DESC LIMIT ?"
        ).bind(note_id).bind(limit).fetch_all(&self.pool).await?;
        Ok(sessions)
    }

    pub async fn get_session(&self, session_id: i64) -> Result<Session> {
        let session = sqlx::query_as::<_, Session>(
            "SELECT id, note_id, session_data, last_active, created_at FROM sessions WHERE id = ?"
        ).bind(session_id).fetch_one(&self.pool).await?;
        Ok(session)
    }

    // ── Style profile ──

    /// Migrate files table: add error_message column if missing.
    pub async fn migrate_files_table(&self) -> Result<()> {
        let columns: Vec<String> = sqlx::query("PRAGMA table_info(files)")
            .fetch_all(&self.pool)
            .await?
            .into_iter()
            .map(|r| r.get::<String, _>("name"))
            .collect();

        if columns.iter().any(|c| c == "error_message") {
            return Ok(());
        }

        sqlx::query("ALTER TABLE files ADD COLUMN error_message TEXT DEFAULT ''")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Migrate existing style_profiles table to the new schema if needed.
    pub async fn migrate_style_profile_table(&self) -> Result<()> {
        // Check if the name column exists
        let columns: Vec<String> = sqlx::query(
            "PRAGMA table_info(style_profiles)"
        )
        .fetch_all(&self.pool)
        .await?
        .into_iter()
        .map(|r| r.get::<String, _>("name"))
        .collect();

        if columns.iter().any(|c| c == "name") {
            return Ok(()); // already migrated
        }

        // Recreate the table with new schema
        sqlx::query("BEGIN TRANSACTION").execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE style_profiles_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                name TEXT NOT NULL DEFAULT 'Unnamed Profile',
                source_scope TEXT NOT NULL DEFAULT 'book_notes',
                language TEXT NOT NULL DEFAULT 'auto',
                profile_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(book_id) REFERENCES books(id)
            )"
        ).execute(&self.pool).await?;

        sqlx::query(
            "INSERT INTO style_profiles_new (id, book_id, name, source_scope, language, profile_json, created_at, updated_at)
             SELECT id, book_id, 'Legacy Profile', 'book_notes', 'auto', profile_json, created_at, created_at
             FROM style_profiles"
        ).execute(&self.pool).await?;

        sqlx::query("DROP TABLE style_profiles").execute(&self.pool).await?;
        sqlx::query("ALTER TABLE style_profiles_new RENAME TO style_profiles").execute(&self.pool).await?;

        sqlx::query("COMMIT").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn save_style_profile(
        &self,
        book_id: i64,
        name: &str,
        source_scope: &str,
        language: &str,
        profile_json: &str,
    ) -> Result<i64> {
        let now = chrono::Utc::now().to_rfc3339();
        // Check if profile with this book_id already exists (one profile per book)
        let existing = sqlx::query(
            "SELECT id FROM style_profiles WHERE book_id = ?"
        ).bind(book_id).fetch_optional(&self.pool).await?;

        if let Some(rec) = existing {
            let id: i64 = rec.get("id");
            sqlx::query(
                "UPDATE style_profiles SET name = ?, source_scope = ?, language = ?, profile_json = ?, updated_at = ? WHERE id = ?"
            )
            .bind(name)
            .bind(source_scope)
            .bind(language)
            .bind(profile_json)
            .bind(&now)
            .bind(id)
            .execute(&self.pool).await?;
            Ok(id)
        } else {
            let res = sqlx::query(
                "INSERT INTO style_profiles (book_id, name, source_scope, language, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(book_id)
            .bind(name)
            .bind(source_scope)
            .bind(language)
            .bind(profile_json)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool).await?;
            Ok(res.last_insert_rowid())
        }
    }

    pub async fn get_style_profile(&self, book_id: i64) -> Result<Option<StyleProfile>> {
        let profile = sqlx::query_as::<_, StyleProfile>(
            "SELECT id, book_id, name, source_scope, language, profile_json, created_at, updated_at FROM style_profiles WHERE book_id = ? ORDER BY updated_at DESC LIMIT 1"
        ).bind(book_id).fetch_optional(&self.pool).await?;
        Ok(profile)
    }

    #[allow(dead_code)]
    pub async fn get_style_profile_by_id(&self, profile_id: i64) -> Result<Option<StyleProfile>> {
        let profile = sqlx::query_as::<_, StyleProfile>(
            "SELECT id, book_id, name, source_scope, language, profile_json, created_at, updated_at FROM style_profiles WHERE id = ?"
        ).bind(profile_id).fetch_optional(&self.pool).await?;
        Ok(profile)
    }

    pub async fn list_style_profiles_by_book(&self, book_id: i64) -> Result<Vec<StyleProfile>> {
        let profiles = sqlx::query_as::<_, StyleProfile>(
            "SELECT id, book_id, name, source_scope, language, profile_json, created_at, updated_at FROM style_profiles WHERE book_id = ? ORDER BY updated_at DESC"
        ).bind(book_id).fetch_all(&self.pool).await?;
        Ok(profiles)
    }

    pub async fn delete_style_profile(&self, profile_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM style_examples WHERE profile_id = ?")
            .bind(profile_id).execute(&self.pool).await?;
        sqlx::query("DELETE FROM style_profiles WHERE id = ?")
            .bind(profile_id).execute(&self.pool).await?;
        Ok(())
    }

    // ── Style examples ──

    pub async fn insert_style_example(
        &self,
        profile_id: i64,
        file_id: Option<i64>,
        note_id: Option<i64>,
        text: &str,
        tags_json: &str,
    ) -> Result<i64> {
        let res = sqlx::query(
            "INSERT INTO style_examples (profile_id, file_id, note_id, text, tags_json) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(profile_id)
        .bind(file_id)
        .bind(note_id)
        .bind(text)
        .bind(tags_json)
        .execute(&self.pool).await?;
        Ok(res.last_insert_rowid())
    }

    pub async fn get_style_examples(&self, profile_id: i64) -> Result<Vec<StyleExample>> {
        let examples = sqlx::query_as::<_, StyleExample>(
            "SELECT id, profile_id, file_id, note_id, text, tags_json FROM style_examples WHERE profile_id = ? ORDER BY id"
        ).bind(profile_id).fetch_all(&self.pool).await?;
        Ok(examples)
    }

    #[allow(dead_code)]
    pub async fn delete_style_examples(&self, profile_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM style_examples WHERE profile_id = ?")
            .bind(profile_id).execute(&self.pool).await?;
        Ok(())
    }

    // ── Text collection for style analysis ──

    pub async fn get_book_notes_text(&self, book_id: i64) -> Result<Vec<String>> {
        let rows = sqlx::query(
            "SELECT plain_text FROM notes WHERE book_id = ? AND plain_text != ''"
        ).bind(book_id).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(|r| r.get::<String, _>("plain_text")).collect())
    }

    pub async fn get_book_files_text(&self, book_id: i64) -> Result<Vec<String>> {
        let rows = sqlx::query(
            "SELECT dc.text FROM document_chunks dc
             INNER JOIN files f ON dc.file_id = f.id
             WHERE f.book_id = ? AND dc.text != ''
             ORDER BY f.id, dc.chunk_index"
        ).bind(book_id).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(|r| r.get::<String, _>("text")).collect())
    }

    pub async fn get_book_headings(&self, book_id: i64) -> Result<Vec<String>> {
        let rows = sqlx::query(
            "SELECT d.headings_json FROM documents d
             INNER JOIN files f ON d.file_id = f.id
             WHERE f.book_id = ? AND d.headings_json != '[]' AND d.headings_json != ''"
        ).bind(book_id).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(|r| r.get::<String, _>("headings_json")).collect())
    }

    // ── Generation runs ──

    pub async fn insert_generation_run(&self, run: &GenerationRun) -> Result<i64> {
        let res = sqlx::query(
            "INSERT INTO generation_runs (note_id, scene, stage, input_json, prompt_full, output_raw, output_json, user_adopted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(run.note_id)
        .bind(&run.scene)
        .bind(&run.stage)
        .bind(&run.input_json)
        .bind(&run.prompt_full)
        .bind(&run.output_raw)
        .bind(&run.output_json)
        .bind(run.user_adopted)
        .bind(&run.created_at)
        .execute(&self.pool).await?;
        Ok(res.last_insert_rowid())
    }

    #[allow(dead_code)]
    pub async fn get_generation_run(&self, run_id: i64) -> Result<GenerationRun> {
        let run = sqlx::query_as::<_, GenerationRun>(
            "SELECT id, note_id, scene, stage, input_json, prompt_full, output_raw, output_json, user_adopted, created_at FROM generation_runs WHERE id = ?"
        ).bind(run_id).fetch_one(&self.pool).await?;
        Ok(run)
    }

    pub async fn list_generation_runs_by_note(&self, note_id: i64) -> Result<Vec<GenerationRun>> {
        let runs = sqlx::query_as::<_, GenerationRun>(
            "SELECT id, note_id, scene, stage, input_json, prompt_full, output_raw, output_json, user_adopted, created_at FROM generation_runs WHERE note_id = ? ORDER BY created_at DESC"
        ).bind(note_id).fetch_all(&self.pool).await?;
        Ok(runs)
    }

    pub async fn update_generation_output(&self, run_id: i64, output_raw: &str, output_json: &str) -> Result<()> {
        sqlx::query(
            "UPDATE generation_runs SET output_raw = ?, output_json = ? WHERE id = ?"
        )
        .bind(output_raw)
        .bind(output_json)
        .bind(run_id)
        .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn mark_generation_adopted(&self, run_id: i64) -> Result<()> {
        sqlx::query("UPDATE generation_runs SET user_adopted = 1 WHERE id = ?")
            .bind(run_id).execute(&self.pool).await?;
        Ok(())
    }
}
