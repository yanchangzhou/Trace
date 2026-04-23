# Trace 开发计划

## 目标

本文档基于当前代码库和 [roadmap.md](/Users/chowyc/CodePractice/Trace/roadmap.md)，总结 `Trace` 下一阶段的开发计划，并且按照两个人通过 GitHub 协作的方式进行拆分，重点是保证分工清晰、尽量减少合并冲突。

## 当前项目判断

Trace 目前已经有了比较扎实的基础：

- 三栏布局已经完成
- 主要文档格式的预览链路已经跑通
- 编辑器已经有基础交互
- Book 分组和文件上传流程已经具备
- Tauri 后端已经支持索引、解析和文件监听

但核心产品链路还没有真正闭合：

`文档上下文 -> 编辑器 -> AI 生成 -> 个人风格`

也就是说，当前产品更像一个已经有质感的外壳，而不是一个真正完成闭环的知识工作软件。下一阶段最重要的，不是继续堆零散功能，而是把这条主链打通。

## 产品优先级

建议后续开发按照这个顺序推进：

1. 统一数据层
2. 升级文档理解与检索
3. 让编辑器可持久化，并打通 AI
4. 提升编辑器高级交互
5. 在主链稳定之后，再做风格学习

## 双人分工方案

为了减少冲突，不要按零散功能点切分，而要按模块 ownership 切分。

### 你负责

建议负责方向：产品主链和前端交互体验

主要职责：

- 编辑器系统
- 预览面板体验
- 文档上下文桥接 UI
- AI 面板与流式交互
- Slash 菜单和块级交互
- 前端状态收敛与页面体验

主要负责文件范围：

- [components/Canvas.tsx](/Users/chowyc/CodePractice/Trace/components/Canvas.tsx)
- [components/FilePreviewPanel.tsx](/Users/chowyc/CodePractice/Trace/components/FilePreviewPanel.tsx)
- [components/DocumentRenderer.tsx](/Users/chowyc/CodePractice/Trace/components/DocumentRenderer.tsx)
- [components/SourceRail.tsx](/Users/chowyc/CodePractice/Trace/components/SourceRail.tsx)
- `components/editor/*`
- `components/ai/*`
- `hooks/*`
- `app/[locale]/*`

### 你朋友负责

建议负责方向：本地后端、数据层、索引、解析

主要职责：

- Tauri 命令层
- SQLite 数据层
- 文件和元数据同步
- 内容索引与检索
- 文档解析、chunk 切分、结构化输出

主要负责文件范围：

- [src-tauri/src/main.rs](/Users/chowyc/CodePractice/Trace/src-tauri/src/main.rs)
- [src-tauri/src/search.rs](/Users/chowyc/CodePractice/Trace/src-tauri/src/search.rs)
- [src-tauri/src/parser.rs](/Users/chowyc/CodePractice/Trace/src-tauri/src/parser.rs)
- [src-tauri/src/watcher.rs](/Users/chowyc/CodePractice/Trace/src-tauri/src/watcher.rs)
- `src-tauri/src/db.rs`
- `src-tauri/src/models.rs`
- `src-tauri/src/document_pipeline.rs`
- [lib/tauri.ts](/Users/chowyc/CodePractice/Trace/lib/tauri.ts) 中用于暴露命令接口的部分

## 协作规则

### 分支策略

- `main`：始终保持可运行
- `develop`：集成分支
- `feature/frontend-*`：前端功能分支
- `feature/backend-*`：后端功能分支

### PR 规则

- 一个 PR 只解决一个明确问题
- 每个 PR 尽量保持范围集中、可 review
- 优先新增文件，避免多人反复修改同一个大文件
- 如果前后端有依赖，优先合并后端接口，再合并前端接入

### GitHub Issue 模板建议

每个 issue 应包含：

- 背景
- 目标
- 不做什么
- 影响文件
- 验收标准

## 第一阶段：统一数据层

### 目标

把当前偏 demo 性质的前端持久化方案，替换成可靠的本地数据真相来源。

### 你朋友负责

- 建立 SQLite schema
- 增加 books 和 files 的 Tauri commands
- 打通文件系统状态和数据库状态同步
- 把 watcher 的事件接入数据库更新逻辑

建议表结构如下：

#### `books`

- `id`
- `name`
- `created_at`
- `updated_at`

#### `files`

