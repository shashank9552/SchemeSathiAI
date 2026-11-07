import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

interface TargetItem {
  id: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
}

const targetItems: TargetItem[] = [
  {
    id: 'NAT-ANS-14',
    expectedScheme: 'Coir Vikas Yojana',
    expectedPage: 22,
    expectedPhrase: 'modernization of coir units',
  },
  {
    id: 'NAT-ANS-15',
    expectedScheme: 'MSME SAMADHAAN (Delayed Payments Monitoring)',
    expectedPage: 36,
    expectedPhrase: 'Delayed Payments',
  },
  {
    id: 'NAT-ANS-19',
    expectedScheme: 'Udyam Registration Portal',
    expectedPage: 40,
    expectedPhrase: 'free of cost',
  },
  {
    id: 'NAT-ANS-22',
    expectedScheme: 'MSME SAMADHAAN (Delayed Payments Monitoring)',
    expectedPage: 36,
    expectedPhrase: '45 days',
  },
  {
    id: 'NAT-ANS-23',
    expectedScheme: 'Gramodyog Vikas Yojana',
    expectedPage: 21,
    expectedPhrase: 'Pottery Activity',
  },
];

async function main() {
  console.log('======================================================================');
  console.log('  CORPUS TEXT SEARCH OVER CHUNKS & PDF EXTRACTED PAGES (INCL. QUARANTINE)');
  console.log('======================================================================');

  // 1. Load PDF and extract all pages
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({
    data: fileData,
    useSystemFonts: true,
    disableFontFace: false,
  }).promise;

  const totalPages = doc.numPages;
  console.log(`Loaded PDF: ${pdfPath} (${totalPages} pages)`);

  const pdfPages: Array<{
    pageIndex: number; // 1-based PDF page index
    text: string;
    lines: string[];
    printedFooterPage?: string;
  }> = [];

  for (let p = 1; p <= totalPages; p++) {
    const page = await doc.getPage(p);
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

    const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of sortedY) {
      const lineItems = linesMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((i) => i.text).join(' ').trim();
      if (lineText) lines.push(lineText);
    }

    const fullPageText = lines.join('\n');

    // Attempt to detect printed page number near footer
    // In MSMESchemebooklet2025-26.pdf, footer has numbers like "03", "18", "22", "36", etc.
    const lastFewLines = lines.slice(-4);
    let footerNum: string | undefined;
    for (let i = lastFewLines.length - 1; i >= 0; i--) {
      const line = lastFewLines[i].trim();
      const match = line.match(/^(\d{1,3})$/) || line.match(/\|\s*(\d{1,3})\s*$/) || line.match(/^(\d{1,3})\s*\|/);
      if (match) {
        footerNum = match[1];
        break;
      }
    }

    pdfPages.push({
      pageIndex: p,
      text: fullPageText,
      lines,
      printedFooterPage: footerNum,
    });
  }

  // Load quarantine list
  const quarantinePath = path.resolve('data/processed/quarantine.json');
  const quarantineList: any[] = JSON.parse(fs.readFileSync(quarantinePath, 'utf8'));
  const quarantinedSet = new Map<number, string>();
  for (const q of quarantineList) {
    quarantinedSet.set(q.pageNumber, q.reason);
  }

  // Load stored chunks
  const chunksPath = path.resolve('data/processed/refined_chunks_190.json');
  const allChunks: any[] = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));
  console.log(`Loaded ${allChunks.length} stored chunks from ${chunksPath}.\n`);

  // Print PDF page index vs Printed Footer mapping for all pages 1 to 61
  console.log('--- FULL PAGE INDEX vs PRINTED FOOTER MAPPING (Pages 1 to 61) ---');
  for (let p = 1; p <= totalPages; p++) {
    const pData = pdfPages[p - 1];
    const isQuarantined = quarantinedSet.has(p);
    console.log(`PDF Page Index ${p.toString().padStart(2, ' ')} -> Printed Footer: "${(pData.printedFooterPage || 'none').padStart(4, ' ')}" ${isQuarantined ? `[QUARANTINED: ${quarantinedSet.get(p)}]` : ''}`);
  }

  // 3. Search for each target item's expectedPhrase
  for (const item of targetItems) {
    const phrase = item.expectedPhrase!;
    console.log(`\n======================================================================`);
    console.log(`ID: ${item.id}`);
    console.log(`Expected Scheme: "${item.expectedScheme}"`);
    console.log(`expectedPage (in JSON): ${item.expectedPage}`);
    console.log(`expectedPhrase: "${phrase}"`);
    console.log(`----------------------------------------------------------------------`);

    // A. Search in stored chunks
    const matchingChunks = allChunks.filter(c =>
      c.text && c.text.toLowerCase().includes(phrase.toLowerCase())
    );

    console.log(`A. Matches in Stored Chunks (Count: ${matchingChunks.length}):`);
    if (matchingChunks.length > 0) {
      for (const mc of matchingChunks) {
        console.log(`   - ChunkIndex: ${mc.chunkIndex} | pageNumber (stored PDF index): ${mc.pageNumber} | Scheme: "${mc.schemeName}" | Section: "${mc.sectionTitle}"`);
        const snippetIndex = mc.text.toLowerCase().indexOf(phrase.toLowerCase());
        const snippet = mc.text.substring(Math.max(0, snippetIndex - 40), Math.min(mc.text.length, snippetIndex + phrase.length + 40)).replace(/\n/g, ' ');
        console.log(`     Context snippet: "...${snippet}..."`);
      }
    } else {
      console.log(`   None found in any of the ${allChunks.length} stored chunks.`);
    }

    // B. Search in extracted raw PDF pages
    const matchingPages = pdfPages.filter(p =>
      p.text.toLowerCase().includes(phrase.toLowerCase())
    );

    console.log(`\nB. Matches in Extracted PDF Pages (Count: ${matchingPages.length}):`);
    if (matchingPages.length > 0) {
      for (const mp of matchingPages) {
        const isQ = quarantinedSet.has(mp.pageIndex);
        console.log(`   - PDF Page Index: ${mp.pageIndex} | Printed Footer Page: "${mp.printedFooterPage || 'not detected'}" ${isQ ? `[QUARANTINED: ${quarantinedSet.get(mp.pageIndex)}]` : '[NOT Quarantined]'}`);
        const snippetIndex = mp.text.toLowerCase().indexOf(phrase.toLowerCase());
        const snippet = mp.text.substring(Math.max(0, snippetIndex - 40), Math.min(mp.text.length, snippetIndex + phrase.length + 40)).replace(/\n/g, ' ');
        console.log(`     Page Context snippet: "...${snippet}..."`);
      }
    } else {
      console.log(`   None found in any of the ${totalPages} PDF pages.`);
    }

    // C. Broad probe for scheme or keywords
    console.log(`\nC. Scheme Page Probe (where does scheme appear in PDF?):`);
    const schemeWords = (item.expectedScheme || '').split(/[\s()]+/).filter(w => w.length > 3);
    const pagesWithScheme = pdfPages.filter(p => p.text.toLowerCase().includes((schemeWords[0] || '').toLowerCase()));
    console.log(`   Pages mentioning "${schemeWords[0]}": [${pagesWithScheme.map(p => `PDF P.${p.pageIndex} (printed footer "${p.printedFooterPage || '?'}")`).join(', ')}]`);
  }

  // 4. Also inspect ALL answerable questions from scripts/eval/natural-questions.json
  console.log(`\n======================================================================`);
  console.log(`  ALL 25 ANSWERABLE QUESTIONS: expectedPage vs PDF Index vs Printed Page`);
  console.log(`======================================================================`);
  const allNatQuestions: any[] = JSON.parse(fs.readFileSync('scripts/eval/natural-questions.json', 'utf8'));
  const ansQuestions = allNatQuestions.filter(q => q.category === 'answerable');

  for (const q of ansQuestions) {
    if (!q.expectedPhrase) continue;
    const phrase = q.expectedPhrase;
    const inChunks = allChunks.filter(c => c.text && c.text.toLowerCase().includes(phrase.toLowerCase()));
    const inPages = pdfPages.filter(p => p.text.toLowerCase().includes(phrase.toLowerCase()));

    const chunkPages = Array.from(new Set(inChunks.map(c => c.pageNumber))).sort((a,b) => a-b);
    const pdfPageIndices = inPages.map(p => p.pageIndex);
    const printedFooters = inPages.map(p => p.printedFooterPage || 'none');

    console.log(`\n[${q.id}] expectedPage in JSON: ${q.expectedPage} | phrase: "${phrase}"`);
    console.log(`      Found in Stored Chunks PDF Page(s): [${chunkPages.join(', ')}]`);
    console.log(`      Found in Extracted PDF Index(es):   [${pdfPageIndices.join(', ')}] -> Printed Footers: [${printedFooters.join(', ')}]`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
