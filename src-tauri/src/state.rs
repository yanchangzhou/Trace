use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::sync::Arc;

use crate::db::Database;
use crate::search::SearchEngine;

pub(crate) static SEARCH_ENGINE: Lazy<Arc<SearchEngine>> = Lazy::new(|| {
    let index_path = get_index_path();
    Arc::new(SearchEngine::new(&index_path).expect("Failed to initialize search engine"))
});

pub(crate) fn get_index_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Trace");
    path.push("index");
    path
}

pub(crate) fn get_trace_docs_path() -> PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("TraceDocs");
    if !path.exists() {
        std::fs::create_dir_all(&path).ok();
    }
    path
}

pub(crate) fn get_db_path() -> PathBuf {
    let mut db_path = get_trace_docs_path();
    db_path.push("trace.db");
    db_path
}

pub(crate) async fn get_db() -> Result<Database, String> {
    Database::new(&get_db_path()).await.map_err(|e| e.to_string())
}
