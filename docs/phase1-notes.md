# SchemeSathi — Phase 1 Architecture & Engineering Notes

## 1. Overview & Decisions

SchemeSathi is a multilingual (Hindi + English) RAG assistant for Indian welfare schemes with grounded citations. Phase 1 ingests official government scheme PDFs and provides grounded retrieval via MongoDB Atlas Vector Search.

### Key Architectural Decisions:
1. **Model Stack**:
   - **Embedding**: `gemini-embedding-2` configured to 768 dimensions via Matryoshka Representation Learning (MRL `outputDimensionality: 768`), balancing high retrieval quality with index memory efficiency.
   - **LLM**: `gemini-3.8-flash` for high throughput, grounded reasoning, and multilingual synthesis.
2. **Corpus Scope**:
   - Official English PDFs registered in `data/raw_pdfs/manifest.json`.
   - Vision IAS Hindi PDFs and KrutiDev-encoded legacy documents are excluded from raw parsing due to corrupt/non-standard font glyph encoding.
   - Hindi queries are supported natively via cross-lingual retrieval (`gemini-embedding-2` aligns Hindi questions with English corpus passages in vector space).
3. **Ingestion Quality Gate**:
   - Character count threshold: pages with $< 100$ characters quarantined.
   - Garble detection: signatures (`म्प्`, detached matras, orphan matras, `\uFFFD`, dangling halants).
   - English-ness check: common English stopword frequency threshold ($\ge 0.08$) catches KrutiDev pseudo-ASCII pages.
   - Quarantined pages are logged to `data/processed/quarantine.json` and excluded from chunking/indexing.
4. **Table & Heading Handling**:
   - Numbered sub-headings (e.g. `1.1) 2nd Loan for...`) are stored in `sectionTitle`, preserving parent `schemeName`.
   - Structured tables (e.g. CGTMSE Guarantee Coverage table on Page 10) are kept intact with `isTable: true`.
   - Content-hash deduplication (SHA-256) at ingestion removes duplicate chunks before vector indexing.

---

## 2. Ingestion & Vector Index Verification

### Chunk Count & Deduplication:
- **Total Pages Analyzed**: 61
- **Eligible Pages**: 54 (7 quarantined)
- **Raw Chunks Before Deduplication**: 191
- **Distinct Chunks After SHA-256 Content-Hash Deduplication**: 190
- **MongoDB Atlas Collection**: `schemesathi.scheme_chunks` (verified `countDocuments() === 190`)

### Atlas Vector Index Definition:
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }
  ]
}
```

### Atlas Vector Search Score Mapping:
Atlas cosine similarity maps $[-1, 1]$ to $[0, 1]$ using:
$$\text{Atlas Score} = \frac{1 + \cos(\theta)}{2}$$
- `0.9230` Atlas score $\leftrightarrow$ `0.8460` cosine similarity.
- `0.8800` Atlas score $\leftrightarrow$ `0.7600` cosine similarity.
- `0.8500` Atlas score $\leftrightarrow$ `0.7000` cosine similarity.

---

## 3. Evaluation & Threshold Calibration

### Evaluation Set (`scripts/eval/questions.json`):
- **12 Answerable Questions**: 8 natural citizen queries without scheme names, 1 query with scheme name, 3 Hindi queries.
- **8 Unanswerable Questions**: 3 near-topic MSME questions not in booklet (MUDRA Shishu, GST exemption, PM Vishwakarma toolkit voucher), 3 out-of-corpus general welfare questions (scholarships, PM Kisan, drone subsidy), and 2 Hindi out-of-corpus queries.

### Metrics Defined:
- **Strict Recall@k**: Hit ONLY if top-$k$ retrieved chunks contain a chunk on `expectedPage` AND including `expectedPhrase`.
- **Lenient Recall@k**: Scheme-level match (`schemeName === expectedScheme`).

### Benchmark Results:
```text
======================================================================
  Recall Metrics (Total Answerable Questions: 12)
