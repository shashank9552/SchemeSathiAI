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
  llmMs?: number;
  retries?: number;
  backoffMs?: number;
  totalMs: number;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  latencyMs: number;
  answerable: boolean;
  topScore?: number;
  usedChunkIds?: string[];
  timings?: StageTimings;
}
