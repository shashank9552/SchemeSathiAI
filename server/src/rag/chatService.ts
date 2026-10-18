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
import { PromptBuilder, REFUSAL_MESSAGES, QUOTA_ERROR_MESSAGES } from './promptBuilder.js';
import { ChatResponse, Citation, LlmAnswerPayload } from './types.js';
import { questionCache } from './questionCache.js';
import { FaithfulnessGuard } from './faithfulnessGuard.js';

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

    // Check Question Cache (1 hour TTL)
    const cachedResponse = questionCache.get(lang, message);
    if (cachedResponse) {
      console.log(`[CHAT_CACHE_HIT] queryHash=${queryHash} lang=${lang}`);
      return {
        ...cachedResponse,
        cached: true,
        latencyMs: Date.now() - startTime,
      };
    }

    // 1. Vector Retrieval (with embedding and search timing)
    let chunks: any[] = [];
    let embedMs = 0;
    let searchMs = 0;
    try {
      const retResult = await this.retriever.retrieveWithTiming(message, config.TOP_K);
      chunks = retResult.chunks;
      embedMs = retResult.embedMs;
      searchMs = retResult.searchMs;
    } catch (retErr: any) {
      const errMsg = retErr.message || String(retErr);
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
        const quotaErr: any = new Error(QUOTA_ERROR_MESSAGES[lang]);
        quotaErr.status = 503;
        throw quotaErr;
      }
      throw retErr;
    }

    const topScore = chunks.length > 0 ? chunks[0].score : 0;

    // 2. Gate 1: Vector Similarity Threshold Gate
    if (chunks.length === 0 || topScore < config.MIN_SIMILARITY) {
      const latencyMs = Date.now() - startTime;
      console.log(
        `[CHAT_REQUEST] queryHash=${queryHash} lang=${lang} topScore=${topScore.toFixed(4)} threshold=${config.MIN_SIMILARITY} decision=refused_first_gate_vector usedChunks=0 timing={lang:${langDetectMs}ms,embed:${embedMs}ms,vectorSearch:${searchMs}ms} latencyMs=${latencyMs}ms`
      );

      const response: ChatResponse = {
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

      questionCache.set(lang, message, response);
      return response;
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
      const errMsg = llmErr.message || String(llmErr);
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
        console.warn(`[CHAT_QUOTA_EXCEEDED] queryHash=${queryHash} - returning 503`);
        const quotaErr: any = new Error(QUOTA_ERROR_MESSAGES[lang]);
        quotaErr.status = 503;
        throw quotaErr;
      }

      const latencyMs = Date.now() - startTime;
      console.error(
        `[CHAT_REQUEST_ERROR] LLM generation failed for queryHash=${queryHash}: ${errMsg} timing={lang:${langDetectMs}ms,embed:${embedMs}ms,vectorSearch:${searchMs}ms,llm:${llmMs}ms} latencyMs=${latencyMs}ms`
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

      const response: ChatResponse = {
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

      questionCache.set(lang, message, response);
      return response;
    }

    // 4. Citation Mapping: Validate chunk IDs and map strictly to stored metadata
    const validChunkMap = new Map(chunks.map((c) => [c.id, c]));
    const rawUsedIds = Array.isArray(parsedPayload.usedChunkIds) ? parsedPayload.usedChunkIds : [];
    
    // Reject any hallucinated ID that was not in the retrieved set
    const validatedIds = rawUsedIds.filter((id) => validChunkMap.has(id));

    // Fallback: if answerable is true but LLM omitted chunk IDs, use top-1 retrieved chunk
    const finalChunkIds = validatedIds.length > 0 ? validatedIds : [chunks[0].id];

    // 5. Faithfulness Guard: Verify every number and percentage against used chunks
    const usedChunks = finalChunkIds.map((id) => validChunkMap.get(id)!).filter(Boolean);
    const faithfulness = FaithfulnessGuard.verifyFaithfulness(
      parsedPayload.answer,
      usedChunks.map((c) => c.text)
    );

    if (!faithfulness.faithful) {
      const latencyMs = Date.now() - startTime;
      console.warn(
        `[FaithfulnessGuard] ungrounded_number detected: [${faithfulness.ungroundedNumbers.join(
          ', '
        )}] queryHash=${queryHash} lang=${lang} decision=refused_faithfulness_guard latencyMs=${latencyMs}ms`
      );

      const response: ChatResponse = {
        answer: REFUSAL_MESSAGES[lang],
        citations: [],
        latencyMs,
        answerable: false,
        topScore,
        faithfulnessChecked: true,
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

      questionCache.set(lang, message, response);
      return response;
    }

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

    const response: ChatResponse = {
      answer: parsedPayload.answer,
      citations,
      latencyMs,
      answerable: true,
      topScore,
      usedChunkIds: finalChunkIds,
      faithfulnessChecked: true,
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

    questionCache.set(lang, message, response);
    return response;
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
