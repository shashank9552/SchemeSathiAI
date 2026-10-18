import { GoogleGenAI } from '@google/genai';
import { ILLMProvider } from './interfaces.js';
import { config } from '../config/index.js';

export interface LlmDetailedResult {
  text: string;
  llmMs: number;
  retries: number;
  backoffMs: number;
}

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
    this.model = model || config.GEMINI_LLM_MODEL;
    if (!this.model) {
      throw new Error('GEMINI_LLM_MODEL must be provided in environment (.env).');
    }
  }

  public async generateResponse(prompt: string, systemInstruction?: string): Promise<string> {
    const result = await this.generateResponseDetailed(prompt, systemInstruction);
    return result.text;
  }

  public async generateResponseDetailed(prompt: string, systemInstruction?: string): Promise<LlmDetailedResult> {
    const maxRetries = 3;
    let attempt = 0;
    let totalBackoffMs = 0;

    while (attempt < maxRetries) {
      const callStart = Date.now();
      try {
        const generationConfig: any = {
          temperature: 0.1, // Grounded low temperature for factual precision
          thinkingConfig: {
            thinkingBudget: 0, // Minimize reasoning/thinking tokens to avoid latency bloat
          },
        };
        if (systemInstruction) {
          generationConfig.systemInstruction = systemInstruction;
        }

        const response = await this.ai.models.generateContent({
          model: this.model,
          contents: prompt,
          config: generationConfig,
        });

        const llmMs = Date.now() - callStart;
        const text = response.text?.trim() || '';
        return {
          text,
          llmMs,
          retries: attempt,
          backoffMs: totalBackoffMs,
        };
      } catch (err: any) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(`LLM generation failed after ${maxRetries} attempts: ${err.message || err}`);
        }
        const errMsg = err.message || String(err);
        let delay = Math.pow(2, attempt) * 1500;
        const match = errMsg.match(/retry in ([0-9.]+)\s*s/i) || errMsg.match(/retryDelay":"([0-9]+)s"/i);
        if (match) {
          delay = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
        }
        totalBackoffMs += delay;
        console.warn(`[GeminiLLMProvider] Transient generation error on attempt ${attempt}: ${errMsg}. Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw new Error('Unexpected exit from retry loop in GeminiLLMProvider');
  }
}
