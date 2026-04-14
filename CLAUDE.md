# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WordWise** (汇) — A Chinese-audience web app that extracts English vocabulary from `.docx` files, generates AI-powered dictionary entries (phonetics, POS, meaning, annotated example sentences), and presents results in a table with CSV export. Features background job processing, persistent file library, dictionary browser, and job progress visualization.

## Commands

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

No test framework or linter configured.

## Architecture

Vanilla JS SPA (no framework) using Vite as bundler. All source in `src/`. UI is rendered via imperative DOM manipulation (`innerHTML` + event listeners) in `app.js`. State is managed via module-level variables (`currentUser`, `selectedFiles`, `activeTab`, `jobFilter`, etc.).

All user-facing text is in Chinese. HTML output is escaped via `escapeHtml()` and `csvEscape()` helpers in `app.js`.

### Navigation

Two tabs in the main view:
- **提取** (Extract) — Upload/select files, create background extraction jobs, view job progress with visualization, cancel jobs
- **词典** (Dictionary) — Browse all persisted word entries with search, POS filter, sort by frequency/alpha/date

### Data Flow

1. **Auth** (`auth.js`) — Email/password auth via InsForge. Supports sign-up with email OTP verification.
2. **File Upload** (`app.js`) — User uploads `.docx` files or selects from file library. Files are SHA-256 hashed client-side for dedup.
3. **Storage** (`db.js`) — New files uploaded to InsForge Storage (`docx-uploads` bucket, private). Storage key saved in `processed_files.storage_key`.
4. **Parse** (`docx-parser.js`) — `mammoth` extracts raw text from `.docx`. Sentences and English words extracted via regex.
5. **Rank** (`word-ranker.js`) — Words scored by length, morphological complexity (prefix/suffix patterns), and curated difficulty/basic word lists. Stop words filtered.
6. **Cache Check** (`db.js`) — Processed files and word entries cached per-user in InsForge Postgres tables. File dedup uses `file_hash`; word entries use `(user_id, word)` unique constraint with upsert.
7. **Background Job** (`app.js` + `db.js`) — Uncached words are submitted as an `extraction_jobs` record. The `process-words` edge function is triggered immediately for the first batch, then a cron continues processing every minute.
8. **AI Generation** (`insforge/functions/process-words/index.ts`) — Server-side cascading retry pipeline:
   - Pass 1: Batch of 10, 3 concurrent → DeepSeek V3.2
   - Pass 2: Individual retry, 5 concurrent → DeepSeek V3.2
   - Pass 3: Individual retry, 5 concurrent → GPT-4o-mini (fallback)
   - Example sentences annotated with phonetics via CMU Pronouncing Dictionary (deterministic, no LLM)
9. **Job Visualization** (`app.js`) — SVG progress ring, word status grid (green/red/gray pills), live polling every 5s. Click word pills for popover details. Job filter tabs (all/active/completed/cancelled). Cancel button for active jobs.
10. **Dictionary** (`app.js`) — Loads all word entries + computes total word frequency across all `processed_files.word_freq` maps. Search, POS filter, sort by frequency/alpha/newest.

### Backend (InsForge)

- **Auth**: Email/password with OTP email verification
- **Storage**: `docx-uploads` bucket (private) for persistent file storage
- **Database tables**:
  - `processed_files`: `user_id`, `file_hash`, `file_name`, `raw_words` (jsonb), `sentences` (jsonb), `storage_key`, `word_freq` (jsonb — `{word: count}` map for frequency aggregation), `created_at`
  - `word_entries`: `user_id`, `word` (unique per user), `phonetic`, `pos`, `meaning`, `example`, `example_annotated` (jsonb array of `{word, phonetic}`), `example_cn`, `created_at`
  - `extraction_jobs`: `user_id`, `status` (pending/processing/completed/cancelled), `file_names` (jsonb), `words` (jsonb), `results` (jsonb), `failed_words` (jsonb), `total_count`, `completed_count`, `failed_count`, `batch_index`, `created_at`, `updated_at`
- **Edge function** `process-words` — AI dictionary generation with cascading retry + CMU phonetic annotation. Dispatch mode (no `job_id` → finds active jobs) and single-job mode. Cron calls every minute in dispatch mode.
- **Database functions** (SECURITY DEFINER, bypass RLS): `get_active_extraction_jobs()`, `get_extraction_job_by_id(uuid)`, `update_extraction_job(...)`, `upsert_word_entries(jsonb)`
- **AI**: Proxied LLM calls via `insforge.ai.chat.completions.create()`. Models: `deepseek/deepseek-v3.2` (primary), `openai/gpt-4o-mini` (fallback).
- **RLS**: All tables use row-level security with `auth.uid()` policies. Edge functions use SECURITY DEFINER RPCs.
- **Cron**: Every minute, calls `process-words` in dispatch mode (10 words per active job per tick).

### Key Module Responsibilities

| Module | Role |
|---|---|
| `insforge-client.js` | Singleton InsForge SDK client (env vars: `VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`) |
| `auth.js` | Auth functions wrapping InsForge auth API |
| `db.js` | All database operations — file cache CRUD, word entry cache/upsert, file hash computation, storage upload/delete, word frequency map |
| `docx-parser.js` | `.docx` → text → sentences + word list extraction |
| `word-ranker.js` | Difficulty scoring, stop-word filtering, frequency aggregation, example sentence lookup |
| `app.js` | All UI rendering (~1000 lines), tab routing (extract ↔ dictionary), file library, job visualization, event handling |
| `style.css` | Full styling (~1000 lines) — warm palette, responsive, Claude-inspired design |

## Deployment

Deployed via InsForge Deployments. `vercel.json` has SPA fallback rewrite (`/(.*) → /index.html`).

```bash
npm run build
npx @insforge/cli deployments deploy .
```

Live at: https://b23mw6qp.insforge.site
