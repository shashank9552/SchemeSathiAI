import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { TextCleaner, DocumentPageText } from '../server/src/ingestion/cleaner.js';
import { DocumentChunker, PageContent, DocumentInfo, OutlineEntry } from '../server/src/ingestion/chunker.js';
import { EmbeddingCache } from '../server/src/providers/embeddingCache.js';

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
    const rawPageObj = rawPages.find((rp) => rp.pageNumber === vp.pageNumber)!;
    return {
      pageNumber: vp.pageNumber,
      text: TextCleaner.cleanPageText(rawPageObj, repeating),
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

  // Group by page
  const pageChunkMap = new Map<number, typeof chunks>();
  chunks.forEach(c => {
    const p = c.metadata.pageNumber;
    if (!pageChunkMap.has(p)) pageChunkMap.set(p, []);
    pageChunkMap.get(p)!.push(c);
  });

  console.log('================================================================================');
  console.log('  DELIVERABLE 5: REAL CHUNKER PER-PAGE CHUNK TABLE');
  console.log('================================================================================\n');

  console.log('| PDF Page | Scheme Name | Chunks |');
  console.log('|:---:|:---|:---:|');

  let totalChunks = 0;
  const sortedPages = Array.from(pageChunkMap.keys()).sort((a, b) => a - b);
  for (const p of sortedPages) {
    const pChunks = pageChunkMap.get(p)!;
    const scheme = pChunks[0].metadata.schemeName;
    totalChunks += pChunks.length;
    console.log(`| ${p.toString().padStart(2, ' ')} | ${scheme} | ${pChunks.length} |`);
  }

  console.log('| **Total** | **All Indexed Schemes (Pages 5-34, 36-53)** | **' + totalChunks + '** |\n');

  // Check cache hits
  const cache = new EmbeddingCache('data/processed/embeddings_hash_cache.json');
  const cacheSize = cache.size();

  let hits = 0;
  let misses = 0;
  chunks.forEach((c) => {
    if (cache.has(c.text, 'gemini-embedding-2', 768)) {
      hits++;
    } else {
      misses++;
    }
  });

  console.log('================================================================================');
  console.log('  CACHE METRICS (embeddings_hash_cache.json)');
  console.log('================================================================================');
  console.log(`Cache entries on disk : ${cacheSize}`);
  console.log(`Cache Key Format      : sha256("\${text.trim()}::gemini-embedding-2::768")`);
  console.log(`Exact Cache Hits      : ${hits}`);
  console.log(`Cache Misses          : ${misses}`);
  console.log(`New Embeddings Needed : ${misses}`);

  const measuredPerEmbeddingSec = 1.2;
  const totalSeconds = misses * measuredPerEmbeddingSec;
  const minutes = Math.floor(totalSeconds / 60);
  const remSeconds = (totalSeconds % 60).toFixed(1);

  console.log(`\nMeasured Latency / Embedding : ${measuredPerEmbeddingSec}s`);
  console.log(`Total Ingestion Time Estimate: ${misses} * 1.2s = ${totalSeconds.toFixed(1)}s (${minutes}m ${remSeconds}s)`);
}

main().catch(console.error);
