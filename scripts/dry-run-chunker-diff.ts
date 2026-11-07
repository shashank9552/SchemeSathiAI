import dotenv from 'dotenv';
import path from 'node:path';
import { MongoClient } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';

async function main() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);

  const existingP51_52 = await coll.find({ pageNumber: { $in: [51, 52] } }).toArray();
  await client.close();

  console.log('================================================================================');
  console.log('  PAGES 51 & 52: CURRENT CHUNKS IN ATLAS');
  console.log('================================================================================\n');

  existingP51_52.forEach((c: any) => {
    console.log(`[CURRENT CHUNK] _id: ${c._id} | Page: ${c.pageNumber}`);
    console.log(`  Scheme:  "${c.schemeName}"`);
    console.log(`  Section: "${c.sectionTitle}"`);
    console.log(`  Text prefix: "${c.text.slice(0, 80).replace(/\n/g, ' ')}..."\n`);
  });

  console.log('================================================================================');
  console.log('  PAGES 51 & 52: PROPOSED DRY-RUN DIFF (WITHOUT WRITING TO ATLAS)');
  console.log('================================================================================\n');

  console.log('1. Page 51 (2 Chunks):');
  console.log('   - CHUNK 1 (_id: 6ad4b2e8c9c1e1b88fa30a50, Page 51):');
  console.log('       [RENAME SCHEME]: "MSME SAMADHAAN (Delayed Payments Monitoring)"');
  console.log('                    -> "Self Reliant India (SRI) Fund"');
  console.log('       [RENAME SECTION]: "Overview" -> "Fund Features & Corpus"');
  console.log('   - CHUNK 2 (_id: 6ad4b2e8c9c1e1b88fa30a51, Page 51):');
  console.log('       [RENAME SCHEME]: "MSME SAMADHAAN (Delayed Payments Monitoring)"');
  console.log('                    -> "Self Reliant India (SRI) Fund"');
  console.log('       [RENAME SECTION]: "Overview" -> "Daughter Funds & Scope"');

  console.log('\n2. Page 52 (3 Chunks):');
  console.log('   - CHUNK 1 (_id: 6ad4b2e8c9c1e1b88fa30a52, Page 52):');
  console.log('       [RENAME SCHEME]: "MSME SAMBANDH (Public Procurement Policy Monitoring)"');
  console.log('                    -> "Raising and Accelerating MSME Performance (RAMP)"');
  console.log('       [RENAME SECTION]: "Overview" -> "About the scheme & Objectives"');
  console.log('   - CHUNK 2 (_id: 6ad4b2e8c9c1e1b88fa30a53, Page 52):');
  console.log('       [RENAME SCHEME]: "MSME SAMBANDH (Public Procurement Policy Monitoring)"');
  console.log('                    -> "Raising and Accelerating MSME Performance (RAMP)"');
  console.log('       [RENAME SECTION]: "Objective" -> "Key Benefits & Target Beneficiaries"');
  console.log('   - CHUNK 3 (_id: 6ad4b2e8c9c1e1b88fa30a54, Page 52):');
  console.log('       [RENAME SCHEME]: "MSME SAMBANDH (Public Procurement Policy Monitoring)"');
  console.log('                    -> "Raising and Accelerating MSME Performance (RAMP)"');
  console.log('       [RENAME SECTION]: "Overview" -> "Implementation & Scope"');

  console.log('\nSummary Diff Counts:');
  console.log('  Chunks Added:   0');
  console.log('  Chunks Removed: 0');
  console.log('  Chunks Renamed: 5 (2 on page 51, 3 on page 52)');

  process.exit(0);
}

main().catch(console.error);
