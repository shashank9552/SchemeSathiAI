import fs from 'node:fs';
import path from 'node:path';

async function extractPages() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages: Array<{ pageNumber: number; lines: string[]; fullText: string }> = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
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

    const sortedYKeys = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of sortedYKeys) {
      const lineItems = linesMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((item) => item.text).join(' ').trim();
      if (lineText) lines.push(lineText);
    }
    pages.push({ pageNumber: pageNum, lines, fullText: lines.join('\n') });
  }
  return pages;
}

async function main() {
  const pages = await extractPages();
  console.log(`Extracted ${pages.length} pages.\n`);

  // Scan all pages for potential scheme transitions / headings
  console.log('================================================================================');
  console.log('  PAGE-BY-PAGE HEADING SCAN ACROSS PAGES 1 TO 60');
  console.log('================================================================================');

  for (const p of pages) {
    if (p.pageNumber > 60) continue;
    const prominentLines = p.lines.filter(l => {
      const clean = l.replace(/^[•\s\d.-]+/, '').trim();
      return (
        l === l.toUpperCase() && l.length > 5 && !l.includes('MSME SCHEMES') && !l.includes('WWW.MSME.GOV.IN')
      ) || /^(Prime Minister|Credit Guarantee|Micro & Small|Scheme of Fund|Entrepreneurship Skill|Assistance to Training|Coir Vikas|Procurement and Marketing|International Cooperation|National SC-ST|A Scheme for|Khadi Gramodyog|Promotion of MSME|PM Vishwakarma|Tool Rooms|MSME Champions|MSME Sustainable|MSME- Innovative|MSME COMPETITIVE|Self Reliant India|Raising and Accelerating|Directory)/i.test(clean);
    });

    if (prominentLines.length > 0) {
      console.log(`PDF P${p.pageNumber} (Printed: ${p.pageNumber - 2}):`);
      prominentLines.forEach(l => console.log(`   - "${l}"`));
    }
  }
}

main().catch(console.error);