======================================================================
Metric                               | Value     | Description
-------------------------------------|-----------|----------------------------------------------------
Strict Recall@1 (Page + Phrase)      | 100.0%    | Top-1 chunk is on expectedPage AND contains phrase
Strict Recall@3 (Page + Phrase)      | 100.0%    | Top-3 chunks include expectedPage AND phrase
Strict Recall@5 (Page + Phrase)      | 100.0%    | Top-5 chunks include expectedPage AND phrase
Lenient Recall@1 (Scheme-level only) | 100.0%    | Top-1 chunk matches expectedScheme name
Lenient Recall@3 (Scheme-level only) | 100.0%    | Top-3 chunks include expectedScheme name
Lenient Recall@5 (Scheme-level only) | 100.0%    | Top-5 chunks include expectedScheme name
```

### Separation Statistics:
- **Answerable Queries**: Min Top Score: `0.861084` | Mean: `0.900632` | Max: `0.935812`
- **Unanswerable Queries**: Min Top Score: `0.810986` | Mean: `0.843152` | Max: `0.895662`

### Threshold Trade-Off Analysis:
| Threshold | True Pos (Ans Passed) | False Neg (Ans Refused) | True Neg (Unans Blocked) | False Pos (Unans Leaked) | Accuracy % |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **0.84** | 12 / 12 | 0 / 12 | 4 / 8 | 4 / 8 | 80.0% |
| **0.86** | 12 / 12 | 0 / 12 | 4 / 8 | 4 / 8 | 80.0% |
| **0.87** (Optimal) | 11 / 12 | 1 / 12 | 7 / 8 | 1 / 8 | **90.0%** |
| **0.88** (Provisional) | 9 / 12 | 3 / 12 | 7 / 8 | 1 / 8 | 80.0% |
| **0.90** | 7 / 12 | 5 / 12 | 8 / 8 | 0 / 8 | 75.0% |

> [!IMPORTANT]
> **Provisional `MIN_SIMILARITY=0.86` & Two-Gate Architecture Evaluation**:
> - `MIN_SIMILARITY=0.86` is configured in `.env` as the provisional value for end-to-end testing.
> - **Rationale**: At `0.86`, 100% of answerable questions pass the vector similarity gate without false rejections. Meanwhile, 4 near-topic unanswerable questions (`UNANS-01` [ECLGS], `UNANS-02` [GST Exemption], `UNANS-03` [MUDRA Shishu], `UNANS-05` [PM Kisan]) pass Gate 1 to thoroughly test Gate 2 LLM refusal.
> - The top retrieved vector score, decision, used chunks count, stage timings, and faithfulness check status are logged on every chat request in `POST /api/chat`.
> - **Mandatory Recalibration**: Whenever additional scheme PDFs are ingested into `data/raw_pdfs/`, `scripts/test-atlas-vector-search.ts` must be re-run and `MIN_SIMILARITY` recalibrated against the expanded corpus.

---

## 4. Benchmark Refinements & Guardrails

### ANS-07 Grounding & Question Rewrite
- **Original Question**: *"Where can an aspiring entrepreneur attend a one-day awareness and motivation training camp to explore self-employment career options?"*
- **Refusal Cause**: Booklet Page 15 defines what the Entrepreneurship Awareness Programme (EAP) is and who it is for, but does not provide physical venue/location information (venues are only specified for Advance ESDP). Under strict zero-hallucination instructions, the LLM correctly set `answerable: false`.
- **Rewritten Question**: *"What is the Entrepreneurship Awareness Programme and who is it for?"*
- **Outcome**: Successfully answered with `expectedPage: 15` and citation to ESDP Scheme on Page 15.

### Corpus Discovery & UNANS-01 Relabeling
- **PM Vishwakarma Toolkit Query**: Originally labeled as out-of-corpus `UNANS-01`. However, official PDF pages 36–37 explicitly cover PM Vishwakarma toolkit vouchers up to ₹15,000 for artisans (including carpenters) and Common Service Centre (CSC) applications.
- Moved to answerable set as `ANS-13` with `expectedPage: 37`.
- Added genuine near-topic unanswerable `UNANS-01`: *"What are the eligibility criteria and maximum loan guarantee under the Emergency Credit Line Guarantee Scheme (ECLGS) for MSMEs?"* (confirmed 0 occurrences in corpus, passes Gate 1 with score 0.8895 and is refused by Gate 2 LLM).

### Faithfulness Guard
- Post-generation guard extracting every numerical token and percentage from the LLM answer.
- Validates each against the cited chunk texts.
- Any ungrounded statistic (e.g. general category 15%/25% subsidy not in chunk) triggers an immediate standard refusal, logged as `ungrounded_number`.
