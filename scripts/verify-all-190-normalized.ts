import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
import { config } from '../server/src/config/index.js';

// Normalization function as specified by user:
// 1. strip heading line (done in caller)
// 2. collapse whitespace
// 3. remove bullet characters
// 4. join hyphenated line breaks
// 5. unify quotes
export function normalizeText(str: string): string {
  return str
    .replace(/[•\u2022\u25cf\u25cb\u25aa\u25ab\u2023\u2043\u204c\u204d\u2219]/g, ' ') // remove bullet characters
    .replace(/(\w+)-\s+(\w+)/g, '$1$2') // join hyphenated line breaks / words
    .replace(/[\u2018\u2019\u201a\u201b']/g, "'") // unify single quotes
    .replace(/[\u201c\u201d\u201e\u201f"]/g, '"') // unify double quotes
    .replace(/[\s\r\n\t]+/g, ' ') // collapse whitespace
    .trim()
    .toLowerCase();
}

async function extractPagesSpatial() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages = new Map<number, { rawText: string; normText: string }>();

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
    pages.set(pageNum, {
      rawText: pageText,
      normText: normalizeText(pageText)
    });
  }
  return pages;
}

async function main() {
  const pages = await extractPagesSpatial();

  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const chunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  let exactMatchCount = 0;
  let normalizedMatchCount = 0;
  let noMatchCount = 0;

  interface NoMatchItem {
    _id: string;
    page: number;
    scheme: string;
    section: string;
    first120: string;
  }

  const noMatchList: NoMatchItem[] = [];

  for (const c of chunks) {
    const fullText = (c.text as string) || '';
    // Strip heading line
    let body = fullText;
    const doubleNewline = fullText.indexOf('\n\n');
    if (doubleNewline !== -1 && doubleNewline < 150) {
      body = fullText.slice(doubleNewline + 2).trim();
    } else {
      const firstLineEnd = fullText.indexOf('\n');
      if (firstLineEnd !== -1 && firstLineEnd < 150) {
        body = fullText.slice(firstLineEnd + 1).trim();
      }
    }

    const pageData = pages.get(c.pageNumber);
    if (!pageData) {
      noMatchCount++;
      noMatchList.push({
        _id: String(c._id),
        page: c.pageNumber,
        scheme: c.schemeName,
        section: c.sectionTitle,
        first120: body.slice(0, 120).replace(/[\s\r\n\t]+/g, ' ')
      });
      continue;
    }

    // 1. Exact match test
    if (pageData.rawText.includes(body)) {
      exactMatchCount++;
    } else {
      // 2. Normalized match test
      const normBody = normalizeText(body);
      if (pageData.normText.includes(normBody)) {
        normalizedMatchCount++;
      } else {
        noMatchCount++;
        noMatchList.push({
          _id: String(c._id),
          page: c.pageNumber,
          scheme: c.schemeName,
          section: c.sectionTitle,
          first120: body.slice(0, 120).replace(/[\s\r\n\t]+/g, ' ')
        });
      }
    }
  }

  console.log('================================================================================');
  console.log('  190 CHUNKS VS STORED PAGE NORMALIZED VERIFICATION (RUN ONCE)');
  console.log('================================================================================');
  console.log(`Total Stored Chunks:      ${chunks.length}`);
  console.log(`Exact Matches:            ${exactMatchCount} (${((exactMatchCount / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Normalized Matches:       ${normalizedMatchCount} (${((normalizedMatchCount / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`Total Matches on Page:    ${exactMatchCount + normalizedMatchCount} (${(((exactMatchCount + normalizedMatchCount) / chunks.length) * 100).toFixed(1)}%)`);
  console.log(`No Match:                 ${noMatchCount} (${((noMatchCount / chunks.length) * 100).toFixed(1)}%)\n`);

  console.log('================================================================================');
  console.log(`  LIST OF NO-MATCH CHUNKS (${noMatchList.length} TOTAL)`);
  console.log('================================================================================');
  noMatchList.forEach((item, idx) => {
    console.log(`[${idx + 1}] _id: ${item._id} | Page: ${item.page} | Scheme: "${item.scheme}" | Section: "${item.section}"`);
    console.log(`    First 120: "${item.first120}"\n`);
  });

  fs.writeFileSync('scripts/run-once-a3-results.json', JSON.stringify({
    total: chunks.length,
    exactMatchCount,
    normalizedMatchCount,
    totalMatchesOnPage: exactMatchCount + normalizedMatchCount,
    noMatchCount,
    noMatchList
  }, null, 2));
}

main().catch(console.error);
