import type { Editor } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code2,
  Quote,
  Minus,
  Sparkles,
<<<<<<< HEAD
  FileText,
  ListTodo,
  MessageSquare,
  Languages,
} from 'lucide-react';
import { triggerAIInline } from '@/lib/ai-bridge';
=======
} from 'lucide-react';
>>>>>>> 30cda3db40c1e1da2714724ab44186a6ac965aa0

export interface CommandItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: 'block' | 'ai';
  action: (editor: Editor) => void;
}

export const commands: CommandItem[] = [
  {
    key: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: Heading1,
    category: 'block',
    action: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    key: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: Heading2,
    category: 'block',
    action: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    key: 'h3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: Heading3,
    category: 'block',
    action: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    key: 'quote',
    label: 'Blockquote',
    description: 'Quoted text block',
    icon: Quote,
    category: 'block',
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    key: 'divider',
    label: 'Divider',
    description: 'Horizontal rule',
    icon: Minus,
    category: 'block',
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    key: 'bullet',
    label: 'Bullet List',
    description: 'Simple bullet list',
    icon: List,
    category: 'block',
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'ordered',
    label: 'Numbered List',
    description: 'Ordered list with numbers',
    icon: ListOrdered,
    category: 'block',
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'code',
    label: 'Code Block',
    description: 'Code snippet with syntax',
    icon: Code2,
    category: 'block',
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
<<<<<<< HEAD
    key: 'ai-continue',
    label: 'Continue Writing',
    description: 'AI continues from your cursor position',
    icon: Sparkles,
    category: 'ai',
    action: (editor) => {
      const text = editor.getText();
      const { from } = editor.state.selection;
      const context = text.slice(Math.max(0, from - 800), from);
      const coords = editor.view.coordsAtPos(from);
      triggerAIInline({
        action: 'continue',
        context,
        mode: 'insert',
        position: { x: coords.left, y: coords.bottom },
      });
    },
  },
  {
    key: 'ai-improve',
    label: 'Improve Writing',
    description: 'Polish and improve the selected text',
    icon: Sparkles,
    category: 'ai',
    action: (editor) => {
      const { from, to, empty } = editor.state.selection;
      const context = empty
        ? editor.getText()
        : editor.state.doc.textBetween(from, to, ' ');
      const coords = editor.view.coordsAtPos(from);
      triggerAIInline({
        action: 'improve',
        context,
        mode: empty ? 'insert' : 'replace',
        position: { x: coords.left, y: coords.bottom },
      });
    },
  },
  {
    key: 'ai-summarize',
    label: 'Summarize Document',
    description: 'AI summary of the current document',
    icon: FileText,
    category: 'ai',
    action: (editor) => {
      const text = editor.getText();
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from);
      triggerAIInline({
        action: 'summarize',
        context: text,
        mode: 'insert',
        position: { x: coords.left, y: coords.bottom },
      });
    },
  },
  {
    key: 'ai-outline',
    label: 'Generate Outline',
    description: 'AI outline based on current content',
    icon: ListTodo,
    category: 'ai',
    action: (editor) => {
      const text = editor.getText();
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from);
      triggerAIInline({
        action: 'outline',
        context: text,
        mode: 'insert',
        position: { x: coords.left, y: coords.bottom },
      });
    },
  },
  {
    key: 'ai-translate',
    label: 'Translate',
    description: 'Translate selected text to English',
    icon: Languages,
    category: 'ai',
    action: (editor) => {
      const { from, to, empty } = editor.state.selection;
      const context = empty
        ? editor.getText()
        : editor.state.doc.textBetween(from, to, ' ');
      const coords = editor.view.coordsAtPos(from);
      triggerAIInline({
        action: 'translate',
        context,
        mode: empty ? 'insert' : 'replace',
        position: { x: coords.left, y: coords.bottom },
      });
    },
  },
  {
    key: 'ai-ask',
    label: 'Ask AI',
    description: 'Open inline input to ask AI anything',
    icon: MessageSquare,
    category: 'ai',
    action: (editor) => {
      const text = editor.getText();
      const { from } = editor.state.selection;
      const context = text.slice(Math.max(0, from - 500), from);
      const coords = editor.view.coordsAtPos(from);
      triggerAIInline({
        action: 'ask',
        context,
        mode: 'insert',
        position: { x: coords.left, y: coords.bottom },
      });
    },
=======
    key: 'ai-write',
    label: 'AI Write',
    description: 'Generate content with AI',
    icon: Sparkles,
    category: 'ai',
    action: () => {},
>>>>>>> 30cda3db40c1e1da2714724ab44186a6ac965aa0
  },
];

export function filterCommands(query: string): CommandItem[] {
  if (!query) return commands;
  const q = query.toLowerCase();
  return commands.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.key.toLowerCase().includes(q),
  );
}
