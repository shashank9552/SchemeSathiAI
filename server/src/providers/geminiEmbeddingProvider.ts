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
    const embeddings = await this.embedWithRetry([text]);
    return embeddings[0];
  }

  public async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    
    // Batch in chunks of 20 to avoid payload size and rate limits
    const BATCH_SIZE = 20;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = await this.embedWithRetry(batch);
      results.push(...batchEmbeddings);
      // Small pause between batches to be respectful to rate limits
      if (i + BATCH_SIZE < texts.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return results;
  }

  private async embedWithRetry(texts: string[], maxRetries = 3): Promise<number[][]> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const promises = texts.map((text) =>
          this.ai.models.embedContent({
            model: this.model,
            contents: text,
            config: {
              outputDimensionality: this.dimensions,
            },
          })
        );

        const responses = await Promise.all(promises);
        return responses.map((res) => {
          const values = res.embeddings?.[0]?.values || res.embedding?.values || [];
          if (values.length === 0) {
            throw new Error(`Embedding returned empty vector for model ${this.model}`);
          }
          return values;
        });
      } catch (err: any) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(`Failed to generate embeddings after ${maxRetries} attempts: ${err.message || err}`);
        }
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[GeminiEmbeddingProvider] Transient error on attempt ${attempt}. Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error('Unexpected exit from retry loop in GeminiEmbeddingProvider');
  }
}
