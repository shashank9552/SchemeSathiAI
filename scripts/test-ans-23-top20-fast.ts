import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { MongoClient } from 'mongodb';
import { config } from '../server/src/config/index.js';
import { getEmbeddingProvider, getLLMProvider } from '../server/src/providers/index.js';
import { PromptBuilder } from '../server/src/rag/promptBuilder.js';

async function searchTopK(collection: any, queryVec: number[], k: number) {
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
  return collection.aggregate(pipeline).toArray();
}

async function main() {
  const jsonPath = path.resolve('scripts/eval/natural-questions.json');
  const questions = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const target = questions.find((q: any) => q.id === 'NAT-ANS-23');
  if (!target) throw new Error(`Missing NAT-ANS-23 in ${jsonPath}`);

  const hindiQuery = target.question;
  const translatedQuery = "How do traditional potters get government assistance for electric wheels to make clay pots and lamps";

  console.log('Connecting to Atlas...');
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.MONGODB_DB_NAME);
  const collection = db.collection(config.MONGODB_COLLECTION_NAME);

  const embeddingProvider = getEmbeddingProvider();
  const llmProvider = getLLMProvider();

  // 1. Direct Hindi Query Top 20
  console.log('\n================================================================================');
  console.log('1. DIRECT HINDI QUERY (TOP 20)');
  console.log(`Query: "${hindiQuery}"`);
  console.log('================================================================================');
  const startHindi = Date.now();
  const hindiVec = await embeddingProvider.embedQuery(hindiQuery);
  const hindiTop20 = await searchTopK(collection, hindiVec, 20);
  const hindiMs = Date.now() - startHindi;

  let hindiFoundRank = -1;
  let hindiFoundChunk: any = null;
  hindiTop20.forEach((c: any, idx: number) => {
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

  // 2. Translated Query Top 20
  console.log('\n================================================================================');
  console.log('2. TRANSLATED ENGLISH QUERY (TOP 20)');
  console.log(`Query: "${translatedQuery}"`);
  console.log('================================================================================');
  const startEn = Date.now();
  const enVec = await embeddingProvider.embedQuery(translatedQuery);
  const enTop20 = await searchTopK(collection, enVec, 20);
  const enMs = Date.now() - startEn;

  let enFoundRank = -1;
  let enFoundChunk: any = null;
  enTop20.forEach((c: any, idx: number) => {
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
    console.log(`   Text snippet: ${enFoundChunk.text.slice(0, 220).replace(/\n/g, ' ')}...`);
  } else {
    console.log(`\n❌ Translated Query: Page 31 Pottery Activity NOT found in Top 20!`);
  }

  // 3. Effect of Top-K = 8
  console.log('\n================================================================================');
  console.log('3. EFFECT OF TOP-K = 8 (Translated Query Chunks)');
  console.log('================================================================================');
  const chunks8 = enTop20.slice(0, 8);
  const p8 = PromptBuilder.buildUserPrompt(hindiQuery, chunks8);
  const sys8 = PromptBuilder.buildSystemInstruction('hi');
  const t8Start = Date.now();
  let rawLlm8 = '';
  try {
    rawLlm8 = await llmProvider.generateResponse(p8, sys8);
  } catch (e: any) {
    rawLlm8 = `Error: ${e.message}`;
  }
  const latency8 = Date.now() - t8Start;
  console.log(`Top-K 8 LLM Latency: ${latency8} ms`);
  console.log(`Raw LLM JSON (Top-K 8):\n${rawLlm8}`);

  // 4. Effect of Top-K = 10
  console.log('\n================================================================================');
  console.log('4. EFFECT OF TOP-K = 10 (Translated Query Chunks)');
  console.log('================================================================================');
  const chunks10 = enTop20.slice(0, 10);
  const p10 = PromptBuilder.buildUserPrompt(hindiQuery, chunks10);
  const sys10 = PromptBuilder.buildSystemInstruction('hi');
  const t10Start = Date.now();
  let rawLlm10 = '';
  try {
    rawLlm10 = await llmProvider.generateResponse(p10, sys10);
  } catch (e: any) {
    rawLlm10 = `Error: ${e.message}`;
  }
  const latency10 = Date.now() - t10Start;
  console.log(`Top-K 10 LLM Latency: ${latency10} ms`);
  console.log(`Raw LLM JSON (Top-K 10):\n${rawLlm10}`);

  await client.close();
  process.exit(0);
}

main().catch(console.error);
