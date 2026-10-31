/**
 * SchemeSathi — RAG Pipeline Types & Data Contracts
 */

export interface RetrievedChunk {
  id: string; // Deterministic identifier (e.g. "chunk-0", "chunk-1")
  schemeName: string;
  sectionTitle: string;
  sourceFile: string;
  pageNumber: number;
  text: string;
  isTable: boolean;
  score: number; // Raw MongoDB Atlas vectorSearchScore
}

export interface Citation {
  schemeName: string;
  sourceFile: string;
  pageNumber: number;
  sectionTitle: string;
  excerpt: string;
}

export interface LlmAnswerPayload {
  answerable: boolean;
  answer: string;
  usedChunkIds: string[];
}

export interface StageTimings {
  langDetectMs: number;
  embedMs: number;
  vectorSearchMs: number;
  translationMs?: number;
  llmMs?: number;
  retries?: number;
  backoffMs?: number;
  totalMs: number;
}

export type RefusalReason =
  | 'below_threshold'
  | 'llm_not_answerable'
  | 'ungrounded_number'
  | 'llm_error'
  | 'quota_error';

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  latencyMs: number;
  answerable: boolean;
  topScore?: number;
  reason?: RefusalReason;
  usedChunkIds?: string[];
  timings?: StageTimings;
  cached?: boolean;
  faithfulnessChecked?: boolean;
}

