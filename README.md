# WordWise (汇) — 智能英语词汇提取

A web app for Chinese English learners that extracts vocabulary from `.docx` documents, generates AI-powered dictionary entries with phonetics, example sentences, and translations.

## Features

- Upload `.docx` files (drag & drop, up to 50 files)
- **File library** — uploaded files stored in cloud storage, reusable across sessions
- Automatic word extraction with difficulty-based ranking
- AI-generated dictionary entries: phonetics, part of speech, Chinese meaning, example sentences with per-word phonetic annotations
- **Cascading retry** — failed AI generations retry individually, then fall back to GPT-4o-mini
- **Dictionary tab** — browse all persisted words with search, POS filter, and sort
- Per-user caching — previously processed files and word entries are reused
- File count metrics — dictionary shows how many files contain each word
- CSV export for offline study
- Email/password authentication with OTP verification

## Tech Stack

- **Frontend**: Vanilla JS + Vite (no framework)
- **Backend**: [InsForge](https://insforge.com) (auth, Postgres database, AI proxy, file storage)
- **AI Models**: DeepSeek V3.2 (primary), GPT-4o-mini (fallback) via InsForge AI
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
    N --> O[AI Generates Dictionary Entries]
    O --> O2[Retry Failed Words Individually]
    O2 --> O3[Fallback Model for Remaining]
    O3 --> P[View Results Table]
    P --> Q{Export?}
    Q -- Yes --> R[Download CSV]

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
        AI_PROXY["AI Proxy"]
        STORAGE["File Storage"]
    end

    DOCX -->|upload| STORAGE
    RANKED -->|uncached words| AI_PROXY
    AI_PROXY -->|Pass 1: batch 10| ENTRIES["Dictionary Entries"]
    AI_PROXY -->|Pass 2: individual retry| ENTRIES
    AI_PROXY -->|Pass 3: fallback model| ENTRIES
    ENTRIES -->|upsert| WORD_CACHE
    WORDS -->|save| DB_CHECK
    WORD_CACHE -->|cached entries| MERGE["Merge & Sort"]
    ENTRIES --> MERGE
    MERGE --> TABLE["Results Table"]
    TABLE -->|export| CSV["CSV Download"]
```

## Backend Schema

```mermaid
erDiagram
    USERS ||--o{ PROCESSED_FILES : uploads
    USERS ||--o{ WORD_ENTRIES : owns

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
```

## Project Structure

```
src/
├── main.js             # Entry point
├── app.js              # UI rendering, view routing, tabs (extract + dictionary)
├── auth.js             # Authentication (InsForge auth)
├── db.js               # Database operations, file hashing, storage
├── docx-parser.js      # .docx text extraction
├── word-ranker.js      # Word difficulty scoring & ranking
├── ai-dictionary.js    # AI dictionary generation with cascading retry
├── insforge-client.js  # InsForge SDK client
└── style.css           # Styles (warm palette, responsive)
```

## License

Private
