use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use anyhow::Result;

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
}