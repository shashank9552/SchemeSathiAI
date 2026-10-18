/**
 * SchemeSathi — Atlas Vector Search Retriever Module
 */

import { getChunksCollection } from '../db/index.js';
import { getEmbeddingProvider } from '../providers/index.js';
import { config } from '../config/index.js';
import { RetrievedChunk } from './types.js';

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  embedMs: number;
  searchMs: number;
}

export class VectorRetriever {
  private embeddingProvider = getEmbeddingProvider();

  public async retrieveWithTiming(query: string, topK?: number): Promise<RetrievalResult> {
    const limit = topK || config.TOP_K || 5;
    const numCandidates = config.NUM_CANDIDATES || 100;
    const indexName = config.ATLAS_VECTOR_INDEX_NAME || 'vector_index';

    // 1. Embed query
    const embedStart = Date.now();
    const queryVector = await this.embeddingProvider.embedQuery(query);
    const embedMs = Date.now() - embedStart;

    // 2. Query MongoDB Atlas Vector Search
    const searchStart = Date.now();
    const collection = await getChunksCollection();
    const rawResults = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: indexName,
            path: 'embedding',
            queryVector,
            numCandidates,
            limit,
          },
        },
        {
          $project: {
            schemeName: 1,
            sectionTitle: 1,
            sourceFile: 1,
            pageNumber: 1,
            text: 1,
            isTable: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ])
      .toArray();
    const searchMs = Date.now() - searchStart;

    // 3. Map to structured RetrievedChunk with deterministic synthetic IDs
    const chunks: RetrievedChunk[] = rawResults.map((doc: any, idx: number) => ({
      id: `chunk-${idx}`,
      schemeName: doc.schemeName || 'Unknown Scheme',
      sectionTitle: doc.sectionTitle || 'Overview',
      sourceFile: doc.sourceFile || 'document.pdf',
      pageNumber: doc.pageNumber || 1,
      text: doc.text || '',
      isTable: Boolean(doc.isTable),
      score: typeof doc.score === 'number' ? doc.score : 0,
    }));

    return { chunks, embedMs, searchMs };
  }

  public async retrieve(query: string, topK?: number): Promise<RetrievedChunk[]> {
    const { chunks } = await this.retrieveWithTiming(query, topK);
    return chunks;
  }
}
