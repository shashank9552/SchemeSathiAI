import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { getChunksCollection, closeDatabaseConnection } from '../server/src/db/index.js';
import { getEmbeddingProvider } from '../server/src/providers/index.js';
import { config } from '../server/src/config/index.js';

async function main() {
  console.log('======================================================================');
  console.log('  LIVE MONGODB ATLAS $vectorSearch ROUND TRIP');
  console.log('======================================================================');

  const query = "who can apply for PMEGP loan?";
  console.log(`Query: "${query}"`);

  const provider = getEmbeddingProvider();
  const collection = await getChunksCollection();

  // 1. Embed query
  const embedStart = Date.now();
  const queryVector = await provider.embedQuery(query);
  const embedMs = Date.now() - embedStart;
  console.log(`Embedding Generated in: ${embedMs} ms (Dimensions: ${queryVector.length})`);

  // 2. Execute $vectorSearch on Atlas
  const searchStart = Date.now();
  const rawResults = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: config.ATLAS_VECTOR_INDEX_NAME || 'vector_index',
          path: 'embedding',
          queryVector,
          numCandidates: config.NUM_CANDIDATES || 100,
          limit: 5,
        },
      },
      {
        $project: {
          _id: 1,
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
  const totalMs = embedMs + searchMs;

  console.log(`$vectorSearch execution time on Atlas: ${searchMs} ms`);
  console.log(`Total round-trip time: ${totalMs} ms`);
  console.log(`Retrieved Documents: ${rawResults.length}\n`);

  console.log('--- RETRIEVED CHUNKS ---');
  rawResults.forEach((doc: any, idx: number) => {
    console.log(`\n[Rank ${idx + 1}]`);
    console.log(`_id:          ${doc._id.toString()}`);
    console.log(`Score:        ${doc.score}`);
    console.log(`Page:         ${doc.pageNumber}`);
    console.log(`Scheme:       ${doc.schemeName}`);
    console.log(`Section:      ${doc.sectionTitle}`);
    console.log(`Text preview: ${doc.text.replace(/\s+/g, ' ').substring(0, 160)}...`);
  });

  await closeDatabaseConnection();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
