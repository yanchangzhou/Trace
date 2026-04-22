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
        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        for event in events {
                            if let Err(e) = handle_file_event(&event.event, &search_engine) {
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
