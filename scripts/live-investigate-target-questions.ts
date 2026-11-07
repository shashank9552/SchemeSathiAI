import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';
import { getChunksCollection, closeDatabaseConnection } from '../server/src/db/index.js';
import { getEmbeddingProvider, getLLMProvider } from '../server/src/providers/index.js';
import { PromptBuilder } from '../server/src/rag/promptBuilder.js';
import { RetrievedChunk } from '../server/src/rag/types.js';

interface QuestionItem {
  id: string;
  category: 'answerable' | 'unanswerable';
  language: 'en' | 'hi';
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
}

const targetIds = [
  'NAT-UNANS-01',
  'NAT-ANS-14',
  'NAT-ANS-15',
  'NAT-ANS-19',
  'NAT-ANS-22',
  'NAT-ANS-23',
];

async function main() {
  const jsonPath = path.resolve(process.cwd(), 'scripts/eval/natural-questions.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`natural-questions.json not found at ${jsonPath}`);
  }
  const allQuestions: QuestionItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Load questions strictly from JSON and fail if any target ID is missing
  const targetQuestions: QuestionItem[] = targetIds.map((id) => {
    const q = allQuestions.find((item) => item.id === id);
    if (!q) {
      throw new Error(`CRITICAL: Question ID '${id}' is missing from ${jsonPath}`);
    }
    return q;
  });

  console.log('================================================================================');
  console.log('  LIVE ATLAS & GEMINI TARGET INVESTIGATION (STRICT JSON SOURCE)');
  console.log(`  Source File: ${jsonPath}`);
  console.log(`  Target Question Count: ${targetQuestions.length}`);
  console.log('================================================================================\n');

  const collection = await getChunksCollection();
  const embeddingProvider = getEmbeddingProvider();
  const llmProvider = getLLMProvider();

  for (const item of targetQuestions) {
    console.log('--------------------------------------------------------------------------------');
    console.log(`[TARGET QUESTION] ID: ${item.id} | Language: ${item.language} | Category: ${item.category}`);
    console.log(`Query: "${item.question}"`);
    if (item.expectedPage) console.log(`Expected Page: ${item.expectedPage}`);
    if (item.expectedPhrase) console.log(`Expected Phrase: "${item.expectedPhrase}"`);
    console.log('--------------------------------------------------------------------------------');

    const startTotal = Date.now();

    // 1. Live Gemini Embedding
    const embedStart = Date.now();
    const queryVector = await embeddingProvider.generateEmbedding(item.question);
    const embedMs = Date.now() - embedStart;

    // 2. Live Atlas Vector Search ($vectorSearch aggregation)
    const searchStart = Date.now();
    const pipeline = [
      {
        $vectorSearch: {
          index: config.ATLAS_VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector: queryVector,
          numCandidates: config.NUM_CANDIDATES,
          limit: 5,
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

    const results = await collection.aggregate(pipeline).toArray();
    const searchMs = Date.now() - searchStart;

    console.log(`Embedding Latency: ${embedMs} ms | Atlas Search Latency: ${searchMs} ms`);
    console.log(`Top Score: ${results[0]?.score ?? 0}`);
    console.log('\n--- REAL TOP 5 CHUNKS FROM ATLAS ---');

    const chunksForPrompt: RetrievedChunk[] = [];

    results.forEach((r, idx) => {
      console.log(`\n[Rank ${idx + 1}]`);
      console.log(`  _id: ${r._id}`);
      console.log(`  chunkId: ${r.id}`);
      console.log(`  pageNumber: ${r.pageNumber}`);
      console.log(`  schemeName: ${r.schemeName}`);
      console.log(`  sectionTitle: ${r.sectionTitle}`);
      console.log(`  15-Digit Atlas Score: ${r.score}`);
      console.log(`  Full Stored Text:\n${r.text}`);

      chunksForPrompt.push({
        id: r.id || String(r._id),
        score: r.score,
        schemeName: r.schemeName,
        sectionTitle: r.sectionTitle,
        pageNumber: r.pageNumber,
        text: r.text,
      });
    });

    // 3. Live LLM Groundedness Generation
    const prompt = PromptBuilder.buildUserPrompt(item.question, chunksForPrompt);
    const systemInstruction = PromptBuilder.buildSystemInstruction(item.language);

    console.log('\n--- LIVE GEMINI LLM RESPONSE (RAW JSON) ---');
    try {
      const llmStart = Date.now();
      const rawLlm = await llmProvider.generateResponse(prompt, systemInstruction);
      const llmMs = Date.now() - llmStart;
      console.log(`LLM Generation Latency: ${llmMs} ms`);
      console.log(rawLlm);
    } catch (err: any) {
      console.error(`LLM Generation Error: ${err.message}`);
    }

    const totalMs = Date.now() - startTotal;
    console.log(`\nTotal Elapsed Time: ${totalMs} ms\n`);

    // Spacing between questions
    await new Promise((r) => setTimeout(r, 800));
  }

  await closeDatabaseConnection();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal Error:', err);
  await closeDatabaseConnection();
  process.exit(1);
});
