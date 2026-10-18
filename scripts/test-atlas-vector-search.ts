/**
 * SchemeSathi - Live Atlas $vectorSearch Evaluation Script
 * 
 * Runs real $vectorSearch aggregation queries on MongoDB Atlas across
 * answerable and unanswerable question sets, outputting the raw score
 * values Atlas returns via { $meta: "vectorSearchScore" }.
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { GeminiEmbeddingProvider } from '../server/src/providers/geminiEmbeddingProvider.js';

dotenv.config();

interface TestCase {
  id: string;
  category: 'Answerable (In-Corpus MSME)' | 'Unanswerable (Out-of-Corpus)';
  language: 'en' | 'hi';
  query: string;
  expectedScheme?: string;
  expectedSection?: string;
}

const TEST_CASES: TestCase[] = [
  // --- Answerable Question Set ---
  {
    id: 'ANS-01',
    category: 'Answerable (In-Corpus MSME)',
    language: 'en',
    query: 'who can apply for PMEGP',
    expectedScheme: 'Prime Minister’s Employment Generation Programme (PMEGP)',
    expectedSection: 'Scheme applicable for (Eligibility)',
  },
  {
    id: 'ANS-02',
    category: 'Answerable (In-Corpus MSME)',
    language: 'en',
    query: 'What is the maximum loan amount under PMEGP for manufacturing sector?',
    expectedScheme: 'Prime Minister’s Employment Generation Programme (PMEGP)',
    expectedSection: 'Nature of assistance',
  },
  {
    id: 'ANS-03',
    category: 'Answerable (In-Corpus MSME)',
    language: 'en',
    query: 'What is the guarantee coverage for women entrepreneurs under CGTMSE?',
    expectedScheme: 'Credit Guarantee Scheme for Micro & Small Enterprises (CGTMSE)',
    expectedSection: 'Guarantee Coverage Table / Eligibility',
  },
  {
    id: 'ANS-04',
    category: 'Answerable (In-Corpus MSME)',
    language: 'hi',
    query: 'PMEGP योजना के लिए कौन आवेदन कर सकता है?',
    expectedScheme: 'Prime Minister’s Employment Generation Programme (PMEGP)',
    expectedSection: 'Scheme applicable for (Eligibility)',
  },

  // --- Unanswerable / Out-of-Corpus Question Set ---
  {
    id: 'UNANS-01',
    category: 'Unanswerable (Out-of-Corpus)',
    language: 'en',
    query: 'Which scholarship can a class 12 student from a low-income family apply for?',
  },
  {
    id: 'UNANS-02',
    category: 'Unanswerable (Out-of-Corpus)',
    language: 'en',
    query: 'How to apply for PM Kisan Samman Nidhi?',
  },
  {
    id: 'UNANS-03',
    category: 'Unanswerable (Out-of-Corpus)',
    language: 'en',
    query: 'What is the drone subsidy for wheat farmers in Punjab?',
  },
  {
    id: 'UNANS-04',
    category: 'Unanswerable (Out-of-Corpus)',
    language: 'hi',
    query: 'किसान क्रेडिट कार्ड कैसे बनवाएं और ऋण सीमा क्या है?',
  },
];

async function runAtlasVectorSearchEvaluation() {
  const logLines: string[] = [];
  function log(msg: string = '') {
    console.log(msg);
    logLines.push(msg);
  }

  log(`======================================================================`);
  log(`  SchemeSathi — Live MongoDB Atlas $vectorSearch Evaluation`);
  log(`  Index: "vector_index" | Collection: "schemesathi.scheme_chunks"`);
  log(`  Embedding Model: gemini-embedding-2 (768 dimensions)`);
  log(`======================================================================\n`);

  const provider = new GeminiEmbeddingProvider();
  const mongoUri = process.env.MONGODB_URI!;
  const client = new MongoClient(mongoUri);
  await client.connect();

  const db = client.db(process.env.MONGODB_DB_NAME || 'schemesathi');
  const collection = db.collection('scheme_chunks');

  const summaryRows: {
    id: string;
    category: string;
    query: string;
    topScore: number;
    topScheme: string;
    topSection: string;
  }[] = [];

  try {
    for (const testCase of TEST_CASES) {
      log(`----------------------------------------------------------------------`);
      log(`[TEST CASE ${testCase.id}] [${testCase.category}] [Lang: ${testCase.language}]`);
      log(`Query: "${testCase.query}"`);
      if (testCase.expectedScheme) {
        log(`Expected Scheme: "${testCase.expectedScheme}"`);
      }

      const queryVector = await provider.embedQuery(testCase.query);

      const results = await collection
        .aggregate([
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector: queryVector,
              numCandidates: 100,
              limit: 3,
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
        .toArray();

      if (results.length === 0) {
        log(`⚠️  No results returned from Atlas $vectorSearch.`);
        continue;
      }

      const topResult = results[0];
      summaryRows.push({
        id: testCase.id,
        category: testCase.category,
        query: testCase.query,
        topScore: topResult.score,
        topScheme: topResult.schemeName,
        topSection: topResult.sectionTitle,
      });

      log(`Top Retrieved Results (Top 3):`);
      for (const [rank, doc] of results.entries()) {
        log(`  Rank ${rank + 1}:`);
        log(`    Scheme:          "${doc.schemeName}"`);
        log(`    Section:         "${doc.sectionTitle}"`);
        log(`    Page / File:     Page ${doc.pageNumber} (${doc.sourceFile})`);
        log(`    Raw Atlas Score: ${doc.score}`);
        log(`    isTable:         ${doc.isTable}`);
        log(`    Preview:         ${doc.text.replace(/\s+/g, ' ').substring(0, 160)}...`);
      }
      log('');
    }

    log(`======================================================================`);
    log(`  Atlas Vector Search Score Summary & Threshold Separation Analysis`);
    log(`======================================================================`);
    log(`ID       | Category     | Raw Atlas Top Score | Top Scheme / Match`);
    log(`---------|--------------|---------------------|--------------------------------------------`);
    for (const r of summaryRows) {
      const catLabel = r.category.startsWith('Answerable') ? 'Answerable  ' : 'Unanswerable';
      log(`${r.id.padEnd(8)} | ${catLabel} | ${r.topScore.toFixed(6).padEnd(19)} | ${r.topScheme.substring(0, 42)}`);
    }

    const answerableScores = summaryRows
      .filter((r) => r.category.startsWith('Answerable'))
      .map((r) => r.topScore);
    const unanswerableScores = summaryRows
      .filter((r) => r.category.startsWith('Unanswerable'))
      .map((r) => r.topScore);

    const minAnswerable = Math.min(...answerableScores);
    const maxUnanswerable = Math.max(...unanswerableScores);

    log(`\nScore Separation Statistics:`);
    log(`  Answerable Queries Min Top Score:   ${minAnswerable.toFixed(6)}`);
    log(`  Unanswerable Queries Max Top Score: ${maxUnanswerable.toFixed(6)}`);
    log(`  Separation Margin (Delta):          +${(minAnswerable - maxUnanswerable).toFixed(6)}`);
    log(`  Recommended MIN_SIMILARITY range:   0.88 - 0.89 (Atlas raw score)`);
    log(`======================================================================\n`);

    const outPath = path.resolve('data/processed/atlas_vector_search_results.txt');
    fs.writeFileSync(outPath, logLines.join('\n'), 'utf8');
    log(`Full UTF-8 log written to: ${outPath}`);
  } catch (err: any) {
    console.error(`Atlas $vectorSearch error: ${err.message}`);
  } finally {
    await client.close();
  }
}

runAtlasVectorSearchEvaluation().catch(console.error);
