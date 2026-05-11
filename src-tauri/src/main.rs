#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod parser;
mod search;
mod services;
mod state;
mod watcher;

use std::sync::Arc;
use tauri::Manager;
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use watcher::FileWatcher;

use commands::ai::{
    assemble_ai_prompt, list_generation_runs, mark_generation_adopted, parse_ai_output,
    save_generation_run, update_generation_output,
};
use commands::blocks::{
    create_block, delete_block, list_blocks_by_note, reorder_blocks, update_block,
};
use commands::books::{create_book, delete_book, list_books, rename_book};
use commands::documents::{
    get_document_chunks_from_db, get_document_metadata, get_file_summary,
    parse_and_store_document, parse_document,
};
use commands::files::{
    copy_file_to_book, create_book_folder, delete_book_folder, delete_file, get_file_detail,
    list_book_files, list_files_by_book, select_files, sync_library,
};
use commands::history::{
    create_snapshot, get_snapshot, list_recent_sessions, list_snapshots_by_note, restore_session,
    restore_snapshot, save_session,
};
use commands::notes::{
    add_note_source, create_note, delete_note, get_note, get_note_sources, list_notes_by_book,
    remove_note_source, update_note,
};
use commands::search::{
    cleanup_old_entries, compact_index, get_docs_folder, get_index_stats, get_related_documents,
    list_all_files, open_file, reindex_files, search_documents, search_local_files,
    summarize_document, get_document_chunks,
};
use commands::settings::{
    delete_api_key, get_masked_api_key, get_storage_location, has_api_key, set_api_key,
};
use commands::style::{
    delete_style_profile, extract_style_profile, get_style_examples, get_style_profile,
    list_style_profiles,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[allow(unused_variables)]
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Failed to apply vibrancy");

            let docs_path = state::get_trace_docs_path();
            println!("TraceDocs folder: {:?}", docs_path);

            // Initial indexing on startup
            let search_engine = Arc::clone(&state::SEARCH_ENGINE);
            let docs_path_clone = docs_path.clone();
            tauri::async_runtime::spawn(async move {
                match search_engine.index_directory(&docs_path_clone) {
                    Ok(count) => println!("Initial indexing complete: {} files", count),
                    Err(e) => eprintln!("Initial indexing failed: {}", e),
                }
            });

            // Start file watcher
            let search_engine = Arc::clone(&state::SEARCH_ENGINE);
            std::thread::spawn(move || {
                match FileWatcher::new(&docs_path, search_engine) {
                    Ok(_watcher) => {
                        println!("File watcher started successfully");
                        loop {
                            std::thread::sleep(std::time::Duration::from_secs(1));
                        }
                    }
                    Err(e) => eprintln!("Failed to start file watcher: {}", e),
                }
            });

            // Initialize SQLite DB and create/migrate tables
            let db_path = state::get_db_path();
            tauri::async_runtime::spawn(async move {
                match db::Database::new(&db_path).await {
                    Ok(db) => {
                        if let Err(e) = db.create_tables().await {
                            eprintln!("Failed to create core tables: {:?}", e);
                        }
                        if let Err(e) = db.create_block_table().await {
                            eprintln!("Failed to create block/version tables: {:?}", e);
                        }
                        if let Err(e) = db.migrate_style_profile_table().await {
                            eprintln!("Failed to migrate style_profiles table: {:?}", e);
                        }
                        if let Err(e) = db.migrate_files_table().await {
                            eprintln!("Failed to migrate files table: {:?}", e);
                        }
                        println!("Database initialized successfully");
                    }
                    Err(e) => eprintln!("Failed to initialize DB: {:?}", e),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Search & index
            search_local_files,
            get_docs_folder,
            reindex_files,
            open_file,
            compact_index,
            cleanup_old_entries,
            get_index_stats,
            list_all_files,
            // Document parsing
            parse_document,
            get_file_summary,
            search_documents,
            get_document_chunks,
            summarize_document,
            get_related_documents,
            // Books
            list_books,
            create_book,
            rename_book,
            delete_book,
            create_book_folder,
            delete_book_folder,
            // Files
            list_files_by_book,
            get_file_detail,
            delete_file,
            sync_library,
            select_files,
            copy_file_to_book,
            list_book_files,
            // Document persistence
            parse_and_store_document,
            get_document_chunks_from_db,
            get_document_metadata,
            // Notes
            create_note,
            get_note,
            update_note,
            delete_note,
            list_notes_by_book,
            // Note sources
            add_note_source,
            get_note_sources,
            remove_note_source,
            // AI generation
            assemble_ai_prompt,
            parse_ai_output,
            save_generation_run,
            list_generation_runs,
            update_generation_output,
            mark_generation_adopted,
            // Blocks
            create_block,
            update_block,
            delete_block,
            list_blocks_by_note,
            reorder_blocks,
            // Snapshots
            create_snapshot,
            list_snapshots_by_note,
            get_snapshot,
            restore_snapshot,
            // Sessions
            save_session,
            list_recent_sessions,
            restore_session,
            // Style profile
            extract_style_profile,
            get_style_profile,
            list_style_profiles,
            get_style_examples,
            delete_style_profile,
            // Secure settings
            set_api_key,
            has_api_key,
            get_storage_location,
            delete_api_key,
            get_masked_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
