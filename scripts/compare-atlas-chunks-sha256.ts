import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB_NAME || 'schemesathi';
const collName = process.env.MONGODB_COLLECTION_NAME || 'scheme_chunks';

function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function main() {
  console.log('Connecting to Atlas to compare chunks...');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection(collName);

  const atlasChunks = await coll.find({}).toArray();
  await client.close();

  const localPath = path.resolve('data/processed/refined_chunks_190.json');
  const localChunks: any[] = JSON.parse(fs.readFileSync(localPath, 'utf8'));

  console.log(`Atlas chunks count: ${atlasChunks.length}`);
  console.log(`Local chunks count: ${localChunks.length}\n`);

  // Build maps by sha256 and by id/page
  const atlasBySha = new Map<string, any>();
  const atlasById = new Map<string, any>();
  atlasChunks.forEach(c => {
    const hash = sha256(c.text);
    atlasBySha.set(hash, c);
    atlasById.set(c.id || String(c._id), c);
  });

  const localBySha = new Map<string, any>();
  const localById = new Map<string, any>();
  localChunks.forEach(c => {
    const hash = sha256(c.text);
    localBySha.set(hash, c);
    localById.set(c.id, c);
  });

  let exactTextMatches = 0;
  const inLocalNotInAtlas: any[] = [];
  const inAtlasNotInLocal: any[] = [];

  for (const [hash, lChunk] of localBySha.entries()) {
    if (atlasBySha.has(hash)) {
      exactTextMatches++;
    } else {
      inLocalNotInAtlas.push(lChunk);
    }
  }

  for (const [hash, aChunk] of atlasBySha.entries()) {
    if (!localBySha.has(hash)) {
      inAtlasNotInLocal.push(aChunk);
    }
  }

  console.log(`Exact Text SHA256 Matches: ${exactTextMatches} / ${localChunks.length}`);
  console.log(`Chunks in Local JSON but NOT in Atlas by sha256: ${inLocalNotInAtlas.length}`);
  console.log(`Chunks in Atlas but NOT in Local JSON by sha256: ${inAtlasNotInLocal.length}\n`);

  // Compare by pageNumber
  const pagesWithDiffs = new Set<number>();
  for (const l of inLocalNotInAtlas) {
    pagesWithDiffs.add(l.pageNumber);
  }
  for (const a of inAtlasNotInLocal) {
    pagesWithDiffs.add(a.pageNumber);
  }

  const sortedDiffPages = Array.from(pagesWithDiffs).sort((a, b) => a - b);
  console.log(`Pages with differing chunks (${sortedDiffPages.length} pages):`, sortedDiffPages);

  // Sample differences
  if (inLocalNotInAtlas.length > 0) {
    console.log('\n--- SAMPLE LOCAL CHUNK NOT IN ATLAS (First 3) ---');
    inLocalNotInAtlas.slice(0, 3).forEach((c, idx) => {
      console.log(`[${idx + 1}] ID: ${c.id} | Page: ${c.pageNumber} | Scheme: ${c.schemeName}`);
      console.log(`    Hash: ${sha256(c.text)}`);
      console.log(`    Snippet: ${c.text.slice(0, 150).replace(/\n/g, ' ')}...`);
    });
  }

  if (inAtlasNotInLocal.length > 0) {
    console.log('\n--- SAMPLE ATLAS CHUNK NOT IN LOCAL (First 3) ---');
    inAtlasNotInLocal.slice(0, 3).forEach((c, idx) => {
      console.log(`[${idx + 1}] ID: ${c.id || c._id} | Page: ${c.pageNumber} | Scheme: ${c.schemeName}`);
      console.log(`    Hash: ${sha256(c.text)}`);
      console.log(`    Snippet: ${c.text.slice(0, 150).replace(/\n/g, ' ')}...`);
    });
  }

  // Also check if normalized text matches (e.g. whitespace or headers)
  let normalizedMatches = 0;
  for (const l of localChunks) {
    const lNorm = l.text.replace(/\s+/g, ' ').trim();
    const match = atlasChunks.find(a => a.text.replace(/\s+/g, ' ').trim() === lNorm);
    if (match) normalizedMatches++;
  }
  console.log(`\nNormalized Text (whitespace-collapsed) Matches: ${normalizedMatches} / ${localChunks.length}`);

  // Check vectors: compare embedding vectors between atlas and local for matching chunk IDs or texts
  let sameVectorCount = 0;
  let diffVectorCount = 0;
  for (const l of localChunks) {
    if (!l.embedding) continue;
    const atlasMatch = atlasChunks.find(a => a.id === l.id || sha256(a.text) === sha256(l.text));
    if (atlasMatch && atlasMatch.embedding) {
      const matchVec = atlasMatch.embedding;
      let diff = 0;
      for (let i = 0; i < Math.min(l.embedding.length, matchVec.length); i++) {
        diff += Math.abs(l.embedding[i] - matchVec[i]);
      }
      if (diff < 1e-6) {
        sameVectorCount++;
      } else {
        diffVectorCount++;
      }
    }
  }
  console.log(`Vector comparisons: ${sameVectorCount} identical vectors, ${diffVectorCount} differing vectors.`);

  process.exit(0);
}

main().catch(console.error);
