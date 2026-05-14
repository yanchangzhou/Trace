import type { Editor } from '@tiptap/react';

export type AIActionType = 'continue' | 'improve' | 'summarize' | 'outline' | 'translate' | 'explain' | 'ask';

let handler: ((action: AIActionType, editor: Editor) => void) | null = null;

export function registerAIActionHandler(h: (action: AIActionType, editor: Editor) => void) {
  handler = h;
}

export function triggerAIAction(action: AIActionType, editor: Editor) {
  handler?.(action, editor);
}
