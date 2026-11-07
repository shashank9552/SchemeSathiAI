import dotenv from 'dotenv';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey });
const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';

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

const hindiQuestions = [
  { id: 'NAT-ANS-20', q: 'मैं 24 वर्ष का युवक हूं और अपने गांव में आटा चक्की लगाना चाहता हूं। मुझे कितनी सब्सिडी और बैंक लोन मिल सकता है?' },
  { id: 'NAT-ANS-21', q: 'महिला उद्यमी को अपना नया व्यवसाय शुरू करने के लिए बिना किसी संपत्ति गिरवी रखे कितने रुपये तक की बैंक गारंटी मिलती है?' },
  { id: 'NAT-ANS-22', q: 'अगर कोई खरीदार कंपनी 45 दिनों में छोटे व्यापारी का बकाया भुगतान नहीं करती है तो कहां शिकायत दर्ज करें?' },
];

async function main() {
  console.log('======================================================================');
  console.log(`  GEMINI EMBEDDING TASK TYPE EXPERIMENT (Model: ${model})`);
  console.log('======================================================================');

  for (const item of hindiQuestions) {
    console.log(`\nTesting [${item.id}]: "${item.q}"`);

    // 1. Without taskType
    const resWithout = await ai.models.embedContent({
      model,
      contents: item.q,
      config: {
        outputDimensionality: 768,
      },
    });
    const vecWithout = resWithout.embeddings?.[0]?.values || (resWithout as any).embedding?.values || [];

    // 2. With taskType: 'RETRIEVAL_QUERY' in config
    let vecWith: number[] = [];
    try {
      const resWith = await ai.models.embedContent({
        model,
        contents: item.q,
        config: {
          outputDimensionality: 768,
          taskType: 'RETRIEVAL_QUERY' as any,
        },
      });
      vecWith = resWith.embeddings?.[0]?.values || (resWith as any).embedding?.values || [];
      console.log('Successfully called with taskType: "RETRIEVAL_QUERY"');
    } catch (err: any) {
      console.error('Error calling with taskType in config:', err.message);
    }

    if (vecWithout.length > 0 && vecWith.length > 0) {
      const cos = cosineSimilarity(vecWithout, vecWith);
      console.log(`Vector lengths: without=${vecWithout.length}, with=${vecWith.length}`);
      console.log(`Cosine Similarity: ${cos.toFixed(15)}`);
      console.log(`First 5 components without: [${vecWithout.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);
      console.log(`First 5 components with:    [${vecWith.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);
      if (cos === 1.0 || Math.abs(cos - 1.0) < 1e-9) {
        console.log(`Result: EXACTLY 1.0 -> taskType parameter had NO effect.`);
      } else {
        console.log(`Result: ${cos} != 1.0 -> taskType produced a DIFFERENT vector!`);
      }
    }
  }

  process.exit(0);
}

main().catch(console.error);
