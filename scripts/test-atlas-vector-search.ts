/**
 * SchemeSathi - Live Atlas $vectorSearch Evaluation Script (Deliverable 3 Verification)
 * 
 * Runs real $vectorSearch aggregation queries on MongoDB Atlas across
 * the 20-question eval set (12 answerable, 8 unanswerable).
 * 
 * Metrics:
 * - Strict Recall@k: hit ONLY if retrieved chunk is on expectedPage AND contains expectedPhrase.
 * - Lenient Recall@k: scheme-level match (schemeName === expectedScheme).
 * - Separation Statistics & Optimal Threshold Analysis (trade-offs at 0.84, 0.86, 0.88, 0.90).
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { GeminiEmbeddingProvider } from '../server/src/providers/geminiEmbeddingProvider.js';

dotenv.config();

interface QuestionItem {
  id: string;
  category: 'answerable' | 'unanswerable';
  language: 'en' | 'hi';
  hasSchemeName?: boolean;
  subCategory?: string;
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
}

interface RetrievedChunk {
  schemeName: string;
  sectionTitle: string;
  sourceFile: string;
  pageNumber: number;
  text: string;
  isTable: boolean;
  score: number;
}

interface EvalResult {
  id: string;
  category: 'answerable' | 'unanswerable';
  language: 'en' | 'hi';
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
  topScore: number;
  retrieved: RetrievedChunk[];
  strictHitAt1: boolean;
  strictHitAt3: boolean;
  strictHitAt5: boolean;
  lenientHitAt1: boolean;
  lenientHitAt3: boolean;
  lenientHitAt5: boolean;
}

async function runEvaluation() {
  const logLines: string[] = [];
  function log(msg: string = '') {
    console.log(msg);
    logLines.push(msg);
  }

  log(`======================================================================`);
  log(`  SchemeSathi — Live MongoDB Atlas $vectorSearch Evaluation (20-Q Set)`);
  log(`  Index: "vector_index" | Collection: "schemesathi.scheme_chunks"`);
  log(`  Embedding Model: gemini-embedding-2 (768 dimensions)`);
  log(`======================================================================\n`);

  const questionsPath = path.resolve('scripts/eval/questions.json');
  if (!fs.existsSync(questionsPath)) {
    throw new Error(`Questions file not found: ${questionsPath}`);
  }
  const questions: QuestionItem[] = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const provider = new GeminiEmbeddingProvider();
  const mongoUri = process.env.MONGODB_URI!;
  const client = new MongoClient(mongoUri);
  await client.connect();

  const db = client.db(process.env.MONGODB_DB_NAME || 'schemesathi');
  const collection = db.collection('scheme_chunks');

  const evalResults: EvalResult[] = [];

  try {
    for (const q of questions) {
      log(`----------------------------------------------------------------------`);
      log(`[${q.id}] [${q.category.toUpperCase()}] [Lang: ${q.language}] ${q.subCategory ? `[${q.subCategory}]` : ''}`);
      log(`Question: "${q.question}"`);
      if (q.category === 'answerable') {
        log(`Expected: Scheme="${q.expectedScheme}" | Page=${q.expectedPage} | Phrase="${q.expectedPhrase}"`);
      }

      const queryVector = await provider.embedQuery(q.question);

      const results: RetrievedChunk[] = (await collection
        .aggregate([
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector: queryVector,
              numCandidates: 100,
              limit: 5,
            },
          },
          {
            $project: {
              schemeName: 1,
              sectionTitle: 1,
              sourceFile: 1,
              pageNumber: 1,
              text: 1,
              isTable: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ])
        .toArray()) as any;

      if (results.length === 0) {
        log(`⚠️  No results returned from Atlas $vectorSearch.`);
        continue;
      }

      const topScore = results[0].score;

      // Check strict & lenient hits
      let strictHitAt1 = false;
      let strictHitAt3 = false;
      let strictHitAt5 = false;
      let lenientHitAt1 = false;
      let lenientHitAt3 = false;
      let lenientHitAt5 = false;

      if (q.category === 'answerable') {
        const checkStrict = (chunk: RetrievedChunk) => {
          const pageMatch = chunk.pageNumber === q.expectedPage;
          const phraseMatch = chunk.text.toLowerCase().includes(q.expectedPhrase!.toLowerCase());
          return pageMatch && phraseMatch;
        };
        const checkLenient = (chunk: RetrievedChunk) => {
          return chunk.schemeName.trim().toLowerCase() === q.expectedScheme!.trim().toLowerCase();
        };

        strictHitAt1 = checkStrict(results[0]);
        strictHitAt3 = results.slice(0, 3).some(checkStrict);
        strictHitAt5 = results.slice(0, 5).some(checkStrict);

        lenientHitAt1 = checkLenient(results[0]);
        lenientHitAt3 = results.slice(0, 3).some(checkLenient);
        lenientHitAt5 = results.slice(0, 5).some(checkLenient);
      }

      evalResults.push({
        id: q.id,
        category: q.category,
        language: q.language,
        question: q.question,
        expectedScheme: q.expectedScheme,
        expectedPage: q.expectedPage,
        expectedPhrase: q.expectedPhrase,
        topScore,
        retrieved: results,
        strictHitAt1,
        strictHitAt3,
        strictHitAt5,
        lenientHitAt1,
        lenientHitAt3,
        lenientHitAt5,
      });

      log(`Top Retrieved Results (Top 3):`);
      for (const [rank, doc] of results.slice(0, 3).entries()) {
        const isStrict = q.category === 'answerable' && doc.pageNumber === q.expectedPage && doc.text.toLowerCase().includes(q.expectedPhrase!.toLowerCase());
        const isLenient = q.category === 'answerable' && doc.schemeName.trim().toLowerCase() === q.expectedScheme!.trim().toLowerCase();
        log(`  Rank ${rank + 1}:`);
        log(`    Scheme:          "${doc.schemeName}"`);
        log(`    Section:         "${doc.sectionTitle}"`);
        log(`    Page / File:     Page ${doc.pageNumber} (${doc.sourceFile})`);
        log(`    Raw Atlas Score: ${doc.score}`);
        log(`    Match Status:    ${q.category === 'answerable' ? `Strict: ${isStrict ? '✅ YES' : '❌ NO'} | Lenient (Scheme): ${isLenient ? '✅ YES' : '❌ NO'}` : 'N/A (Unanswerable)'}`);
        log(`    Preview:         ${doc.text.replace(/\s+/g, ' ').substring(0, 150)}...`);
      }
      log('');
    }

    // --- Score Table Summary ---
    log(`======================================================================`);
    log(`  Evaluation Summary Table (All 20 Questions)`);
    log(`======================================================================`);
    log(`ID       | Category     | Lang | Top Score | Strict Hit@3 | Lenient Hit@3 | Top Matched Scheme`);
    log(`---------|--------------|------|-----------|--------------|---------------|-----------------------------------------`);
    for (const r of evalResults) {
      const catLabel = r.category === 'answerable' ? 'Answerable  ' : 'Unanswerable';
      const strictStr = r.category === 'answerable' ? (r.strictHitAt3 ? '✅ Hit ' : '❌ Miss') : '  -    ';
      const lenientStr = r.category === 'answerable' ? (r.lenientHitAt3 ? '✅ Hit ' : '❌ Miss') : '  -    ';
      const schemeStr = r.retrieved[0].schemeName.substring(0, 39);
      log(`${r.id.padEnd(8)} | ${catLabel} | ${r.language.padEnd(4)} | ${r.topScore.toFixed(6)}  | ${strictStr}     | ${lenientStr}     | ${schemeStr}`);
    }

    // --- Recall Metrics ---
    const answerable = evalResults.filter((r) => r.category === 'answerable');
    const totalAns = answerable.length;

    const strictRecall1 = (answerable.filter((r) => r.strictHitAt1).length / totalAns) * 100;
    const strictRecall3 = (answerable.filter((r) => r.strictHitAt3).length / totalAns) * 100;
    const strictRecall5 = (answerable.filter((r) => r.strictHitAt5).length / totalAns) * 100;

    const lenientRecall1 = (answerable.filter((r) => r.lenientHitAt1).length / totalAns) * 100;
    const lenientRecall3 = (answerable.filter((r) => r.lenientHitAt3).length / totalAns) * 100;
    const lenientRecall5 = (answerable.filter((r) => r.lenientHitAt5).length / totalAns) * 100;

    log(`\n======================================================================`);
    log(`  Recall Metrics (Total Answerable Questions: ${totalAns})`);
    log(`======================================================================`);
    log(`Metric                               | Value     | Description`);
    log(`-------------------------------------|-----------|----------------------------------------------------`);
    log(`Strict Recall@1 (Page + Phrase)      | ${strictRecall1.toFixed(1).padStart(5)}%    | Top-1 chunk is on expectedPage AND contains phrase`);
    log(`Strict Recall@3 (Page + Phrase)      | ${strictRecall3.toFixed(1).padStart(5)}%    | Top-3 chunks include expectedPage AND phrase`);
    log(`Strict Recall@5 (Page + Phrase)      | ${strictRecall5.toFixed(1).padStart(5)}%    | Top-5 chunks include expectedPage AND phrase`);
    log(`Lenient Recall@1 (Scheme-level only) | ${lenientRecall1.toFixed(1).padStart(5)}%    | Top-1 chunk matches expectedScheme name`);
    log(`Lenient Recall@3 (Scheme-level only) | ${lenientRecall3.toFixed(1).padStart(5)}%    | Top-3 chunks include expectedScheme name`);
    log(`Lenient Recall@5 (Scheme-level only) | ${lenientRecall5.toFixed(1).padStart(5)}%    | Top-5 chunks include expectedScheme name`);

    // --- Separation Statistics ---
    const ansScores = evalResults.filter((r) => r.category === 'answerable').map((r) => r.topScore);
    const unansScores = evalResults.filter((r) => r.category === 'unanswerable').map((r) => r.topScore);

    const minAns = Math.min(...ansScores);
    const maxAns = Math.max(...ansScores);
    const meanAns = ansScores.reduce((a, b) => a + b, 0) / ansScores.length;

    const minUnans = Math.min(...unansScores);
    const maxUnans = Math.max(...unansScores);
    const meanUnans = unansScores.reduce((a, b) => a + b, 0) / unansScores.length;

    log(`\n======================================================================`);
    log(`  Separation Statistics`);
    log(`======================================================================`);
    log(`Answerable Queries (N=${ansScores.length}):`);
    log(`  Min Top Score:  ${minAns.toFixed(6)}`);
    log(`  Mean Top Score: ${meanAns.toFixed(6)}`);
    log(`  Max Top Score:  ${maxAns.toFixed(6)}`);
    log(`\nUnanswerable Queries (N=${unansScores.length}):`);
    log(`  Min Top Score:  ${minUnans.toFixed(6)}`);
    log(`  Mean Top Score: ${meanUnans.toFixed(6)}`);
    log(`  Max Top Score:  ${maxUnans.toFixed(6)}`);
    log(`\nSeparation Margin (Min Answerable - Max Unanswerable): ${(minAns - maxUnans).toFixed(6)}`);

    // --- Threshold Trade-off Analysis ---
    log(`\n======================================================================`);
    log(`  MIN_SIMILARITY Threshold Decision & Trade-off Analysis`);
    log(`======================================================================`);
    log(`Threshold | True Pos (Ans >= T) | False Neg (Ans < T) | True Neg (Unans < T) | False Pos (Unans >= T) | Accuracy %`);
    log(`----------|---------------------|---------------------|----------------------|------------------------|-----------`);

    const evalThreshold = (t: number) => {
      const tp = ansScores.filter((s) => s >= t).length;
      const fn = ansScores.filter((s) => s < t).length;
      const tn = unansScores.filter((s) => s < t).length;
      const fp = unansScores.filter((s) => s >= t).length;
      const accuracy = ((tp + tn) / (ansScores.length + unansScores.length)) * 100;
      return { t, tp, fn, tn, fp, accuracy };
    };

    const requestedThresholds = [0.84, 0.86, 0.88, 0.90];
    for (const t of requestedThresholds) {
      const { tp, fn, tn, fp, accuracy } = evalThreshold(t);
      log(`  ${t.toFixed(2)}    | ${String(tp).padStart(2)} / ${ansScores.length} (Ans Pass)   | ${String(fn).padStart(2)} / ${ansScores.length} (Refused)   | ${String(tn).padStart(2)} / ${unansScores.length} (Unans Block)  | ${String(fp).padStart(2)} / ${unansScores.length} (False Pass)   | ${accuracy.toFixed(1)}%`);
    }

    // Search for optimal threshold across fine-grained range
    let bestT = 0.88;
    let bestAcc = -1;
    for (let t = 0.80; t <= 0.95; t += 0.005) {
      const { accuracy } = evalThreshold(t);
      if (accuracy > bestAcc) {
        bestAcc = accuracy;
        bestT = t;
      }
    }

    const optimal = evalThreshold(bestT);
    log(`\nOptimal Threshold Found: ${bestT.toFixed(3)}`);
    log(`  Maximizes Decision Accuracy to: ${bestAcc.toFixed(1)}%`);
    log(`  True Positives (Answerable Passed):   ${optimal.tp}/${ansScores.length}`);
    log(`  False Negatives (Answerable Refused): ${optimal.fn}/${ansScores.length}`);
    log(`  True Negatives (Unanswerable Blocked):${optimal.tn}/${unansScores.length}`);
    log(`  False Positives (Unanswerable Leaked):${optimal.fp}/${unansScores.length}`);
    log(`======================================================================\n`);

    const outPath = path.resolve('data/processed/eval_results_20q.txt');
    fs.writeFileSync(outPath, logLines.join('\n'), 'utf8');
    log(`Evaluation log written to: ${outPath}`);
  } catch (err: any) {
    console.error(`Evaluation error: ${err.message}`);
  } finally {
    await client.close();
  }
}

runEvaluation().catch(console.error);
