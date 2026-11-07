import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const page = await doc.getPage(31);
  const tc = await page.getTextContent();
  const rawP31 = tc.items.map((i: any) => i.str).join('\n');
  console.log('=== REAL PDF PAGE 31 RAW TEXT ===');
  console.log(rawP31);
}

main().catch(console.error);
