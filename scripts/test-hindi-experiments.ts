import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';
import { VectorRetriever } from '../server/src/rag/retriever.js';
import { getLLMProvider } from '../server/src/providers/index.js';
import { getChunksCollection } from '../server/src/db/index.js';

interface QuestionItem {
  id: string;
  category: 'answerable' | 'unanswerable';
  language: 'en' | 'hi';
  question: string;
}

async function main() {
  const evalResults = JSON.parse(fs.readFileSync('data/processed/natural_questions_eval_results.json', 'utf8'));

  // 1. Mean Top Score for English vs Hindi Answerable Questions
  const enAns = evalResults.filter((x: any) => x.category === 'answerable' && x.language === 'en');
  const hiAns = evalResults.filter((x: any) => x.category === 'answerable' && x.language === 'hi');

  const meanEn = enAns.reduce((acc: number, x: any) => acc + x.topScore, 0) / enAns.length;
  const meanHi = hiAns.reduce((acc: number, x: any) => acc + x.topScore, 0) / hiAns.length;

  console.log(`======================================================================`);
  console.log(`  Mean Top Score Analysis (Answerable Questions)`);
  console.log(`======================================================================`);
  console.log(`English Answerable (N=${enAns.length}): Mean Top Score = ${meanEn.toFixed(6)}`);
  console.log(`Hindi Answerable   (N=${hiAns.length}):  Mean Top Score = ${meanHi.toFixed(6)}`);
  console.log(`Score Disparity (English - Hindi) = ${(meanEn - meanHi).toFixed(6)} (+${((meanEn - meanHi)*100).toFixed(2)}% higher for English)`);

  // Detailed scores for Hindi Answerable Questions
  console.log(`\nIndividual Hindi Answerable Scores:`);
  hiAns.forEach((h: any) => {
    console.log(`- [${h.id}] Score: ${h.topScore.toFixed(6)} | Q: "${h.question}"`);
  });

  // 2. Experiments on Hindi Questions
  console.log(`\n======================================================================`);
  console.log(`  Experiments on Hindi Answerable Questions (NAT-ANS-20 to NAT-ANS-25)`);
  console.log(`  Comparing:`);
  console.log(`  (Baseline) Raw Hindi query (no taskType)`);
  console.log(`  (a) taskType: 'RETRIEVAL_QUERY'`);
  console.log(`  (b) LLM Translation to English before embedding`);
  console.log(`======================================================================\n`);

  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const llmProvider = getLLMProvider();
  const collection = await getChunksCollection();
  const indexName = config.ATLAS_VECTOR_INDEX_NAME || 'vector_index';

  interface ExpRow {
    id: string;
    question: string;
    baseScore: number;
    baseLatencyMs: number;
    taskTypeScore: number;
    taskTypeLatencyMs: number;
    transQuery: string;
    transScore: number;
    transTotalLatencyMs: number;
    transLlmLatencyMs: number;
  }

  const expRows: ExpRow[] = [];

  for (const h of hiAns) {
    console.log(`Testing ${h.id}: "${h.question}"...`);

    // --- (Baseline): Standard embedding (no taskType) ---
    const t0 = Date.now();
    const baseEmbedRes = await ai.models.embedContent({
      model: config.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
      contents: h.question,
      config: { outputDimensionality: 768 },
    });
    const baseVector = baseEmbedRes.embeddings?.[0]?.values || [];
    const baseSearchRes = await collection.aggregate([
      { $vectorSearch: { index: indexName, path: 'embedding', queryVector: baseVector, numCandidates: 100, limit: 1 } },
      { $project: { score: { $meta: 'vectorSearchScore' } } }
    ]).toArray();
    const baseScore = baseSearchRes[0]?.score || 0;
    const baseLatency = Date.now() - t0;

    // --- (a): With taskType: 'RETRIEVAL_QUERY' ---
    const t1 = Date.now();
    const taskEmbedRes = await ai.models.embedContent({
      model: config.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
      contents: h.question,
      config: { outputDimensionality: 768, taskType: 'RETRIEVAL_QUERY' },
    });
    const taskVector = taskEmbedRes.embeddings?.[0]?.values || [];
    const taskSearchRes = await collection.aggregate([
      { $vectorSearch: { index: indexName, path: 'embedding', queryVector: taskVector, numCandidates: 100, limit: 1 } },
      { $project: { score: { $meta: 'vectorSearchScore' } } }
    ]).toArray();
    const taskTypeScore = taskSearchRes[0]?.score || 0;
    const taskTypeLatency = Date.now() - t1;

    // --- (b): LLM Translate to English then embed ---
    const t2 = Date.now();
    const transPrompt = `Translate the following Hindi query into clear, concise English for search retrieval. Output ONLY the English translation without any quotes or explanation.\n\nHindi: "${h.question}"`;
    const transResult = await llmProvider.generateResponse(transPrompt);
    const transLlmLatency = Date.now() - t2;
    const englishQuery = transResult.replace(/^["']|["']$/g, '').trim();

    const t3 = Date.now();
    const transEmbedRes = await ai.models.embedContent({
      model: config.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
      contents: englishQuery,
      config: { outputDimensionality: 768 },
    });
    const transVector = transEmbedRes.embeddings?.[0]?.values || [];
    const transSearchRes = await collection.aggregate([
      { $vectorSearch: { index: indexName, path: 'embedding', queryVector: transVector, numCandidates: 100, limit: 1 } },
      { $project: { score: { $meta: 'vectorSearchScore' } } }
    ]).toArray();
    const transScore = transSearchRes[0]?.score || 0;
    const transTotalLatency = Date.now() - t2;

    expRows.push({
      id: h.id,
      question: h.question,
      baseScore,
      baseLatencyMs: baseLatency,
      taskTypeScore,
      taskTypeLatencyMs: taskTypeLatency,
      transQuery: englishQuery,
      transScore,
      transTotalLatencyMs: transTotalLatency,
      transLlmLatencyMs: transLlmLatency,
    });

    // Small delay between calls
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\n========================================================================================================================`);
  console.log(`  Experiment Results Summary Table`);
  console.log(`========================================================================================================================`);
  console.log(`ID         | Baseline Score | Baseline (ms) | (a) RETRIEVAL_QUERY | (a) (ms) | (b) Translated Query                       | (b) Score | (b) Total (ms)`);
  console.log(`-----------|----------------|---------------|---------------------|----------|--------------------------------------------|-----------|---------------`);
  for (const row of expRows) {
    const qShort = row.transQuery.length > 42 ? row.transQuery.substring(0, 39) + '...' : row.transQuery;
    console.log(
      `${row.id.padEnd(10)} | ${row.baseScore.toFixed(6)}       | ${String(row.baseLatencyMs).padEnd(13)} | ${row.taskTypeScore.toFixed(6)}            | ${String(row.taskTypeLatencyMs).padEnd(8)} | ${qShort.padEnd(42)} | ${row.transScore.toFixed(6)}  | ${String(row.transTotalLatencyMs).padEnd(13)}`
    );
  }

  const avgBaseScore = expRows.reduce((a, b) => a + b.baseScore, 0) / expRows.length;
  const avgBaseLat = expRows.reduce((a, b) => a + b.baseLatencyMs, 0) / expRows.length;
  const avgTaskScore = expRows.reduce((a, b) => a + b.taskTypeScore, 0) / expRows.length;
  const avgTaskLat = expRows.reduce((a, b) => a + b.taskTypeLatencyMs, 0) / expRows.length;
  const avgTransScore = expRows.reduce((a, b) => a + b.transScore, 0) / expRows.length;
  const avgTransLat = expRows.reduce((a, b) => a + b.transTotalLatencyMs, 0) / expRows.length;

  console.log(`-----------|----------------|---------------|---------------------|----------|--------------------------------------------|-----------|---------------`);
  console.log(
    `AVERAGE    | ${avgBaseScore.toFixed(6)}       | ${avgBaseLat.toFixed(0).padEnd(13)} | ${avgTaskScore.toFixed(6)}            | ${avgTaskLat.toFixed(0).padEnd(8)} | (Translation to English)                   | ${avgTransScore.toFixed(6)}  | ${avgTransLat.toFixed(0).padEnd(13)}`
  );

  console.log(`\nKey Findings:`);
  console.log(`1. (a) RETRIEVAL_QUERY effect: Score changed from ${avgBaseScore.toFixed(6)} to ${avgTaskScore.toFixed(6)} (${((avgTaskScore - avgBaseScore) * 100).toFixed(2)}%), latency changed from ${avgBaseLat.toFixed(0)}ms to ${avgTaskLat.toFixed(0)}ms.`);
  console.log(`2. (b) LLM Translation effect: Score changed from ${avgBaseScore.toFixed(6)} to ${avgTransScore.toFixed(6)} (+${((avgTransScore - avgBaseScore) * 100).toFixed(2)}% boost!), but added ~${(avgTransLat - avgBaseLat).toFixed(0)}ms latency due to extra LLM call.`);

  fs.writeFileSync('data/processed/hindi_experiment_results.json', JSON.stringify({ meanEn, meanHi, expRows }, null, 2), 'utf8');
  process.exit(0);
}

main().catch(console.error);
