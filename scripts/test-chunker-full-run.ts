import fs from 'node:fs';
import path from 'node:path';
import { TextCleaner, DocumentPageText } from '../server/src/ingestion/cleaner.js';
import { DocumentChunker, PageContent } from '../server/src/ingestion/chunker.js';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;
  const numPages = doc.numPages;

  const rawPages: DocumentPageText[] = [];
  const validPages: PageContent[] = [];

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

  const chunker = new DocumentChunker();
  const docInfo = {
    sourceFile: 'MSMESchemebooklet2025-26.pdf',
    documentTitle: 'Ministry of MSME Scheme Booklet 2025-26',
    defaultSchemeName: 'Ministry of MSME Scheme Booklet 2025-26',
    category: 'Business, MSME & Entrepreneurship',
    level: 'central' as const,
    language: 'en',
  };

  const chunks = chunker.chunkDocument(cleanedPages, docInfo);

  console.log(`Total chunks generated: ${chunks.length}`);
  const p48_54 = chunks.filter(c => c.metadata.pageNumber >= 48 && c.metadata.pageNumber <= 54);
  for (const c of p48_54) {
    console.log(`Page: ${c.metadata.pageNumber} | Scheme: "${c.metadata.schemeName}" | Section: "${c.metadata.sectionTitle}"`);
  }

  // Also check all distinct schemes detected across the whole doc:
  console.log('\nAll schemes detected by DocumentChunker across entire doc:');
  const schemesByPage = new Map<number, Set<string>>();
  for (const c of chunks) {
    if (!schemesByPage.has(c.metadata.pageNumber)) schemesByPage.set(c.metadata.pageNumber, new Set());
    schemesByPage.get(c.metadata.pageNumber)!.add(c.metadata.schemeName);
  }
  for (const [p, s] of schemesByPage.entries()) {
    console.log(`Page ${p}: ${Array.from(s).join(' | ')}`);
  }
}

main().catch(console.error);
