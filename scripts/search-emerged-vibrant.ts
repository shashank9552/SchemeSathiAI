import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfFiles = fs.readdirSync('data/raw_pdfs').filter(f => f.endsWith('.pdf'));

  for (const f of pdfFiles) {
    const full = path.join('data/raw_pdfs', f);
    try {
      const data = new Uint8Array(fs.readFileSync(full));
      const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const str = tc.items.map((i: any) => i.str).join(' ');
        if (str.toLowerCase().includes('emerged') && str.toLowerCase().includes('vibrant')) {
          console.log(`MATCH in ${f} on Page ${p}:`);
          console.log(str.slice(0, 300));
        }
      }
    } catch {}
  }
}

main().catch(console.error);
