import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { TextCleaner, DocumentPageText } from '../server/src/ingestion/cleaner.js';
import { DocumentChunker, PageContent, DocumentInfo, OutlineEntry } from '../server/src/ingestion/chunker.js';

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
  const cleanedPages: PageContent[] = validPages.map((vp) => {
    const rawObj = rawPages.find((rp) => rp.pageNumber === vp.pageNumber)!;
    return {
      pageNumber: vp.pageNumber,
      text: TextCleaner.cleanPageText(rawObj, repeating),
    };
  });

  return cleanedPages;
}

async function main() {
  const cleanedPages = await extractPages();

  // Load outline.review.json
  const rawOutline = JSON.parse(fs.readFileSync('data/outline.review.json', 'utf8'));
  const flatOutline: OutlineEntry[] = [];

  for (const entry of rawOutline) {
    if (entry.index === false) continue; // skip non-indexed
    if (entry.subSchemes && entry.subSchemes.length > 0) {
      // Find min sub start page
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

  // Only pass pages that are indexed
  const indexedPageNumbers = new Set<number>();
  for (const entry of rawOutline) {
    if (entry.index !== false) {
      for (let p = entry.startPage; p <= entry.endPage; p++) {
        indexedPageNumbers.add(p);
      }
    }
  }

  const pagesToChunk = cleanedPages.filter(p => indexedPageNumbers.has(p.pageNumber));
  const newChunks = chunker.chunkDocument(pagesToChunk, docInfo);

  // Load stored chunks
  const storedChunks: any[] = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

  // Load cache
  const cachePath = 'data/processed/embeddings_hash_cache.json';
  const cacheMap = new Map<string, number[]>();
  if (fs.existsSync(cachePath)) {
    const rawCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Array.isArray(rawCache)) {
      rawCache.forEach((entry: any) => {
        if (entry.key && entry.embedding) cacheMap.set(entry.key, entry.embedding);
      });
    } else if (typeof rawCache === 'object' && rawCache !== null) {
      for (const [k, v] of Object.entries(rawCache)) {
        if (Array.isArray(v)) cacheMap.set(k, v as number[]);
      }
    }
  }

  console.log(`New Chunks: ${newChunks.length} | Stored Chunks: ${storedChunks.length} | Cache Size: ${cacheMap.size}\n`);

  interface PageStats {
    page: number;
    oldLabels: Set<string>;
    newScheme: string;
    newSections: Set<string>;
    oldCount: number;
    newCount: number;
    cacheHits: number;
    newEmbeddings: number;
    differenceReason: string;
  }

  const tableRows: PageStats[] = [];

  for (let p = 1; p <= 61; p++) {
    const oldP = storedChunks.filter(c => c.pageNumber === p);
    const newP = newChunks.filter(c => c.metadata.pageNumber === p);

    const oldLabels = new Set<string>(oldP.map(c => c.schemeName as string));
    const newSections = new Set<string>(newP.map(c => c.metadata.sectionTitle));
    const newScheme = newP.length > 0 ? newP[0].metadata.schemeName : (indexedPageNumbers.has(p) ? 'Indexed (no chunks)' : 'NON-INDEXED');

    let hits = 0;
    let newEmbeds = 0;
    for (const c of newP) {
      const hash = crypto.createHash('sha256').update(`${c.text.trim()}::gemini-embedding-2::768`).digest('hex');
      if (cacheMap.has(hash)) {
        hits++;
      } else {
        newEmbeds++;
      }
    }

    let diffReason = '';
    if (newP.length === oldP.length) {
      diffReason = 'Equal chunk count';
    } else if (newP.length > oldP.length) {
      if (oldP.length === 0) {
        diffReason = 'Previously omitted/misattributed page indexed';
      } else {
        diffReason = `Refined boundary split: +${newP.length - oldP.length} chunks (tables/subheadings)`;
      }
    } else {
      if (newP.length === 0) {
        diffReason = 'Quarantined/non-indexed page';
      } else {
        diffReason = `Merged small paragraphs: -${oldP.length - newP.length} chunks`;
      }
    }

    if (oldP.length > 0 || newP.length > 0) {
      tableRows.push({
        page: p,
        oldLabels,
        newScheme,
        newSections,
        oldCount: oldP.length,
        newCount: newP.length,
        cacheHits: hits,
        newEmbeddings: newEmbeds,
        differenceReason: diffReason
      });
    }
  }

  // Print summary totals
  const totalOld = tableRows.reduce((sum, r) => sum + r.oldCount, 0);
  const totalNew = tableRows.reduce((sum, r) => sum + r.newCount, 0);
  const totalHits = tableRows.reduce((sum, r) => sum + r.cacheHits, 0);
  const totalNewEmbeds = tableRows.reduce((sum, r) => sum + r.newEmbeddings, 0);

  console.log(`Total Old: ${totalOld} | Total New: ${totalNew} | Total Hits: ${totalHits} | Total New Embeddings: ${totalNewEmbeds}\n`);

  fs.writeFileSync('scripts/page-by-page-dry-run.json', JSON.stringify({
    totalOld,
    totalNew,
    totalHits,
    totalNewEmbeds,
    tableRows: tableRows.map(r => ({
      ...r,
      oldLabels: Array.from(r.oldLabels),
      newSections: Array.from(r.newSections)
    }))
  }, null, 2));

  console.log('Saved page-by-page table to scripts/page-by-page-dry-run.json');
}

main().catch(console.error);
