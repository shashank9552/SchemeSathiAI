import fs from 'node:fs';
import path from 'node:path';

function normalizeText(str: string): string {
  return str
    .replace(/[•\u2022\u25cf\u25cb\u25aa\u25ab\u2023\u2043\u204c\u204d\u2219]/g, ' ')
    .replace(/(\w+)-\s+(\w+)/g, '$1$2')
    .replace(/[\u2018\u2019\u201a\u201b']/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f"]/g, '"')
    .replace(/[\s\r\n\t]+/g, ' ')
    .trim()
    .toLowerCase();
}

async function extractSpecificPages(pageNumbers: number[]) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages = new Map<number, { rawText: string; normText: string }>();

  for (const pageNum of pageNumbers) {
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
    const pageText = lines.join('\n');
    pages.set(pageNum, {
      rawText: pageText,
      normText: normalizeText(pageText)
    });
  }
  return pages;
}

function findDetailedDiff(chunkNorm: string, pageNorm: string) {
  const cWords = chunkNorm.split(' ').filter(w => w.length > 2);
  let bestPStart = -1;

  for (let i = 0; i < Math.min(10, cWords.length); i++) {
    const probe = cWords.slice(i, i + 3).join(' ');
    const pos = pageNorm.indexOf(probe);
    if (pos !== -1) {
      const prefixWords = cWords.slice(0, i).join(' ');
      bestPStart = Math.max(0, pos - prefixWords.length - 1);
      break;
    }
  }

  if (bestPStart === -1) {
    for (let i = 0; i < Math.min(10, cWords.length); i++) {
      const probe = cWords.slice(i, i + 2).join(' ');
      const pos = pageNorm.indexOf(probe);
      if (pos !== -1) {
        const prefixWords = cWords.slice(0, i).join(' ');
        bestPStart = Math.max(0, pos - prefixWords.length - 1);
        break;
      }
    }
  }

  if (bestPStart === -1 && cWords.length > 0) {
    const pos = pageNorm.indexOf(cWords[0]);
    if (pos !== -1) bestPStart = pos;
  }

  if (bestPStart === -1) bestPStart = 0;

  // Align start if first word of chunk exists nearby
  if (cWords.length > 0) {
    const firstWordPos = pageNorm.indexOf(cWords[0], Math.max(0, bestPStart - 60));
    if (firstWordPos !== -1 && Math.abs(firstWordPos - bestPStart) < 80) {
      bestPStart = firstWordPos;
    }
  }

  let cIdx = 0;
  let pIdx = bestPStart;

  while (cIdx < chunkNorm.length && pIdx < pageNorm.length) {
    if (chunkNorm[cIdx] !== pageNorm[pIdx]) {
      break;
    }
    cIdx++;
    pIdx++;
  }

  const diffOffset = cIdx;
  const chunkDiff = chunkNorm.slice(diffOffset, Math.min(chunkNorm.length, diffOffset + 50));
  const pageDiff = pageNorm.slice(pIdx, Math.min(pageNorm.length, pIdx + 50));
  const pageSnippet = pageNorm.slice(Math.max(0, pIdx - 20), Math.min(pageNorm.length, pIdx + 80));

  let reason = '';
  if (chunkNorm.includes('|')) {
    reason = 'Markdown pipe-table delimiters ("|") manually formatted in stored chunk';
  } else if (chunkNorm.includes('detailed information:')) {
    reason = 'Label "detailed information:" inserted into stored chunk';
  } else if (chunkNorm.includes('₹') || chunkDiff.includes('₹')) {
    reason = 'Currency symbol replacement ("₹" in chunk vs "rs." in PDF)';
  } else if (chunkDiff.startsWith('apply on:') || chunkNorm.includes('apply on:')) {
    reason = 'Prefix "apply on:" inserted into stored chunk';
  } else if (chunkDiff.includes('http') || pageDiff.includes('http')) {
    reason = 'Hyperlink URL tokenization / line-break reformatting';
  } else if (chunkDiff.startsWith('who can apply:')) {
    reason = 'Field header "who can apply:" inserted into chunk text';
  } else {
    reason = `Text stream divergence at offset ${diffOffset}: chunk="${chunkDiff.slice(0, 20)}" vs page="${pageDiff.slice(0, 20)}"`;
  }

  return { pageSnippet, diffOffset, chunkDiff, pageDiff, reason };
}

async function main() {
  const targetPages = [10, 14, 16, 19, 22, 25, 29, 34, 39, 43, 45, 46, 47, 48, 51];
  const pages = await extractSpecificPages(targetPages);

  const chunksRaw = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

  // Target selectors for the 16 scheme chunks:
  // Pages 10, 14, 16, 19, 22, 25 x2, 29, 34, 39, 43, 45, 46, 47, 48, 51
  const targets = [
    { page: 10, match: (c: any) => c.text.includes('|') || c.sectionTitle.includes('Extent') },
    { page: 14, match: (c: any) => c.text.includes('SPVs') || c.text.includes('Detailed Information:') },
    { page: 16, match: (c: any) => c.text.includes('Advance MDP') },
    { page: 19, match: (c: any) => c.text.includes('Mahila Coir') },
    { page: 22, match: (c: any) => c.text.includes('refer PMS Scheme guidelines') },
    { page: 25, match: (c: any) => c.text.includes('Publicity Cost') },
    { page: 25, match: (c: any) => c.text.includes('MoUs with 18') },
    { page: 29, match: (c: any) => c.text.includes('Livelihood Business Incubator') },
    { page: 34, match: (c: any) => c.text.includes('State Government or any State Govt') },
    { page: 39, match: (c: any) => c.text.includes('Total Quality Management') },
    { page: 43, match: (c: any) => c.text.includes('in order to enhance their global') },
    { page: 45, match: (c: any) => c.text.includes('Student Project') || c.text.includes('75%') || c.pageNumber === 45 },
    { page: 46, match: (c: any) => c.text.includes('champions. This will act') || c.pageNumber === 46 },
    { page: 47, match: (c: any) => c.text.includes('Implementation Cost') || c.text.includes('1,20,000') || c.pageNumber === 47 },
    { page: 48, match: (c: any) => c.text.includes('Beneficiary Contribution') || c.pageNumber === 48 },
    { page: 51, match: (c: any) => c.text.includes('Daughter Funds') || c.text.includes('availability of growth capital') }
  ];

  console.log('================================================================================');
  console.log('  ITEM 1: THE 16 SCHEME NO-MATCH CHUNKS DETAILED COMPARISON');
  console.log('================================================================================\n');

  let count = 0;
  for (const t of targets) {
    count++;
    const pageChunks = chunksRaw.filter((c: any) => c.pageNumber === t.page);
    let chunk = pageChunks.find(t.match);
    if (!chunk) {
      console.log(`[#${count}] WARNING: No matching chunk found on page ${t.page}! Available chunks: ${pageChunks.length}`);
      continue;
    }

    let body = chunk.text;
    const dnl = body.indexOf('\n\n');
    if (dnl !== -1 && dnl < 150) {
      body = body.slice(dnl + 2).trim();
    }

    const normBody = normalizeText(body);
    const pageData = pages.get(t.page)!;
    const isNormMatch = pageData.normText.includes(normBody);

    const { pageSnippet, diffOffset, chunkDiff, pageDiff, reason } = findDetailedDiff(normBody, pageData.normText);

    console.log(`[#${count}] Page ${chunk.pageNumber} | Chunk Index: ${chunk.chunkIndex} | NormMatch: ${isNormMatch}`);
    console.log(`  Scheme: "${chunk.schemeName}"`);
    console.log(`  Section: "${chunk.sectionTitle}"`);
    console.log(`  NORMALIZED CHUNK BODY (first 100 chars):`);
    console.log(`    "${normBody.slice(0, 100)}..."`);
    console.log(`  BEST-MATCHING NORMALIZED PAGE TEXT (100 chars):`);
    console.log(`    "...${pageSnippet.slice(0, 100)}..."`);
    console.log(`  FIRST POINT OF DIFFERENCE:`);
    console.log(`    Offset in chunk: char ${diffOffset}`);
    console.log(`    Chunk has: "${chunkDiff.slice(0, 35)}"`);
    console.log(`    Page has:  "${pageDiff.slice(0, 35)}"`);
    console.log(`  WHY IT FAILS: ${reason}\n`);
  }
}

main().catch(console.error);
