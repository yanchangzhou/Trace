# Notion 风格 AI 助手设计文档 — 基于 DeepSeek API

> 目标：将 AI 功能从"侧边栏按钮"改造为"随时随地呼出"的 Notion 风格智能助手，并默认使用 DeepSeek API。

---

## 1. 现状分析

### 1.1 当前架构

```
用户点击 "AI Assist" 按钮 → AIPanel 侧边栏打开
  → 用户输入提示词 → streamGenerate(request)
    → Tauri IPC → Rust backend
      → 读取 DB 中的 model_name / model_base_url / openai_api_key
      → POST OpenAI-compatible API (SSE streaming)
      → 流式返回 token → 前端渲染
```

### 1.2 已有但未完成的部分

| 功能 | 状态 | 说明 |
|------|------|------|
| Slash 菜单 AI 项 (`/ai`) | **空壳** | [commands.ts:90-96](components/editor/commands.ts#L90-L96) — `action: () => {}` 为空 |
| 编辑器桥接 (insert/replace/getSelection) | **已完成** | [EditorContext.tsx:38-46](contexts/EditorContext.tsx#L38-L46) — 注册了三个 handler |
| Provider 无关的 LLM 调用 | **已完成** | [ai.rs:91-110](src-tauri/src/ai.rs#L91-L110) — 通过 OpenAI 兼容 API |
| API Key 管理 UI | **已移除** | commit `8cae5cb` 移除了前端 API-key 配置 UI |
| 文本选择 BubbleMenu | **仅有格式工具栏** | [EditorShell.tsx:284-298](components/editor/EditorShell.tsx#L284-L298) — 缺少 AI 操作 |

### 1.3 当前痛点

1. AI 必须通过侧边栏按钮打开，打断了写作流程
2. 选中文本后无法直接调用 AI（只能手动复制粘贴到面板）
3. Slash 菜单 AI 项是摆设，没有任何功能
4. 没有键盘快捷键触发 AI
5. API 配置藏在后端 DB 中，切换 Provider 不方便

---

## 2. DeepSeek API 集成

### 2.1 API 兼容性

DeepSeek API **完全兼容** OpenAI Chat Completions 格式，无需修改 Rust 层的 `stream_ai_response()` 函数。

| 配置项 | 值 |
|--------|-----|
| API Base URL | `https://api.deepseek.com/v1/chat/completions` |
| 推荐模型 | `deepseek-chat` (V3, 日常使用) / `deepseek-reasoner` (R1, 深度推理) |
| 认证方式 | `Authorization: Bearer {API_KEY}` |
| 计费 | 极低价格 (约 1/50 of GPT-4) |

### 2.2 配置方案

#### 方案 A（推荐）：启动时自动初始化

在 Rust 后端 `main.rs` 的 `setup` 函数中，增加 DeepSeek 默认配置写入逻辑：

```rust
// 首次启动时写入 DeepSeek 默认配置
fn ensure_model_defaults(db: &Database) {
    if db.get_setting("model_name").ok().flatten().is_none() {
        db.save_setting("model_provider", "deepseek");
        db.save_setting("model_name", "deepseek-chat");
        db.save_setting("model_base_url", "https://api.deepseek.com/v1/chat/completions");
    }
}
```

**已存在的用户配置不会被覆盖**（因为 `is_none()` 检查）。老用户手动在 DB 里改或提供一个设置界面。

#### 方案 B：后端设置页面

在 Rust 端增加一个简单的 Tauri command：

```rust
#[tauri::command]
fn configure_ai_provider(api_key: String, model_name: String) -> Result<(), String> {
    DATABASE.save_setting("openai_api_key", &api_key);
    DATABASE.save_setting("model_name", &model_name);
    DATABASE.save_setting("model_provider", "deepseek");
    DATABASE.save_setting("model_base_url", "https://api.deepseek.com/v1/chat/completions");
    Ok(())
}
```

前两种方式都支持，推荐优先方案 A（简单直接），方案 B 后续迭代。

---

## 3. Notion 风格 AI 交互设计

### 3.1 四种调用方式

```
┌──────────────────────────────────────────────────────┐
│                   AI 调用入口                          │
├──────────────┬──────────────┬────────────┬───────────┤
│   Slash 命令  │  选中文本     │ 键盘快捷键  │ 浮动按钮   │
│   / 输入 AI   │  浮动菜单     │  Cmd+J     │  右下角    │
└──────────────┴──────────────┴────────────┴───────────┘
```

#### 方式 1：Slash 命令（`/` 菜单）

在编辑器任意位置输入 `/`，弹出命令列表，AI 相关命令：

| 命令 | 描述 | 行为 |
|------|------|------|
| `/ai continue` | AI 续写 | 在当前光标位置续写内容 |
| `/ai improve` | AI 改进 | 改进光标所在段落 |
| `/ai summarize` | AI 总结 | 总结当前文档内容 |
| `/ai outline` | AI 大纲 | 为当前内容生成大纲 |
| `/ai translate` | AI 翻译 | 翻译选中内容 |
| `/ai ask` | 问 AI | 打开内联输入框，自由提问 |

**实现**：扩展 [commands.ts](components/editor/commands.ts) 的 `commands` 数组，为每个 AI 项的 `action` 填充真实逻辑。action 内部调用 `useEditorContext()` 提供的方法：

```typescript
// commands.ts 中 AI 项的 action 示例
{
  key: 'ai-continue',
  label: 'AI Continue Writing',
  description: 'Let AI continue from cursor position',
  icon: Sparkles,
  category: 'ai',
  action: (editor) => {
    // 获取光标前后文本作为上下文
    const text = editor.getText();
    const { from } = editor.state.selection;
    const context = text.slice(Math.max(0, from - 500), from);
    // 触发 AI 弹窗，传入上下文
    triggerAIInline({ action: 'continue', context });
  },
}
```

#### 方式 2：选中文本浮动菜单

选中文本后，现有的 BubbleMenu（[EditorShell.tsx:284-298](components/editor/EditorShell.tsx#L284-L298)）自动显示。在其上加 AI 操作按钮：

```
选中一段文字后浮出的菜单：

  [B] [I] [U] [Link]  │  [✨ Improve] [✨ Translate] [✨ Explain] [✨ Ask AI...]
   ← 格式工具栏 →     │  ← AI 操作区 →
```

**实现**：
- 修改 `EditorToolbar` 组件，增加 AI 操作按钮
- 或新建一个独立的 `AISelectionMenu` 组件，在选择文本时与 BubbleMenu 同时显示
- AI 按钮点击后，获取选中文本，传入 AI 流式生成，结果替换选中文本或显示在 tooltip 中

```typescript
// 在 EditorToolbar 或新组件中
const handleAISelectionAction = async (action: string) => {
  const selectedText = editor.state.doc.textBetween(
    editor.state.selection.from,
    editor.state.selection.to,
    ' '
  );
  
  const request: AIRequest = {
    action: 'free',
    prompt: buildPrompt(action, selectedText),
    context_file_ids: [],
    style: 'default',
  };
  
  // 打开内联 AI 结果面板（非侧边栏）
  openInlineAIResult(request, { mode: 'replace' });
};
```

#### 方式 3：键盘快捷键 `Cmd+J`

按下 `Cmd+J` / `Ctrl+J`：
- 如果光标在空行或段落末尾 → 打开 AI 内联输入小窗（类似 Notion 的 "Ask AI"）
- 如果有选中文本 → 等同于方式 2，打开 AI 操作菜单

**实现**：在 `EditorShell` 中注册键盘事件监听：

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault();
      if (!editor) return;
      const { empty, from, to } = editor.state.selection;
      if (!empty) {
        // 有选中文本 → 打开 AI 操作弹窗
        openAISelectionMenu(from, to);
      } else {
        // 无选中 → 打开 AI 内联输入框
        openAIInlinePrompt();
      }
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [editor]);
```

#### 方式 4：空行 AI 占位提示

当编辑器只有一行空内容时，placeholder 文字改为：

> "Press `/` for commands, `Cmd+J` to ask AI, or start writing..."

在 [EditorShell.tsx:69-71](components/editor/EditorShell.tsx#L69-L71) 的 Placeholder extension 中配置。

### 3.2 AI 弹窗组件：`AIInlinePopup`

核心新组件，取代/补充侧边栏 AIPanel：

```
┌─────────────────────────────────────┐
│  ✨ Ask AI                    [×]   │
│─────────────────────────────────────│
│  Action: [Continue ▾]              │
│  Style:  [Default ▾]               │
│─────────────────────────────────────│
│                                     │
│  What do you want AI to do?         │
│  ┌─────────────────────────────┐   │
│  │ (user input...)             │   │
│  └─────────────────────────────┘   │
│                                     │
│  ── AI Response ──                  │
│  (streaming text appears here...)   │
│                                     │
│─────────────────────────────────────│
│  [Insert] [Replace] [Copy] [Retry] │
└─────────────────────────────────────┘
```

**特性**：
- 浮层定位在光标附近（使用 TipTap 的 `calculatePosition` 或绝对定位）
- 流式显示 AI 响应
- 操作按钮：Insert / Replace / Copy / Retry
- 可拖拽（类似 Notion 的 AI 弹窗）
- 复用现有 `streamGenerate()` 调用

### 3.3 保留但增强的侧边栏 AIPanel

侧边栏 AIPanel 仍然保留，但定位为"深度 AI 工作区"：
- 历史对话记录
- 多轮对话上下文
- 跨文档分析
- 写作模板管理

日常工作通过上述 4 种内联方式完成，复杂任务才打开侧边栏。

---

## 4. 组件架构变更

### 4.1 新增组件

```
components/ai/
├── AIPanel.tsx              ← 保留，深度工作区（已有）
├── StreamingComposer.tsx    ← 保留（已有）
├── AIInlinePopup.tsx        ← 新增：内联 AI 弹窗
├── AISelectionMenu.tsx      ← 新增：选中文本 AI 菜单
├── AIInlineInput.tsx        ← 新增：Cmd+J 触发的浮动输入框
└── AIProviderConfig.tsx     ← 新增：API 设置对话框
```

### 4.2 修改文件

| 文件 | 改动 |
|------|------|
| `components/editor/commands.ts` | AI 项的 `action` 从 `() => {}` 改为真实调用 |
| `components/editor/EditorShell.tsx` | 增加 Cmd+J 快捷键监听；BubbleMenu 增加 AI 按钮 |
| `components/editor/EditorToolbar.tsx` | 增加 AI 操作分隔区域 |
| `contexts/EditorContext.tsx` | 增加 `openAIInline` / `closeAIInline` / `inlineAIState` 状态管理 |
| `src-tauri/src/main.rs` | 增加 DeepSeek 默认配置初始化 |

### 4.3 AI Context 流

```
EditorContext（新增字段）
├── aiMode: 'inline' | 'panel' | 'idle'
├── inlinePosition: { x, y }       ← AI 弹窗位置
├── inlineRequest: AIRequest | null ← 当前 AI 请求
├── openInlineAI(request, position)
├── closeInlineAI()
└── triggerAIFromSelection(action)
```

---

## 5. 实现路线图

### Phase 1 — DeepSeek 配置 + 基础连线（预计 2-3 小时）

- [ ] Rust `setup()` 中增加 DeepSeek 默认配置
- [ ] 验证 `stream_generate` 在 DeepSeek API 上正常工作
- [ ] 前端增加 API Key 配置入口（简单的设置弹窗）
- [ ] **交付物**：用 DeepSeek API 成功生成一段文本

### Phase 2 — Slash 命令 AI 功能（预计 2-3 小时）

- [ ] 实现 `commands.ts` 中所有 AI 项的 `action`
- [ ] 创建 `AIInlinePopup` 组件（从 Slash 命令触发）
- [ ] 流式响应在弹窗中显示
- [ ] Insert / Replace 功能与编辑器联动
- [ ] **交付物**：输入 `/ai improve`，选中段落 → AI 改写 → Insert 到编辑器

### Phase 3 — 文本选择 AI 菜单（预计 2 小时）

- [ ] 在 BubbleMenu 上增加 AI 操作按钮
- [ ] 选中文本 → AI Improve / Translate / Explain
- [ ] 结果替换选中文本
- [ ] **交付物**：选中一段文字 → 点击 "Improve" → AI 改写原文

### Phase 4 — 键盘快捷键 Cmd+J（预计 1 小时）

- [ ] `EditorShell` 中注册键盘事件
- [ ] 空光标 → 打开 AI 内联输入
- [ ] 有选中 → 打开 AI 选择菜单
- [ ] **交付物**：按 Cmd+J 弹出 AI 输入框

### Phase 5 — 统一 AI UX 打磨（预计 1-2 小时）

- [ ] 统一 AI 弹窗样式（匹配 Notion 风格）
- [ ] 动画过渡
- [ ] Placeholder 文字更新
- [ ] 保留侧边栏 AIPanel 作为深度工作区
- [ ] **交付物**：完整的 Notion 风格 AI 体验

---

## 6. 关键代码示例

### 6.1 DeepSeek 默认配置（Rust）

```rust
// 在 main.rs setup() 或 db 初始化时调用
fn init_ai_defaults(db: &Database) {
    if db.get_setting("model_name").ok().flatten().is_none() {
        let _ = db.save_setting("model_provider", "deepseek");
        let _ = db.save_setting("model_name", "deepseek-chat");
        let _ = db.save_setting("model_base_url", 
            "https://api.deepseek.com/v1/chat/completions");
    }
}
```

### 6.2 AI 命令实现（TypeScript）

```typescript
// components/editor/commands.ts
import { triggerAIInline } from '@/contexts/EditorContext';

// AI Continue - 从光标位置续写
{
  key: 'ai-continue',
  label: 'Continue Writing',
  description: 'AI continues from your cursor position',
  icon: Sparkles,
  category: 'ai',
  action: (editor) => {
    const docText = editor.getText();
    const cursorPos = editor.state.selection.from;
    const contextBefore = docText.slice(Math.max(0, cursorPos - 800), cursorPos);
    triggerAIInline({
      action: 'free',
      prompt: `Continue writing from where I left off. 
        Context before cursor:\n"""\n${contextBefore}\n"""\n\n
        Write naturally as if you were me.`,
      mode: 'insert',
    });
  },
},

// AI Improve - 改进选中文本
{
  key: 'ai-improve',
  label: 'Improve Writing',
  description: 'Polish and improve the selected text',
  icon: Sparkles,
  category: 'ai',
  action: (editor) => {
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty 
      ? editor.getText() // 全文
      : editor.state.doc.textBetween(from, to, ' ');
    triggerAIInline({
      action: 'free',
      prompt: `Improve the following text. Fix grammar, clarity, and flow:\n"""\n${selectedText}\n"""`,
      mode: empty ? 'insert' : 'replace',
    });
  },
},
```

### 6.3 Cmd+J 快捷键

```typescript
// 在 EditorShell.tsx 中添加
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault();
      const sel = editor?.state.selection;
      if (!sel || sel.empty) {
        openAIInlinePrompt(editor);     // 空选择 → 内联输入
      } else {
        openAISelectionPopup(editor);    // 有选择 → AI 操作菜单
      }
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [editor]);
```

### 6.4 内联 AI 弹窗组件结构

```typescript
// components/ai/AIInlinePopup.tsx
interface AIInlinePopupProps {
  request: AIRequest;
  position: { x: number; y: number };
  mode: 'insert' | 'replace';
  onClose: () => void;
}

export default function AIInlinePopup({ request, position, mode, onClose }: AIInlinePopupProps) {
  const { insertGeneratedText, replaceSelection } = useEditorContext();
  const [streamBuffer, setStreamBuffer] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [fullResponse, setFullResponse] = useState('');

  const handleStream = useCallback(() => {
    setIsStreaming(true);
    streamGenerate(
      request,
      (token) => setStreamBuffer(prev => prev + token),
      (response) => {
        setFullResponse(response);
        setIsStreaming(false);
      },
      (error) => { /* handle error */ }
    );
  }, [request]);

  const handleInsert = () => {
    insertGeneratedText(fullResponse);
    onClose();
  };

  const handleReplace = () => {
    replaceSelection(fullResponse);
    onClose();
  };

  // ... render floating popup with streaming text + action buttons
}
```

---

## 7. UI 参考：Notion AI 的交互模式

### 7.1 四种触发方式对比

| 触发方式 | Notion 做法 | Trace 对应实现 |
|---------|------------|--------------|
| 空格键 + AI | 新建行按 Space → "Ask AI" | `/` slash 命令 |
| 选中文本 | 浮动菜单出现 "Ask AI" | BubbleMenu + AI 按钮 |
| 斜杠命令 | `/` 列出所有块 + AI 选项 | `/` 已支持块命令，补充 AI |
| 快捷键 | `Cmd+J` | `Cmd+J` |

### 7.2 Notion AI 弹窗特点

- 出现在光标下方 20-30px，宽度约 500px
- 圆角卡片 + 柔和阴影
- 流式输出文字（逐字显示）
- 完成后显示操作按钮行
- 点击空白处或 Esc 关闭

我们的 `AIInlinePopup` 应该复刻这些特性。

---

## 8. 风险与注意事项

1. **SSE 流式兼容性**：DeepSeek API 流式格式与 OpenAI 一致，`reqwest` + SSE 解析无需修改。已验证可行。

2. **上下文窗口**：DeepSeek V3 支持 128K 上下文。当前 Rust 层 `build_ai_context` 取前 10 个 chunk 各 500 字符（约 5000 字符），远低于限制。但如果用户选中大量文本 + 多文档，需要注意控制总长度。

3. **API Key 安全**：当前 API key 明文存储在 SQLite 中（`DB.save_setting("openai_api_key", key)`）。对于本地 Tauri 应用可接受，但未来若上云需加密。

4. **错误处理**：DeepSeek 偶尔返回 rate limit 或 service overload。前端应有合适的错误提示 + 重试按钮。

5. **向后兼容**：修改 `commands.ts` 和 `EditorContext` 时需要确保不破坏现有的 AI Panel 功能。

---

## 9. 附录

### 9.1 DeepSeek API 价格参考

| 模型 | 输入 (1M tokens) | 输出 (1M tokens) | 上下文长度 |
|------|------------------|-------------------|-----------|
| deepseek-chat (V3) | ¥1 | ¥2 | 128K |
| deepseek-reasoner (R1) | ¥4 | ¥16 | 128K |

对比 GPT-4o（输入 ¥2.5/1M tokens），测试成本极低。

### 9.2 获取 API Key

1. 访问 [platform.deepseek.com](https://platform.deepseek.com)
2. 注册账号 → API Keys → 创建新 Key
3. 复制 key 到 Trace 的配置中

### 9.3 现有相关文件索引

| 文件 | 用途 |
|------|------|
| [components/ai/AIPanel.tsx](components/ai/AIPanel.tsx) | 当前侧边栏 AI 面板 |
| [components/editor/commands.ts](components/editor/commands.ts) | 斜杠命令定义（含空壳 AI 项） |
| [components/editor/EditorShell.tsx](components/editor/EditorShell.tsx) | 编辑器主壳（含 BubbleMenu） |
| [components/editor/EditorToolbar.tsx](components/editor/EditorToolbar.tsx) | BubbleMenu 格式工具栏 |
| [contexts/EditorContext.tsx](contexts/EditorContext.tsx) | 编辑器状态 + AI 桥接 |
| [lib/tauri.ts](lib/tauri.ts) | 前端 Tauri IPC 调用 |
| [src-tauri/src/ai.rs](src-tauri/src/ai.rs) | Rust AI pipeline（prompt 构建 + SSE 流式） |
| [src-tauri/src/main.rs](src-tauri/src/main.rs) | Tauri command 处理 |
| [src-tauri/src/db.rs](src-tauri/src/db.rs) | SQLite 设置存储 |
| [types/ai.ts](types/ai.ts) | TypeScript AI 类型定义 |
