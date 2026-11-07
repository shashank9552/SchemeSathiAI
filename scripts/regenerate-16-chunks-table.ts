import fs from 'node:fs';
import path from 'node:path';

function normalizeText(str: string): string {
  return str
    .replace(/[•\u2022\u25cf\u25cb\u25aa\u25ab\u2023\u2043\u204c\u204d\u2219]/g, ' ')
    .replace(/(\w+)-\s+(\w+)/g, '$1$2')
    .replace(/[\u2018\u2019\u201a\u201b']/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f"]/g, '"')
    .replace(/[\s\r\n\t]+/g, ' ')
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

function computeFailureCause(chunkNorm: string, pageNorm: string, isMatch: boolean): 'none (match)' | 'table' | 'URL' | 'spacing' | 'label drift' | 'other' {
  if (isMatch) return 'none (match)';
  if (chunkNorm.includes('|') || chunkNorm.includes('|-')) return 'table';
  if (chunkNorm.includes('http') || chunkNorm.includes('www.') || pageNorm.includes('http') || pageNorm.includes('www.')) {
    // Check if difference is due to URL tokenization
    return 'URL';
  }
  if (/\d\.\s+\d{2}\b/.test(chunkNorm) || /\d{1,2}\.\s+\d{1,2}\.\s+\d{2,4}\b/.test(chunkNorm)) {
    return 'spacing';
  }
  if (chunkNorm.includes('detailed information:') || chunkNorm.includes('who can apply:')) {
    return 'other'; // inserted curation label
  }
  return 'other';
}

async function main() {
  const pages = await extractPagesSpatial();
  const chunksRaw = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

  // The 16 chunks on scheme pages requested by user:
  // Pages 10, 14, 16, 19, 22, 25 (x2), 29, 34, 39, 43, 45, 46, 47, 48, 51
  const targetSelectors = [
    { page: 10, chunkIdx: 35 },
    { page: 14, chunkIdx: 41 },
    { page: 16, chunkIdx: 46 },
    { page: 19, chunkIdx: 52 },
    { page: 22, chunkIdx: 59 },
    { page: 25, chunkIdx: 65 },
    { page: 25, chunkIdx: 66 },
    { page: 29, chunkIdx: 75 },
    { page: 34, chunkIdx: 94 },
    { page: 39, chunkIdx: 104 },
    { page: 43, chunkIdx: 114 },
    { page: 45, chunkIdx: 118 },
    { page: 46, chunkIdx: 120 },
    { page: 47, chunkIdx: 122 },
    { page: 48, chunkIdx: 123 },
    { page: 51, chunkIdx: 131 }
  ];

  console.log('================================================================================');
  console.log('  REGENERATED 16-CHUNK TABLE (ONE METHOD: verify-all-190-normalized.ts)');
  console.log('================================================================================\n');

  let idx = 0;
  for (const t of targetSelectors) {
    idx++;
    const chunk = chunksRaw.find((c: any) => c.pageNumber === t.page && c.chunkIndex === t.chunkIdx);
    if (!chunk) continue;

    let body = chunk.text;
    const dnl = body.indexOf('\n\n');
    if (dnl !== -1 && dnl < 150) body = body.slice(dnl + 2).trim();

    const normBody = normalizeText(body);
    const pageData = pages.get(t.page)!;
    const isNormMatch = pageData.normText.includes(normBody);
    const cause = computeFailureCause(normBody, pageData.normText, isNormMatch);

    console.log(`[#${idx}] Page ${chunk.pageNumber} | Chunk ${chunk.chunkIndex} | normMatch: ${isNormMatch} | Cause: ${cause}`);
    console.log(`  Scheme: "${chunk.schemeName}"`);
    console.log(`  Section: "${chunk.sectionTitle}"`);
    console.log(`  First 100 Body: "${normBody.slice(0, 100)}..."`);
    console.log('');
  }
}

main().catch(console.error);
