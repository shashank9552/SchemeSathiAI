import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;
  const numPages = doc.numPages;

  console.log(`Document has ${numPages} pages.`);

  const phrase = 'vibrant and dynamic sector';
  let found = false;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    const str = tc.items.map((i: any) => i.str).join(' ');
    if (str.toLowerCase().includes('vibrant') || str.toLowerCase().includes('dynamic')) {
      console.log(`Page ${pageNum} has vibrant/dynamic:`);
      const matched = str.split('.').filter((s: string) => s.toLowerCase().includes('vibrant') || s.toLowerCase().includes('dynamic'));
      matched.forEach((m: string) => console.log(`  "${m.trim()}"`));
    }
    if (str.toLowerCase().includes(phrase)) {
      console.log(`>>> EXACT PHRASE FOUND ON PDF PAGE ${pageNum}!`);
      found = true;
    }
  }

  if (!found) {
    console.log(`Phrase "${phrase}" NOT found in MSMESchemebooklet2025-26.pdf!`);
  }
}

main().catch(console.error);
