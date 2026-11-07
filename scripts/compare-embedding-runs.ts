import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { getChunksCollection, closeDatabaseConnection } from '../server/src/db/index.js';
import { config } from '../server/src/config/index.js';

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey });
const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const testQueries = [
  { id: 'NAT-ANS-22', q: 'अगर कोई खरीदार कंपनी 45 दिनों में छोटे व्यापारी का बकाया भुगतान नहीं करती है तो कहां शिकायत दर्ज करें?' },
  { id: 'NAT-ANS-24', q: 'क्या अनुसूचित जाति और जनजाति के नए उद्यमियों के लिए सरकार की तरफ से कोई विशेष सहयोग और प्रशिक्षण केंद्र है?' },
];

async function main() {
  console.log('======================================================================');
  console.log('  INVESTIGATION: REPEAT EMBEDDING & ATLAS vs LOCAL SCORE DISCREPANCY');
  console.log('======================================================================\n');

  const collection = await getChunksCollection();
  const localChunks: any[] = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

  for (const item of testQueries) {
    console.log(`----------------------------------------------------------------------`);
    console.log(`[${item.id}] Query: "${item.q}"`);

    // 1. Embed Run 1
    const res1 = await ai.models.embedContent({
      model,
      contents: item.q,
      config: { outputDimensionality: 768 },
    });
    const vec1: number[] = res1.embeddings?.[0]?.values || (res1 as any).embedding?.values || [];

    // 2. Embed Run 2 (exact same query, called again)
    const res2 = await ai.models.embedContent({
      model,
      contents: item.q,
      config: { outputDimensionality: 768 },
    });
    const vec2: number[] = res2.embeddings?.[0]?.values || (res2 as any).embedding?.values || [];

    // Check embedding stability
    const cosBetweenRuns = cosineSimilarity(vec1, vec2);
    console.log(`\n1. Gemini Embedding Stability:`);
    console.log(`   Cosine similarity between Run 1 and Run 2 embedding: ${cosBetweenRuns.toFixed(15)}`);
    console.log(`   Vec1 first 3: [${vec1.slice(0, 3).map(v => v.toFixed(6)).join(', ')}]`);
    console.log(`   Vec2 first 3: [${vec2.slice(0, 3).map(v => v.toFixed(6)).join(', ')}]`);

    // 3. Atlas $vectorSearch using vec1
    const atlasResults = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: config.ATLAS_VECTOR_INDEX_NAME || 'vector_index',
            path: 'embedding',
            queryVector: vec1,
            numCandidates: config.NUM_CANDIDATES || 100,
            limit: 5,
          },
        },
        {
          $project: {
            _id: 1,
            pageNumber: 1,
            schemeName: 1,
            sectionTitle: 1,
            text: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ])
      .toArray();

    const atlasTopDoc = atlasResults[0];
    console.log(`\n2. Live MongoDB Atlas $vectorSearch Result (using Vec 1):`);
    console.log(`   Atlas Top Score: ${atlasTopDoc?.score}`);
    console.log(`   Atlas Top Chunk: Page ${atlasTopDoc?.pageNumber} | ${atlasTopDoc?.schemeName} | ${atlasTopDoc?.sectionTitle}`);

    // 4. Local In-Memory Cosine Search using vec1 over refined_chunks_190.json
    const scoredLocal = localChunks.map((c, idx) => {
      const cos = cosineSimilarity(vec1, c.embedding);
      const score = (1 + cos) / 2;
      return {
        idx,
        pageNumber: c.pageNumber,
        schemeName: c.schemeName,
        sectionTitle: c.sectionTitle,
        score,
        cos,
      };
    });
    scoredLocal.sort((a, b) => b.score - a.score);
    const localTopDoc = scoredLocal[0];

    console.log(`\n3. Local Vector Search over refined_chunks_190.json (using Vec 1):`);
    console.log(`   Local Top Score: ${localTopDoc?.score}`);
    console.log(`   Local Top Chunk: Page ${localTopDoc?.pageNumber} | ${localTopDoc?.schemeName} | ${localTopDoc?.sectionTitle}`);

    // 5. Compare Atlas doc vector in MongoDB vs localChunks vector
    const atlasDbDoc = await collection.findOne({ _id: atlasTopDoc._id });
    if (atlasDbDoc && atlasDbDoc.embedding) {
      console.log(`\n4. Database Vector vs Local File Vector Check:`);
      const matchingLocal = localChunks.find(c => c.pageNumber === atlasTopDoc.pageNumber && c.sectionTitle === atlasTopDoc.sectionTitle);
      if (matchingLocal) {
        const cosDocVsLocal = cosineSimilarity(atlasDbDoc.embedding, matchingLocal.embedding);
        console.log(`   Cosine similarity between MongoDB chunk vector and refined_chunks_190.json vector: ${cosDocVsLocal.toFixed(15)}`);
      }
    }
  }

  await closeDatabaseConnection();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
