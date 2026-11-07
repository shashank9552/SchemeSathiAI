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

async function extractAllSpatiallyReconstructedPages() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages: Array<{ pageNumber: number; text: string; normText: string }> = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    const items = tc.items as Array<{ str: string; transform: number[] }>;

    const linesMap = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of items) {
      if (!item.str || item.str.trim() === '') continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let foundY: number | null = null;
      for (const lineY of linesMap.keys()) {
        if (Math.abs(lineY - y) <= 3.0) {
          foundY = lineY;
          break;
        }
      }
      if (foundY !== null) {
        linesMap.get(foundY)!.push({ x, text: item.str });
      } else {
        linesMap.set(y, [{ x, text: item.str }]);
      }
    }

    const sortedYKeys = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of sortedYKeys) {
      const lineItems = linesMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((item) => item.text).join(' ').trim();
      if (lineText) lines.push(lineText);
    }
    const pageText = lines.join('\n');
    pages.push({
      pageNumber: pageNum,
      text: pageText,
      normText: normalize(pageText)
    });
  }
  return pages;
}

async function main() {
  const pdfPages = await extractAllSpatiallyReconstructedPages();

  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const chunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  let onStoredPage = 0;
  let onDifferentPage = 0;
  let notInBooklet = 0;

  const mismatches: any[] = [];

  for (const c of chunks) {
    const fullText = (c.text as string) || '';
    let body = fullText;
    const doubleNewline = fullText.indexOf('\n\n');
    if (doubleNewline !== -1 && doubleNewline < 150) {
      body = fullText.slice(doubleNewline + 2).trim();
    }

    // Try multiple search strategies:
    // 1. Take a 8-word slice from the start of body
    // 2. Take a 8-word slice from middle of body
    const words = normalize(body).split(' ').filter(w => w.length > 1);
    const probe1 = words.slice(0, 7).join(' ');
    const probe2 = words.length > 15 ? words.slice(8, 15).join(' ') : '';
    const probe3 = words.length > 25 ? words.slice(16, 23).join(' ') : '';

    const storedPage = pdfPages.find(p => p.pageNumber === c.pageNumber);
    const foundOnStored = storedPage && (
      (probe1 && storedPage.normText.includes(probe1)) ||
      (probe2 && storedPage.normText.includes(probe2)) ||
      (probe3 && storedPage.normText.includes(probe3))
    );

    if (foundOnStored) {
      onStoredPage++;
    } else {
      // Search all other pages
      const foundPages: number[] = [];
      for (const p of pdfPages) {
        if (
          (probe1 && p.normText.includes(probe1)) ||
          (probe2 && p.normText.includes(probe2)) ||
          (probe3 && p.normText.includes(probe3))
        ) {
          foundPages.push(p.pageNumber);
        }
      }

      if (foundPages.length > 0) {
        onDifferentPage++;
        mismatches.push({
          type: 'DIFFERENT_PAGE',
          _id: String(c._id),
          storedPage: c.pageNumber,
          actualPages: foundPages,
          scheme: c.schemeName,
          section: c.sectionTitle,
          sample: body.slice(0, 90).replace(/\n/g, ' ')
        });
      } else {
        notInBooklet++;
        mismatches.push({
          type: 'NOT_IN_BOOKLET',
          _id: String(c._id),
          storedPage: c.pageNumber,
          actualPages: [],
          scheme: c.schemeName,
          section: c.sectionTitle,
          sample: body.slice(0, 90).replace(/\n/g, ' ')
        });
      }
    }
  }

  console.log('================================================================================');
  console.log('  SPATIAL ALIGNED CHUNK vs PAGENUMBER VERIFICATION');
  console.log('================================================================================');
  console.log(`Total Stored Chunks:                            ${chunks.length}`);
  console.log(`Text appears on STORED pageNumber:              ${onStoredPage} (${((onStoredPage / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Text appears on a DIFFERENT pageNumber:         ${onDifferentPage} (${((onDifferentPage / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Text NOT found anywhere in booklet (foreign):   ${notInBooklet} (${((notInBooklet / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Total Mismatches:                               ${mismatches.length}\n`);

  console.log('--- BREAKDOWN OF MISMATCHES ---');
  mismatches.forEach(m => {
    console.log(`[${m.type}] _id: ${m._id} | Stored: P${m.storedPage} | Actual: [${m.actualPages.join(', ')}] | Scheme: "${m.scheme}"`);
    console.log(`  Sample: "${m.sample}..."\n`);
  });

  fs.writeFileSync('scripts/spatial-chunk-verification.json', JSON.stringify({
    total: chunks.length,
    onStoredPage,
    onDifferentPage,
    notInBooklet,
    mismatches
  }, null, 2));
}

main().catch(console.error);
