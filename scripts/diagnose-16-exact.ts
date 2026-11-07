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

async function main() {
  const pages = await extractPagesSpatial();
  const chunksRaw = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

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

  targetSelectors.forEach((t, i) => {
    const chunk = chunksRaw.find((c: any) => c.pageNumber === t.page && c.chunkIndex === t.chunkIdx);
    if (!chunk) return;

    let body = chunk.text;
    const dnl = body.indexOf('\n\n');
    if (dnl !== -1 && dnl < 150) body = body.slice(dnl + 2).trim();

    const normBody = normalizeText(body);
    const pageData = pages.get(t.page)!;
    const isNormMatch = pageData.normText.includes(normBody);

    console.log(`\n================================================================================`);
    console.log(`[#${i + 1}] Page ${chunk.pageNumber} | ChunkIndex ${chunk.chunkIndex}`);
    console.log(`Stored Scheme: "${chunk.schemeName}"`);
    console.log(`Stored Section: "${chunk.sectionTitle}"`);
    console.log(`isNormMatch: ${isNormMatch}`);

    if (isNormMatch) {
      console.log(`STATUS: TRUE MATCH under normalized comparison`);
      return;
    }

    // Find first point of difference
    let bestStart = -1;
    const words = normBody.split(' ').filter(w => w.length > 2);
    for (let w = 0; w < words.length; w++) {
      const probe = words.slice(w, w + 3).join(' ');
      const pos = pageData.normText.indexOf(probe);
      if (pos !== -1) {
        const prefix = words.slice(0, w).join(' ');
        bestStart = Math.max(0, pos - prefix.length - 1);
        break;
      }
    }
    if (bestStart === -1) bestStart = 0;

    let cIdx = 0;
    let pIdx = bestStart;
    const firstWordPos = pageData.normText.indexOf(words[0], Math.max(0, bestStart - 50));
    if (firstWordPos !== -1) pIdx = firstWordPos;

    let diffIndex = -1;
    while (cIdx < normBody.length && pIdx < pageData.normText.length) {
      if (normBody[cIdx] !== pageData.normText[pIdx]) {
        diffIndex = cIdx;
        break;
      }
      cIdx++;
      pIdx++;
    }

    console.log(`First point of difference at offset ${diffIndex}:`);
    console.log(`  Chunk char: ${JSON.stringify(normBody[diffIndex])} | context: "${normBody.slice(Math.max(0, diffIndex - 25), diffIndex + 25)}"`);
    console.log(`  Page  char: ${JSON.stringify(pageData.normText[pIdx])} | context: "${pageData.normText.slice(Math.max(0, pIdx - 25), pIdx + 25)}"`);

    // Determine precise category: label drift | URL | spacing | table | other
    let computedCause = 'other';
    if (normBody.includes('|') || normBody.includes('|-')) {
      computedCause = 'table';
    } else if (normBody.startsWith('detailed information:') && !pageData.normText.includes('detailed information:')) {
      computedCause = 'label drift';
    } else if (/\d\.\s+\d{2}\b/.test(normBody) || /\d{1,2}\.\s+\d{1,2}\.\s+\d{2,4}\b/.test(normBody)) {
      computedCause = 'spacing';
    } else if (normBody.slice(Math.max(0, diffIndex - 20), diffIndex + 20).includes('http') ||
               normBody.slice(Math.max(0, diffIndex - 20), diffIndex + 20).includes('www.')) {
      computedCause = 'URL';
    } else if (chunk.pageNumber === 19 || chunk.pageNumber === 51) {
      computedCause = 'table';
    }
    console.log(`COMPUTED CAUSE: ${computedCause}`);
  });
}

main().catch(console.error);
