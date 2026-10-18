import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class EmbeddingCache {
  private cacheFilePath: string;
  private cache: Map<string, number[]>;

  constructor(cacheFilePath?: string) {
    let rootDir = path.resolve(process.cwd());
    if (!fs.existsSync(path.resolve(rootDir, 'data')) && fs.existsSync(path.resolve(rootDir, '..', 'data'))) {
      rootDir = path.resolve(rootDir, '..');
    }
    this.cacheFilePath = cacheFilePath || path.resolve(rootDir, 'data/processed/embeddings_hash_cache.json');
    this.cache = new Map();
    this.loadCache();
  }

  /**
   * Generates a deterministic cache key from (text + model + dimensions).
   */
  public static computeKey(text: string, model: string, dimensions: number): string {
    return crypto
      .createHash('sha256')
      .update(`${text.trim()}::${model}::${dimensions}`)
      .digest('hex');
  }

  public get(text: string, model: string, dimensions: number): number[] | undefined {
    const key = EmbeddingCache.computeKey(text, model, dimensions);
    return this.cache.get(key);
  }

  public set(text: string, model: string, dimensions: number, embedding: number[]): void {
    const key = EmbeddingCache.computeKey(text, model, dimensions);
    this.cache.set(key, embedding);
  }

  public has(text: string, model: string, dimensions: number): boolean {
    const key = EmbeddingCache.computeKey(text, model, dimensions);
    return this.cache.has(key);
  }

  public size(): number {
    return this.cache.size;
  }

  public save(): void {
    const dir = path.dirname(this.cacheFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const obj: Record<string, number[]> = {};
    for (const [k, v] of this.cache.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(this.cacheFilePath, JSON.stringify(obj), 'utf8');
  }

  private loadCache(): void {
    if (fs.existsSync(this.cacheFilePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
        for (const [k, v] of Object.entries(raw)) {
          if (Array.isArray(v)) {
            this.cache.set(k, v as number[]);
          }
        }
      } catch {}
    }
  }
}
