export interface SourceFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  bookId: string;
  addedAt: number;
  size?: number;
  status?: string;
  role?: 'source' | 'style_sample' | 'both';
  parseStatus?: 'pending' | 'parsing' | 'ready' | 'failed';
  parseError?: string | null;
  file?: File;
}

export interface SearchResult {
  name: string;
  path: string;
  extension: string;
  size: number;
  last_modified: number;
  score: number;
}

export interface ContentSearchResult extends SearchResult {
  file_id: string;
  file_name: string;
  chunk_id: string;
  snippet: string;
  locator: string;
  matched_terms: string[];
}
