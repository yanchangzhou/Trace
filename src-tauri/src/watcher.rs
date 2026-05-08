use anyhow::Result;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use crate::search::SearchEngine;

/// File watcher that monitors a directory and updates the search index
pub struct FileWatcher {
    _debouncer: notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>,
}

impl FileWatcher {
    /// Create a new file watcher for the given directory
    pub fn new(watch_path: &Path, search_engine: Arc<SearchEngine>) -> Result<Self> {
        let watch_path = watch_path.to_path_buf();
        
        // Create debouncer to avoid processing rapid file changes
        let watch_path_clone = watch_path.clone();
        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        for event in events {
                            let ev = event.event;
                            match &ev.kind {
                                EventKind::Create(_) | EventKind::Modify(_) => {
                                    for path in &ev.paths {
                                        if path.is_file() {
                                            println!("Indexing/Updating file: {:?}", path);
                                            if let Err(e) = search_engine.index_file(path) {
                                                eprintln!("Failed to index file: {}", e);
                                            }
                                            if let Err(e) = search_engine.commit() {
                                                eprintln!("Failed to commit index: {}", e);
                                            }

                                            // Spawn async task to sync DB
                                            let watch_path_async = watch_path_clone.clone();
                                            let path_async = path.clone();
                                            tauri::async_runtime::spawn(async move {
                                                let mut db_path = watch_path_async.clone();
                                                db_path.push("trace.db");
                                                let db_url = format!("sqlite://{}", db_path.to_string_lossy());
                                                match crate::db::Database::new(&db_url).await {
                                                    Ok(db) => {
                                                        // Determine book by first path component
                                                        if let Ok(rel) = path_async.strip_prefix(&watch_path_async) {
                                                            if let Some(first_comp) = rel.components().next() {
                                                                let folder_name = first_comp.as_os_str().to_string_lossy().to_string();
                                                                // Try to find or create book
                                                                let existing = sqlx::query!("SELECT id FROM books WHERE name = ?", folder_name)
                                                                    .fetch_optional(&db.pool)
                                                                    .await;
                                                                let book_id: i64 = match existing {
                                                                    Ok(Some(r)) => r.id,
                                                                    _ => {
                                                                        let now = chrono::Utc::now().to_rfc3339();
                                                                        match sqlx::query("INSERT INTO books (name, created_at, updated_at) VALUES (?, ?, ?)")
                                                                            .bind(&folder_name)
                                                                            .bind(&now)
                                                                            .bind(&now)
                                                                            .execute(&db.pool)
                                                                            .await {
                                                                            Ok(rr) => rr.last_insert_rowid(),
                                                                            Err(_) => 0,
                                                                        }
                                                                    }
                                                                };

                                                                // Sync single file record
                                                                if let Ok(meta) = std::fs::metadata(&path_async) {
                                                                    let size = meta.len() as i64;
                                                                    let ext = path_async.extension().and_then(|e| e.to_str()).unwrap_or("").to_string();
                                                                    if let Err(e) = db.sync_files_for_book(book_id, vec![(path_async.to_string_lossy().to_string(), size, ext)]) .await {
                                                                        eprintln!("DB sync error: {:?}", e);
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                    Err(e) => eprintln!("Failed to open DB: {:?}", e),
                                                }
                                            });
                                        }
                                    }
                                }
                                EventKind::Remove(_) => {
                                    for path in &ev.paths {
                                        println!("Removing file from index: {:?}", path);
                                        if let Err(e) = search_engine.remove_file(path) {
                                            eprintln!("Failed to remove from index: {}", e);
                                        }
                                        if let Err(e) = search_engine.commit() {
                                            eprintln!("Commit failed: {}", e);
                                        }

                                        // Remove DB records asynchronously
                                        let watch_path_async = watch_path_clone.clone();
                                        let path_async = path.clone();
                                        tauri::async_runtime::spawn(async move {
                                            let mut db_path = watch_path_async.clone();
                                            db_path.push("trace.db");
                                            let db_url = format!("sqlite://{}", db_path.to_string_lossy());
                                            match crate::db::Database::new(&db_url).await {
                                                Ok(db) => {
                                                    if let Err(e) = db.delete_file_by_path(&path_async.to_string_lossy()).await {
                                                        eprintln!("Failed to delete file record: {:?}", e);
                                                    }
                                                }
                                                Err(e) => eprintln!("Failed to open DB: {:?}", e),
                                            }
                                        });
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    Err(errors) => {
                        for error in errors {
                            eprintln!("Watch error: {:?}", error);
                        }
                    }
                }
            },
        )?;
        
        // Start watching the directory
        debouncer
            .watcher()
            .watch(&watch_path, RecursiveMode::Recursive)?;
        
        println!("Started watching: {:?}", watch_path);
        
        Ok(Self {
            _debouncer: debouncer,
        })
    }
}

/// Handle individual file system events
fn handle_file_event(event: &Event, search_engine: &SearchEngine) -> Result<()> {
    match &event.kind {
        EventKind::Create(_) => {
            // File created - add to index
            for path in &event.paths {
                if path.is_file() {
                    println!("Indexing new file: {:?}", path);
                    search_engine.index_file(path)?;
                    search_engine.commit()?;
                }
            }
        }
        EventKind::Modify(_) => {
            // File modified - re-index
            for path in &event.paths {
                if path.is_file() {
                    println!("Re-indexing modified file: {:?}", path);
                    search_engine.remove_file(path)?;
                    search_engine.index_file(path)?;
                    search_engine.commit()?;
                }
            }
        }
        EventKind::Remove(_) => {
            // File removed - remove from index
            for path in &event.paths {
                println!("Removing file from index: {:?}", path);
                search_engine.remove_file(path)?;
                search_engine.commit()?;
            }
        }
        _ => {}
    }
    
    Ok(())
}
