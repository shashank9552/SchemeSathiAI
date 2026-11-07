import fs from 'node:fs';
import path from 'node:path';
import { TextCleaner, DocumentPageText } from '../server/src/ingestion/cleaner.js';
import { DocumentChunker, PageContent, DocumentInfo, OutlineEntry } from '../server/src/ingestion/chunker.js';

async function main() {
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

  const rawOutline = JSON.parse(fs.readFileSync('data/outline.review.json', 'utf8'));
  const flatOutline: OutlineEntry[] = [];
  for (const entry of rawOutline) {
    if (entry.index === false) continue;
    if (entry.subSchemes && entry.subSchemes.length > 0) {
      const minSubStart = Math.min(...entry.subSchemes.map((s: any) => s.startPage));
      if (minSubStart > entry.startPage) {
        flatOutline.push({ schemeName: entry.schemeName, startPage: entry.startPage, endPage: minSubStart - 1 });
      }
      for (const sub of entry.subSchemes) {
        flatOutline.push({ schemeName: entry.schemeName, subScheme: sub.subScheme, startPage: sub.startPage, endPage: sub.endPage });
      }
    } else {
      flatOutline.push({ schemeName: entry.schemeName, startPage: entry.startPage, endPage: entry.endPage });
    }
  }

  const repeating = TextCleaner.findRepeatingHeaderFooters(rawPages);
  const indexedPageNumbers = new Set<number>();
  for (const entry of rawOutline) {
    if (entry.index !== false) {
      for (let p = entry.startPage; p <= entry.endPage; p++) indexedPageNumbers.add(p);
    }
  }

  const cleanedPages: PageContent[] = validPages
    .filter(p => indexedPageNumbers.has(p.pageNumber))
    .map((vp) => {
      const rawObj = rawPages.find((rp) => rp.pageNumber === vp.pageNumber)!;
      return {
        pageNumber: vp.pageNumber,
        text: TextCleaner.cleanPageText(rawObj, repeating),
      };
    });

  const chunker = new DocumentChunker();
  const docInfo: DocumentInfo = {
    sourceFile: 'MSMESchemebooklet2025-26.pdf',
    documentTitle: 'Ministry of MSME Scheme Booklet 2025-26',
    defaultSchemeName: 'Ministry of MSME Scheme Booklet 2025-26',
    category: 'Business, MSME & Entrepreneurship',
    level: 'central',
    language: 'en',
    outline: flatOutline
  };

  const chunks = chunker.chunkDocument(cleanedPages, docInfo);

  console.log(`Scanning ${chunks.length} chunks for spacing glitches...`);

  const numPattern = /\d\.\s+\d{2}\b/g;
  const urlPattern = /\w\.\s+(msme|gov|in)\b/gi;

  const numHits: Array<{ page: number; chunkIdx: number; match: string; context: string }> = [];
  const urlHits: Array<{ page: number; chunkIdx: number; match: string; context: string }> = [];

  chunks.forEach((c) => {
    let m: RegExpExecArray | null;
    while ((m = numPattern.exec(c.text)) !== null) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(c.text.length, m.index + 40);
      numHits.push({
        page: c.metadata.pageNumber,
        chunkIdx: c.metadata.chunkIndex,
        match: m[0],
        context: c.text.slice(start, end).replace(/\n/g, ' ')
      });
    }
    while ((m = urlPattern.exec(c.text)) !== null) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(c.text.length, m.index + 40);
      urlHits.push({
        page: c.metadata.pageNumber,
        chunkIdx: c.metadata.chunkIndex,
        match: m[0],
        context: c.text.slice(start, end).replace(/\n/g, ' ')
      });
    }
  });

  console.log(`\n=== NUMBER/DECIMAL SPACING HITS (pattern: /\\d\\. \\d{2}\\b/): ${numHits.length} ===`);
  numHits.forEach((h, i) => {
    console.log(`[${i + 1}] Page ${h.page} (Chunk ${h.chunkIdx}) Match: "${h.match}" | Context: "...${h.context}..."`);
  });

  console.log(`\n=== URL DOMAIN SPACING HITS (pattern: /\\w\\. (msme|gov|in)\\b/): ${urlHits.length} ===`);
  urlHits.forEach((h, i) => {
    console.log(`[${i + 1}] Page ${h.page} (Chunk ${h.chunkIdx}) Match: "${h.match}" | Context: "...${h.context}..."`);
  });
}

main().catch(console.error);
