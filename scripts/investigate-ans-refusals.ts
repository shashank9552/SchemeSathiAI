import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { VectorRetriever } from '../server/src/rag/retriever.js';
import { getLLMProvider } from '../server/src/providers/index.js';
import { PromptBuilder } from '../server/src/rag/promptBuilder.js';

interface QuestionItem {
  id: string;
  category: 'answerable' | 'unanswerable';
  language: 'en' | 'hi';
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
}

const targetIds = ['NAT-ANS-14', 'NAT-ANS-15', 'NAT-ANS-19', 'NAT-ANS-22', 'NAT-ANS-23'];

async function main() {
  const questionsPath = path.resolve(process.cwd(), 'scripts/eval/natural-questions.json');
  if (!fs.existsSync(questionsPath)) {
    throw new Error(`natural-questions.json not found at ${questionsPath}`);
  }
  const questions: QuestionItem[] = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const targets: QuestionItem[] = targetIds.map((id) => {
    const q = questions.find((item) => item.id === id);
    if (!q) {
      throw new Error(`CRITICAL: Target ID '${id}' is missing from ${questionsPath}`);
    }
    return q;
  });

  const retriever = new VectorRetriever();
  const llmProvider = getLLMProvider();

  for (const item of targets) {
    console.log(`\n======================================================================`);
    console.log(`ID: ${item.id}`);
    console.log(`Question: "${item.question}"`);
    console.log(`Language: ${item.language}`);
    console.log(`Expected Page: ${item.expectedPage}`);
    console.log(`Expected Phrase: "${item.expectedPhrase}"`);

    const retResult = await retriever.retrieveWithTiming(item.question, 5);
    const chunks = retResult.chunks;
    const topScore = chunks.length > 0 ? chunks[0].score : 0;
    console.log(`Top Score: ${topScore}`);

    // Check if any retrieved chunk contains expectedPhrase
    let containsPhrase = false;
    let matchingChunkIndex = -1;
    chunks.forEach((c, idx) => {
      if (item.expectedPhrase && c.text.toLowerCase().includes(item.expectedPhrase.toLowerCase())) {
        containsPhrase = true;
        matchingChunkIndex = idx;
      }
    });

    console.log(`Contains Expected Phrase: ${containsPhrase ? `YES (in chunk ${matchingChunkIndex + 1})` : 'NO'}`);
    console.log('\n--- TOP 5 CHUNKS ---');
    chunks.forEach((c, idx) => {
      console.log(`  [Chunk ${idx + 1}] Score: ${c.score} | Page: ${c.pageNumber} | Scheme: ${c.schemeName} | Section: ${c.sectionTitle}`);
      console.log(`     Text snippet: ${c.text.replace(/\s+/g, ' ').slice(0, 140)}...`);
    });

    const prompt = PromptBuilder.buildUserPrompt(item.question, chunks);
    const systemInstruction = PromptBuilder.buildSystemInstruction(item.language);

    console.log('\n--- RAW LLM JSON ---');
    try {
      const rawLlm = await llmProvider.generateResponse(prompt, systemInstruction);
      console.log(rawLlm);
    } catch (err: any) {
      console.error(`LLM error: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  process.exit(0);
}

main().catch(console.error);
