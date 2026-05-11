# Tauri Command Table

Core acceptance target: `npm run tauri:dev`.

| Command | Input | Output | Main Caller | Stability |
| --- | --- | --- | --- | --- |
| `search_local_files` | `query: string` | `SearchResult[]` | `SpotlightSearch` | Stable |
| `get_docs_folder` | none | `string` | library fallback | Stable |
| `reindex_files` | none | `number` | manual refresh/fallback | Stable |
| `open_file` | `path: string` | `void` | `SpotlightSearch` | Stable |
| `get_index_stats` | none | `IndexStats` | `SourceRail` | Stable |
| `parse_document` | `filePath: string` | `ParsedDocument` | `FilePreviewPanel` | Preview stable |
| `select_files` | none | `string[]` | `SourceRail` upload | Stable |
| `copy_file_to_book` | `filePath, bookId` | copied path | `SourceRail` upload | Stable |
| `retry_file_parse` | `fileId, filePath` | `void` | `SourceRail` failed files | New |
| `list_books` | none | `Book[]` | `BookContext` | Stable |
| `create_book` | `name` | `Book` | `BookSelector` | Stable |
| `rename_book` | `bookId, newName` | `void` | `BookSelector` | Stable |
| `delete_book` | `bookId` | `void` | `BookSelector` | Stable |
| `list_files_by_book` | `bookId` | `FileRecord[]` | `BookContext` | Stable |
| `delete_file` | `fileId, filePath, bookId` | `void` | `SourceRail` | Stable |
| `update_file_role` | `fileId, role` | `void` | `SourceRail` | Stable |
| `sync_library` | none | `number` | `BookContext` fallback | Experimental |
| `search_documents` | `query, scope?` | `ContentSearchResult[]` | `SpotlightSearch` | Stable |
| `get_document_chunks` | `fileId` | `DocumentChunk[]` | `FilePreviewPanel` | Stable |
| `summarize_document` | `fileId` | `string` | future UI | Stable |
| `create_note` | `bookId, title, contentJson, plainText` | `Note` | `EditorShell` | Stable |
| `update_note` | `noteId, title, contentJson, plainText` | `Note` | `EditorShell` | Stable |
| `get_note` | `noteId` | `Note?` | future UI | Stable |
| `list_notes_by_book` | `bookId` | `Note[]` | `NoteList` | Stable |
| `build_ai_context` | `AIRequest` | `string` | debug/future UI | Stable |
| `save_api_key` | `key` | `void` | `AIPanel` | Dev-only storage |
| `get_api_key` | none | `string?` | `AIPanel` | Dev-only storage |
| `stream_generate` | `AIRequest, streamId` | event stream | `AIPanel` | Stable |
| `generate_with_context` | `AIRequest` | prompt string | debug/future UI | Stable |
| `retry_generation` | `AIRequest` | prompt string | future UI | Experimental |
| `save_note_version` | `noteId, contentJson, plainText` | `NoteVersion` | future UI | Stable |
| `list_note_versions` | `noteId` | `NoteVersion[]` | future UI | Stable |
| `restore_note_version` | `noteId, versionNumber` | `Note?` | future UI | Stable |
| `start_editing_session` | `noteId` | `NoteSession` | future UI | Stable |
| `end_editing_session` | `sessionId` | `void` | future UI | Stable |
| `get_recent_session` | `noteId` | `NoteSession?` | future UI | Stable |
| `get_style_profile` | `style` | `StyleProfile?` | `AIPanel` | Stable |
| `extract_my_style` | none | `StyleProfile` | future UI | Basic |
| `create_style_profile_from_samples` | `name, fileIds` | `SavedStyleProfile` | `SourceRail` | MVP |
| `list_style_profiles` | none | `SavedStyleProfile[]` | `AIPanel` | MVP |
| `update_saved_style_profile` | `profileId, name, profileJson` | `void` | future UI | MVP |
| `delete_style_profile` | `profileId` | `void` | future UI | MVP |

