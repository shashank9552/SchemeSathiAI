import path from 'node:path';
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { config } from '../server/src/config/index.js';

async function main() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const doc = await coll.findOne({ _id: new ObjectId('6ad4b2e8c9c1e1b88fa30a83') });
  await client.close();

  if (!doc) {
    console.log('Doc not found in Atlas');
    return;
  }

  console.log('Atlas Chunk a83:');
  console.log('Text:', JSON.stringify(doc.text));

  // Check character codes
  for (let i = 0; i < doc.text.length; i++) {
    const code = doc.text.charCodeAt(i);
    if (code >= 0x0400 && code <= 0x04FF) {
      console.log(`Cyrillic character found at pos ${i}: "${doc.text[i]}" (U+${code.toString(16)})`);
    } else if (code > 127 && (code < 0x0900 || code > 0x097F) && (code < 0x2000 || code > 0x20CF)) {
      console.log(`Non-standard character at pos ${i}: "${doc.text[i]}" (U+${code.toString(16)})`);
    }
  }
}

main().catch(console.error);
