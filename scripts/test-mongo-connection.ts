import dotenv from 'dotenv';
import path from 'node:path';
import { MongoClient } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI;
console.log('Testing MongoDB URI:', uri ? uri.replace(/:([^@]+)@/, ':****@') : 'NONE');

async function testConn(name: string, options: any) {
  console.log(`\n--- Test: ${name} ---`);
  const client = new MongoClient(uri!, options);
  try {
    await client.connect();
    console.log(`SUCCESS with ${name}!`);
    const db = client.db('schemesathi');
    const count = await db.collection('scheme_chunks').countDocuments();
    console.log(`Document count: ${count}`);
    await client.close();
    return true;
  } catch (err: any) {
    console.error(`FAILED with ${name}:`, err.message);
    if (err.cause) console.error('Cause:', err.cause.message);
    return false;
  }
}

async function main() {
  if (!uri) return;
  await testConn('Default options', { serverSelectionTimeoutMS: 5000 });
  await testConn('With family: 4', { serverSelectionTimeoutMS: 5000, family: 4 });
  await testConn('With tlsInsecure: true', { serverSelectionTimeoutMS: 5000, tlsInsecure: true });
}

main().catch(console.error);
