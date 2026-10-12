import { GoogleGenAI } from '@google/genai';
import { ILLMProvider } from './interfaces.js';
import { config } from '../config/index.js';

export class GeminiLLMProvider implements ILLMProvider {
  public readonly name = 'gemini';
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey || config.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY must be provided for GeminiLLMProvider.');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model || config.GEMINI_LLM_MODEL || 'gemini-3.8-flash';
  }

  public async generateResponse(prompt: string, systemInstruction?: string): Promise<string> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await this.ai.models.generateContent({
          model: this.model,
          contents: prompt,
          config: systemInstruction
            ? {
                systemInstruction,
                temperature: 0.1, // Grounded low temperature for factual precision
              }
            : {
                temperature: 0.1,
              },
        });

        const text = response.text?.trim() || '';
        return text;
      } catch (err: any) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(`LLM generation failed after ${maxRetries} attempts: ${err.message || err}`);
        }
        const delay = Math.pow(2, attempt) * 1500;
        console.warn(`[GeminiLLMProvider] Transient generation error on attempt ${attempt}. Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw new Error('Unexpected exit from retry loop in GeminiLLMProvider');
  }
}
