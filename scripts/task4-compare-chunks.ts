import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
import { config } from '../server/src/config/index.js';

function collapseWhitespace(str: string): string {
  return str.replace(/[\s\r\n\t]+/g, ' ').trim();
}

function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[\s\r\n\t]+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

async function extractPages() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages = new Map<number, { raw: string; collapsed: string; norm: string }>();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const str = tc.items.map((i: any) => i.str).join(' ');
    pages.set(p, {
      raw: str,
      collapsed: collapseWhitespace(str),
      norm: normalizeForSearch(str)
    });
  }
  return pages;
}

async function main() {
  const pages = await extractPages();

  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const chunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  console.log(`Fetched ${chunks.length} chunks from Atlas.`);

  interface MismatchRecord {
    _id: string;
    pageNumber: number;
    schemeName: string;
    first120: string;
    appearsOnNoPage: boolean;
    actualPagesFound: number[];
  }

  const mismatches: MismatchRecord[] = [];
  let matchedStored = 0;

  for (const c of chunks) {
    const fullText = (c.text as string) || '';
    let body = fullText;
    const doubleNewline = fullText.indexOf('\n\n');
    if (doubleNewline !== -1 && doubleNewline < 150) {
      body = fullText.slice(doubleNewline + 2).trim();
    } else {
      // try stripping `${c.schemeName} - ${c.sectionTitle}`
      const prefix = `${c.schemeName} - ${c.sectionTitle}`;
      if (body.startsWith(prefix)) {
        body = body.slice(prefix.length).trim();
      }
    }

    const collapsedBody = collapseWhitespace(body);
    const first120 = collapsedBody.slice(0, 120);
    const normBody = normalizeForSearch(body);
    
    // Distinct probe slice of 10 words
    const words = normBody.split(' ').filter(w => w.length > 2);
    const probe = words.slice(0, 10).join(' ');

    const storedPageData = pages.get(c.pageNumber);
    const matchesStored = storedPageData && (
      storedPageData.collapsed.includes(first120.slice(0, 50)) ||
      (probe && storedPageData.norm.includes(probe))
    );

    if (matchesStored) {
      matchedStored++;
    } else {
      // Check if it appears on ANY page
      const foundOn: number[] = [];
      if (probe) {
        for (const [pNum, pData] of pages.entries()) {
          if (pData.norm.includes(probe)) {
            foundOn.push(pNum);
          }
        }
      }

      mismatches.push({
        _id: String(c._id),
        pageNumber: c.pageNumber,
        schemeName: c.schemeName,
        first120,
        appearsOnNoPage: foundOn.length === 0,
        actualPagesFound: foundOn
      });
    }
  }

  console.log(`Matched on stored page: ${matchedStored} / ${chunks.length}`);
  console.log(`Mismatches: ${mismatches.length}`);
  const noPageCount = mismatches.filter(m => m.appearsOnNoPage).length;
  console.log(`Appears on NO PDF page: ${noPageCount}\n`);

  console.log('=== MISMATCH LIST ===');
  mismatches.forEach(m => {
    console.log(`Page ${m.pageNumber} | Scheme: "${m.schemeName}" | _id: ${m._id}`);
    console.log(`  First 120: "${m.first120}"`);
    if (m.appearsOnNoPage) {
      console.log(`  STATUS: APPEARS ON NO PDF PAGE (Foreign/stale text or altered table)`);
    } else {
      console.log(`  STATUS: Appears on PDF page(s) [${m.actualPagesFound.join(', ')}]`);
    }
    console.log('');
  });

  fs.writeFileSync('scripts/task4-mismatches.json', JSON.stringify({
    total: chunks.length,
    matchedStored,
    mismatchCount: mismatches.length,
    noPageCount,
    mismatches
  }, null, 2));
}

main().catch(console.error);
