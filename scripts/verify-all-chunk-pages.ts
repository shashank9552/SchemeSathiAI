import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
import { config } from '../server/src/config/index.js';

async function extractAllPdfPages() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages: Array<{ pageNumber: number; text: string; normText: string }> = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const str = tc.items.map((i: any) => i.str).join(' ');
    pages.push({
      pageNumber: p,
      text: str,
      normText: normalize(str)
    });
  }
  return pages;
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[\s\r\n\t]+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

async function main() {
  console.log('Extracting PDF pages...');
  const pdfPages = await extractAllPdfPages();
  console.log(`Extracted ${pdfPages.length} PDF pages.`);

  console.log('Fetching Atlas chunks...');
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.MONGODB_DB_NAME);
  const coll = db.collection(config.MONGODB_COLLECTION_NAME);
  const chunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  console.log(`Fetched ${chunks.length} chunks from Atlas.\n`);

  let matchOnStoredPage = 0;
  let matchOnOtherPage = 0;
  let notFoundInDoc = 0;

  interface MismatchDetail {
    _id: string;
    storedPage: number;
    foundPages: number[];
    schemeName: string;
    sectionTitle: string;
    bodySample: string;
  }

  const mismatches: MismatchDetail[] = [];

  for (const c of chunks) {
    const fullText = (c.text as string) || '';
    // Strip header prefix
    let bodyText = fullText;
    const doubleNewline = fullText.indexOf('\n\n');
    if (doubleNewline !== -1 && doubleNewline < 150) {
      bodyText = fullText.slice(doubleNewline + 2).trim();
    }

    // Extract a distinctive slice of words (e.g. 15 words)
    const words = bodyText.split(/\s+/).filter(w => w.length > 2);
    const probeWords = words.slice(0, 15).join(' ');
    const probeNorm = normalize(probeWords);

    if (!probeNorm) {
      console.log(`Warning: empty probe for chunk ${c._id}`);
      continue;
    }

    const storedPageObj = pdfPages.find(p => p.pageNumber === c.pageNumber);
    if (storedPageObj && storedPageObj.normText.includes(probeNorm)) {
      matchOnStoredPage++;
    } else {
      // Find on which page it actually appears
      const foundOn: number[] = [];
      for (const p of pdfPages) {
        if (p.normText.includes(probeNorm)) {
          foundOn.push(p.pageNumber);
        }
      }

      if (foundOn.length > 0) {
        matchOnOtherPage++;
      } else {
        notFoundInDoc++;
      }

      mismatches.push({
        _id: String(c._id),
        storedPage: c.pageNumber,
        foundPages: foundOn,
        schemeName: c.schemeName,
        sectionTitle: c.sectionTitle,
        bodySample: bodyText.slice(0, 80).replace(/\n/g, ' ')
      });
    }
  }

  console.log('================================================================================');
  console.log('  CHUNK PAGENUMBER ACCURACY SUMMARY');
  console.log('================================================================================');
  console.log(`Total Stored Chunks:                     ${chunks.length}`);
  console.log(`Body appears on stored pageNumber:       ${matchOnStoredPage} (${((matchOnStoredPage / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Body appears on a DIFFERENT pageNumber:  ${matchOnOtherPage} (${((matchOnOtherPage / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Body text NOT found anywhere in booklet: ${notFoundInDoc} (${((notFoundInDoc / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Total Mismatches:                        ${mismatches.length}\n`);

  console.log('--- ALL MISMATCHED CHUNKS ---');
  for (const m of mismatches) {
    const status = m.foundPages.length === 0 ? 'NOT FOUND IN BOOKLET (STALE/FOREIGN)' : `FOUND ON PAGE(S): [${m.foundPages.join(', ')}]`;
    console.log(`_id: ${m._id} | Stored: P${m.storedPage} -> ${status}`);
    console.log(`  Scheme: "${m.schemeName}" | Section: "${m.sectionTitle}"`);
    console.log(`  Sample: "${m.bodySample}..."\n`);
  }
}

main().catch(console.error);
