import type { AIInlineRequest } from '@/types';

let _handler: ((request: AIInlineRequest) => void) | null = null;

export function setAIInlineHandler(fn: ((request: AIInlineRequest) => void) | null) {
  _handler = fn;
}

export function triggerAIInline(request: AIInlineRequest) {
  _handler?.(request);
}
