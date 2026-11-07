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

  // Check each scheme boundary:
  // Does any page contain text from the previous scheme and the next scheme?
  // Schemes and their start pages:
  // P5: PMEGP
  // P7: PMEGP 2nd Loan
  // P9: CGTMSE
  // P11: MSE-CDP
  // P13: SFURTI
  // P15: ESDP
  // P17: ATI
  // P18: Coir Vikas Yojana
  // P21: PMS
  // P23: IC
  // P26: National SC-ST Hub
  // P28: ASPIRE
  // P30: Khadi Gramodyog
  // P33: Promotion of MSME in NER and SIKKIM
  // P35: Photo page? Let's check P34 and P35!
  // P36: PM Vishwakarma
  // P38: Tool Rooms
  // P40: MSME Champions
  // P41: ZED
  // P44: MSME-Innovative
  // P47: MSME-Lean
  // P50: SRI Fund
  // P52: RAMP
  // P54: Contacts divider
  // P55: Blank
  // P56: Directory

  console.log('--- CHECKING BOUNDARY PAGES ---');
  for (const pNum of [6, 8, 10, 12, 14, 16, 17, 20, 22, 25, 27, 29, 31, 32, 34, 35, 37, 39, 40, 43, 46, 49, 51, 53]) {
    const p = pages.find(x => x.pageNumber === pNum);
    console.log(`Page ${pNum} has ${p?.lines.length} lines. Last 3 lines:`);
    p?.lines.slice(-3).forEach(l => console.log(`   "${l}"`));
  }
}

main().catch(console.error);
