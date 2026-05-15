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
  FileText,
  ListTodo,
  MessageSquare,
  Languages,
} from 'lucide-react';
import { triggerAIInline } from '@/lib/ai-bridge';

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
    label: '一级标题',
    description: '大型章节标题',
    icon: Heading1,
    category: 'block',
    action: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    key: 'h2',
    label: '二级标题',
    description: '中型章节标题',
    icon: Heading2,
    category: 'block',
    action: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    key: 'h3',
    label: '三级标题',
    description: '小型章节标题',
    icon: Heading3,
    category: 'block',
    action: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    key: 'quote',
    label: '引用块',
    description: '引用文本块',
    icon: Quote,
    category: 'block',
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    key: 'divider',
    label: '分隔线',
    description: '水平分割线',
    icon: Minus,
    category: 'block',
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    key: 'bullet',
    label: '无序列表',
    description: '简单的项目符号列表',
    icon: List,
    category: 'block',
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'ordered',
    label: '有序列表',
    description: '带编号的列表',
    icon: ListOrdered,
    category: 'block',
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'code',
    label: '代码块',
    description: '带语法高亮的代码片段',
    icon: Code2,
    category: 'block',
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    key: 'ai-continue',
    label: '继续写作',
    description: 'AI 从光标位置继续写作',
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
    label: '改进写作',
    description: '润色和改进选中的文本',
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
    label: '摘要文档',
    description: 'AI 总结当前文档内容',
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
    label: '生成大纲',
    description: '基于当前内容生成大纲',
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
    label: '翻译',
    description: '将选中文本翻译为英文',
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
    label: '询问 AI',
    description: '打开内联输入框向 AI 提问',
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
