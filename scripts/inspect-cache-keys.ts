import fs from 'node:fs';
import crypto from 'node:crypto';

const cache = JSON.parse(fs.readFileSync('data/processed/embeddings_hash_cache.json', 'utf8'));
const cacheKeys = new Set(Object.keys(cache));
console.log('Total cache keys:', cacheKeys.size);

const storedChunks = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

let matchGemini2 = 0;
let matchGemini2Raw = 0;

for (const c of storedChunks) {
  const text = c.text;
  const h1 = crypto.createHash('sha256').update(`${text.trim()}::gemini-embedding-2::768`).digest('hex');
  const h2 = crypto.createHash('sha256').update(`${text}::gemini-embedding-2::768`).digest('hex');

  if (cacheKeys.has(h1)) matchGemini2++;
  if (cacheKeys.has(h2)) matchGemini2Raw++;
}

console.log('Match gemini-embedding-2 (trim):', matchGemini2);
console.log('Match gemini-embedding-2 (raw):', matchGemini2Raw);
