import { GoogleGenAI } from '@google/genai';
import { IEmbeddingProvider } from './interfaces.js';
import { config } from '../config/index.js';

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  public readonly name = 'gemini';
  public readonly dimensions: number;
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey?: string, model?: string, dimensions?: number) {
    const key = apiKey || config.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY must be provided for GeminiEmbeddingProvider.');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model || config.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
    this.dimensions = dimensions || config.EMBEDDING_DIMENSIONS || 768;
  }

  public async embedQuery(text: string): Promise<number[]> {
    return this.embedSingleWithRetry(text);
  }

  public async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    
    const results: number[][] = [];
    const DELAY_BETWEEN_REQUESTS_MS = 650; // Keeps rate under 100 requests per minute (Free Tier limit)

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const embedding = await this.embedSingleWithRetry(text);
      results.push(embedding);

      if ((i + 1) % 25 === 0 || i === texts.length - 1) {
        console.log(`   [Embedding Progress] ${i + 1}/${texts.length} chunks embedded...`);
      }

      if (i < texts.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
      }
    }

    return results;
  }

  private async embedSingleWithRetry(text: string, maxRetries = 5): Promise<number[]> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const res = await this.ai.models.embedContent({
          model: this.model,
          contents: text,
          config: {
            outputDimensionality: this.dimensions,
          },
        });

        const values = res.embeddings?.[0]?.values || (res as any).embedding?.values || [];
        if (values.length === 0) {
          throw new Error(`Embedding returned empty vector for model ${this.model}`);
        }
        return values;
      } catch (err: any) {
        attempt++;
        const errMsg = err.message || String(err);
        const isQuota = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');

        if (attempt >= maxRetries) {
          throw new Error(`Failed to generate embedding after ${maxRetries} attempts: ${errMsg}`);
        }

        // Parse retry delay from error if available, otherwise use exponential backoff
        let delayMs = Math.pow(2, attempt) * 2000;
        const match = errMsg.match(/retry in ([0-9.]+)\s*s/i) || errMsg.match(/retryDelay":"([0-9]+)s"/i);
        if (match) {
          delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
        } else if (isQuota) {
          delayMs = 35000; // Standard 35s quota reset
        }

        console.warn(`[GeminiEmbeddingProvider] Quota/transient error on attempt ${attempt}. Waiting ${Math.ceil(delayMs / 1000)}s before retry...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw new Error('Unexpected exit from retry loop in GeminiEmbeddingProvider');
  }
}
