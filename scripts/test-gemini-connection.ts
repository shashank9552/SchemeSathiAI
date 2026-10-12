/**
 * SchemeSathi — Minimal Gemini API Connectivity Verification Script
 * 
 * Tests both GEMINI_EMBEDDING_MODEL and GEMINI_LLM_MODEL using credentials from .env.
 * Does NOT log or expose the API key.
 * 
 * Usage:
 *   npx tsx scripts/test-gemini-connection.ts
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

// Load .env from root or server directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
}

async function verifyGeminiConnection() {
  console.log('\n======================================================');
  console.log('  SchemeSathi — Gemini API Connection Verification');
  console.log('======================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_gemini_api_key_here')) {
    console.error('❌ Error: GEMINI_API_KEY is not set in .env.');
    console.error('Please configure your real Gemini API key in C:\\dev\\SchemeSathi\\.env and run again.\n');
    process.exit(1);
  }

  const llmModel = process.env.GEMINI_LLM_MODEL || 'gemini-3.8-flash';
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
  const targetDimensions = Number.parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10);

  console.log(`Configured LLM Model:        ${llmModel}`);
  console.log(`Configured Embedding Model:  ${embeddingModel}`);
  console.log(`Target Embedding Dimensions: ${targetDimensions}`);
  console.log('API Key:                     [CONFIGURED & MASKED]');
  console.log('\n------------------------------------------------------');

  const ai = new GoogleGenAI({ apiKey });

  // 1. Test Embedding Model
  console.log(`\n⏳ Testing Embedding Model (${embeddingModel})...`);
  const embedStartTime = Date.now();
  try {
    const embedResponse = await ai.models.embedContent({
      model: embeddingModel,
      contents: 'भारत सरकार की कल्याणकारी योजनाएं (Government welfare schemes of India)',
      config: {
        outputDimensionality: targetDimensions,
      },
    });

    const embedDuration = Date.now() - embedStartTime;
    const values = embedResponse.embeddings?.[0]?.values || embedResponse.embedding?.values || [];

    if (values.length === 0) {
      throw new Error('Received empty embedding values array from Gemini API.');
    }

    console.log(`✅ Embedding Model OK (${embedDuration} ms)`);
    console.log(`   - Generated vector length: ${values.length}`);
    console.log(`   - Matches target dimensions (${targetDimensions}): ${values.length === targetDimensions ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   - Sample vector slice: [${values.slice(0, 3).map((v) => v.toFixed(5)).join(', ')}, ...]`);
  } catch (embedErr: any) {
    console.error(`❌ Embedding Model Failed:`);
    console.error(`   Message: ${embedErr.message || embedErr}`);
    process.exit(1);
  }

  // 2. Test LLM Generation Model
  console.log(`\n⏳ Testing LLM Model (${llmModel})...`);
  const llmStartTime = Date.now();
  let responseText = '';
  let retries = 3;
  while (retries > 0) {
    try {
      const genResponse = await ai.models.generateContent({
        model: llmModel,
        contents: 'Respond with the exact phrase: "SchemeSathi Gemini API connection verified."',
      });
      responseText = genResponse.text?.trim() || '';
      break;
    } catch (llmErr: any) {
      retries--;
      if (retries === 0) {
        console.error(`❌ LLM Model Failed:`);
        console.error(`   Message: ${llmErr.message || llmErr}`);
        process.exit(1);
      }
      console.log(`   (Transient error, retrying in 2s... remaining attempts: ${retries})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const llmDuration = Date.now() - llmStartTime;
  console.log(`✅ LLM Generation Model OK (${llmDuration} ms)`);
  console.log(`   - Response: "${responseText}"`);

  console.log('\n======================================================');
  console.log('🎉 All Gemini API connectivity checks PASSED successfully!');
  console.log('======================================================\n');
}

verifyGeminiConnection().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
