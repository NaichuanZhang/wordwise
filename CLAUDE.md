# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WordWise** (汇) — A Chinese-audience web app that extracts English vocabulary from `.docx` files, generates AI-powered dictionary entries (phonetics, POS, meaning, annotated example sentences), and presents results in a table with CSV export. Includes a persistent file library and a dictionary browser.

## Commands

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

No test framework is configured yet. No linter configured.

## Architecture

Vanilla JS SPA (no framework) using Vite as bundler. All source in `src/`. UI is rendered via imperative DOM manipulation (`innerHTML` + event listeners) in `app.js`.

### Navigation

Two tabs in the main view:
- **提取** (Extract) — Upload/select files, process words, view extraction results
- **词典** (Dictionary) — Browse all persisted word entries with search, filter, sort

### Data Flow

1. **Auth** (`auth.js`) — Email/password auth via InsForge. Supports sign-up with email OTP verification.
2. **File Upload** (`app.js`) — User uploads `.docx` files or selects from file library. Files are SHA-256 hashed client-side for dedup.
3. **Storage** (`db.js`) — New files uploaded to InsForge Storage (`docx-uploads` bucket, private). Storage key saved in `processed_files.storage_key`.
4. **Parse** (`docx-parser.js`) — `mammoth` extracts raw text from `.docx`. Sentences and English words extracted via regex.
5. **Rank** (`word-ranker.js`) — Words scored by length, morphological complexity (prefix/suffix patterns), and curated difficulty/basic word lists. Stop words filtered.
6. **Cache Check** (`db.js`) — Processed files and word entries cached per-user in InsForge Postgres tables. File dedup uses `file_hash`; word entries use `(user_id, word)` unique constraint with upsert.
7. **AI Generation** (`ai-dictionary.js`) — Cascading retry pipeline:
   - Pass 1: Batches of 10, 3 concurrent → DeepSeek V3.2
   - Pass 2: Individual retry, 5 concurrent → DeepSeek V3.2
   - Pass 3: Individual retry, 5 concurrent → GPT-4o-mini (fallback)
8. **Display** (`app.js`) — Results table with annotated examples (each word shows phonetic below it). CSV download with BOM for Excel compatibility.
9. **Dictionary** (`app.js`) — Loads all word entries + computes file count per word from `processed_files.raw_words`. Search, POS filter, sort by file count/alpha/newest.

### Backend (InsForge)

- **Auth**: Email/password with OTP email verification
- **Storage**: `docx-uploads` bucket (private) for persistent file storage
- **Database tables**:
  - `processed_files`: `user_id`, `file_hash`, `file_name`, `raw_words` (jsonb), `sentences` (jsonb), `storage_key`, `created_at`
  - `word_entries`: `user_id`, `word` (unique per user), `phonetic`, `pos`, `meaning`, `example`, `example_annotated` (jsonb array of `{word, phonetic}`), `example_cn`, `created_at`
- **AI**: Proxied LLM calls via `insforge.ai.chat.completions.create()`. Models: `deepseek/deepseek-v3.2` (primary), `openai/gpt-4o-mini` (fallback).

### Key Module Responsibilities

| Module | Role |
|---|---|
| `insforge-client.js` | Singleton InsForge SDK client (env vars: `VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`) |
| `auth.js` | Auth functions wrapping InsForge auth API |
| `db.js` | All database operations — file cache CRUD, word entry cache/upsert, file hash computation, storage upload/delete, file count map |
| `docx-parser.js` | `.docx` → text → sentences + word list extraction |
| `word-ranker.js` | Difficulty scoring, stop-word filtering, frequency aggregation, example sentence lookup |
| `ai-dictionary.js` | Cascading AI dictionary generation: batch → individual retry → model fallback |
| `app.js` | All UI rendering, tab routing (extract ↔ dictionary), file library, event handling |
| `style.css` | Full styling — warm palette inspired by Claude's design, responsive |

## Deployment

Deployed via InsForge Deployments. `vercel.json` has SPA fallback rewrite (`/(.*) → /index.html`).

```bash
npm run build
npx @insforge/cli deployments deploy .
```

Live at: https://b23mw6qp.insforge.site
