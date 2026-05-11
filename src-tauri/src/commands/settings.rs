use crate::services::secure_storage;

/// Store the OpenAI API key in the platform keystore.
/// Returns the storage location description.
#[tauri::command]
pub(crate) fn set_api_key(key: String) -> Result<String, String> {
    if key.trim().is_empty() {
        // Empty key = delete
        secure_storage::delete_api_key()?;
        return Ok(format!("API key removed. Stored in: {}", secure_storage::storage_location()));
    }
    secure_storage::set_api_key(&key)?;
    Ok(format!("API key saved. Stored in: {}", secure_storage::storage_location()))
}

/// Check whether an API key exists (without returning the value).
#[tauri::command]
pub(crate) fn has_api_key() -> Result<bool, String> {
    secure_storage::get_api_key().map(|k| k.is_some())
}

/// Return the storage location description for display in settings UI.
#[tauri::command]
pub(crate) fn get_storage_location() -> Result<String, String> {
    Ok(secure_storage::storage_location().to_string())
}

/// Delete the API key from the platform keystore.
#[tauri::command]
pub(crate) fn delete_api_key() -> Result<String, String> {
    secure_storage::delete_api_key()?;
    Ok("API key deleted successfully.".to_string())
}

/// Get a masked version of the API key for display (e.g., "sk-...Ab12").
#[tauri::command]
pub(crate) fn get_masked_api_key() -> Result<Option<String>, String> {
    let key = secure_storage::get_api_key()?;
    Ok(key.map(|k| {
        if k.len() <= 10 {
            "***".to_string()
        } else {
            let prefix = &k[..4];
            let suffix = &k[k.len() - 4..];
            format!("{}...{}", prefix, suffix)
        }
    }))
}
