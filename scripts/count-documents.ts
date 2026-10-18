import { getChunksCollection, closeDatabaseConnection } from '../server/src/db/index.js';

async function main() {
  const collection = await getChunksCollection();
  const count = await collection.countDocuments();
  console.log('TOTAL_SCHEME_CHUNKS_COUNT:', count);
  await closeDatabaseConnection();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
