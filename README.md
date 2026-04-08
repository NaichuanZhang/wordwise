# WordWise (汇) — 智能英语词汇提取

A web app for Chinese English learners that extracts vocabulary from `.docx` documents, ranks words by difficulty, and generates AI-powered dictionary entries with phonetics, example sentences, and translations.

## Features

- Upload `.docx` files (drag & drop, up to 50 files)
- Automatic word extraction with difficulty-based ranking
- AI-generated dictionary entries: phonetics, part of speech, Chinese meaning, example sentences with per-word phonetic annotations
- Per-user caching — previously processed files and word entries are reused
- CSV export for offline study
- Email/password authentication with OTP verification

## Tech Stack

- **Frontend**: Vanilla JS + Vite (no framework)
- **Backend**: [InsForge](https://insforge.com) (auth, Postgres database, AI proxy)
- **AI Model**: DeepSeek V3.2 via InsForge AI
- **DOCX Parsing**: [Mammoth.js](https://github.com/mwilliamson/mammoth.js)
- **Hosting**: Vercel

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
    G --> I[Upload View]
    B -- Yes --> I

    I --> J[Drag & Drop .docx Files]
    J --> K[Files Hashed & Cache Checked]
    K --> L[Click 'Start Extraction']
    L --> M[Parse & Rank Words]
    M --> N[AI Generates Dictionary Entries]
    N --> O[View Results Table]
    O --> P{Export?}
    P -- Yes --> Q[Download CSV]
    P -- No --> R[Done]

    I --> S[View Processed File History]
    S --> T[Delete Old Files]
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
        AI_PROXY["AI Proxy<br/>(DeepSeek V3.2)"]
    end

    RANKED -->|uncached words| AI_PROXY
    AI_PROXY -->|JSON: phonetic, POS,<br/>meaning, example,<br/>annotated, translation| ENTRIES["Dictionary Entries"]
    ENTRIES -->|upsert| WORD_CACHE
    WORDS -->|save| DB_CHECK
    WORD_CACHE -->|cached entries| MERGE["Merge & Sort<br/>by Frequency"]
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
        int frequency
    }
```

## Project Structure

```
src/
├── main.js             # Entry point
├── app.js              # UI rendering & view routing
├── auth.js             # Authentication (InsForge auth)
├── db.js               # Database operations & file hashing
├── docx-parser.js      # .docx text extraction
├── word-ranker.js      # Word difficulty scoring & ranking
├── ai-dictionary.js    # AI-powered dictionary generation
├── insforge-client.js  # InsForge SDK client
└── style.css           # Styles (warm palette, responsive)
```

## License

Private
