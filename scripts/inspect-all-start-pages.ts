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

// Updated outline entries based on user instructions:
// - Quarantine 54 and 55
// - Directory = 56 to 59
// - Khadi Gramodyog Vikas Yojana = single parent for pages 30 to 32
const updatedOutline = [
  { schemeName: "Ministry of MSME Overview", startPage: 2, endPage: 2 },
  { schemeName: "Table of Contents", startPage: 3, endPage: 4 },
  { schemeName: "Prime Minister’s Employment Generation Programme (PMEGP)", startPage: 5, endPage: 6 },
  { schemeName: "PMEGP 2nd Loan for Up-gradation", startPage: 7, endPage: 8 },
  { schemeName: "Credit Guarantee Scheme for Micro & Small Enterprises (CGTMSE)", startPage: 9, endPage: 10 },
  { schemeName: "Micro & Small Enterprises Cluster Development Programme (MSE-CDP) Scheme", startPage: 11, endPage: 12 },
  { schemeName: "Scheme of Fund for Regeneration of Traditional Industries (SFURTI)", startPage: 13, endPage: 14 },
  { schemeName: "Entrepreneurship Skill Development Programme (ESDP)", startPage: 15, endPage: 16 },
  { schemeName: "Assistance to Training Institutions (ATI) Scheme", startPage: 17, endPage: 17 },
  { schemeName: "Coir Vikas Yojana", startPage: 18, endPage: 20 },
  { schemeName: "Procurement and Marketing Support (PMS) Scheme", startPage: 21, endPage: 22 },
  { schemeName: "International Cooperation (IC) Scheme", startPage: 23, endPage: 25 },
  { schemeName: "National SC-ST Hub Scheme", startPage: 26, endPage: 27 },
  { schemeName: "A Scheme for Promotion of Innovation, Rural Industries and Entrepreneurship (ASPIRE)", startPage: 28, endPage: 29 },
  { schemeName: "Khadi Gramodyog Vikas Yojana", startPage: 30, endPage: 32 },
  { schemeName: "Promotion of MSME in NER and SIKKIM", startPage: 33, endPage: 34 },
  { schemeName: "PM Vishwakarma", startPage: 36, endPage: 37 },
  { schemeName: "Tool Rooms and Technical Institutions", startPage: 38, endPage: 39 },
  { schemeName: "MSME Champions Scheme", subScheme: "Overview", startPage: 40, endPage: 40 },
  { schemeName: "MSME Champions Scheme", subScheme: "MSME Sustainable (ZED) Certification", startPage: 41, endPage: 43 },
  { schemeName: "MSME Champions Scheme", subScheme: "MSME- Innovative (Incubation, IPR and Design)", startPage: 44, endPage: 46 },
  { schemeName: "MSME Champions Scheme", subScheme: "MSME COMPETITIVE (LEAN) SCHEME", startPage: 47, endPage: 49 },
  { schemeName: "Self Reliant India (SRI) Fund", startPage: 50, endPage: 51 },
  { schemeName: "Raising and Accelerating MSME Performance (RAMP)", startPage: 52, endPage: 53 },
  { schemeName: "Directory of Field Offices, MSME-DFOs & Testing Centres", startPage: 56, endPage: 59 }
];

async function main() {
  const pages = await extractPages();

  console.log('================================================================================');
  console.log('  ITEM B: FIRST 5 LINES FOR EVERY START PAGE OF EVERY SCHEME');
  console.log('================================================================================\n');

  for (const entry of updatedOutline) {
    const page = pages.find(p => p.pageNumber === entry.startPage);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Scheme: "${entry.schemeName}" ${entry.subScheme ? `(Sub: "${entry.subScheme}")` : ''}`);
    console.log(`Page Range: PDF P${entry.startPage} - P${entry.endPage} (Printed: ${entry.startPage - 2} - ${entry.endPage - 2})`);

    if (!page) {
      console.log(`[ERROR] Page ${entry.startPage} not found!`);
      continue;
    }

    const first5 = page.lines.slice(0, 5);
    console.log(`First 5 lines:`);
    first5.forEach((l, i) => console.log(`  [${i + 1}] "${l}"`));

    // Check title presence
    const titleCandidates = [entry.schemeName, entry.subScheme].filter(Boolean) as string[];
    const first5Joined = first5.join(' ').toLowerCase();

    let foundTitle = false;
    let matchedTitleWord = '';
    for (const tc of titleCandidates) {
      // Check significant words from title
      const sigWords = tc.split(/\s+/).filter(w => w.length > 3 && !/^(scheme|programme|yojana|msme|and|the|for)$/i.test(w));
      const matchAll = sigWords.length > 0 && sigWords.every(w => first5Joined.includes(w.toLowerCase()));
      if (matchAll || first5Joined.includes(tc.toLowerCase().slice(0, 15))) {
        foundTitle = true;
        matchedTitleWord = tc;
        break;
      }
    }

    const line1 = first5[0] || '';
    const startsMidSentence = /^[a-z,;]/.test(line1);
    const startsMidTable = /^[0-9]+\s+[A-Z]/.test(line1) || /^•/.test(line1) || /^(Particulars|Details|INR|Rs\.)/i.test(line1);

    console.log(`Title found in first 5 lines? ${foundTitle ? `YES ("${matchedTitleWord}")` : 'NO'}`);
    if (startsMidSentence) console.log(`[FLAG] Starts mid-sentence: "${line1}"`);
    if (startsMidTable) console.log(`[FLAG] Starts mid-table / bullet: "${line1}"`);
    console.log('');
  }

  // Also inspect quarantined pages 54 and 55
  console.log('================================================================================');
  console.log('  QUARANTINED PAGES: PDF P54 AND P55');
  console.log('================================================================================');
  for (const qPageNum of [54, 55]) {
    const qPage = pages.find(p => p.pageNumber === qPageNum);
    console.log(`PDF P${qPageNum} (Printed: ${qPageNum - 2}):`);
    if (qPage) {
      console.log(`  Total Lines: ${qPage.lines.length}`);
      qPage.lines.forEach((l, i) => console.log(`    [${i + 1}] "${l}"`));
    }
  }

  // Also check Page 31 and Page 32 specifically to show Khadi/Gramodyog structure
  console.log('\n================================================================================');
  console.log('  KHADI GRAMODYOG VIKAS YOJANA (P30, P31, P32) STRUCTURE');
  console.log('================================================================================');
  for (const kp of [30, 31, 32]) {
    const p = pages.find(x => x.pageNumber === kp);
    console.log(`--- PDF P${kp} (Printed: ${kp - 2}) --- First 8 lines:`);
    p?.lines.slice(0, 8).forEach((l, i) => console.log(`  [${i + 1}] "${l}"`));
  }
}

main().catch(console.error);
