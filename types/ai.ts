export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: AISource[];
}

export interface AISource {
  file_id: string;
  file_name: string;
  chunk_id?: string;
  quote: string;
}

export type WritingStyle = 'default' | 'academic' | 'analytical' | 'concise' | 'my_style';

export interface StyleProfile {
  style: WritingStyle;
  label: string;
  description: string;
  constraints: StyleConstraint[];
}

export interface StyleConstraint {
  name: string;
  value: string;
  explanation: string;
}

export interface AIRequest {
  action: 'summarize' | 'compare' | 'outline' | 'free';
  context_file_ids: string[];
  style?: WritingStyle;
  prompt?: string;
}

export interface AIStreamEvent {
  type: 'token' | 'source' | 'done' | 'error';
  content?: string;
  source?: AISource;
  error?: string;
}
