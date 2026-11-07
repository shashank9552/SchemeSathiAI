import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('Searching in data/ ...');
  const files = fs.readdirSync('data', { recursive: true }) as string[];
  for (const f of files) {
    const fullPath = path.join('data', f);
    if (!fs.statSync(fullPath).isFile()) continue;
    if (fullPath.endsWith('.pdf')) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes('vibrant and dynamic') || content.toLowerCase().includes('vibrant & dynamic')) {
        console.log(`Found in file: ${fullPath}`);
      }
    } catch {}
  }

  console.log('Searching in Atlas chunks...');
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const coll = client.db().collection('scheme_chunks');
  const docs = await coll.find({
    $or: [
      { text: { $regex: /vibrant and dynamic/i } },
      { text: { $regex: /vibrant & dynamic/i } },
      { pageNumber: 4 }
    ]
  }).toArray();
  console.log(`Found ${docs.length} matching docs in Atlas.`);
  for (const d of docs) {
    console.log(`_id: ${d._id}, pageNumber: ${d.pageNumber}, scheme: "${d.schemeName}", section: "${d.sectionTitle}"`);
    console.log(`text: ${d.text.slice(0, 300)}\n`);
  }
  await client.close();
}

main().catch(console.error);
