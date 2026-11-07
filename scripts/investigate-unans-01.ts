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

async function main() {
  const jsonPath = path.resolve(process.cwd(), 'scripts/eval/natural-questions.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`natural-questions.json not found at ${jsonPath}`);
  }
  const allQuestions: QuestionItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const target = allQuestions.find((q) => q.id === 'NAT-UNANS-01');

  if (!target) {
    throw new Error(`CRITICAL: Question ID 'NAT-UNANS-01' missing from ${jsonPath}`);
  }

  const query = target.question;
  const lang = target.language || 'en';

  console.log(`[Loaded from ${jsonPath}]`);
  console.log(`ID: ${target.id} | Language: ${lang}`);
  console.log(`Query: "${query}"\n`);

  const retriever = new VectorRetriever();
  const llmProvider = getLLMProvider();

  const retResult = await retriever.retrieveWithTiming(query, 5);
  console.log(`Top Score: ${retResult.chunks[0]?.score}`);
  console.log('\n--- RETRIEVED CHUNKS ---');
  retResult.chunks.forEach((c, idx) => {
    console.log(`\n[Chunk ${idx + 1}] ID: ${c.id} | Score: ${c.score} | Scheme: ${c.schemeName} | Page: ${c.pageNumber} | Section: ${c.sectionTitle}`);
    console.log(`Full Text:\n${c.text}`);
  });

  const prompt = PromptBuilder.buildUserPrompt(query, retResult.chunks);
  const systemInstruction = PromptBuilder.buildSystemInstruction(lang);
  const rawLlm = await llmProvider.generateResponse(prompt, systemInstruction);
  console.log('\n--- RAW LLM JSON ---');
  console.log(rawLlm);

  process.exit(0);
}

main().catch(console.error);
