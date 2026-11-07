import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

process.env.ENABLE_HINDI_TRANSLATION_FALLBACK = 'true';

import { MongoClient } from 'mongodb';

interface QuestionItem {
  id: string;
  category: string;
  language: 'en' | 'hi';
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
}

const targetIds = ['NAT-ANS-20', 'NAT-ANS-23', 'NAT-ANS-25'];

async function main() {
  const jsonPath = path.resolve(process.cwd(), 'scripts/eval/natural-questions.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`natural-questions.json not found at ${jsonPath}`);
  }
  const allQuestions: QuestionItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const targetQuestions: QuestionItem[] = targetIds.map((id) => {
    const q = allQuestions.find((item) => item.id === id);
    if (!q) {
      throw new Error(`CRITICAL: Question ID '${id}' missing from ${jsonPath}`);
    }
    return q;
  });

  const { config } = await import('../server/src/config/index.js');
  (config as any).ENABLE_HINDI_TRANSLATION_FALLBACK = true;

  const { ChatService } = await import('../server/src/rag/chatService.js');
  const { VectorRetriever } = await import('../server/src/rag/retriever.js');

  console.log('================================================================================');
  console.log('  LIVE ATLAS END-TO-END RUN FOR ANS-20, 23, 25 (STRICT JSON SOURCE)');
  console.log(`  Source File: ${jsonPath}`);
  console.log(`  ENABLE_HINDI_TRANSLATION_FALLBACK: ${config.ENABLE_HINDI_TRANSLATION_FALLBACK}`);
  console.log(`  MIN_SIMILARITY: ${config.MIN_SIMILARITY}`);
  console.log('================================================================================\n');

  // Verify MongoDB connection
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.MONGODB_DB_NAME);
  const col = db.collection(config.MONGODB_COLLECTION_NAME);
  const count = await col.countDocuments();
  console.log(`Connected to MongoDB Atlas: ${col.namespace} (${count} documents)\n`);

  const retriever = new VectorRetriever();
  const chatService = new ChatService(retriever);

  for (const item of targetQuestions) {
    console.log('================================================================================');
    console.log(`Question ID: ${item.id}`);
    console.log(`Hindi Query: "${item.question}"`);
    if (item.expectedScheme) console.log(`Expected Scheme: ${item.expectedScheme}`);
    console.log('--------------------------------------------------------------------------------');

    const startTime = Date.now();
    const result = await chatService.processMessage(item.question, 'hi');
    const totalMs = Date.now() - startTime;

    console.log(`\nDecision: ${result.answerable ? 'ANSWERABLE (PASSED BOTH GATES)' : 'REFUSED'}`);
    console.log(`Reason: ${result.reason || (result.answerable ? 'grounded_answer' : 'unknown')}`);
    console.log(`Top Score: ${result.topScore}`);
    console.log(`Total Latency: ${result.latencyMs} ms (Measured: ${totalMs} ms)`);
    if (result.timings) {
      console.log(`Timings: lang=${result.timings.langDetectMs}ms, embed=${result.timings.embedMs}ms, search=${result.timings.vectorSearchMs}ms, trans=${result.timings.translationMs || 0}ms, llm=${result.timings.llmMs || 0}ms`);
    }

    // Direct retrieve vs fallback retrieve details
    console.log('\n--- RETRIEVAL DETAILS ---');
    const directRet = await retriever.retrieveWithTiming(item.question, 5);
    console.log(`Direct Hindi Top Score: ${directRet.chunks[0]?.score}`);
    let finalChunks = directRet.chunks;
    if (directRet.chunks[0]?.score < config.MIN_SIMILARITY) {
      const transPrompt = `Translate the following citizen query from Hindi to English for information retrieval from an official government welfare booklet. Output ONLY the plain English translation, with no explanation or punctuation:\n\n${item.question}`;
      const translated = await (chatService as any).llmProvider.generateResponse(transPrompt, 'You are an accurate translator.');
      console.log(`Translated Query: "${translated.trim()}"`);
      const fallbackRet = await retriever.retrieveWithTiming(translated.trim(), 5);
      console.log(`Fallback English Top Score: ${fallbackRet.chunks[0]?.score}`);
      if (fallbackRet.chunks[0]?.score > directRet.chunks[0]?.score) {
        finalChunks = fallbackRet.chunks;
      }
    }

    console.log('\n--- TOP 5 RETRIEVED CHUNKS USED ---');
    finalChunks.forEach((c: any, idx: number) => {
      console.log(`  [Chunk ${idx + 1}] Score: ${c.score} | Page: ${c.pageNumber} | Scheme: ${c.schemeName} | Section: ${c.sectionTitle}`);
      console.log(`     Text snippet: ${c.text.replace(/\s+/g, ' ').slice(0, 150)}...`);
    });

    console.log('\n--- FINAL SYNTHESIZED ANSWER ---');
    console.log(result.answer);

    console.log('\n--- CITATIONS ---');
    if (result.citations && result.citations.length > 0) {
      result.citations.forEach((cit: any, cIdx: number) => {
        console.log(`  [Citation ${cIdx + 1}] Scheme: ${cit.schemeName} | Section: ${cit.sectionTitle} | Page: ${cit.pageNumber}`);
        console.log(`     Snippet: ${cit.snippet}`);
      });
    } else {
      console.log('  (No citations returned)');
    }
    console.log('\n');

    await new Promise((r) => setTimeout(r, 1000));
  }

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error running test:', err);
  process.exit(1);
});
