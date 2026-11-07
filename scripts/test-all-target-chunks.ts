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

async function extractSpecificPages(pageNumbers: number[]) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages = new Map<number, { rawText: string; normText: string }>();

  for (const pageNum of pageNumbers) {
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
  const targetPages = [10, 14, 16, 19, 22, 25, 29, 34, 39, 43, 45, 46, 47, 48, 51];
  const pages = await extractSpecificPages(targetPages);
  const chunks = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

  for (const p of targetPages) {
    const pChunks = chunks.filter((c: any) => c.pageNumber === p);
    const pageData = pages.get(p)!;
    console.log(`\n================ PAGE ${p} (${pChunks.length} chunks) ================`);
    for (const c of pChunks) {
      let body = c.text;
      const dnl = body.indexOf('\n\n');
      if (dnl !== -1 && dnl < 150) body = body.slice(dnl + 2).trim();
      const normBody = normalizeText(body);
      const normMatch = pageData.normText.includes(normBody);
      console.log(`Chunk idx ${c.chunkIndex} | normMatch: ${normMatch} | sec: "${c.sectionTitle}"`);
      console.log(`  First 100 body: "${normBody.slice(0, 100)}"`);
      if (!normMatch) {
        console.log(`  --> NOT FOUND ON PAGE ${p}`);
      }
    }
  }
}

main().catch(console.error);
