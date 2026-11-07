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
        if (str.toLowerCase().includes('emerged')) {
          console.log(`MATCH in ${f} on Page ${p}:`);
          const sentences = str.split('.');
          sentences.filter(s => s.toLowerCase().includes('emerged')).forEach(s => console.log(`  "${s.trim()}"`));
        }
      }
    } catch {}
  }
}

main().catch(console.error);
