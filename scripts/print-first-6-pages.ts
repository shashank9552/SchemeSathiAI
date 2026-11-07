import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  for (let p = 1; p <= 6; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const str = tc.items.map((i: any) => i.str).join(' ');
    console.log(`================================================================================`);
    console.log(`PDF PAGE ${p}:`);
    console.log(`================================================================================`);
    console.log(str);
    console.log('\n');
  }
}

main().catch(console.error);
