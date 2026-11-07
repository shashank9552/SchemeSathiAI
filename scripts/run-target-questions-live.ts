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
  category: string;
  language: 'en' | 'hi';
  question: string;
}

const targetIds = ['NAT-UNANS-01', 'NAT-ANS-14', 'NAT-ANS-15'];

async function main() {
  const jsonPath = path.resolve('scripts/eval/natural-questions.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`File not found: ${jsonPath}`);
  }
  const questions: QuestionItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const targets = targetIds.map(id => {
    const q = questions.find(item => item.id === id);
    if (!q) throw new Error(`Missing question ID '${id}' in ${jsonPath}`);
    return q;
  });

  const retriever = new VectorRetriever();
  const llmProvider = getLLMProvider();

  console.log('================================================================================');
  console.log('  LIVE EXECUTION FOR TARGET QUESTIONS (NAT-UNANS-01, NAT-ANS-14, NAT-ANS-15)');
  console.log(`  Loaded from: ${jsonPath}`);
  console.log('================================================================================\n');

  for (const item of targets) {
    console.log('--------------------------------------------------------------------------------');
    console.log(`ID: ${item.id} | Category: ${item.category} | Language: ${item.language}`);
    console.log(`Question: "${item.question}"`);
    console.log('--------------------------------------------------------------------------------');

    const retResult = await retriever.retrieveWithTiming(item.question, 5);
    const chunks = retResult.chunks;
    const topScore = chunks[0]?.score ?? 0;
    console.log(`Top Score: ${topScore} (Embed: ${retResult.embedMs}ms, Search: ${retResult.searchMs}ms)`);

    console.log('\n--- TOP 5 RETRIEVED CHUNKS ---');
    chunks.forEach((c, idx) => {
      console.log(`[Chunk ${idx + 1}] ID: ${c.id} | Score: ${c.score} | Page: ${c.pageNumber} | Scheme: ${c.schemeName} | Section: ${c.sectionTitle}`);
      console.log(`Text: ${c.text.replace(/\s+/g, ' ').slice(0, 160)}...`);
    });

    const prompt = PromptBuilder.buildUserPrompt(item.question, chunks);
    const systemInstruction = PromptBuilder.buildSystemInstruction(item.language);

    console.log('\n--- RAW LLM JSON ---');
    const startLlm = Date.now();
    const rawLlm = await llmProvider.generateResponse(prompt, systemInstruction);
    const llmMs = Date.now() - startLlm;
    console.log(`(Generated in ${llmMs} ms)`);
    console.log(rawLlm);
    console.log('\n');

    await new Promise(r => setTimeout(r, 1000));
  }

  process.exit(0);
}

main().catch(console.error);
