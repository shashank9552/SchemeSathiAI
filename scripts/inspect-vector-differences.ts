import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { MongoClient } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB_NAME || 'schemesathi';
const collName = process.env.MONGODB_COLLECTION_NAME || 'scheme_chunks';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function magnitude(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection(collName);

  const sampleAtlas = await coll.findOne({});
  await client.close();

  const localChunks: any[] = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
  const sampleLocal = localChunks.find(c => c.text === sampleAtlas.text);

  console.log('Sample Chunk Page:', sampleAtlas.pageNumber, sampleAtlas.schemeName);
  console.log('Atlas Vector length:', sampleAtlas.embedding.length);
  console.log('Local Vector length:', sampleLocal.embedding.length);
  console.log('Atlas Vector magnitude:', magnitude(sampleAtlas.embedding));
  console.log('Local Vector magnitude:', magnitude(sampleLocal.embedding));

  const cos = cosineSimilarity(sampleAtlas.embedding, sampleLocal.embedding);
  console.log('Cosine similarity between Atlas vector and Local vector:', cos);

  // Compare first 5 dimensions
  console.log('Atlas first 5 dims:', sampleAtlas.embedding.slice(0, 5));
  console.log('Local first 5 dims:', sampleLocal.embedding.slice(0, 5));

  // Let's check git history of scripts to see how Atlas was seeded vs how refined_chunks_190.json was generated
  process.exit(0);
}

main().catch(console.error);
