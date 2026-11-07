import path from 'node:path';
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';

async function main() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);

  // Search for the 4 ids ending with a71, a74, a76, a6d
  const targetIds = [
    '6ad4b2e8c9c1e1b88fa30a6d',
    '6ad4b2e8c9c1e1b88fa30a71',
    '6ad4b2e8c9c1e1b88fa30a74',
    '6ad4b2e8c9c1e1b88fa30a76'
  ];

  console.log('Querying Atlas for target chunk IDs:');
  for (const idStr of targetIds) {
    const doc = await coll.findOne({ _id: new ObjectId(idStr) });
    console.log(`================================================================================`);
    console.log(`_id: ${idStr}`);
    if (!doc) {
      console.log('DOC NOT FOUND BY OBJECTID, trying string _id:');
      const docStr = await coll.findOne({ _id: idStr as any });
      console.log(docStr);
    } else {
      console.log(`pageNumber: ${doc.pageNumber}`);
      console.log(`schemeName: "${doc.schemeName}"`);
      console.log(`sectionTitle: "${doc.sectionTitle}"`);
      console.log(`VERBATIM STORED TEXT:`);
      console.log(JSON.stringify(doc.text));
    }
  }

  // Also search for all 190 chunks containing MGIRI/SAMADHAAN/SAMBANDH/ni-msme/Udyam
  const all190 = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  console.log(`\n================================================================================`);
  console.log(`SEARCHING ALL 190 CHUNKS FOR MGIRI / SAMADHAAN / SAMBANDH / ni-msme / Udyam`);
  console.log(`================================================================================`);

  const matchingChunks = all190.filter(c => {
    const full = ((c.schemeName || '') + ' ' + (c.sectionTitle || '') + ' ' + (c.text || '')).toLowerCase();
    return full.includes('mgiri') ||
           full.includes('samadhaan') ||
           full.includes('sambandh') ||
           full.includes('ni-msme') ||
           full.includes('udyam assist');
  });

  console.log(`Found ${matchingChunks.length} chunks matching label search:\n`);
  for (const c of matchingChunks) {
    console.log(`_id: ${c._id} | Page: ${c.pageNumber} | Scheme: "${c.schemeName}" | Section: "${c.sectionTitle}"`);
    console.log(`  Text prefix: ${JSON.stringify(c.text.slice(0, 140))}\n`);
  }

  await client.close();
}

main().catch(console.error);
