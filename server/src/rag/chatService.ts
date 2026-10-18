/**
 * SchemeSathi — Grounded RAG Chat Orchestration Service
 * 
 * Implements two-gate validation:
 * 1. Vector Similarity Gate: Rejects out-of-corpus queries if top score < MIN_SIMILARITY
 * 2. LLM Groundedness Gate: Instructs LLM to return { answerable, answer, usedChunkIds }
 *    and maps usedChunkIds strictly to stored chunk metadata.
 */

import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { getLLMProvider } from '../providers/index.js';
import { VectorRetriever } from './retriever.js';
import { PromptBuilder, REFUSAL_MESSAGES } from './promptBuilder.js';
import { ChatResponse, Citation, LlmAnswerPayload } from './types.js';

export class ChatService {
  private retriever: VectorRetriever;
  private llmProvider = getLLMProvider();

  constructor(retriever?: VectorRetriever) {
    this.retriever = retriever || new VectorRetriever();
  }

  public detectLanguage(text: string): 'en' | 'hi' {
    // Detect Devanagari Unicode block
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    return hasDevanagari ? 'hi' : 'en';
  }

  public async processMessage(message: string, forcedLanguage?: 'en' | 'hi'): Promise<ChatResponse> {
    const startTime = Date.now();
    const langDetectStart = Date.now();
    const lang = forcedLanguage || this.detectLanguage(message);
    const langDetectMs = Date.now() - langDetectStart;
    const queryHash = crypto.createHash('sha256').update(message.trim()).digest('hex').slice(0, 8);

    // 1. Vector Retrieval (with embedding and search timing)
    const { chunks, embedMs, searchMs } = await this.retriever.retrieveWithTiming(message, config.TOP_K);
    const topScore = chunks.length > 0 ? chunks[0].score : 0;

    // 2. Gate 1: Vector Similarity Threshold Gate
    if (chunks.length === 0 || topScore < config.MIN_SIMILARITY) {
      const latencyMs = Date.now() - startTime;
      console.log(
        `[CHAT_REQUEST] queryHash=${queryHash} lang=${lang} topScore=${topScore.toFixed(4)} threshold=${config.MIN_SIMILARITY} decision=refused_first_gate_vector usedChunks=0 timing={lang:${langDetectMs}ms,embed:${embedMs}ms,vectorSearch:${searchMs}ms} latencyMs=${latencyMs}ms`
      );

      return {
        answer: REFUSAL_MESSAGES[lang],
        citations: [],
        latencyMs,
        answerable: false,
        topScore,
        timings: {
          langDetectMs,
          embedMs,
          vectorSearchMs: searchMs,
          totalMs: latencyMs,
        },
      };
    }

    // 3. Gate 2: LLM Synthesis & Groundedness Gate
    const systemInstruction = PromptBuilder.buildSystemInstruction(lang);
    const prompt = PromptBuilder.buildUserPrompt(message, chunks);

    let rawLlmOutput = '';
    let llmMs = 0;
    let retries = 0;
    let backoffMs = 0;

    try {
      if ('generateResponseDetailed' in this.llmProvider) {
        const result = await (this.llmProvider as any).generateResponseDetailed(prompt, systemInstruction);
        rawLlmOutput = result.text;
        llmMs = result.llmMs;
        retries = result.retries;
        backoffMs = result.backoffMs;
      } else {
        const llmStart = Date.now();
        rawLlmOutput = await this.llmProvider.generateResponse(prompt, systemInstruction);
        llmMs = Date.now() - llmStart;
      }
    } catch (llmErr: any) {
      const latencyMs = Date.now() - startTime;
      console.error(
        `[CHAT_REQUEST_ERROR] LLM generation failed for queryHash=${queryHash}: ${llmErr.message} timing={lang:${langDetectMs}ms,embed:${embedMs}ms,vectorSearch:${searchMs}ms,llm:${llmMs}ms} latencyMs=${latencyMs}ms`
      );
      return {
        answer: REFUSAL_MESSAGES[lang],
        citations: [],
        latencyMs,
        answerable: false,
        topScore,
        timings: {
          langDetectMs,
          embedMs,
          vectorSearchMs: searchMs,
          llmMs,
          retries,
          backoffMs,
          totalMs: latencyMs,
        },
      };
    }

    // Parse structured JSON response
    const parsedPayload = this.parseLlmJson(rawLlmOutput);

    // If LLM determines question is unanswerable from the retrieved passages
    if (!parsedPayload || !parsedPayload.answerable) {
      const latencyMs = Date.now() - startTime;
      console.log(
        `[CHAT_REQUEST] queryHash=${queryHash} lang=${lang} topScore=${topScore.toFixed(4)} decision=refused_second_gate_llm usedChunks=0 timing={lang:${langDetectMs}ms,embed:${embedMs}ms,vectorSearch:${searchMs}ms,llm:${llmMs}ms,retries:${retries},backoff:${backoffMs}ms} latencyMs=${latencyMs}ms`
      );

      return {
        answer: parsedPayload?.answer?.trim() || REFUSAL_MESSAGES[lang],
        citations: [],
        latencyMs,
        answerable: false,
        topScore,
        timings: {
          langDetectMs,
          embedMs,
          vectorSearchMs: searchMs,
          llmMs,
          retries,
          backoffMs,
          totalMs: latencyMs,
        },
      };
    }

    // 4. Citation Mapping: Validate chunk IDs and map strictly to stored metadata
    const validChunkMap = new Map(chunks.map((c) => [c.id, c]));
    const rawUsedIds = Array.isArray(parsedPayload.usedChunkIds) ? parsedPayload.usedChunkIds : [];
    
    // Reject any hallucinated ID that was not in the retrieved set
    const validatedIds = rawUsedIds.filter((id) => validChunkMap.has(id));

    // Fallback: if answerable is true but LLM omitted chunk IDs, use top-1 retrieved chunk
    const finalChunkIds = validatedIds.length > 0 ? validatedIds : [chunks[0].id];

    const citations: Citation[] = finalChunkIds.map((id) => {
      const chunk = validChunkMap.get(id)!;
      return {
        schemeName: chunk.schemeName,
        sourceFile: chunk.sourceFile,
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle,
        excerpt: chunk.text.replace(/\s+/g, ' ').substring(0, 240) + (chunk.text.length > 240 ? '...' : ''),
      };
    });

    const latencyMs = Date.now() - startTime;
    console.log(
      `[CHAT_REQUEST] queryHash=${queryHash} lang=${lang} topScore=${topScore.toFixed(4)} decision=answered usedChunks=${citations.length} timing={lang:${langDetectMs}ms,embed:${embedMs}ms,vectorSearch:${searchMs}ms,llm:${llmMs}ms,retries:${retries},backoff:${backoffMs}ms} latencyMs=${latencyMs}ms`
    );

    return {
      answer: parsedPayload.answer,
      citations,
      latencyMs,
      answerable: true,
      topScore,
      usedChunkIds: finalChunkIds,
      timings: {
        langDetectMs,
        embedMs,
        vectorSearchMs: searchMs,
        llmMs,
        retries,
        backoffMs,
        totalMs: latencyMs,
      },
    };
  }

  private parseLlmJson(rawText: string): LlmAnswerPayload | null {
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

      const parsed = JSON.parse(cleaned);
      if (typeof parsed === 'object' && parsed !== null && 'answerable' in parsed) {
        return {
          answerable: Boolean(parsed.answerable),
          answer: String(parsed.answer || ''),
          usedChunkIds: Array.isArray(parsed.usedChunkIds) ? parsed.usedChunkIds.map(String) : [],
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
