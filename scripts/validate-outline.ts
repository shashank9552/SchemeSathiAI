import fs from 'node:fs';
import path from 'node:path';

export interface SubSchemeEntry {
  subScheme: string;
  startPage: number;
  endPage: number;
  titleOnPage: string;
  tocPage?: number;
}

export interface OutlineEntry {
  schemeName: string;
  startPage: number;
  endPage: number;
  index?: boolean;
  reason?: string;
  titleOnPage?: string;
  tocPage?: number;
  subSchemes?: SubSchemeEntry[];
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[\s\r\n\t]+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

async function extractPagesFirst5Lines(): Promise<Map<number, string[]>> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pageLines = new Map<number, string[]>();

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
    pageLines.set(pageNum, lines.slice(0, 5));
  }
  return pageLines;
}

export async function validateOutlineEntries(entries: OutlineEntry[], pageFirst5Map: Map<number, string[]>): Promise<{ errors: string[]; passed: boolean }> {
  const errors: string[] = [];

  // Sort by startPage
  entries.sort((a, b) => a.startPage - b.startPage);

  // 1. Continuous Range (P1 to P61)
  let expectedPage = 1;
  for (const e of entries) {
    if (e.startPage > e.endPage) {
      errors.push(`[Range Error] "${e.schemeName}": startPage ${e.startPage} > endPage ${e.endPage}`);
    }
    if (e.startPage !== expectedPage) {
      if (e.startPage < expectedPage) {
        errors.push(`[Overlap Error] "${e.schemeName}" starts at P${e.startPage}, expected P${expectedPage}`);
      } else {
        errors.push(`[Gap Error] Gap between P${expectedPage} and P${e.startPage - 1} before "${e.schemeName}"`);
      }
    }
    expectedPage = e.endPage + 1;
  }
  if (expectedPage !== 62) {
    errors.push(`[Coverage Error] Expected to cover through page 61, but reached P${expectedPage - 1}`);
  }

  // 2. Sub-ranges inside parent
  for (const e of entries) {
    if (e.subSchemes && e.subSchemes.length > 0) {
      for (const sub of e.subSchemes) {
        if (sub.startPage < e.startPage || sub.endPage > e.endPage) {
          errors.push(`[Sub-range Error] Sub-scheme "${sub.subScheme}" (P${sub.startPage}–P${sub.endPage}) outside parent "${e.schemeName}" (P${e.startPage}–P${e.endPage})`);
        }
      }
    }
  }

  // 3. titleOnPage ONLY for index: true, reason REQUIRED for index: false
  for (const e of entries) {
    if (e.index === false) {
      if (!e.reason || e.reason.trim().length === 0) {
        errors.push(`[Missing Reason] Non-indexed entry "${e.schemeName}" (P${e.startPage}–P${e.endPage}) must have an explicit reason`);
      }
      if (e.titleOnPage) {
        errors.push(`[Invalid titleOnPage] Non-indexed entry "${e.schemeName}" must NOT have titleOnPage`);
      }
    } else {
      // index: true (or undefined -> defaults to true)
      if (!e.titleOnPage) {
        errors.push(`[Missing titleOnPage] Indexed entry "${e.schemeName}" (P${e.startPage}) must have titleOnPage`);
      } else {
        const lines = pageFirst5Map.get(e.startPage) || [];
        const first5Norm = normalize(lines.join(' '));
        const titleNorm = normalize(e.titleOnPage);
        const words = titleNorm.split(' ').filter(w => w.length > 2);
        const isPresent = first5Norm.includes(titleNorm) ||
                          words.every(w => first5Norm.includes(w)) ||
                          (words.length >= 3 && words.slice(0, 4).every(w => first5Norm.includes(w)));
        if (!isPresent) {
          errors.push(`[Title Mismatch] P${e.startPage}: "${e.schemeName}" titleOnPage "${e.titleOnPage}" NOT found in first 5 lines ("${first5Norm.slice(0, 80)}")`);
        }
      }

      // Check sub-schemes titleOnPage
      if (e.subSchemes) {
        for (const sub of e.subSchemes) {
          if (!sub.titleOnPage) {
            errors.push(`[Missing titleOnPage] Sub-scheme "${sub.subScheme}" (P${sub.startPage}) must have titleOnPage`);
          } else {
            const lines = pageFirst5Map.get(sub.startPage) || [];
            const first5Norm = normalize(lines.join(' '));
            const titleNorm = normalize(sub.titleOnPage);
            const words = titleNorm.split(' ').filter(w => w.length > 2);
            const isPresent = first5Norm.includes(titleNorm) ||
                              words.every(w => first5Norm.includes(w)) ||
                              (words.length >= 3 && words.slice(0, 4).every(w => first5Norm.includes(w)));
            if (!isPresent) {
              errors.push(`[Title Mismatch] P${sub.startPage}: Sub-scheme "${sub.subScheme}" titleOnPage "${sub.titleOnPage}" NOT found in first 5 lines`);
            }
          }
        }
      }
    }
  }

  // 4. TOC formula: tocPage + 2 == startPage
  for (const e of entries) {
    if (e.tocPage !== undefined) {
      if (e.tocPage + 2 !== e.startPage) {
        errors.push(`[TOC Formula Error] "${e.schemeName}": TOC page ${e.tocPage} + 2 != startPage ${e.startPage}`);
      }
    }
    if (e.subSchemes) {
      for (const sub of e.subSchemes) {
        if (sub.tocPage !== undefined) {
          if (sub.tocPage + 2 !== sub.startPage) {
            errors.push(`[TOC Formula Error] Sub-scheme "${sub.subScheme}": TOC page ${sub.tocPage} + 2 != startPage ${sub.startPage}`);
          }
        }
      }
    }
  }

  return { errors, passed: errors.length === 0 };
}

