use std::path::Path;
use std::sync::Arc;

use tauri::Emitter;

use crate::parser::DocumentData;
use crate::state;

/// Copy a file into a book folder, index it in Tantivy, and return the destination path.
/// The caller should later trigger `process_importing_files` to parse chunks + update status.
pub(crate) async fn copy_and_index(file_path: &str, book_id: &str) -> Result<String, String> {
    let source = Path::new(file_path);
    if !source.exists() {
        return Err(format!("Source file does not exist: {}", file_path));
    }

    let file_name = source
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();

    let mut dest_dir = state::get_trace_docs_path();
    dest_dir.push(book_id);
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Failed to create book folder: {}", e))?;

    let stem = source
        .file_stem()
        .unwrap()
        .to_string_lossy()
        .to_string();
    let extension = source.extension().map(|e| e.to_string_lossy().to_string());

    let mut dest_path = dest_dir.clone();
    dest_path.push(&file_name);

    // Deduplicate: append -N before extension if file already exists
    let mut counter = 1;
    while dest_path.exists() {
        let new_name = if let Some(ext) = &extension {
            format!("{}-{}.{}", stem, counter, ext)
        } else {
            format!("{}-{}", stem, counter)
        };
        dest_path = dest_dir.clone();
        dest_path.push(new_name);
        counter += 1;
    }

    std::fs::copy(&source, &dest_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    // Index in Tantivy synchronously so the file is searchable immediately
    let search_engine = Arc::clone(&state::SEARCH_ENGINE);
    if let Err(e) = search_engine.index_file(&dest_path) {
        eprintln!("Failed to index file {:?}: {}", dest_path, e);
    }

    Ok(dest_path.to_string_lossy().to_string())
}

/// Parse a document and persist its metadata + chunks to the database.
pub(crate) async fn parse_and_store(file_id: i64, file_path: &str) -> Result<DocumentData, String> {
    let path = std::path::Path::new(file_path);
    let data = crate::parser::extract_document_data(path).map_err(|e| e.to_string())?;

    let db = state::get_db().await?;
    db.save_document_metadata(
        file_id,
        &data.summary,
        data.word_count,
        data.page_count,
        data.slide_count,
        &data.headings_json,
    )
    .await
    .map_err(|e| e.to_string())?;

    let chunks: Vec<(i64, String, i64, String)> = data
        .chunks
        .iter()
        .map(|c| (c.chunk_index, c.text.clone(), c.token_count, c.locator_json.clone()))
        .collect();
    db.save_document_chunks(file_id, chunks)
        .await
        .map_err(|e| e.to_string())?;

    Ok(data)
}

/// Process all files with `status='importing'` for a book:
/// parse → store chunks → update status to ready/failed → emit events.
pub(crate) async fn process_importing_files(book_id: i64, app: tauri::AppHandle) -> Result<(), String> {
    let db = state::get_db().await?;
    let files = db
        .list_files_by_book(book_id)
        .await
        .map_err(|e| e.to_string())?;

    for file in files {
        if file.status != "importing" {
            continue;
        }

        match parse_and_store(file.id, &file.path).await {
            Ok(_) => {
                db.update_file_status(file.id, "ready", "")
                    .await
                    .map_err(|e| e.to_string())?;
                let _ = app.emit(
                    "file-status-changed",
                    serde_json::json!({
                        "file_id": file.id,
                        "book_id": file.book_id,
                        "status": "ready",
                        "error_message": "",
                    }),
                );
            }
            Err(e) => {
                db.update_file_status(file.id, "failed", &e)
                    .await
                    .map_err(|e2| e2.to_string())?;
                let _ = app.emit(
                    "file-status-changed",
                    serde_json::json!({
                        "file_id": file.id,
                        "book_id": file.book_id,
                        "status": "failed",
                        "error_message": e,
                    }),
                );
            }
        }
    }

    Ok(())
}