- `id`
- `book_id`
- `name`
- `path`
- `extension`
- `size`
- `hash`
- `status`
- `created_at`
- `updated_at`

#### `documents`

- `file_id`
- `summary`
- `word_count`
- `page_count`
- `slide_count`
- `headings_json`
- `parsed_at`

#### `document_chunks`

- `id`
- `file_id`
- `chunk_index`
- `text`
- `token_count`
- `locator_json`

建议优先提供这些 Tauri commands：

- `list_books`
- `create_book`
- `rename_book`
- `delete_book`
- `list_files_by_book`
- `delete_file`
- `get_file_detail`
- `sync_library`

### 你负责

- 重构 [contexts/BookContext.tsx](/Users/chowyc/CodePractice/Trace/contexts/BookContext.tsx)
- 不再把 `localStorage` 当成数据真相来源
- 让 `SourceRail` 和 `BookSelector` 改为从 Tauri commands 获取数据
- 在创建、上传、删除、重命名、切换之后统一刷新数据

### 验收标准

- 应用重启后，books 和 files 状态完全正确
- 删除文件时，会同步删除磁盘、数据库和索引中的记录
- 核心状态不再依赖 `localStorage`

## 第二阶段：文档理解与检索

### 目标

把搜索从“文件名查找”升级成“基于内容的检索”。

### 你朋友负责

- 扩展 [src-tauri/src/parser.rs](/Users/chowyc/CodePractice/Trace/src-tauri/src/parser.rs)，做统一文本提取管线
- 为 PDF、DOCX、PPTX、TXT、MD 增加 chunk 切分逻辑
- 扩展 [src-tauri/src/search.rs](/Users/chowyc/CodePractice/Trace/src-tauri/src/search.rs)，支持文档正文索引
- 返回命中的片段和定位信息

建议增加这些能力：

- `search_documents(query, scope)`
- `get_document_chunks(file_id)`
- `summarize_document(file_id)`
- `get_related_documents(file_id)` 后续可补

建议搜索结果结构：

- `file_id`
- `file_name`
- `chunk_id`
- `snippet`
- `score`
- `locator`
- `matched_terms`

### 你负责

- 升级 `SpotlightSearch`，支持展示正文命中片段
- 在 `FilePreviewPanel` 中增加摘要、标题树、关键片段区域
- 在 `SourceRail` 中显示索引状态
- 支持从搜索结果点击后跳转到预览面板对应位置

### 验收标准

- 搜索正文关键词时能够命中文档内容
- 搜索结果显示片段，而不只是文件名
- 预览面板可以展示摘要和标题结构

## 第三阶段：可持久化编辑器与 AI 主链

### 目标

把当前的编辑器变成真正的写作工作区，并且让它和 AI 基于文档上下文协同工作。

### 你负责

- 拆分 [components/Canvas.tsx](/Users/chowyc/CodePractice/Trace/components/Canvas.tsx)
- 增加自动保存
- 增加 note 标题和保存状态
- 完成 slash menu 的基础交互
- 支持从预览区插入引用块到编辑器
- 构建 AI 面板和流式生成 UI

建议新增前端文件：

- `components/editor/EditorShell.tsx`
- `components/editor/EditorToolbar.tsx`
- `components/editor/SlashMenu.tsx`
- `components/ai/AIPanel.tsx`
- `components/ai/StreamingComposer.tsx`

### 你朋友负责

- 增加 note 持久化
- 增加 note 和 source 之间的关系存储
- 增加 AI 上下文打包 command
- 把选中的文件和 chunks 组装成可直接进入 prompt 的上下文
- 增加 AI 生成接口适配层

建议新增表：

#### `notes`

- `id`
- `book_id`
- `title`
- `content_json`
- `plain_text`
- `created_at`
- `updated_at`

#### `note_sources`

- `note_id`
- `file_id`
- `chunk_id`
- `quote_text`

建议增加这些 commands：

- `create_note`
- `update_note`
- `get_note`
- `list_notes_by_book`
- `build_ai_context`
- `generate_with_context`
- `retry_generation`

### AI 第一版功能范围

先只做三个最有价值的动作：

- 总结当前文档
- 比较两份文档
- 基于已选资料生成提纲

### 验收标准

- 编辑器内容可以自动保存和恢复
- AI 响应支持流式输出
- AI 输出能够引用来源文档
- 生成内容能够插回编辑器

