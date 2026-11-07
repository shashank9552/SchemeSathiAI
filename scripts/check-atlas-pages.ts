import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
import { config } from '../server/src/config/index.js';

async function main() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.MONGODB_DB_NAME);
  const coll = db.collection(config.MONGODB_COLLECTION_NAME);
  const count = await coll.countDocuments();
  console.log(`DB: ${config.MONGODB_DB_NAME}, Collection: ${config.MONGODB_COLLECTION_NAME}, Count: ${count}`);

  const pages = await coll.distinct('pageNumber');
  console.log('Distinct pageNumbers in Atlas:', pages.sort((a: number, b: number) => a - b));

  const p4Docs = await coll.find({ pageNumber: 4 }).toArray();
  console.log(`Docs with pageNumber: 4: ${p4Docs.length}`);
  for (const d of p4Docs) {
    console.log(`_id: ${d._id}, scheme: "${d.schemeName}", section: "${d.sectionTitle}"`);
    console.log(`text: ${d.text}\n`);
  }

  const vibrantDocs = await coll.find({ text: { $regex: /vibrant/i } }).toArray();
  console.log(`Docs with "vibrant": ${vibrantDocs.length}`);
  for (const d of vibrantDocs) {
    console.log(`_id: ${d._id}, page: ${d.pageNumber}, scheme: "${d.schemeName}"`);
    console.log(`text: ${d.text.slice(0, 200)}\n`);
  }

  await client.close();
}

main().catch(console.error);
