use keyring::Entry;

const SERVICE: &str = "trace";
const API_KEY_ACCOUNT: &str = "openai_api_key";

/// Store the OpenAI API key in the platform keystore.
/// - macOS: Keychain (service="trace", account="openai_api_key")
/// - Windows: Credential Manager (target="trace:openai_api_key")
/// - Linux: Secret Service (via libsecret / DBus)
pub(crate) fn set_api_key(key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, API_KEY_ACCOUNT).map_err(|e| format!("Keyring error: {}", e))?;
    entry
        .set_password(key.trim())
        .map_err(|e| format!("Failed to store API key: {}", e))
}

/// Retrieve the OpenAI API key from the platform keystore.
/// Returns `None` if no key has been stored.
pub(crate) fn get_api_key() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, API_KEY_ACCOUNT).map_err(|e| format!("Keyring error: {}", e))?;
    match entry.get_password() {
        Ok(key) => {
            if key.is_empty() {
                Ok(None)
            } else {
                Ok(Some(key))
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve API key: {}", e)),
    }
}

/// Remove the OpenAI API key from the platform keystore.
pub(crate) fn delete_api_key() -> Result<(), String> {
    let entry = Entry::new(SERVICE, API_KEY_ACCOUNT).map_err(|e| format!("Keyring error: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already deleted
        Err(e) => Err(format!("Failed to delete API key: {}", e)),
    }
}

/// Returns a human-readable description of where the key is stored.
pub(crate) fn storage_location() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS Keychain (search \"trace\" in Keychain Access)"
    } else if cfg!(target_os = "windows") {
        "Windows Credential Manager (search \"trace\" in Credential Manager)"
    } else {
        "Linux Secret Service (libsecret / DBus)"
    }
}
