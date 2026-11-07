import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
import { config } from '../server/src/config/index.js';

function normalize(str: string): string {
  return str.toLowerCase().replace(/[\s\r\n\t]+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

async function extractAllPdfPages() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages: Array<{ pageNumber: number; rawText: string; normText: string }> = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const str = tc.items.map((i: any) => i.str).join(' ');
    pages.push({
      pageNumber: p,
      rawText: str,
      normText: normalize(str)
    });
  }
  return pages;
}

// Find matching pages for a chunk text by testing multiple 6-word window phrases
function findMatchingPages(bodyText: string, pdfPages: Array<{ pageNumber: number; normText: string }>): { appearsOn: number[]; confidence: number } {
  const normBody = normalize(bodyText);
  const words = normBody.split(' ').filter(w => w.length > 2);
  if (words.length < 5) {
    // short text, exact match
    const matches: number[] = [];
    for (const p of pdfPages) {
      if (p.normText.includes(normBody)) matches.push(p.pageNumber);
    }
    return { appearsOn: matches, confidence: matches.length > 0 ? 1 : 0 };
  }

  // Create 6-word sliding windows
  const windowSize = 6;
  const pageHits = new Map<number, number>();
  let totalWindows = 0;

  for (let i = 0; i <= words.length - windowSize; i += 3) {
    totalWindows++;
    const windowPhrase = words.slice(i, i + windowSize).join(' ');
    for (const p of pdfPages) {
      if (p.normText.includes(windowPhrase)) {
        pageHits.set(p.pageNumber, (pageHits.get(p.pageNumber) || 0) + 1);
      }
    }
  }

  const matchingPages: number[] = [];
  let bestScore = 0;
  for (const [pageNum, hits] of pageHits.entries()) {
    const ratio = hits / totalWindows;
    if (ratio >= 0.25) { // At least 25% of word windows match
      matchingPages.push(pageNum);
      if (ratio > bestScore) bestScore = ratio;
    }
  }

  return { appearsOn: matchingPages.sort((a, b) => a - b), confidence: bestScore };
}

async function main() {
  const pdfPages = await extractAllPdfPages();

  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const chunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  let onStoredPageCount = 0;
  let onDifferentPageCount = 0;
  let notInDocCount = 0;

  const differentPageList: Array<{ _id: string; storedPage: number; actualPages: number[]; scheme: string; text: string }> = [];
  const notInDocList: Array<{ _id: string; storedPage: number; scheme: string; text: string }> = [];

  for (const c of chunks) {
    const fullText = (c.text as string) || '';
    let body = fullText;
    const doubleNewline = fullText.indexOf('\n\n');
    if (doubleNewline !== -1 && doubleNewline < 150) {
      body = fullText.slice(doubleNewline + 2).trim();
    }

    const { appearsOn, confidence } = findMatchingPages(body, pdfPages);

    if (appearsOn.includes(c.pageNumber)) {
      onStoredPageCount++;
    } else if (appearsOn.length > 0) {
      onDifferentPageCount++;
      differentPageList.push({
        _id: String(c._id),
        storedPage: c.pageNumber,
        actualPages: appearsOn,
        scheme: c.schemeName,
        text: body.slice(0, 100).replace(/\n/g, ' ')
      });
    } else {
      notInDocCount++;
      notInDocList.push({
        _id: String(c._id),
        storedPage: c.pageNumber,
        scheme: c.schemeName,
        text: body.slice(0, 100).replace(/\n/g, ' ')
      });
    }
  }

  console.log('================================================================================');
  console.log('  RESULTS: VERIFY EVERY STORED CHUNK AGAINST STORED PAGENUMBER');
  console.log('================================================================================');
  console.log(`Total Stored Chunks:                            ${chunks.length}`);
  console.log(`Text appears on STORED pageNumber:              ${onStoredPageCount} (${((onStoredPageCount / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Text appears on a DIFFERENT pageNumber:         ${onDifferentPageCount} (${((onDifferentPageCount / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Text NOT found anywhere in booklet (foreign):   ${notInDocCount} (${((notInDocCount / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Total Mismatches (different page + foreign):    ${onDifferentPageCount + notInDocCount}`);

  console.log('\n--- CHUNKS APPEARING ON DIFFERENT PAGE(S) ---');
  differentPageList.forEach(item => {
    console.log(`_id: ${item._id} | Stored: P${item.storedPage} -> Actual: [${item.actualPages.join(', ')}] | Scheme: "${item.scheme}"`);
    console.log(`  Sample: "${item.text}..."\n`);
  });

  console.log('\n--- CHUNKS NOT FOUND IN BOOKLET (FOREIGN / STALE CORPUS) ---');
  notInDocList.forEach(item => {
    console.log(`_id: ${item._id} | Stored: P${item.storedPage} | Scheme: "${item.scheme}"`);
    console.log(`  Sample: "${item.text}..."\n`);
  });

  // Save report to disk
  fs.writeFileSync('scripts/accurate-chunk-verification.json', JSON.stringify({
    totalChunks: chunks.length,
    onStoredPageCount,
    onDifferentPageCount,
    notInDocCount,
    differentPageList,
    notInDocList
  }, null, 2));
}

main().catch(console.error);
