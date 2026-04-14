# WordWise (汇) — 智能英语词汇提取

A web app for Chinese English learners that extracts vocabulary from `.docx` documents, generates AI-powered dictionary entries with phonetics, example sentences, and translations.

## Features

- Upload `.docx` files (drag & drop, up to 50 files)
- **File library** — uploaded files stored in cloud storage, reusable across sessions
- Automatic word extraction with difficulty-based ranking
- **Background job processing** — AI generation runs server-side; navigate away or close browser freely
- AI-generated dictionary entries: phonetics, part of speech, Chinese meaning, example sentences with per-word phonetic annotations (CMU Dictionary)
- **Cascading retry** — failed AI generations retry individually, then fall back to GPT-4o-mini (server-side)
- **Job visualization** — SVG progress ring, color-coded word grid, live polling, cancel support
- **Dictionary tab** — browse all persisted words with search, POS filter, and sort
- Per-user caching — previously processed files and word entries are reused
- Word frequency metrics — dictionary shows total appearances across all files
- CSV export for offline study
- Email/password authentication with OTP verification

## Tech Stack

- **Frontend**: Vanilla JS + Vite (no framework)
- **Backend**: [InsForge](https://insforge.com) (auth, Postgres database, AI proxy, file storage, edge functions, cron)
- **AI Models**: DeepSeek V3.2 (primary), GPT-4o-mini (fallback) via InsForge AI
- **Phonetics**: CMU Pronouncing Dictionary (ARPABET → IPA, deterministic)
- **DOCX Parsing**: [Mammoth.js](https://github.com/mwilliamson/mammoth.js)
- **Hosting**: InsForge Deployments (Vercel)

## Getting Started

```bash
npm install
npm run dev
```

Create a `.env.local` with your InsForge credentials:

```
VITE_INSFORGE_URL=https://your-project.insforge.app
VITE_INSFORGE_ANON_KEY=your-anon-key
```

## User Flow

```mermaid
flowchart TD
    A[Open App] --> B{Authenticated?}
    B -- No --> C[Login / Register]
    C --> D{Register?}
    D -- Yes --> E[Enter Email + Password + Name]
    E --> F[Email OTP Verification]
    F --> G[Verified]
    D -- No --> H[Enter Email + Password]
    H --> G
    G --> I[Main View]
    B -- Yes --> I

    I --> J[提取 Tab: Upload Files]
    J --> K1[Drag & Drop .docx Files]
    J --> K2[Select from File Library]
    K1 --> L[Files Hashed & Cache Checked]
    K2 --> L
    L --> M[Click 'Start Extraction']
    M --> N[Parse & Rank Words]
    N --> O[Create Background Job]
    O --> P[Job Progress Visualization]
    P --> P2[SVG Ring + Word Grid + Live Polling]
    P2 --> Q[View Completed Results]
    Q --> R{Export?}
    R -- Yes --> R2[Download CSV]

    I --> S[词典 Tab: Browse All Words]
    S --> T[Search / Filter / Sort]
    T --> U[Download Filtered CSV]

    I --> V[File Library]
    V --> W[Select Files for Processing]
    V --> X[Delete Old Files]
```

## Data Flow

```mermaid
flowchart LR
    subgraph Client
        DOCX[".docx File"] -->|mammoth| TEXT["Raw Text"]
        TEXT -->|regex| WORDS["Word List"]
        TEXT -->|regex| SENTS["Sentences"]
        WORDS -->|score & filter| RANKED["Ranked Words"]
        FILE_HASH["SHA-256 Hash"] -.->|dedup check| DB_CHECK
    end

    subgraph InsForge Backend
        DB_CHECK["processed_files table"]
        WORD_CACHE["word_entries table"]
        JOBS["extraction_jobs table"]
        EDGE_FN["process-words function"]
        AI_PROXY["AI Proxy"]
        STORAGE["File Storage"]
        CRON["Cron (every min)"]
    end

    DOCX -->|upload| STORAGE
    RANKED -->|uncached words| JOBS
    JOBS -->|dispatch| EDGE_FN
    CRON -->|trigger| EDGE_FN
    EDGE_FN -->|batch 10 + retry| AI_PROXY
    EDGE_FN -->|CMU dict| PHONETIC["Phonetic Annotations"]
    AI_PROXY --> ENTRIES["Dictionary Entries"]
    ENTRIES -->|upsert| WORD_CACHE
    ENTRIES -->|update progress| JOBS
    WORDS -->|save| DB_CHECK
    JOBS -->|poll status| VIZ["Job Visualization"]
    WORD_CACHE -->|browse| DICT["Dictionary Tab"]
```

## Backend Schema

```mermaid
erDiagram
    USERS ||--o{ PROCESSED_FILES : uploads
    USERS ||--o{ WORD_ENTRIES : owns
    USERS ||--o{ EXTRACTION_JOBS : creates

    USERS {
        uuid id PK
        string email
        string name
        timestamp created_at
    }

    PROCESSED_FILES {
        uuid id PK
        uuid user_id FK
        string file_hash
        string file_name
        json raw_words
        json sentences
        string storage_key
        json word_freq
        timestamp created_at
    }

    WORD_ENTRIES {
        uuid id PK
        uuid user_id FK
        string word
        string phonetic
        string pos
        string meaning
        string example
        json example_annotated
        string example_cn
        timestamp created_at
    }

    EXTRACTION_JOBS {
        uuid id PK
        uuid user_id FK
        string status
        json file_names
        json words
        json results
        json failed_words
        int total_count
        int completed_count
        int failed_count
        int batch_index
        timestamp created_at
        timestamp updated_at
    }
```

## Project Structure

```
src/
├── main.js             # Entry point
├── app.js              # UI rendering, view routing, tabs, job visualization
├── auth.js             # Authentication (InsForge auth)
├── db.js               # Database operations, file hashing, storage, job CRUD
├── docx-parser.js      # .docx text extraction
├── word-ranker.js      # Word difficulty scoring & ranking
├── insforge-client.js  # InsForge SDK client
└── style.css           # Styles (warm palette, responsive)

insforge/functions/
└── process-words/
    └── index.ts        # AI dictionary generation edge function + CMU phonetic annotator
```

## License

Private
