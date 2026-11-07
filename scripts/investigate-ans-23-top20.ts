import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { MongoClient } from 'mongodb';
import { config } from '../server/src/config/index.js';
import { getEmbeddingProvider, getLLMProvider } from '../server/src/providers/index.js';
import { PromptBuilder } from '../server/src/rag/promptBuilder.js';
import { RetrievedChunk } from '../server/src/rag/types.js';

interface QuestionItem {
  id: string;
  question: string;
  language: 'en' | 'hi';
}

async function searchTopK(collection: any, queryVec: number[], k: number): Promise<RetrievedChunk[]> {
  const pipeline = [
    {
      $vectorSearch: {
        index: config.ATLAS_VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: queryVec,
        numCandidates: Math.max(100, k * 10),
        limit: k,
      },
    },
    {
      $project: {
        _id: 1,
        id: 1,
        schemeName: 1,
        sectionTitle: 1,
        pageNumber: 1,
        text: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];
  const docs = await collection.aggregate(pipeline).toArray();
  return docs.map(d => ({
    id: d.id || String(d._id),
    score: d.score,
    schemeName: d.schemeName,
    sectionTitle: d.sectionTitle,
    pageNumber: d.pageNumber,
    text: d.text,
  }));
}

async function main() {
  const jsonPath = path.resolve('scripts/eval/natural-questions.json');
  const questions: QuestionItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const target = questions.find(q => q.id === 'NAT-ANS-23');
  if (!target) throw new Error(`Missing NAT-ANS-23 in ${jsonPath}`);

  console.log('================================================================================');
  console.log('  ANS-23: TOP 20 ANALYSIS & EFFECT OF TOP-K (8 vs 10)');
  console.log(`  Query: "${target.question}"`);
  console.log('================================================================================\n');

  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.MONGODB_DB_NAME);
  const collection = db.collection(config.MONGODB_COLLECTION_NAME);

  const embeddingProvider = getEmbeddingProvider();
  const llmProvider = getLLMProvider();

  // 1. Direct Hindi Top 20
  console.log('--- 1. DIRECT HINDI QUERY (TOP 20) ---');
  const hindiVec = await embeddingProvider.embedQuery(target.question);
  const hindiTop20 = await searchTopK(collection, hindiVec, 20);

  console.log(`Retrieved ${hindiTop20.length} chunks. Searching for Page 31 "Pottery Activity"...`);
  let hindiFoundRank = -1;
  let hindiFoundChunk: any = null;
  hindiTop20.forEach((c, idx) => {
    const isP31Pottery = c.pageNumber === 31 && c.text.toLowerCase().includes('pottery');
    const marker = isP31Pottery ? ' <=== TARGET CHUNK (Page 31 Pottery Activity)' : '';
    console.log(`  [Rank ${idx + 1}] Score: ${c.score.toFixed(6)} | Page: ${c.pageNumber} | Scheme: ${c.schemeName} | Section: ${c.sectionTitle}${marker}`);
    if (isP31Pottery && hindiFoundRank === -1) {
      hindiFoundRank = idx + 1;
      hindiFoundChunk = c;
    }
  });

  if (hindiFoundChunk) {
    console.log(`\n🎯 Direct Hindi Query: Page 31 Pottery Activity found at RANK ${hindiFoundRank} with score ${hindiFoundChunk.score.toFixed(6)}`);
  } else {
    console.log(`\n❌ Direct Hindi Query: Page 31 Pottery Activity NOT found in Top 20!`);
  }

  // 2. Translated English Top 20
  console.log('\n--- 2. TRANSLATED ENGLISH QUERY (TOP 20) ---');
  const transPrompt = `Translate the following citizen query from Hindi to English for information retrieval from an official government welfare booklet. Output ONLY the plain English translation, with no explanation or punctuation:\n\n${target.question}`;
  const translatedQuery = (await llmProvider.generateResponse(transPrompt, 'You are an accurate translator.')).trim();
  console.log(`Translated Query: "${translatedQuery}"`);

  const enVec = await embeddingProvider.embedQuery(translatedQuery);
  const enTop20 = await searchTopK(collection, enVec, 20);

  let enFoundRank = -1;
  let enFoundChunk: any = null;
  enTop20.forEach((c, idx) => {
    const isP31Pottery = c.pageNumber === 31 && c.text.toLowerCase().includes('pottery');
    const marker = isP31Pottery ? ' <=== TARGET CHUNK (Page 31 Pottery Activity)' : '';
    console.log(`  [Rank ${idx + 1}] Score: ${c.score.toFixed(6)} | Page: ${c.pageNumber} | Scheme: ${c.schemeName} | Section: ${c.sectionTitle}${marker}`);
    if (isP31Pottery && enFoundRank === -1) {
      enFoundRank = idx + 1;
      enFoundChunk = c;
    }
  });

  if (enFoundChunk) {
    console.log(`\n🎯 Translated Query: Page 31 Pottery Activity found at RANK ${enFoundRank} with score ${enFoundChunk.score.toFixed(6)}`);
    console.log(`   Text snippet: ${enFoundChunk.text.slice(0, 200).replace(/\n/g, ' ')}...`);
  } else {
    console.log(`\n❌ Translated Query: Page 31 Pottery Activity NOT found in Top 20!`);
  }

  // 3. Test Top-K = 8
  console.log('\n================================================================================');
  console.log('  EFFECT OF TOP-K = 8 (Using Translated Query)');
  console.log('================================================================================');
  const start8 = Date.now();
  const chunks8 = enTop20.slice(0, 8);
  const prompt8 = PromptBuilder.buildUserPrompt(target.question, chunks8);
  const sys8 = PromptBuilder.buildSystemInstruction('hi');
  const rawLlm8 = await llmProvider.generateResponse(prompt8, sys8);
  const latency8 = Date.now() - start8;
  console.log(`Top-K 8 Latency: ${latency8} ms`);
  console.log(`Raw LLM JSON (Top-K 8):\n${rawLlm8}`);

  // 4. Test Top-K = 10
  console.log('\n================================================================================');
  console.log('  EFFECT OF TOP-K = 10 (Using Translated Query)');
  console.log('================================================================================');
  const start10 = Date.now();
  const chunks10 = enTop20.slice(0, 10);
  const prompt10 = PromptBuilder.buildUserPrompt(target.question, chunks10);
  const sys10 = PromptBuilder.buildSystemInstruction('hi');
  const rawLlm10 = await llmProvider.generateResponse(prompt10, sys10);
  const latency10 = Date.now() - start10;
  console.log(`Top-K 10 Latency: ${latency10} ms`);
  console.log(`Raw LLM JSON (Top-K 10):\n${rawLlm10}`);

  await client.close();
  process.exit(0);
}

main().catch(console.error);
