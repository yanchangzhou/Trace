import { invoke } from '@tauri-apps/api/core';

// ── API Key (Secure Storage) ──

export async function setApiKey(key: string): Promise<string> {
  return await invoke<string>('set_api_key', { key });
}

export async function hasApiKey(): Promise<boolean> {
  return await invoke<boolean>('has_api_key');
}

export async function getMaskedApiKey(): Promise<string | null> {
  return await invoke<string | null>('get_masked_api_key');
}

export async function deleteApiKey(): Promise<string> {
  return await invoke<string>('delete_api_key');
}

export async function getStorageLocation(): Promise<string> {
  return await invoke<string>('get_storage_location');
}
