import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
import { config } from '../server/src/config/index.js';
import { normalizeText } from './verify-all-190-normalized.js';

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

function findBestMatch(chunkNorm: string, pageNorm: string): { matchSnippet: string; diffIndex: number; chunkChar: string; pageChar: string } {
  // Find longest common prefix or best matching window
  // Try to find the start of the chunk in pageNorm
  const words = chunkNorm.split(' ').filter(w => w.length > 2);
  let bestStart = -1;

  for (let i = 0; i < words.length; i++) {
    const probe = words.slice(i, i + 3).join(' ');
    const pos = pageNorm.indexOf(probe);
    if (pos !== -1) {
      // trace back to find corresponding start in pageNorm
      const prefixWords = words.slice(0, i).join(' ');
      bestStart = Math.max(0, pos - prefixWords.length - 1);
      break;
    }
  }

  if (bestStart === -1) {
    // try 2 words
    for (let i = 0; i < words.length; i++) {
      const probe = words.slice(i, i + 2).join(' ');
      const pos = pageNorm.indexOf(probe);
      if (pos !== -1) {
        const prefixWords = words.slice(0, i).join(' ');
        bestStart = Math.max(0, pos - prefixWords.length - 1);
        break;
      }
    }
  }

  if (bestStart === -1) bestStart = 0;

  // Now compare chunkNorm and pageNorm starting around bestStart
  // Find the exact offset in chunkNorm where difference starts
  let diffIndex = -1;
  let chunkChar = '';
  let pageChar = '';

  const candidatePageSnippet = pageNorm.slice(bestStart, bestStart + chunkNorm.length + 100);

  // Character-by-character comparison from start of match
  let pIdx = bestStart;
  let cIdx = 0;

  // Align start if possible
  const firstWord = words[0];
  const firstWordPos = pageNorm.indexOf(firstWord, Math.max(0, bestStart - 50));
  if (firstWordPos !== -1) {
    pIdx = firstWordPos;
  }

  while (cIdx < chunkNorm.length && pIdx < pageNorm.length) {
    if (chunkNorm[cIdx] !== pageNorm[pIdx]) {
      diffIndex = cIdx;
      chunkChar = chunkNorm[cIdx];
      pageChar = pageNorm[pIdx];
      break;
    }
    cIdx++;
    pIdx++;
  }

  const matchSnippet = pageNorm.slice(Math.max(0, pIdx - 40), Math.min(pageNorm.length, pIdx + 80));

  return { matchSnippet, diffIndex, chunkChar, pageChar };
}

async function main() {
  const pages = await extractPagesSpatial();

  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const chunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  // The 16 target scheme chunks (non-directory) that failed normalized match on their page
  const targetPages = [10, 14, 16, 19, 22, 25, 29, 34, 39, 43, 45, 46, 47, 48, 51];

  console.log('================================================================================');
  console.log('  ANALYSIS OF THE 16 SCHEME NO-MATCH CHUNKS');
  console.log('================================================================================\n');

  let count = 0;
  for (const c of chunks) {
    if (!targetPages.includes(c.pageNumber)) continue;

    const fullText = (c.text as string) || '';
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

    const normBody = normalizeText(body);
    const pageData = pages.get(c.pageNumber)!;

    // Check if it really fails normalized match
    if (pageData.normText.includes(normBody)) {
      continue; // matched
    }

    count++;
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[#${count}] CHUNK _id: ${c._id} | Page: ${c.pageNumber}`);
    console.log(`Scheme: "${c.schemeName}" | Section: "${c.sectionTitle}"`);
    console.log(`--------------------------------------------------------------------------------`);

    const { matchSnippet, diffIndex, chunkChar, pageChar } = findBestMatch(normBody, pageData.normText);

    console.log(`NORMALIZED CHUNK BODY (First 200 chars):`);
    console.log(`"${normBody.slice(0, 200)}..."\n`);

    console.log(`BEST-MATCHING NORMALIZED PAGE TEXT REGION:`);
    console.log(`"...${matchSnippet}..."\n`);

    console.log(`FIRST POINT OF DIFFERENCE:`);
    console.log(`  Offset in chunk: char ${diffIndex}`);
    console.log(`  Chunk has:       ${JSON.stringify(chunkChar)} (context: "${normBody.slice(Math.max(0, diffIndex - 20), diffIndex + 20)}")`);
    console.log(`  Page has:        ${JSON.stringify(pageChar)}`);

    // Specific explanation of cause
    let cause = '';
    if (normBody.includes('|') || normBody.includes('category (including')) {
      cause = 'Markdown table pipe delimiters ("|") added during curation that do not exist in raw PDF';
    } else if (c.pageNumber === 19) {
      cause = 'Chunk body combines text from separate columns on page 19 ("Mahila Coir Yojana")';
    } else if (normBody.includes('detailed information:')) {
      cause = 'Inserted label/heading "detailed information:" not present in PDF line stream at that location';
    } else if (c.pageNumber === 48) {
      cause = 'Multi-column financial matrix formatted with custom dashes and currency indicators';
    } else if (c.pageNumber === 51) {
      cause = 'Table key-value columns interleaved or reordered into linear text';
    } else {
      cause = 'Formatting/token difference between curated chunk text and PDF spatial extraction';
    }
    console.log(`WHY IT FAILS: ${cause}\n`);
  }

  console.log(`Total scheme no-match chunks analyzed: ${count}`);
}

main().catch(console.error);
