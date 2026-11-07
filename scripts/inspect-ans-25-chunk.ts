import dotenv from 'dotenv';
import path from 'node:path';
import { MongoClient } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db('schemesathi');
  const collection = db.collection('scheme_chunks');

  const p41Chunks = await collection.find({ pageNumber: 41 }).toArray();
  await client.close();

  console.log(`Found ${p41Chunks.length} chunks on PDF page 41:\n`);
  p41Chunks.forEach((c, idx) => {
    console.log(`================================================================================`);
    console.log(`[CHUNK ${idx + 1}] ID: ${c._id} | Page: ${c.pageNumber}`);
    console.log(`Scheme: ${c.schemeName}`);
    console.log(`Section: ${c.sectionTitle}`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(c.text);
    console.log(`================================================================================\n`);
  });

  process.exit(0);
}

main().catch(console.error);
