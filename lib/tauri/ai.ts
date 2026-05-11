import { invoke } from '@tauri-apps/api/core';
import type {
  WritingTask,
  StructuredOutput,
  GenerationRun,
  StyleProfile,
  StyleExample,
} from './types';

export type { WritingTask, StructuredOutput, GenerationRun, StyleProfile, StyleExample };

// ── AI Generation ──

export async function assembleAiPrompt(
  noteId: number,
  task: WritingTask,
): Promise<string> {
  return await invoke<string>('assemble_ai_prompt', { note_id: noteId, task });
}

export async function parseAiOutput(rawOutput: string): Promise<StructuredOutput> {
  return await invoke<StructuredOutput>('parse_ai_output', { raw_output: rawOutput });
}

export async function saveGenerationRun(
  noteId: number,
  scene: string,
  stage: string,
  inputJson: string,
  promptFull: string,
): Promise<number> {
  return await invoke<number>('save_generation_run', {
    note_id: noteId,
    scene,
    stage,
    input_json: inputJson,
    prompt_full: promptFull,
  });
}

export async function listGenerationRuns(noteId: number): Promise<GenerationRun[]> {
  return await invoke<GenerationRun[]>('list_generation_runs', { note_id: noteId });
}

export async function updateGenerationOutput(
  runId: number,
  outputRaw: string,
  outputJson: string,
): Promise<void> {
  return await invoke<void>('update_generation_output', {
    run_id: runId,
    output_raw: outputRaw,
    output_json: outputJson,
  });
}

export async function markGenerationAdopted(runId: number): Promise<void> {
  return await invoke<void>('mark_generation_adopted', { run_id: runId });
}

// ── Style Profile ──

export async function extractStyleProfile(
  bookId: number,
  name: string,
  sourceScope: string,
  language: string,
): Promise<string> {
  return await invoke<string>('extract_style_profile', {
    book_id: bookId,
    name,
    source_scope: sourceScope,
    language,
  });
}

export async function getStyleProfile(bookId: number): Promise<StyleProfile | null> {
  return await invoke<StyleProfile | null>('get_style_profile', { book_id: bookId });
}

export async function listStyleProfiles(bookId: number): Promise<StyleProfile[]> {
  return await invoke<StyleProfile[]>('list_style_profiles', { book_id: bookId });
}

export async function getStyleExamples(profileId: number): Promise<StyleExample[]> {
  return await invoke<StyleExample[]>('get_style_examples', { profile_id: profileId });
}

export async function deleteStyleProfile(profileId: number): Promise<void> {
  return await invoke<void>('delete_style_profile', { profile_id: profileId });
}
