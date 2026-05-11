# Trace

Trace is a local-first Tauri + Next.js writing workspace for collecting source documents, extracting writing samples, building style profiles, and generating drafts with AI.

## Requirements

- Node.js 20+
- npm
- Rust stable
- Tauri system prerequisites for your OS

## Install

```bash
npm install
```

## Development

Use the Tauri desktop app as the acceptance environment for core features:

```bash
npm run tauri:dev
```

This starts Next.js on `http://localhost:1420/en` and opens the desktop window.

Browser-only preview is available for UI checks:

```bash
npm run dev
```

Browser mode does not exercise local filesystem, SQLite, parsing, indexing, or AI streaming.

## Build

```bash
npm run build
npm run tauri:build
```

## AI Setup

Open the AI Assistant panel in the desktop app, click the key icon, and save an OpenAI API key. The current development build stores the key in the local SQLite `settings` table.

## Supported Files

- Preview/import: PDF, DOCX, PPTX, TXT, MD
- Best current text extraction: TXT, MD, DOCX, PDF
- PDF preview uses pdf.js; PDF text extraction uses a native extractor with a best-effort fallback.

## Validation Commands

```bash
npx tsc --noEmit
npm run build
cd src-tauri && cargo test && cargo check
```

