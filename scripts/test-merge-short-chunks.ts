import fs from 'node:fs';
import path from 'node:path';
import { TextCleaner, DocumentPageText } from '../server/src/ingestion/cleaner.js';
import { DocumentChunker, PageContent, DocumentInfo, OutlineEntry, GeneratedChunk } from '../server/src/ingestion/chunker.js';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const rawPages: DocumentPageText[] = [];
  const validPages: PageContent[] = [];

  for (const pageNum of [5, 6, 7, 8, 9, 10]) {
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

  const cleanedPages: PageContent[] = validPages.map((vp) => {
    const rawObj = rawPages.find((rp) => rp.pageNumber === vp.pageNumber)!;
    return {
      pageNumber: vp.pageNumber,
      text: TextCleaner.cleanPageText(rawObj, new Set()),
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

  const rawChunks = chunker.chunkDocument(cleanedPages, docInfo);

  // Implement post-processing merge for chunks with body < 200 chars:
  // Forward merge within same page/scheme
  function mergeShortChunks(chunks: GeneratedChunk[]): GeneratedChunk[] {
    const result: GeneratedChunk[] = [];
    let i = 0;
    while (i < chunks.length) {
      const curr = chunks[i];
      const headerPrefix = `${curr.metadata.schemeName} - ${curr.metadata.sectionTitle}\n\n`;
      const body = curr.text.startsWith(headerPrefix) ? curr.text.slice(headerPrefix.length).trim() : curr.text.trim();

      if (body.length < 200 && i + 1 < chunks.length && chunks[i + 1].metadata.pageNumber === curr.metadata.pageNumber && chunks[i + 1].metadata.schemeName === curr.metadata.schemeName) {
        // Merge into following chunk
        const next = chunks[i + 1];
        const nextHeaderPrefix = `${next.metadata.schemeName} - ${next.metadata.sectionTitle}\n\n`;
        const nextBody = next.text.startsWith(nextHeaderPrefix) ? next.text.slice(nextHeaderPrefix.length).trim() : next.text.trim();
        const mergedText = `${nextHeaderPrefix}${body}\n\n${nextBody}`;
        chunks[i + 1] = {
          text: mergedText,
          metadata: {
            ...next.metadata,
          }
        };
        // Skip current chunk (merged forward)
        i++;
      } else {
        result.push(curr);
        i++;
      }
    }
    // Reindex
    result.forEach((c, idx) => {
      c.metadata.chunkIndex = idx;
    });
    return result;
  }

  const mergedChunks = mergeShortChunks(rawChunks);

  for (const p of [5, 9, 10]) {
    const pChunks = mergedChunks.filter(c => c.metadata.pageNumber === p);
    console.log(`\n================================================================================`);
    console.log(`  PAGE ${p} POST-MERGE CHUNKS (TOTAL: ${pChunks.length})`);
    console.log(`================================================================================`);
    pChunks.forEach((c, idx) => {
      const headerPrefix = `${c.metadata.schemeName} - ${c.metadata.sectionTitle}\n\n`;
      const body = c.text.startsWith(headerPrefix) ? c.text.slice(headerPrefix.length).trim() : c.text.trim();
      console.log(`[Chunk ${idx + 1}] Index: ${c.metadata.chunkIndex} | Total Length: ${c.text.length} | Body Length: ${body.length}`);
      console.log(`  Scheme: "${c.metadata.schemeName}" | Section: "${c.metadata.sectionTitle}"`);
      console.log(`VERBATIM TEXT:\n${c.text}\n`);
    });
  }
}

main().catch(console.error);