## 第四阶段：高级编辑交互

### 目标

让编辑器从“能用”变成“顺滑、有手感”。

### 你负责

- 完整的 slash menu 键盘导航
- block menu
- block drag handle
- block 重排交互
- 更自然的 focus、hover、间距和排版节奏

这一阶段尽量只集中修改：

- `components/editor/*`
- [app/globals.css](/Users/chowyc/CodePractice/Trace/app/globals.css)
- 编辑器相关前端状态

### 你朋友负责

- 如果 block 要持久化，补充 block 级别的存储结构
- 增加版本历史
- 增加快照与回滚
- 增加最近编辑会话恢复

### 验收标准

- slash menu 可以完整通过键盘操作
- block 可以拖拽重排
- 结构化内容在重启后不丢失

## 第五阶段：风格学习

### 目标

构建一个可解释、可控制的第一版个性化写作辅助。

这个阶段应该在主链稳定之后再开始。

### 你朋友负责

构建 `style profile extractor`，从历史 note 中提取：

- 平均句长
- 高频词
- 标题密度
- 术语密度
- 段落长度分布

输出形式建议为结构化 JSON，便于调试和解释。

### 你负责

在 AI UI 中增加风格选择：

- 默认
- 学术
- 分析
- 简洁
- 我的风格

同时展示这次生成具体应用了哪些风格约束。

### 验收标准

- 可以切换不同风格模式
- 生成结果在风格上有明显差异
- 风格逻辑可解释、可回退

## 共享重构规则

### 拆分共享类型

不要继续把所有类型都堆在 [types/index.ts](/Users/chowyc/CodePractice/Trace/types/index.ts)。

建议拆成：

- `types/book.ts`
- `types/file.ts`
- `types/document.ts`
- `types/note.ts`
- `types/ai.ts`

### Tauri 统一出口

所有前端调用原生命令的地方，都应该通过 [lib/tauri.ts](/Users/chowyc/CodePractice/Trace/lib/tauri.ts) 统一封装。

这样前后端边界会更清楚。

### 尽早拆大组件

尤其是这些文件：

- [components/Canvas.tsx](/Users/chowyc/CodePractice/Trace/components/Canvas.tsx)
- [contexts/BookContext.tsx](/Users/chowyc/CodePractice/Trace/contexts/BookContext.tsx)
- [src-tauri/src/main.rs](/Users/chowyc/CodePractice/Trace/src-tauri/src/main.rs)
- [types/index.ts](/Users/chowyc/CodePractice/Trace/types/index.ts)

这些都是高冲突文件，建议在多人并行开发之前就先拆开。

## 按周推进计划

### 第 1 周

- 你朋友：SQLite schema 和 books/files commands
- 你：把前端本地数据流改成 Tauri 驱动

### 第 2 周

- 你朋友：文件删除、同步管线、watcher 集成
- 你：补齐上传、删除、刷新、错误态和 loading 态

### 第 3 周

- 你朋友：内容提取、chunk 切分、全文索引
- 你：搜索片段 UI 和预览摘要接入

### 第 4 周

- 你朋友：note 存储和 AI context builder
- 你：编辑器 autosave、AI 面板、流式生成 UI

### 第 5 周

- 你：slash menu、block 交互、引用插入
- 你朋友：版本历史和 note 快照支持

### 第 6 周

- 你朋友：style extractor v1
- 你：风格选择 UI 和生成策略控制

## 建议创建的 GitHub Issues

- `core: migrate books and files from localStorage to SQLite`
- `core: implement file delete and sync pipeline`
- `search: add full-text chunk indexing`
- `preview: show summary, headings, and snippets in preview panel`
- `editor: add persistent notes with autosave`
- `ai: build document context bridge`
- `ai: implement streaming generation UI`
- `editor: add slash menu keyboard navigation`
- `editor: add block drag and reorder`
- `style: implement style profile extractor v1`

## 最后的建议

当前最大的风险，不是功能不够多，而是表面功能增长速度快于核心链路稳定速度。

Trace 不应该变成一个“带 AI 按钮的普通笔记软件”。它真正的价值应该来自：

- 基于本地资料的 grounded writing
- 可见、可复用的文档上下文
- 基于用户写作行为的个性化辅助

所以接下来最优先的，不是继续做更多表层交互，而是先把文档上下文、编辑器持久化和 AI 生成变成一个真正协同工作的系统。
