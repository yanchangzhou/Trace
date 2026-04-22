# Trace

Minimalist AI Collaboration Software built with Tauri v2 + Next.js 15

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Desktop**: Tauri v2
- **Internationalization**: next-intl
- **Package Manager**: pnpm

## Supported Languages

- English (en) - Default
- 中文 (zh)
- Español (es)
- Français (fr)
- Deutsch (de)
- 日本語 (ja)

## Getting Started

### Prerequisites

- Node.js v20+
- Rust v1.75+
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Run development server (Next.js only)
pnpm dev

# Run Tauri development (Desktop app)
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Project Structure

```
trace/
├── app/                    # Next.js App Router
│   ├── [locale]/          # Internationalized routes
│   │   ├── layout.tsx     # Root layout with i18n
│   │   └── page.tsx       # Home page
│   └── globals.css        # Global styles
├── i18n/                  # Internationalization config
│   ├── request.ts         # i18n request handler
│   └── routing.ts         # Routing configuration
├── messages/              # Translation files (JSON)
│   ├── en.json           # English
│   ├── zh.json           # Chinese
│   ├── es.json           # Spanish
│   ├── fr.json           # French
│   ├── de.json           # German
│   └── ja.json           # Japanese
├── src-tauri/            # Tauri backend
│   ├── src/
│   │   └── main.rs       # Rust entry point
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── middleware.ts         # Next.js middleware for i18n
├── next.config.ts        # Next.js configuration
├── tailwind.config.ts    # Tailwind CSS configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Node.js dependencies
```

## Development Guidelines

- All variable names and comments must be in English (Global Standard)
- Follow TypeScript strict mode
- Use Tailwind CSS for styling
- Maintain responsive design for all screen sizes
- Support dark mode by default

## License

MIT
