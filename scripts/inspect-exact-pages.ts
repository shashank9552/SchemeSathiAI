import fs from 'node:fs';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const fileData = new Uint8Array(fs.readFileSync('data/raw_pdfs/MSMESchemebooklet2025-26.pdf'));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pagesToInspect = [20, 21, 22, 31, 36, 40, 49, 50, 51, 52];

  for (const p of pagesToInspect) {
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

    console.log(`\n======================================================================`);
    console.log(`PDF PAGE INDEX: ${p} (Printed Footer Page: ${p - 2})`);
    console.log(`======================================================================`);
    console.log(lines.join('\n'));
  }
}

main().catch(console.error);
