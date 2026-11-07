import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const phrase = 'sector has emerged as a highly vibrant';
  console.log(`Searching for "${phrase}" across ${doc.numPages} pages...`);

  let found = false;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const str = tc.items.map((i: any) => i.str).join(' ');
    const norm = str.toLowerCase().replace(/\s+/g, ' ');
    if (norm.includes(phrase)) {
      console.log(`MATCH FOUND ON PDF PAGE ${p}!`);
      console.log(`Raw text around match:`);
      const idx = norm.indexOf(phrase);
      console.log(str.slice(Math.max(0, idx - 100), Math.min(str.length, idx + 200)));
      found = true;
    }
  }

  if (!found) {
    console.log(`Phrase "${phrase}" not found in MSMESchemebooklet2025-26.pdf.`);
    // Try other PDFs in data/raw_pdfs
    const otherPdfs = fs.readdirSync('data/raw_pdfs').filter(f => f.endsWith('.pdf') && f !== 'MSMESchemebooklet2025-26.pdf');
    for (const op of otherPdfs) {
      console.log(`Searching in ${op}...`);
      try {
        const odata = new Uint8Array(fs.readFileSync(path.join('data/raw_pdfs', op)));
        const odoc = await pdfjs.getDocument({ data: odata, useSystemFonts: true }).promise;
        for (let p = 1; p <= odoc.numPages; p++) {
          const page = await odoc.getPage(p);
          const tc = await page.getTextContent();
          const str = tc.items.map((i: any) => i.str).join(' ');
          const norm = str.toLowerCase().replace(/\s+/g, ' ');
          if (norm.includes(phrase)) {
            console.log(`MATCH FOUND IN ${op} ON PAGE ${p}!`);
          }
        }
      } catch (err) {
        console.log(`Error reading ${op}: ${err}`);
      }
    }
  }
}

main().catch(console.error);
