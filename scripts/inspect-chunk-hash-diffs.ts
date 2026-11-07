import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { TextCleaner, DocumentPageText } from '../server/src/ingestion/cleaner.js';
import { DocumentChunker, PageContent, DocumentInfo } from '../server/src/ingestion/chunker.js';

function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function extractPages() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const rawPages: DocumentPageText[] = [];
  const validPages: PageContent[] = [];

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
    const reconstructedLines: string[] = [];
    for (const y of sortedYKeys) {
      const lineItems = linesMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((item) => item.text).join(' ').trim();
      if (lineText) reconstructedLines.push(lineText);
    }
    const pageText = reconstructedLines.join('\n');
    rawPages.push({ pageNumber: pageNum, rawText: pageText, lines: reconstructedLines });
    validPages.push({ pageNumber: pageNum, text: pageText });
  }

  const repeating = TextCleaner.findRepeatingHeaderFooters(rawPages);
  return validPages.map((vp) => {
    const rawObj = rawPages.find((rp) => rp.pageNumber === vp.pageNumber)!;
    return {
      pageNumber: vp.pageNumber,
      text: TextCleaner.cleanPageText(rawObj, repeating),
    };
  });
}

async function main() {
  const cleanedPages = await extractPages();
  const rawOutline = JSON.parse(fs.readFileSync('data/outline.review.json', 'utf8'));

  const flatOutline: any[] = [];
  for (const entry of rawOutline) {
    if (entry.index === false) continue;
    if (entry.subSchemes && entry.subSchemes.length > 0) {
      const minSubStart = Math.min(...entry.subSchemes.map((s: any) => s.startPage));
      if (minSubStart > entry.startPage) {
        flatOutline.push({
          schemeName: entry.schemeName,
          startPage: entry.startPage,
          endPage: minSubStart - 1
        });
      }
      for (const sub of entry.subSchemes) {
        flatOutline.push({
          schemeName: entry.schemeName,
          subScheme: sub.subScheme,
          startPage: sub.startPage,
          endPage: sub.endPage
        });
      }
    } else {
      flatOutline.push({
        schemeName: entry.schemeName,
        startPage: entry.startPage,
        endPage: entry.endPage
      });
    }
  }

  const chunker = new DocumentChunker();
  const docInfo: DocumentInfo = {
    sourceFile: 'MSMESchemebooklet2025-26.pdf',
    documentTitle: 'Ministry of MSME Scheme Booklet 2025-26',
    defaultSchemeName: 'Ministry of MSME Overview',
    category: 'Business, MSME & Entrepreneurship',
    level: 'central',
    language: 'en',
    outline: flatOutline
  };

  const indexedPageNumbers = new Set<number>();
  for (const entry of rawOutline) {
    if (entry.index !== false) {
      for (let p = entry.startPage; p <= entry.endPage; p++) indexedPageNumbers.add(p);
    }
  }

  const pagesToChunk = cleanedPages.filter(p => indexedPageNumbers.has(p.pageNumber));
  const newChunks = chunker.chunkDocument(pagesToChunk, docInfo);
  const oldChunks: any[] = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

  for (const pageNum of [5, 9, 59]) {
    console.log(`================================================================================`);
    console.log(`PAGE ${pageNum}: COMPARING OLD vs NEW CHUNKS`);
    console.log(`================================================================================`);
    const pageOld = oldChunks.filter(c => c.pageNumber === pageNum);
    const pageNew = newChunks.filter(c => c.metadata.pageNumber === pageNum);

    console.log(`Old Chunk Count: ${pageOld.length} | New Chunk Count: ${pageNew.length}\n`);

    // Compare first 2 chunks on this page
    const compareCount = Math.min(2, pageOld.length, pageNew.length);
    for (let i = 0; i < compareCount; i++) {
      const oc = pageOld[i];
      const nc = pageNew[i];
      const oldHash = sha256(oc.text);
      const newHash = sha256(nc.text);

      console.log(`--- [PAGE ${pageNum} | CHUNK ${i + 1}] ---`);
      console.log(`OLD _id: ${oc._id || 'local'} | Scheme: "${oc.schemeName}" | Section: "${oc.sectionTitle}"`);
      console.log(`OLD SHA-256: ${oldHash}`);
      console.log(`OLD TEXT:\n${JSON.stringify(oc.text)}\n`);

      console.log(`NEW Scheme: "${nc.metadata.schemeName}" | Section: "${nc.metadata.sectionTitle}"`);
      console.log(`NEW SHA-256: ${newHash}`);
      console.log(`NEW TEXT:\n${JSON.stringify(nc.text)}\n`);

      console.log(`WHY HASHES DIFFER:`);
      if (oc.schemeName !== nc.metadata.schemeName) {
        console.log(`  - Scheme name mismatch: "${oc.schemeName}" vs "${nc.metadata.schemeName}"`);
      }
      if (oc.sectionTitle !== nc.metadata.sectionTitle) {
        console.log(`  - Section title mismatch: "${oc.sectionTitle}" vs "${nc.metadata.sectionTitle}"`);
      }
      if (oc.text !== nc.text) {
        console.log(`  - Body text formatting / chunk boundary difference:`);
        console.log(`    Old length: ${oc.text.length} chars | New length: ${nc.text.length} chars`);
      }
      console.log('');
    }
  }
}

main().catch(console.error);
