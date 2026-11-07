import fs from 'node:fs';
import path from 'node:path';

function normalize(str: string): string {
  return str.toLowerCase().replace(/[\s\r\n\t]+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;
  const p2 = await doc.getPage(2);
  const tc = await p2.getTextContent();
  const rawP2 = tc.items.map((i: any) => i.str).join(' ');

  const chunk0 = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'))[0];
  const chunk0Body = chunk0.text.split('\n\n')[1];

  console.log('rawP2 norm:', normalize(rawP2).slice(0, 100));
  console.log('chunk0Body norm:', normalize(chunk0Body).slice(0, 100));
  console.log('Includes?', normalize(rawP2).includes(normalize(chunk0Body).slice(0, 50)));
}

main().catch(console.error);
