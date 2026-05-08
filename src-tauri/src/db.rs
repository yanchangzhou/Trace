use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use anyhow::Result;

// Book and file related models
#[derive(Debug, Serialize, Deserialize)]
pub struct Book {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: i64,
    pub book_id: i64,
    pub name: String,
    pub path: String,
    pub extension: String,
    pub size: i64,
    pub hash: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub file_id: i64,
    pub summary: String,
    pub word_count: i64,
    pub page_count: Option<i64>,
    pub slide_count: Option<i64>,
    pub headings_json: String,
    pub parsed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentChunk {
    pub id: i64,
    pub file_id: i64,
    pub chunk_index: i64,
    pub text: String,
    pub token_count: i64,
    pub locator_json: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub book_id: i64,
    pub title: String,
    pub content_json: String,
    pub plain_text: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NoteSource {
    pub note_id: i64,
    pub file_id: i64,
    pub chunk_id: i64,
    pub quote_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Block {
    pub id: i64,
    pub note_id: i64,
    pub content: String,
    pub order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionHistory {
    pub id: i64,
    pub note_id: i64,
    pub snapshot: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub id: i64,
    pub note_id: i64,
    pub session_data: String,
    pub last_active: String,
    pub created_at: String,
}

pub struct Database {
    pub pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }

    pub async fn create_tables(&self) -> Result<()> {
        // Notes and related tables
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content_json TEXT NOT NULL,
                plain_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS note_sources (
                note_id INTEGER NOT NULL,
                file_id INTEGER NOT NULL,
                chunk_id INTEGER NOT NULL,
                quote_text TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        )
        .execute(&self.pool)
        .await?;

        // Books and files
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                extension TEXT NOT NULL,
                size INTEGER NOT NULL,
                hash TEXT,
                status TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(book_id) REFERENCES books(id)
            );"
        )
        .execute(&self.pool)
        .await?;

        // Document metadata and chunks
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS documents (
                file_id INTEGER PRIMARY KEY,
                summary TEXT,
                word_count INTEGER,
                page_count INTEGER,
                slide_count INTEGER,
                headings_json TEXT,
                parsed_at TEXT,
                FOREIGN KEY(file_id) REFERENCES files(id)
            );"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS document_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                token_count INTEGER,
                locator_json TEXT,
                FOREIGN KEY(file_id) REFERENCES files(id)
            );"
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn create_block_table(&self) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS version_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                snapshot TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                session_data TEXT NOT NULL,
                last_active TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id)
            );"
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn add_block(&self, block: Block) -> Result<()> {
        sqlx::query(
            "INSERT INTO blocks (note_id, content, order, created_at, updated_at) VALUES (?, ?, ?, ?, ?);"
        )
        .bind(block.note_id)
        .bind(&block.content)
        .bind(block.order)
        .bind(&block.created_at)
        .bind(&block.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn save_version_history(&self, history: VersionHistory) -> Result<()> {
        sqlx::query(
            "INSERT INTO version_history (note_id, snapshot, created_at) VALUES (?, ?, ?);"
        )
        .bind(history.note_id)
        .bind(&history.snapshot)
        .bind(&history.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn save_session(&self, session: Session) -> Result<()> {
        sqlx::query(
            "INSERT INTO sessions (note_id, session_data, last_active, created_at) VALUES (?, ?, ?, ?);"
        )
        .bind(session.note_id)
        .bind(&session.session_data)
        .bind(&session.last_active)
        .bind(&session.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_recent_sessions(&self, note_id: i64, limit: i64) -> Result<Vec<Session>> {
        let sessions = sqlx::query_as!(Session, "SELECT * FROM sessions WHERE note_id = ? ORDER BY last_active DESC LIMIT ?", note_id, limit)
            .fetch_all(&self.pool)
            .await?;
        Ok(sessions)
    }

    pub async fn get_session(&self, session_id: i64) -> Result<Session> {
        let session = sqlx::query_as!(Session, "SELECT * FROM sessions WHERE id = ?", session_id)
            .fetch_one(&self.pool)
            .await?;
        Ok(session)
    }

    pub async fn list_blocks_by_note(&self, note_id: i64) -> Result<Vec<Block>> {
        let blocks = sqlx::query_as!(Block, "SELECT * FROM blocks WHERE note_id = ? ORDER BY `order` ASC", note_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(blocks)
    }

    pub async fn list_version_history_by_note(&self, note_id: i64) -> Result<Vec<VersionHistory>> {
        let snaps = sqlx::query_as!(VersionHistory, "SELECT * FROM version_history WHERE note_id = ? ORDER BY created_at DESC", note_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(snaps)
    }

    // Book CRUD
    pub async fn list_books(&self) -> Result<Vec<Book>> {
        let books = sqlx::query_as!(Book, "SELECT id, name, created_at, updated_at FROM books")
            .fetch_all(&self.pool)
            .await?;
        Ok(books)
    }

    pub async fn create_book(&self, name: &str, created_at: &str) -> Result<i64> {
        let res = sqlx::query("INSERT INTO books (name, created_at, updated_at) VALUES (?, ?, ?)")
            .bind(name)
            .bind(created_at)
            .bind(created_at)
            .execute(&self.pool)
            .await?;
        Ok(res.last_insert_rowid())
    }

    pub async fn rename_book(&self, book_id: i64, new_name: &str, updated_at: &str) -> Result<()> {
        sqlx::query("UPDATE books SET name = ?, updated_at = ? WHERE id = ?")
            .bind(new_name)
            .bind(updated_at)
            .bind(book_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_book(&self, book_id: i64) -> Result<()> {
        // Delete related chunks, documents, files, then the book
        sqlx::query("DELETE FROM document_chunks WHERE file_id IN (SELECT id FROM files WHERE book_id = ?)")
            .bind(book_id)
            .execute(&self.pool)
            .await?;

        sqlx::query("DELETE FROM documents WHERE file_id IN (SELECT id FROM files WHERE book_id = ?)")
            .bind(book_id)
            .execute(&self.pool)
            .await?;

        sqlx::query("DELETE FROM files WHERE book_id = ?")
            .bind(book_id)
            .execute(&self.pool)
            .await?;

        sqlx::query("DELETE FROM books WHERE id = ?")
            .bind(book_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    // File operations
    pub async fn list_files_by_book(&self, book_id: i64) -> Result<Vec<FileRecord>> {
        let files = sqlx::query_as!(FileRecord,
            "SELECT id, book_id, name, path, extension, size, hash, status, created_at, updated_at FROM files WHERE book_id = ?",
            book_id
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(files)
    }

    pub async fn get_file_detail(&self, file_id: i64) -> Result<Option<FileRecord>> {
        let file = sqlx::query_as!(FileRecord,
            "SELECT id, book_id, name, path, extension, size, hash, status, created_at, updated_at FROM files WHERE id = ?",
            file_id
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(file)
    }

    pub async fn delete_file(&self, file_id: i64) -> Result<()> {
        // Delete chunks and document metadata first
        sqlx::query("DELETE FROM document_chunks WHERE file_id = ?")
            .bind(file_id)
            .execute(&self.pool)
            .await?;

        sqlx::query("DELETE FROM documents WHERE file_id = ?")
            .bind(file_id)
            .execute(&self.pool)
            .await?;

        sqlx::query("DELETE FROM files WHERE id = ?")
            .bind(file_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn delete_file_by_path(&self, path: &str) -> Result<()> {
        if let Some(rec) = sqlx::query!("SELECT id FROM files WHERE path = ?", path)
            .fetch_optional(&self.pool)
            .await? {
            let id = rec.id;
            self.delete_file(id).await?;
        }
        Ok(())
    }

    /// Simple sync: ensure files on disk under provided book path are recorded in DB
    pub async fn sync_files_for_book(&self, book_id: i64, files: Vec<(String, i64, String)>) -> Result<()> {
        // `files` is a list of tuples: (path, size, extension)
        for (path, size, extension) in files {
            let name = std::path::Path::new(&path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());

            // Upsert simple record if missing
            sqlx::query(
                "INSERT OR IGNORE INTO files (book_id, name, path, extension, size, hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(book_id)
            .bind(&name)
            .bind(&path)
            .bind(&extension)
            .bind(size)
            .bind("")
            .bind("active")
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(chrono::Utc::now().to_rfc3339())
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }
}