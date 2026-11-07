import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const fileData = new Uint8Array(fs.readFileSync('data/raw_pdfs/MSMESchemebooklet2025-26.pdf'));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items as Array<{ str: string; transform: number[] }>;
    // Look at items with y < 50 (bottom of page)
    const bottomItems = items.filter(i => i.transform[5] < 60 && i.str.trim().length > 0);
    const topItems = items.filter(i => i.transform[5] > 750 && i.str.trim().length > 0);
    const bottomText = bottomItems.map(i => i.str).join(' ');
    const topText = topItems.map(i => i.str).join(' ');
    console.log(`PDF Page ${p.toString().padStart(2, ' ')}: Top: [${topText.substring(0, 40)}] | Bottom: [${bottomText}]`);
  }
}

main().catch(console.error);
