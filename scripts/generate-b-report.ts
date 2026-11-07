import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const outline = [
    { id: 1, schemeName: "Ministry of MSME Overview", startPage: 2, endPage: 2 },
    { id: 2, schemeName: "Table of Contents", startPage: 3, endPage: 4 },
    { id: 3, schemeName: "Prime Minister’s Employment Generation Programme (PMEGP)", startPage: 5, endPage: 6 },
    { id: 4, schemeName: "PMEGP 2nd Loan for Up-gradation", startPage: 7, endPage: 8 },
    { id: 5, schemeName: "Credit Guarantee Scheme for Micro & Small Enterprises (CGTMSE)", startPage: 9, endPage: 10 },
    { id: 6, schemeName: "Micro & Small Enterprises Cluster Development Programme (MSE-CDP) Scheme", startPage: 11, endPage: 12 },
    { id: 7, schemeName: "Scheme of Fund for Regeneration of Traditional Industries (SFURTI)", startPage: 13, endPage: 14 },
    { id: 8, schemeName: "Entrepreneurship Skill Development Programme (ESDP)", startPage: 15, endPage: 16 },
    { id: 9, schemeName: "Assistance to Training Institutions (ATI) Scheme", startPage: 17, endPage: 17 },
    { id: 10, schemeName: "Coir Vikas Yojana", startPage: 18, endPage: 20 },
    { id: 11, schemeName: "Procurement and Marketing Support (PMS) Scheme", startPage: 21, endPage: 22 },
    { id: 12, schemeName: "International Cooperation (IC) Scheme", startPage: 23, endPage: 25 },
    { id: 13, schemeName: "National SC-ST Hub Scheme", startPage: 26, endPage: 27 },
    { id: 14, schemeName: "A Scheme for Promotion of Innovation, Rural Industries and Entrepreneurship (ASPIRE)", startPage: 28, endPage: 29 },
    { id: 15, schemeName: "Khadi Gramodyog Vikas Yojana", startPage: 30, endPage: 32 },
    { id: 16, schemeName: "Promotion of MSME in NER and SIKKIM", startPage: 33, endPage: 34 },
    { id: 17, schemeName: "PM Vishwakarma", startPage: 36, endPage: 37 },
    { id: 18, schemeName: "Tool Rooms and Technical Institutions", startPage: 38, endPage: 39 },
    { id: 19, schemeName: "MSME Champions Scheme", subScheme: "Overview", startPage: 40, endPage: 40 },
    { id: 20, schemeName: "MSME Champions Scheme", subScheme: "MSME Sustainable (ZED) Certification", startPage: 41, endPage: 43 },
    { id: 21, schemeName: "MSME Champions Scheme", subScheme: "MSME- Innovative (Incubation, IPR and Design)", startPage: 44, endPage: 46 },
    { id: 22, schemeName: "MSME Champions Scheme", subScheme: "MSME COMPETITIVE (LEAN) SCHEME", startPage: 47, endPage: 49 },
    { id: 23, schemeName: "Self Reliant India (SRI) Fund", startPage: 50, endPage: 51 },
    { id: 24, schemeName: "Raising and Accelerating MSME Performance (RAMP)", startPage: 52, endPage: 53 },
    { id: 25, schemeName: "Directory of Field Offices, MSME-DFOs & Testing Centres", startPage: 56, endPage: 59 }
  ];

  for (const entry of outline) {
    const page = await doc.getPage(entry.startPage);
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

    const first5 = lines.slice(0, 5);
    const first5Text = first5.join(' ');
    
    // Check if title is present
    const target = entry.subScheme || entry.schemeName;
    const words = target.split(/\s+/).filter(w => w.length > 3 && !/^(scheme|programme|yojana|msme|and|for|the)$/i.test(w));
    const titlePresent = words.some(w => first5Text.toLowerCase().includes(w.toLowerCase()));

    const line1 = first5[0] || '';
    const midSentence = /^[a-z,;]/.test(line1);
    const midTable = /^[0-9]+\s+[A-Z]/.test(line1) || /^•/.test(line1) || /^(Particulars|Details|S\.No)/i.test(line1);

    console.log(`[#${entry.id}] ${entry.schemeName} ${entry.subScheme ? `| ${entry.subScheme}` : ''}`);
    console.log(`  Start Page: PDF ${entry.startPage} (Printed: ${entry.startPage - 2})`);
    first5.forEach((l, idx) => console.log(`    L${idx + 1}: ${l}`));
    console.log(`  Title in first 5 lines: ${titlePresent ? 'YES' : 'NO'}`);
    if (midSentence) console.log(`  FLAG: Starts mid-sentence ("${line1}")`);
    if (midTable) console.log(`  FLAG: Starts mid-table / list ("${line1}")`);
    console.log('');
  }
}

main().catch(console.error);
