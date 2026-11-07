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

  const rawOutline = JSON.parse(fs.readFileSync('data/outlines/MSMESchemebooklet2025-26.json', 'utf8'));
  const flatOutline: OutlineEntry[] = [];
  const indexedPages = new Set<number>();

  for (const entry of rawOutline) {
    if (entry.index === false) continue;
    for (let p = entry.startPage; p <= entry.endPage; p++) indexedPages.add(p);

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
  const eligiblePages = validPages.filter((p) => indexedPages.has(p.pageNumber));

  const cleanedPages: PageContent[] = eligiblePages.map((vp) => {
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

  console.log('================================================================================');
  console.log('  "HOW TO APPLY" CHUNKS FOR PAGES 6, 10, 14, 29 (VERBATIM)');
  console.log('================================================================================\n');

  const targetPages = [6, 10, 14, 29];
  for (const p of targetPages) {
    const pageChunks = chunks.filter(c => c.metadata.pageNumber === p);
    const applyChunk = pageChunks.find(c => c.metadata.sectionTitle.toLowerCase().includes('how to apply') || c.text.toLowerCase().includes('how to apply'));
    if (applyChunk) {
      console.log(`--------------------------------------------------------------------------------`);
      console.log(`PAGE ${p} | ChunkIndex: ${applyChunk.metadata.chunkIndex}`);
      console.log(`SchemeName   : "${applyChunk.metadata.schemeName}"`);
      console.log(`SectionTitle : "${applyChunk.metadata.sectionTitle}"`);
      console.log(`VERBATIM CHUNK TEXT:`);
      console.log(applyChunk.text);
      console.log(`--------------------------------------------------------------------------------\n`);
    } else {
      console.log(`PAGE ${p}: No chunk titled "How to apply", printing last chunk on page ${p}:`);
      const lastChunk = pageChunks[pageChunks.length - 1];
      console.log(`ChunkIndex: ${lastChunk.metadata.chunkIndex} | Section: "${lastChunk.metadata.sectionTitle}"`);
      console.log(lastChunk.text);
      console.log('\n');
    }
  }

  console.log('================================================================================');
  console.log('  ALL URLS KEPT ACROSS ALL CHUNKS (TOTAL CHUNKS: ' + chunks.length + ')');
  console.log('================================================================================\n');

  const urlMap = new Map<string, Array<{ page: number; chunkIndex: number; scheme: string }>>();
  const urlRegex = /(?:https?:\/\/|www\.)[^\s]+/gi;

  chunks.forEach((c) => {
    const matches = c.text.match(urlRegex);
    if (matches) {
      matches.forEach((u) => {
        // Clean trailing punctuation
        const cleanU = u.replace(/[,\.\)]+$/, '');
        if (!urlMap.has(cleanU)) urlMap.set(cleanU, []);
        urlMap.get(cleanU)!.push({
          page: c.metadata.pageNumber,
          chunkIndex: c.metadata.chunkIndex,
          scheme: c.metadata.schemeName
        });
      });
    }
  });

  let urlCount = 0;
  for (const [url, locations] of urlMap.entries()) {
    urlCount++;
    console.log(`[${urlCount}] ${url}`);
    locations.forEach(loc => {
      console.log(`     -> Page ${loc.page} (Chunk ${loc.chunkIndex}) [${loc.scheme}]`);
    });
  }

  console.log(`\nTotal unique URLs kept: ${urlCount}`);
}

main().catch(console.error);
