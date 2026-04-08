# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WordWise** (汇) — A Chinese-audience web app that extracts English vocabulary from `.docx` files, ranks words by difficulty, generates AI-powered dictionary entries (phonetics, POS, meaning, annotated example sentences), and presents results in a table with CSV export.

## Commands

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

No test framework is configured yet. No linter configured.

## Architecture

Vanilla JS SPA (no framework) using Vite as bundler. All source in `src/`. UI is rendered via imperative DOM manipulation (`innerHTML` + event listeners) in `app.js`.

### Data Flow

1. **Auth** (`auth.js`) — Email/password auth via InsForge (Supabase-like BaaS). Supports sign-up with email OTP verification.
2. **File Upload** (`app.js`) — User uploads `.docx` files. Files are SHA-256 hashed client-side for dedup.
3. **Parse** (`docx-parser.js`) — `mammoth` extracts raw text from `.docx`. Sentences and English words are extracted via regex.
4. **Rank** (`word-ranker.js`) — Words scored by length, morphological complexity (prefix/suffix patterns), and curated difficulty/basic word lists. Stop words filtered.
5. **Cache Check** (`db.js`) — Processed files and word entries are cached per-user in InsForge Postgres tables (`processed_files`, `word_entries`). File dedup uses `file_hash`; word entries use `(user_id, word)` unique constraint with upsert.
6. **AI Generation** (`ai-dictionary.js`) — Uncached words sent in batches (10 words/batch, 3 concurrent batches) to `deepseek/deepseek-v3.2` via InsForge AI proxy. Prompt requests JSON array with phonetics, POS, meaning, short example sentence, per-word phonetic annotations, and Chinese translation.
7. **Display** (`app.js`) — Results table with annotated examples (each word shows phonetic below it). CSV download with BOM for Excel compatibility.

### Backend (InsForge)

- **Auth**: Email/password with OTP email verification
- **Database tables**:
  - `processed_files`: `user_id`, `file_hash`, `file_name`, `raw_words` (json), `sentences` (json)
  - `word_entries`: `user_id`, `word` (unique per user), `phonetic`, `pos`, `meaning`, `example`, `example_annotated` (json array of `{word, phonetic}`), `example_cn`, `frequency`
- **AI**: Proxied LLM calls via `insforge.ai.chat.completions.create()`

### Key Module Responsibilities

| Module | Role |
|---|---|
| `insforge-client.js` | Singleton InsForge SDK client (env vars: `VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`) |
| `auth.js` | Auth functions wrapping InsForge auth API |
| `db.js` | All database operations — file cache CRUD, word entry cache/upsert, file hash computation |
| `docx-parser.js` | `.docx` → text → sentences + word list extraction |
| `word-ranker.js` | Difficulty scoring, stop-word filtering, frequency aggregation, example sentence lookup |
| `ai-dictionary.js` | Batched AI dictionary generation with concurrency control and fallback |
| `app.js` | All UI rendering, view routing (auth ↔ upload ↔ results), event handling |
| `style.css` | Full styling — warm palette inspired by Claude's design, responsive |

## Deployment

Deployed to Vercel. `vercel.json` has SPA fallback rewrite (`/(.*) → /index.html`).
