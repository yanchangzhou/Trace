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
} from 'lucide-react';

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
    key: 'ai-write',
    label: 'AI Write',
    description: 'Generate content with AI',
    icon: Sparkles,
    category: 'ai',
    action: () => {},
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
