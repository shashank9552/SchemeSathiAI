import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { MongoClient } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

interface QuestionItem {
  id: string;
  category: 'answerable' | 'unanswerable';
  subCategory?: string;
  language: 'en' | 'hi';
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
  note?: string;
}

interface AtlasChunk {
  _id: any;
  id?: string;
  schemeName: string;
  sectionTitle: string;
  pageNumber: number;
  text: string;
}

/**
 * Strips the prepended "${schemeName} - ${sectionTitle}" header line from chunk text.
 */
function stripPrefix(chunk: AtlasChunk): string {
  if (!chunk.text) return '';
  if (chunk.schemeName && chunk.sectionTitle) {
    const prefix = `${chunk.schemeName} - ${chunk.sectionTitle}`;
    if (chunk.text.startsWith(prefix)) {
      return chunk.text.slice(prefix.length).replace(/^[\r\n]+/, '');
    }
  }
  const firstNewline = chunk.text.indexOf('\n');
  if (firstNewline !== -1) {
    const firstLine = chunk.text.slice(0, firstNewline);
    if (firstLine.includes(' - ')) {
      return chunk.text.slice(firstNewline).replace(/^[\r\n]+/, '');
    }
  }
  return chunk.text;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment.');
  }

  const jsonPath = path.resolve('scripts/eval/natural-questions.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Evaluation file not found: ${jsonPath}`);
  }

  const questions: QuestionItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log('================================================================================');
  console.log('  VERIFY EVAL PHRASES AGAINST MONGODB ATLAS (STRIPPED BODY TEXT)');
  console.log(`  Questions file: ${jsonPath} (${questions.length} total questions)`);
  console.log('================================================================================\n');

  console.log('Connecting to MongoDB Atlas...');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'schemesathi');
  const collection = db.collection<AtlasChunk>(process.env.MONGODB_COLLECTION_NAME || 'scheme_chunks');

  const atlasChunks = await collection.find({}).toArray();
  await client.close();
  console.log(`Retrieved ${atlasChunks.length} chunks from Atlas.\n`);

  let passCount = 0;
  let failCount = 0;
  let skippedUnanswerable = 0;

  for (const q of questions) {
    if (q.category !== 'answerable') {
      skippedUnanswerable++;
      continue;
    }

    if (!q.expectedPhrase || q.expectedPhrase.trim() === '') {
      console.error(`❌ [${q.id}] FAIL: Missing expectedPhrase`);
      failCount++;
      continue;
    }

    if (!q.expectedPage) {
      console.error(`❌ [${q.id}] FAIL: Missing expectedPage`);
      failCount++;
      continue;
    }

    // Require match strictly on expectedPage, ignoring table-of-contents pages 3 and 4
    const pageChunks = atlasChunks.filter(
      (c) => c.pageNumber === q.expectedPage && c.pageNumber !== 3 && c.pageNumber !== 4
    );

    if (pageChunks.length === 0) {
      console.error(`❌ [${q.id}] FAIL: No valid chunks found on expectedPage ${q.expectedPage} (ignoring TOC pages 3 & 4)`);
      failCount++;
      continue;
    }

    const matchingChunks = pageChunks.filter((c) => {
      const body = stripPrefix(c);
      return body.includes(q.expectedPhrase!);
    });

    if (matchingChunks.length === 0) {
      console.error(`❌ [${q.id}] FAIL: expectedPhrase not found in stripped body on expectedPage ${q.expectedPage}`);
      console.error(`   Phrase: "${q.expectedPhrase}"`);
      failCount++;
    } else {
      console.log(
        `✅ [${q.id}] PASS: Found in ${matchingChunks.length} chunk(s) on PDF page ${q.expectedPage} | phrase: "${q.expectedPhrase}"`
      );
      passCount++;
    }
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log(`Summary: ${passCount} PASSED, ${failCount} FAILED, ${skippedUnanswerable} UNANSWERABLE SKIPPED.`);
  console.log('--------------------------------------------------------------------------------\n');

  if (failCount > 0) {
    console.error(`Verification FAILED with ${failCount} errors.`);
    process.exit(1);
  } else {
    console.log('All answerable expectedPhrases strictly verified against Atlas chunk body text!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
