export interface Note {
  id: string;
  book_id: string;
  title: string;
  content_json: string;
  plain_text: string;
  created_at: number;
  updated_at: number;
}

export interface NoteSource {
  note_id: string;
  file_id: string;
  chunk_id?: string;
  quote_text: string;
}
