# SchemeSathi (योजना साथी)

> Multilingual (Hindi + English) RAG Assistant for Indian Government Welfare Schemes with Grounded Citations.  
> MCA Final-Year Major Project — Phase 1.

SchemeSathi empowers citizens to discover government welfare schemes, scholarships, subsidies, and entitlements they are eligible for by asking questions in **Hindi or English**. Responses are strictly grounded in official government scheme documentation, complete with source document and page number citations to eliminate hallucinations.

---

## 🏛️ Key Features

- **Multilingual Support (Hindi & English):** Automatic language detection and toggle for seamless conversational access.
- **Strictly Grounded RAG:** Answers are synthesized **only** from retrieved passages of official scheme PDFs. If information is not found in the documents, the system honestly admits it rather than speculating.
- **Verifiable Citations:** Every response includes file names and page numbers pointing to the official source documents.
- **Vector Search Guardrails:** Uses configurable similarity thresholds (`MIN_SIMILARITY`) to reject irrelevant queries before invoking the LLM, protecting against hallucinations and reducing API cost.
- **Provider Abstraction:** Modular provider layer allowing LLM and embedding backends (Google Gemini, etc.) to be swapped via environment variables.

---

## 🛠️ Architecture & Tech Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend:** Node.js 20+, Express, TypeScript
- **Vector Store:** MongoDB Atlas Vector Search
- **Embeddings:** Google Gemini (`text-embedding-004`, 768 dimensions)
- **Generation:** Google Gemini (`gemini-2.5-flash`)
- **PDF Extraction:** `pdfjs-dist` / `pdf-parse` with page tracking and OCR detection

---

## 📁 Repository Structure

```
SchemeSathi/
├── client/                     # Next.js App Router frontend
├── server/                     # Express API server & RAG pipeline
│   ├── src/
│   │   ├── config/             # Zod-validated environment config
│   │   ├── db/                 # MongoDB connection & collections
│   │   ├── providers/          # Swappable LLM & Embedding interfaces
│   │   ├── ingestion/          # PDF parsing, cleaning, chunking & indexing
│   │   ├── rag/                # Vector retrieval & strictly grounded prompt builder
│   │   ├── routes/             # Express routes (/api/health, /api/chat)
│   │   └── middlewares/        # Helmet, CORS, Rate-limiting, Centralized Error Handling
│   └── tests/                  # Unit tests (Chunker, PromptBuilder)
├── data/
│   ├── raw_pdfs/               # Official PDF documents & manifest.json
│   └── processed/              # Processed chunks cache & ingestion logs
├── docs/                       # Atlas vector search definition & phase notes
└── scripts/
    ├── inspect-pdf.ts          # PDF page text quality inspector (Devanagari check)
    └── eval/                   # Benchmark questions (20 samples) & evaluation runner
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v20.x or higher
- **npm** v10.x or higher
- **MongoDB Atlas** cluster with Vector Search capability
- **Google Gemini API Key** ([Google AI Studio](https://aistudio.google.com/))

### 1. Clone & Install Dependencies

```bash
git clone <repo-url> SchemeSathi
cd SchemeSathi
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` in the root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Adding Scheme PDFs & Ingestion

1. Place official government scheme PDFs into `data/raw_pdfs/`.
2. Register each file in `data/raw_pdfs/manifest.json`:
   ```json
   {
     "schemes": [
       {
         "file": "post_matric_scholarship.pdf",
         "schemeName": "Post-Matric Scholarship Scheme for SC Students",
         "category": "Education",
         "level": "central",
         "language": "en",
         "sourceUrl": "https://scholarships.gov.in"
       }
     ]
   }
   ```
3. Run the PDF inspector to verify text extraction and Devanagari fidelity:
   ```bash
   npm run inspect:pdf -- --file post_matric_scholarship.pdf --page 1
   ```
4. Ingest and create vector embeddings in MongoDB Atlas:
   ```bash
   npm run ingest
   ```

### 4. Create MongoDB Atlas Vector Search Index

In MongoDB Atlas under your collection (`scheme_chunks`), create a Vector Search Index using the definition documented in [`docs/atlas-vector-search.json`](file:///c:/Users/shash/OneDrive/Desktop/SchemeSathiAI/docs/atlas-vector-search.json).

### 5. Running the Application

To run the backend API server:
```bash
npm run dev:server
```

To run the Next.js client interface:
```bash
npm run dev:client
```

Open `http://localhost:3000` in your browser.

---

## 🧪 Testing & Evaluation

- Run Unit Tests:
  ```bash
  npm run test
  ```
- Run RAG Retrieval & Recall Evaluation:
  ```bash
  npm run eval
  ```

---

## 📄 License
Academic Major Project License - MCA Final Year.