async function main() {
  console.log('================================================================================');
  console.log('  VALIDATE OUTLINE (data/outline.review.json)');
  console.log('================================================================================\n');

  const outlinePath = path.resolve('data/outline.review.json');
  if (!fs.existsSync(outlinePath)) {
    console.error(`❌ File not found: ${outlinePath}`);
    process.exit(1);
  }

  const entries: OutlineEntry[] = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));
  console.log(`Loaded ${entries.length} entries from ${outlinePath}`);

  const pageFirst5Map = await extractPagesFirst5Lines();

  // 1. Run live validation on data/outline.review.json
  const result = await validateOutlineEntries(entries, pageFirst5Map);

  if (result.passed) {
    console.log('✅ PASS: All outline validations passed (0 gaps, 0 overlaps, sub-schemes in bounds, valid titleOnPage on all indexed schemes, explicit reasons on all non-indexed pages, TOC formula verified).');
  } else {
    console.error(`❌ FAILED with ${result.errors.length} errors:`);
    result.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  // 2. Negative Test: Verify that a wrong titleOnPage makes it fail
  console.log('\n--- NEGATIVE TEST: Verifying validator fails on incorrect titleOnPage ---');
  const negativeEntries: OutlineEntry[] = JSON.parse(JSON.stringify(entries));
  const pmegpEntry = negativeEntries.find(e => e.startPage === 5)!;
  pmegpEntry.titleOnPage = 'INVALID SCHEME TITLE THAT DOES NOT EXIST ON PAGE 5';

  const negativeResult = await validateOutlineEntries(negativeEntries, pageFirst5Map);
  if (!negativeResult.passed && negativeResult.errors.some(e => e.includes('Title Mismatch'))) {
    console.log(`✅ NEGATIVE TEST PASSED: Validator successfully caught the bogus title and failed with:`);
    console.log(`   "${negativeResult.errors.find(e => e.includes('Title Mismatch'))}"`);
  } else {
    console.error(`❌ NEGATIVE TEST FAILED: Validator did not fail on bogus title!`);
    process.exit(1);
  }

  console.log('\n================================================================================');
  console.log('✅ ALL VALIDATIONS AND NEGATIVE TESTS COMPLETED SUCCESSFULLY!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
