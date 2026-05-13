use anyhow::Result;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use crate::search::SearchEngine;
use crate::db::Database;

/// File watcher that monitors a directory and updates both the search index and database
pub struct FileWatcher {
    _debouncer: notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>,
}

impl FileWatcher {
    /// Create a new file watcher for the given directory
    pub fn new(
        watch_path: &Path,
        search_engine: Arc<SearchEngine>,
        db: Arc<Database>,
    ) -> Result<Self> {
        let watch_path = watch_path.to_path_buf();

        // Create debouncer to avoid processing rapid file changes
        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        for event in events {
                            if let Err(e) = handle_file_event(&event.event, &search_engine, &db) {
                                eprintln!("Error handling file event: {}", e);
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

        Ok(Self { _debouncer: debouncer })
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Handle individual file system events
fn handle_file_event(event: &Event, search_engine: &SearchEngine, db: &Database) -> Result<()> {
    match &event.kind {
        EventKind::Create(_) => {
            for path in &event.paths {
                if path.is_file() {
                    println!("File created: {:?}", path);
                    search_engine.index_file(path)?;
                    search_engine.commit()?;

                    // Parse and chunk for content indexing
                    if let Ok(parsed) = crate::parser::parse_to_text(path) {
                        let file_id = uuid::Uuid::new_v4().to_string();
                        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        let file_path_str = path.to_string_lossy().to_string();
                        let metadata = std::fs::metadata(path)?;

                        // Add to DB
                        let now = now_secs();
                        let _ = db.add_file(&crate::models::FileRecord {
                            id: file_id.clone(),
                            book_id: String::new(),
                            name: file_name.clone(),
                            path: file_path_str.clone(),
                            extension: extension.clone(),
                            size: metadata.len(),
                            hash: None,
                            status: "ready".to_string(),
                            created_at: now,
                            updated_at: now,
                        });

                        // Chunk and index content
                        let chunks = crate::parser::split_into_chunks(&parsed.text, &file_id);
                        for chunk in &chunks {
                            let _ = search_engine.index_chunk(chunk, &file_name, &file_path_str, &extension);
                        }
                        let _ = db.insert_chunks(&chunks);
                        let _ = search_engine.commit();
                    }
                }
            }
        }
        EventKind::Modify(_) => {
            for path in &event.paths {
                if path.is_file() {
                    println!("File modified: {:?}", path);
                    search_engine.remove_file(path)?;
                    search_engine.index_file(path)?;

                    // Re-parse and re-chunk
                    if let Ok(parsed) = crate::parser::parse_to_text(path) {
                        let file_path_str = path.to_string_lossy().to_string();
                        if let Ok(Some(file_record)) = db.get_file_by_path(&file_path_str) {
                            search_engine.remove_chunks_for_file(&file_record.id)?;
                            let _ = db.delete_chunks_for_file(&file_record.id);

                            let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                            let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                            let chunks = crate::parser::split_into_chunks(&parsed.text, &file_record.id);
                            for chunk in &chunks {
                                let _ = search_engine.index_chunk(chunk, &file_name, &file_path_str, &extension);
                            }
                            let _ = db.insert_chunks(&chunks);
                        }
                    }
                    search_engine.commit()?;
                }
            }
        }
        EventKind::Remove(_) => {
            for path in &event.paths {
                println!("File removed: {:?}", path);
                let file_path_str = path.to_string_lossy().to_string();
                if let Ok(Some(file_record)) = db.get_file_by_path(&file_path_str) {
                    search_engine.remove_chunks_for_file(&file_record.id)?;
                    let _ = db.delete_chunks_for_file(&file_record.id);
                    let _ = db.delete_file(&file_record.id, &file_path_str);
                }
                search_engine.remove_file(path)?;
                search_engine.commit()?;
            }
        }
        _ => {}
    }

    Ok(())
}
