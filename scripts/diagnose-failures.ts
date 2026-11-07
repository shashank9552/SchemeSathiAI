import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';
import { VectorRetriever } from '../server/src/rag/retriever.js';
import { getLLMProvider } from '../server/src/providers/index.js';
import { PromptBuilder } from '../server/src/rag/promptBuilder.js';
import { FaithfulnessGuard } from '../server/src/rag/faithfulnessGuard.js';

const questions = [
  { id: '(a)', q: 'I am 22 and want to start my own small business. Which scheme can help?' },
  { id: '(b)', q: 'I am 22 years old and want to start a small manufacturing business. What financial help is available?' },
  { id: '(c)', q: 'How can a young person get a loan to start a business?' }
];

async function runDiagnosis() {
  const retriever = new VectorRetriever();
  const llmProvider = getLLMProvider();

  for (const item of questions) {
    console.log(`\n======================================================================`);
    console.log(`QUESTION ${item.id}: "${item.q}"`);
    console.log(`======================================================================`);

    const retResult = await retriever.retrieveWithTiming(item.q, 5);
    const chunks = retResult.chunks;
    const topScore = chunks.length > 0 ? chunks[0].score : 0;

    console.log(`TOP SCORE: ${topScore}`);
    console.log(`THRESHOLD (MIN_SIMILARITY): ${config.MIN_SIMILARITY}`);

    console.log(`\n--- TOP 5 RETRIEVED CHUNKS ---`);
    chunks.slice(0, 5).forEach((c, idx) => {
      console.log(`[Chunk ${idx + 1}] ID: ${c.id} | Score: ${c.score.toFixed(6)} | Scheme: ${c.schemeName} | Page: ${c.pageNumber} | Section: ${c.sectionTitle}`);
      console.log(`Text: ${c.text.replace(/\s+/g, ' ').substring(0, 300)}...`);
    });

    let refusedGate = 'none';
    if (chunks.length === 0 || topScore < config.MIN_SIMILARITY) {
      refusedGate = 'below_threshold (Gate 1 Vector)';
    }

    const lang = 'en';
    const systemInstruction = PromptBuilder.buildSystemInstruction(lang);
    const prompt = PromptBuilder.buildUserPrompt(item.q, chunks);

    let rawLlmOutput = '';
    try {
      rawLlmOutput = await llmProvider.generateResponse(prompt, systemInstruction);
    } catch (err: any) {
      rawLlmOutput = `ERROR: ${err.message}`;
    }

    console.log(`\n--- RAW LLM JSON ---`);
    console.log(rawLlmOutput);

    let parsedPayload: any = null;
    try {
      const cleaned = rawLlmOutput
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      parsedPayload = JSON.parse(cleaned);
    } catch {}

    if (refusedGate === 'none') {
      if (!parsedPayload || !parsedPayload.answerable) {
        refusedGate = 'llm_not_answerable (Gate 2 LLM)';
      }
    }

    let faithfulnessResult: any = null;
    if (parsedPayload?.answer) {
      const validChunkMap = new Map(chunks.map((c) => [c.id, c]));
      const rawUsedIds = Array.isArray(parsedPayload.usedChunkIds) ? parsedPayload.usedChunkIds : [];
      const validatedIds = rawUsedIds.filter((id: string) => validChunkMap.has(id));
      const finalChunkIds = validatedIds.length > 0 ? validatedIds : [chunks[0]?.id].filter(Boolean);
      const usedChunks = finalChunkIds.map((id: string) => validChunkMap.get(id)!).filter(Boolean);
      
      faithfulnessResult = FaithfulnessGuard.verifyFaithfulness(
        parsedPayload.answer,
        usedChunks.map((c) => c.text)
      );

      if (refusedGate === 'none' && !faithfulnessResult.faithful) {
        refusedGate = 'ungrounded_number (FaithfulnessGuard)';
      }
    }

    console.log(`\n--- FAITHFULNESS GUARD ---`);
    if (faithfulnessResult) {
      console.log(`Faithful: ${faithfulnessResult.faithful}`);
      console.log(`Ungrounded numbers: [${faithfulnessResult.ungroundedNumbers.join(', ')}]`);
    } else {
      console.log(`FaithfulnessGuard not run (no answer payload)`);
    }

    console.log(`\n--- REFUSAL SUMMARY ---`);
    console.log(`WHICH GATE OR GUARD REFUSED IT: ${refusedGate}`);
  }

  process.exit(0);
}

runDiagnosis().catch((err) => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
