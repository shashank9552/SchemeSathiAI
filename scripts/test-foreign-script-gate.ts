import fs from 'node:fs';
import path from 'node:path';
import { analyzeGarble } from '../server/src/ingestion/garbleDetector.js';

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  console.log('================================================================================');
  console.log('  SWEEPING ALL 61 PAGES WITH UPDATED GARBLE / FOREIGN SCRIPT GATE');
  console.log('================================================================================\n');

  const flaggedPages: Array<{
    page: number;
    charCount: number;
    reason: string;
    foreignChars: Array<{ ch: string; code: string; name: string }>;
  }> = [];

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
    const reconstructedLines: string[] = [];
    for (const y of sortedYKeys) {
      const lineItems = linesMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((item) => item.text).join(' ').trim();
      if (lineText) reconstructedLines.push(lineText);
    }

    const pageText = reconstructedLines.join('\n');
    const analysis = analyzeGarble(pageText);

    // Find any code points outside the allowed set
    const foreignMatches: Array<{ ch: string; code: string; name: string }> = [];
    for (let i = 0; i < pageText.length; i++) {
      const ch = pageText[i];
      const code = ch.charCodeAt(0);
      // Allowed ranges:
      // ASCII: 0x0000 - 0x007F
      // Latin-1 Supplement: 0x00A0 - 0x00FF
      // Devanagari: 0x0900 - 0x097F
      // General Punctuation: 0x2000 - 0x206F
      // Currency Symbols: 0x20A0 - 0x20CF
      const isAllowed =
        (code >= 0x0000 && code <= 0x007F) ||
        (code >= 0x00A0 && code <= 0x00FF) ||
        (code >= 0x0900 && code <= 0x097F) ||
        (code >= 0x2000 && code <= 0x206F) ||
        (code >= 0x20A0 && code <= 0x20CF);

      if (!isAllowed) {
        let scriptName = 'Unknown / Foreign';
        if (code >= 0x0400 && code <= 0x052F) scriptName = 'Cyrillic';
        else if ((code >= 0x0370 && code <= 0x03FF) || (code >= 0x1F00 && code <= 0x1FFF)) scriptName = 'Greek';
        else if (code >= 0x4E00 && code <= 0x9FFF) scriptName = 'CJK';
        else if (code >= 0x0600 && code <= 0x06FF) scriptName = 'Arabic';
        else if (code >= 0x0590 && code <= 0x05FF) scriptName = 'Hebrew';
        else if (code >= 0xE000 && code <= 0xF8FF) scriptName = 'Private Use';

        foreignMatches.push({
          ch,
          code: 'U+' + code.toString(16).toUpperCase().padStart(4, '0'),
          name: scriptName
        });
      }
    }

    if (analysis.isGarbled || foreignMatches.length > 0) {
      flaggedPages.push({
        page: pageNum,
        charCount: analysis.totalChars,
        reason: analysis.quarantineReason || 'none',
        foreignChars: foreignMatches
      });
    }
  }

  console.log(`Results: ${flaggedPages.length} pages flagged out of 61:\n`);
  flaggedPages.forEach((f) => {
    console.log(`Page ${f.page}:`);
    console.log(`  charCount: ${f.charCount}`);
    console.log(`  quarantineReason: ${f.reason}`);
    console.log(`  foreignChars count: ${f.foreignChars.length}`);
    if (f.foreignChars.length > 0) {
      // Deduplicate by code
      const uniqueCodes = Array.from(new Set(f.foreignChars.map(c => `${c.ch} (${c.code}, ${c.name})`)));
      console.log(`  unique foreign code points:`, uniqueCodes);
    }
    console.log('');
  });

  // TEST ON REAL CHUNK A83 TEXT
  console.log('================================================================================');
  console.log('  TEST ON REAL TEXT OF CHUNK a83');
  console.log('================================================================================');
  // Chunk a83 text from directory page 57, with Cyrillic characters like 'с' (U+0441) or 'а' (U+0430)
  const a83Text = `Directory of Field Offices, MSME-DFOs & Testing Centres - Directory & Contact Details\n\n12. Industrial Estate, Fax : 0141-2210553\nJaipur -302 006. Rajasthan\nMSME-DFO, Ph : 0191-2431077 dcdi-jammu@dcmsme.gov.in`;
  const a83WithCyrillic = `Directory of Field Offices, MSME-DFOs & Testing Centres - Directory & Contact Details\n\n12. Industrial Estate, Fax : 0141-2210553\nJаipur -302 006. Rаjаsthаn\nMSME-DFO, Ph : 0191-2431077 dcdi-jammu@dcmsme.gov.in`; // contains Cyrillic small 'а' U+0430

  console.log('\nTesting a83 clean text:');
  const a83CleanAnalysis = analyzeGarble(a83Text);
  console.log(`  isGarbled: ${a83CleanAnalysis.isGarbled}, reason: ${a83CleanAnalysis.quarantineReason}`);

  console.log('\nTesting a83 with Cyrillic (homoglyphs U+0430 "а"):');
  const a83CyrillicAnalysis = analyzeGarble(a83WithCyrillic);
  console.log(`  isGarbled: ${a83CyrillicAnalysis.isGarbled}, reason: ${a83CyrillicAnalysis.quarantineReason}`);
  console.log(`  signatures.foreignScriptChars: ${a83CyrillicAnalysis.signatures.foreignScriptChars}`);
}

main().catch(console.error);
