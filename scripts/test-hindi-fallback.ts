import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey });
const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
const llmModel = process.env.GEMINI_LLM_MODEL || 'gemini-3.1-flash-lite';
const MIN_SIMILARITY = 0.86;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function atlasScore(cosine: number): number {
  return (1 + cosine) / 2;
}

interface StoredChunk {
  schemeName: string;
  sectionTitle: string;
  pageNumber: number;
  text: string;
  embedding: number[];
}

interface QuestionItem {
  id: string;
  category: string;
  language: 'en' | 'hi';
  question: string;
}

const targetIds = [
  'NAT-ANS-20',
  'NAT-ANS-21',
  'NAT-ANS-22',
  'NAT-ANS-23',
  'NAT-ANS-24',
  'NAT-ANS-25',
];

async function embed(text: string): Promise<number[]> {
  const res = await ai.models.embedContent({
    model: embeddingModel,
    contents: text,
    config: { outputDimensionality: 768 },
  });
  return res.embeddings?.[0]?.values || (res as any).embedding?.values || [];
}

async function translate(text: string): Promise<string> {
  const prompt = `Translate the following citizen query from Hindi to English for information retrieval from an official government welfare booklet. Output ONLY the plain English translation, with no explanation or punctuation:\n\n${text}`;
  const res = await ai.models.generateContent({
    model: llmModel,
    contents: prompt,
  });
  return res.text?.trim() || '';
}

function vectorSearch(queryVec: number[], chunks: StoredChunk[], topK = 5) {
  const scored = chunks.map((c, idx) => {
    const cos = cosineSimilarity(queryVec, c.embedding);
    return {
      chunkIndex: idx,
      schemeName: c.schemeName,
      sectionTitle: c.sectionTitle,
      pageNumber: c.pageNumber,
      text: c.text,
      score: atlasScore(cos),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

async function main() {
  const jsonPath = path.resolve(process.cwd(), 'scripts/eval/natural-questions.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`natural-questions.json not found at ${jsonPath}`);
  }
  const allQuestions: QuestionItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const hindiQuestions = targetIds.map((id) => {
    const q = allQuestions.find((item) => item.id === id);
    if (!q) {
      throw new Error(`CRITICAL: Question ID '${id}' missing from ${jsonPath}`);
    }
    return { id: q.id, q: q.question };
  });

  console.log('========================================================================================================');
  console.log('  HINDI TRANSLATION FALLBACK EVALUATION (6 Hindi Answerable Questions from JSON)');
  console.log(`  Source: ${jsonPath}`);
  console.log(`  Threshold: MIN_SIMILARITY = ${MIN_SIMILARITY} | Fallback Active: YES`);
  console.log('========================================================================================================\n');

  const chunksPath = path.resolve('data/processed/refined_chunks_190.json');
  const chunks: StoredChunk[] = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));

  const results: any[] = [];

  for (const item of hindiQuestions) {
    console.log(`--------------------------------------------------------------------------------------------------------`);
    console.log(`[${item.id}] Query: "${item.q}"`);

    const totalStart = Date.now();

    // 1. Embed raw Hindi query
    const embedStart = Date.now();
    const hindiVec = await embed(item.q);
    const hindiEmbedMs = Date.now() - embedStart;

    // 2. Vector search raw Hindi query
    const searchStart = Date.now();
    const hindiResults = vectorSearch(hindiVec, chunks, 5);
    const hindiSearchMs = Date.now() - searchStart;
    const initialTopScore = hindiResults[0]?.score || 0;

    console.log(`   Initial Hindi Top Score: ${initialTopScore.toFixed(6)} (Embed: ${hindiEmbedMs}ms, Search: ${hindiSearchMs}ms)`);

    let translatedQuery = '';
    let transMs = 0;
    let fallbackEmbedMs = 0;
    let fallbackSearchMs = 0;
    let finalTopScore = initialTopScore;
    let fallbackTriggered = false;
    let finalSource = 'hindi_direct';

    // 3. Fallback logic: ONLY if initialTopScore < MIN_SIMILARITY
    if (initialTopScore < MIN_SIMILARITY) {
      fallbackTriggered = true;
      console.log(`   -> Score < ${MIN_SIMILARITY}: TRIGGERING ENGLISH TRANSLATION FALLBACK...`);

      const tStart = Date.now();
      translatedQuery = await translate(item.q);
      transMs = Date.now() - tStart;
      console.log(`   -> Translated Query: "${translatedQuery}" (Translation: ${transMs}ms)`);

      const feStart = Date.now();
      const enVec = await embed(translatedQuery);
      fallbackEmbedMs = Date.now() - feStart;

      const fsStart = Date.now();
      const enResults = vectorSearch(enVec, chunks, 5);
      fallbackSearchMs = Date.now() - fsStart;
      const fallbackTopScore = enResults[0]?.score || 0;

      console.log(`   -> English Fallback Top Score: ${fallbackTopScore.toFixed(6)} (Embed: ${fallbackEmbedMs}ms, Search: ${fallbackSearchMs}ms)`);

      if (fallbackTopScore > initialTopScore) {
        finalTopScore = fallbackTopScore;
        finalSource = 'english_fallback_used';
      } else {
        finalSource = 'hindi_kept (fallback lower)';
      }
    } else {
      console.log(`   -> Score >= ${MIN_SIMILARITY}: Passed Gate 1 directly. Translation fallback NOT triggered.`);
    }

    const totalTurnMs = Date.now() - totalStart;
    console.log(`   Final Top Score: ${finalTopScore.toFixed(6)} | Decision: ${finalTopScore >= MIN_SIMILARITY ? 'PASS' : 'BELOW_THRESHOLD'} | Total Turn: ${totalTurnMs}ms`);

    results.push({
      id: item.id,
      initialScore: initialTopScore,
      fallbackTriggered,
      translatedQuery,
      finalTopScore,
      finalSource,
      passedGate1: finalTopScore >= MIN_SIMILARITY,
      latencies: {
        hindiEmbedMs,
        hindiSearchMs,
        transMs,
        fallbackEmbedMs,
        fallbackSearchMs,
        totalTurnMs,
      },
    });

    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\n========================================================================================================================`);
  console.log(`  HINDI FALLBACK SUMMARY TABLE`);
  console.log(`========================================================================================================================`);
  console.log(`ID         | Initial Score | Triggered | Translated Query (snippet)        | Fallback Score | Final Score | Total Turn (ms)`);
  console.log(`-----------|---------------|-----------|-----------------------------------|----------------|-------------|----------------`);
  for (const r of results) {
    const trigStr = r.fallbackTriggered ? 'YES      ' : 'NO (pass)';
    const snippet = (r.translatedQuery || 'N/A (already passed)').substring(0, 33).padEnd(33);
    const fbScoreStr = r.fallbackTriggered ? r.finalTopScore.toFixed(6) : 'N/A     ';
    console.log(`${r.id.padEnd(10)} | ${r.initialScore.toFixed(6)}      | ${trigStr} | ${snippet} | ${fbScoreStr}       | ${r.finalTopScore.toFixed(6)}    | ${r.latencies.totalTurnMs}`);
  }

  process.exit(0);
}

main().catch(console.error);
