import { IEmbeddingProvider, ILLMProvider } from './interfaces.js';
import { GeminiEmbeddingProvider } from './geminiEmbeddingProvider.js';
import { GeminiLLMProvider } from './geminiLlmProvider.js';
import { config } from '../config/index.js';

export * from './interfaces.js';
export * from './geminiEmbeddingProvider.js';
export * from './geminiLlmProvider.js';

let defaultEmbeddingProvider: IEmbeddingProvider | null = null;
let defaultLLMProvider: ILLMProvider | null = null;

export function getEmbeddingProvider(): IEmbeddingProvider {
  if (defaultEmbeddingProvider) {
    return defaultEmbeddingProvider;
  }

  const providerName = config.EMBEDDING_PROVIDER?.toLowerCase() || 'gemini';
  if (providerName === 'gemini') {
    defaultEmbeddingProvider = new GeminiEmbeddingProvider();
    return defaultEmbeddingProvider;
  }

  throw new Error(`Unsupported EMBEDDING_PROVIDER: "${providerName}". Supported: "gemini".`);
}

export function getLLMProvider(): ILLMProvider {
  if (defaultLLMProvider) {
    return defaultLLMProvider;
  }

  const providerName = config.LLM_PROVIDER?.toLowerCase() || 'gemini';
  if (providerName === 'gemini') {
    defaultLLMProvider = new GeminiLLMProvider();
    return defaultLLMProvider;
  }

  throw new Error(`Unsupported LLM_PROVIDER: "${providerName}". Supported: "gemini".`);
}
