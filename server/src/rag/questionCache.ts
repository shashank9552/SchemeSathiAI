/**
 * SchemeSathi — In-Memory Question Cache
 * 
 * Caches grounded responses for identical normalized queries.
 * Key: sha256(lang + "::" + normalizedQuery)
 * TTL: 1 hour (3600 seconds)
 */

import crypto from 'node:crypto';
import { ChatResponse } from './types.js';

interface CacheEntry {
  response: ChatResponse;
  expiresAt: number;
}

export class QuestionCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = 3600 * 1000, maxEntries = 500) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  public static normalizeQuestion(text: string): string {
    return text
      .toLowerCase()
      .replace(/[?!.,;:'"“”‘’]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public static computeKey(language: string, question: string): string {
    const normalized = this.normalizeQuestion(question);
    return crypto
      .createHash('sha256')
      .update(`${language.toLowerCase()}::${normalized}`)
      .digest('hex');
  }

  public get(language: string, question: string): ChatResponse | null {
    const key = QuestionCache.computeKey(language, question);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  public set(language: string, question: string, response: ChatResponse): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const key = QuestionCache.computeKey(language, question);
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export const questionCache = new QuestionCache();
