import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';

async function extractAllPages(): Promise<Array<{ pageNumber: number; text: string; lines: string[] }>> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;
  const numPages = doc.numPages;

  const pages: Array<{ pageNumber: number; text: string; lines: string[] }> = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
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
    pages.push({ pageNumber: pageNum, text: lines.join('\n'), lines });
  }

  return pages;
}

function normalizeText(str: string): string {
  return str.toLowerCase().replace(/[\s\r\n\t]+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

async function main() {
  console.log('Extracting all pages from PDF...');
  const pdfPages = await extractAllPages();
  console.log(`Extracted ${pdfPages.length} pages.\n`);

  // --- TASK A1: Full text of PDF pages 2 and 4 ---
  console.log('================================================================================');
  console.log('  TASK A.1: FULL TEXT OF PDF PAGES 2 AND 4');
  console.log('================================================================================\n');

  const p2 = pdfPages.find(p => p.pageNumber === 2)!;
  console.log('--- PDF PAGE 2 FULL TEXT ---');
  console.log(p2.text);
  console.log('\n--- PDF PAGE 2 LINE COUNT: ' + p2.lines.length + ' ---\n');

  const p4 = pdfPages.find(p => p.pageNumber === 4)!;
  console.log('--- PDF PAGE 4 FULL TEXT ---');
  console.log(p4.text);
  console.log('\n--- PDF PAGE 4 LINE COUNT: ' + p4.lines.length + ' ---\n');

  // Check which page contains "vibrant and dynamic sector"
  console.log('--- SEARCH FOR "vibrant and dynamic sector" ---');
  const targetPhrase = 'vibrant and dynamic sector';
  for (const p of pdfPages) {
    if (p.text.toLowerCase().includes(targetPhrase)) {
      console.log(`FOUND on PDF Page ${p.pageNumber}:`);
      const matchedLines = p.lines.filter(l => l.toLowerCase().includes(targetPhrase));
      matchedLines.forEach(l => console.log(`  Line: "${l}"`));
    }
  }

  // --- TASK A2: Compare every stored chunk against stored pageNumber ---
  console.log('\n================================================================================');
  console.log('  TASK A.2: VERIFY EVERY STORED CHUNK AGAINST STORED PAGENUMBER');
  console.log('================================================================================\n');

  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const storedChunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  console.log(`Fetched ${storedChunks.length} chunks from Atlas.\n`);

  interface MismatchReport {
    chunkId: string;
    storedPageNumber: number;
    actualPageNumbers: number[];
    schemeName: string;
    sectionTitle: string;
    textSnippet: string;
  }

  const mismatches: MismatchReport[] = [];
  let exactMatchCount = 0;

  for (const chunk of storedChunks) {
    const rawChunkText = (chunk.text as string) || '';
    // Strip scheme/section prefix if present: "Scheme - Section: Text" or "Scheme - Section\nText"
    let cleanText = rawChunkText;
    const colonIdx = cleanText.indexOf(':');
    if (colonIdx !== -1 && colonIdx < 120) {
      // test whether text after colon is substantial
      const after = cleanText.slice(colonIdx + 1).trim();
      if (after.length > 50) cleanText = after;
    }

    // Take a distinctive 60-character phrase from chunk
    const words = cleanText.split(/\s+/).filter(w => w.length > 2);
    const probeWords = words.slice(0, 10).join(' ');
    const probeNorm = normalizeText(probeWords);

    const storedPage = pdfPages.find(p => p.pageNumber === chunk.pageNumber);
    const appearsOnStored = storedPage ? normalizeText(storedPage.text).includes(probeNorm) : false;

    if (appearsOnStored) {
      exactMatchCount++;
    } else {
      // Find where it actually appears
      const foundPages: number[] = [];
      for (const p of pdfPages) {
        if (normalizeText(p.text).includes(probeNorm)) {
          foundPages.push(p.pageNumber);
        }
      }
      mismatches.push({
        chunkId: String(chunk._id),
        storedPageNumber: chunk.pageNumber,
        actualPageNumbers: foundPages,
        schemeName: chunk.schemeName,
        sectionTitle: chunk.sectionTitle,
        textSnippet: cleanText.slice(0, 100).replace(/\n/g, ' ')
      });
    }
  }

  console.log(`Total Stored Chunks: ${storedChunks.length}`);
  console.log(`Appears on Stored Page: ${exactMatchCount}`);
  console.log(`Page Number Mismatches: ${mismatches.length}\n`);

  console.log('Sample Mismatches (first 25):');
  mismatches.slice(0, 25).forEach((m, idx) => {
    console.log(`[${idx + 1}] _id: ${m.chunkId}`);
    console.log(`    Stored Page: ${m.storedPageNumber} | Actual Page(s): [${m.actualPageNumbers.join(', ')}]`);
    console.log(`    Scheme: "${m.schemeName}" | Section: "${m.sectionTitle}"`);
    console.log(`    Snippet: "${m.textSnippet}..."\n`);
  });

  // Save full mismatch report to disk
  fs.writeFileSync('scripts/chunk-page-mismatches.json', JSON.stringify({
    totalChunks: storedChunks.length,
    matchedCount: exactMatchCount,
    mismatchCount: mismatches.length,
    mismatches
  }, null, 2));

  // --- TASK B: For every start page of every scheme in outline, print first 5 lines ---
  console.log('\n================================================================================');
  console.log('  TASK B: FIRST 5 LINES OF EVERY SCHEME START PAGE');
  console.log('================================================================================\n');

  const draftOutline = JSON.parse(fs.readFileSync('data/outline.draft.json', 'utf8'));

  for (const entry of draftOutline) {
    const page = pdfPages.find(p => p.pageNumber === entry.startPage);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Scheme: "${entry.schemeName}" (Pages ${entry.startPage} - ${entry.endPage})`);
    console.log(`Start Page: PDF ${entry.startPage} (Printed: ${entry.startPage - 2})`);
    if (!page) {
      console.log(`  [ERROR] Page ${entry.startPage} not found!`);
      continue;
    }

    const first5 = page.lines.slice(0, 5);
    console.log(`  First 5 lines:`);
    first5.forEach((l, i) => console.log(`    [${i + 1}] ${l}`));

    const normScheme = normalizeText(entry.schemeName);
    const normSub = entry.subScheme ? normalizeText(entry.subScheme) : '';
    const first5Norm = normalizeText(first5.join(' '));

    const titleInFirst5 = (normScheme && first5Norm.includes(normScheme.slice(0, 20))) ||
                          (normSub && first5Norm.includes(normSub.slice(0, 20))) ||
                          first5.some(l => l.toUpperCase().includes(entry.schemeName.toUpperCase().slice(0, 15)));

    // Check if line 1 starts with lowercase, bullet, or table continuation
    const line1 = first5[0] || '';
    const startsMidSentence = /^[a-z,;]/.test(line1);
    const startsMidTable = /^[0-9]+\s+[A-Z]/.test(line1) || /^•/.test(line1) || /^(Particulars|Details|INR|Rs\.)/i.test(line1);

    console.log(`  Title in first 5 lines? ${titleInFirst5 ? 'YES' : 'NO'}`);
    if (startsMidSentence) console.log(`  [FLAG] Starts mid-sentence: "${line1}"`);
    if (startsMidTable) console.log(`  [FLAG] Starts with bullet or table item: "${line1}"`);
    console.log('');
  }
}

main().catch(console.error);
