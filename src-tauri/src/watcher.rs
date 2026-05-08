use anyhow::Result;
use notify::{EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use crate::search::SearchEngine;

pub struct FileWatcher {
    _debouncer: notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>,
}

impl FileWatcher {
    pub fn new(watch_path: &Path, search_engine: Arc<SearchEngine>) -> Result<Self> {
        let watch_path = watch_path.to_path_buf();

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
                                        if path.is_file() && !is_hidden(path) {
                                            println!("Indexing/Updating file: {:?}", path);
                                            if let Err(e) = search_engine.index_file(path) {
                                                eprintln!("Failed to index file: {}", e);
                                            }
                                            if let Err(e) = search_engine.commit() {
                                                eprintln!("Failed to commit index: {}", e);
                                            }

                                            // Spawn DB sync on a separate thread with its own tokio runtime
                                            let watch_path_async = watch_path_clone.clone();
                                            let path_async = path.clone();
                                            std::thread::spawn(move || {
                                                let rt = match tokio::runtime::Runtime::new() {
                                                    Ok(rt) => rt,
                                                    Err(e) => {
                                                        eprintln!("Failed to create runtime: {:?}", e);
                                                        return;
                                                    }
                                                };
                                                rt.block_on(async {
                                                    sync_file_to_db(&watch_path_async, &path_async).await;
                                                });
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

                                        let watch_path_async = watch_path_clone.clone();
                                        let path_async = path.clone();
                                        std::thread::spawn(move || {
                                            let rt = match tokio::runtime::Runtime::new() {
                                                Ok(rt) => rt,
                                                Err(e) => {
                                                    eprintln!("Failed to create runtime: {:?}", e);
                                                    return;
                                                }
                                            };
                                            rt.block_on(async {
                                                remove_file_from_db(&watch_path_async, &path_async).await;
                                            });
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

        debouncer
            .watcher()
            .watch(&watch_path, RecursiveMode::Recursive)?;

        println!("Started watching: {:?}", watch_path);

        Ok(Self {
            _debouncer: debouncer,
        })
    }
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.') || n.starts_with('~') || n == "trace.db")
        .unwrap_or(false)
}

async fn sync_file_to_db(watch_path: &Path, file_path: &Path) {
    let mut db_path = watch_path.to_path_buf();
    db_path.push("trace.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let db = match crate::db::Database::new(&db_url).await {
        Ok(db) => db,
        Err(e) => {
            eprintln!("Failed to open DB: {:?}", e);
            return;
        }
    };

    // Determine book by first path component
    let rel = match file_path.strip_prefix(watch_path) {
        Ok(r) => r,
        Err(_) => return,
    };

    let first_comp = match rel.components().next() {
        Some(c) => c.as_os_str().to_string_lossy().to_string(),
        None => return,
    };

    if first_comp.is_empty() {
        return;
    }

    // Find or create book
    let books = match db.list_books().await {
        Ok(b) => b,
        Err(_) => return,
    };

    let book_id: i64 = if let Some(book) = books.iter().find(|b| b.name == first_comp) {
        book.id
    } else {
        let now = chrono::Utc::now().to_rfc3339();
        match db.create_book(&first_comp, &now).await {
            Ok(id) => id,
            Err(_) => return,
        }
    };

    // Sync file record
    if let Ok(meta) = std::fs::metadata(file_path) {
        let size = meta.len() as i64;
        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();
        if let Err(e) = db.sync_files_for_book(book_id, vec![(file_path.to_string_lossy().to_string(), size, ext)]).await {
            eprintln!("DB sync error: {:?}", e);
        }
    }
}

async fn remove_file_from_db(watch_path: &Path, file_path: &Path) {
    let mut db_path = watch_path.to_path_buf();
    db_path.push("trace.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let db = match crate::db::Database::new(&db_url).await {
        Ok(db) => db,
        Err(e) => {
            eprintln!("Failed to open DB: {:?}", e);
            return;
        }
    };

    if let Err(e) = db.delete_file_by_path(&file_path.to_string_lossy()).await {
        eprintln!("Failed to delete file record: {:?}", e);
    }
}
