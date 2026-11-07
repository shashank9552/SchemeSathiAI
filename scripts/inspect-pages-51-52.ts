import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('======================================================================');
  console.log('  RAW EXTRACTED TEXT AND STORED CHUNKS FOR PDF PAGES 51 & 52');
  console.log('======================================================================\n');

  // 1. Raw PDF extraction for Pages 51 & 52
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  for (const p of [51, 52]) {
    const page = await doc.getPage(p);
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

    const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of sortedY) {
      const lineItems = linesMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((i) => i.text).join(' ').trim();
      if (lineText) lines.push(lineText);
    }

    console.log(`----------------------------------------------------------------------`);
    console.log(`RAW EXTRACTED TEXT: PDF PAGE ${p} (Printed Footer Page: ${p - 2})`);
    console.log(`----------------------------------------------------------------------`);
    console.log(lines.join('\n'));
    console.log('\n');
  }

  // 2. Stored Chunks for Pages 51 & 52 from MongoDB / refined_chunks_190.json
  const chunks: any[] = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
  const p51_52Chunks = chunks.filter(c => c.pageNumber === 51 || c.pageNumber === 52);

  console.log(`======================================================================`);
  console.log(`STORED CHUNKS PRODUCED FOR PAGES 51 & 52 (Count: ${p51_52Chunks.length})`);
  console.log(`======================================================================`);

  p51_52Chunks.forEach((c, idx) => {
    console.log(`\n[Chunk ${idx + 1}] (ChunkIndex: ${c.chunkIndex})`);
    console.log(`pageNumber:   ${c.pageNumber}`);
    console.log(`schemeName:   "${c.schemeName}"`);
    console.log(`sectionTitle: "${c.sectionTitle}"`);
    console.log(`full text:`);
    console.log(c.text);
    console.log('----------------------------------------------------------------------');
  });

  process.exit(0);
}

main().catch(console.error);
