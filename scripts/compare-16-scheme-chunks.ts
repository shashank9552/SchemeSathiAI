import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
import { config } from '../server/src/config/index.js';

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

async function extractPagesSpatial() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve('data/raw_pdfs/MSMESchemebooklet2025-26.pdf');
  const fileData = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: fileData, useSystemFonts: true }).promise;

  const pages = new Map<number, { rawText: string; normText: string }>();

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
    const pageText = lines.join('\n');
    pages.set(pageNum, {
      rawText: pageText,
      normText: normalizeText(pageText)
    });
  }
  return pages;
}

function findDetailedDiff(chunkNorm: string, pageNorm: string): { pageSnippet: string; diffOffset: number; chunkDiff: string; pageDiff: string; reason: string } {
  const cWords = chunkNorm.split(' ');
  let bestPStart = -1;

  for (let i = 0; i < Math.min(6, cWords.length); i++) {
    const probe = cWords.slice(i, i + 3).join(' ');
    const pos = pageNorm.indexOf(probe);
    if (pos !== -1) {
      const prefixWords = cWords.slice(0, i).join(' ');
      bestPStart = Math.max(0, pos - prefixWords.length - 1);
      break;
    }
  }

  if (bestPStart === -1) {
    for (let i = 0; i < Math.min(6, cWords.length); i++) {
      const probe = cWords.slice(i, i + 2).join(' ');
      const pos = pageNorm.indexOf(probe);
      if (pos !== -1) {
        const prefixWords = cWords.slice(0, i).join(' ');
        bestPStart = Math.max(0, pos - prefixWords.length - 1);
        break;
      }
    }
  }

  if (bestPStart === -1) bestPStart = 0;

  // Align start if possible
  const firstWord = cWords[0];
  const firstWordPos = pageNorm.indexOf(firstWord, Math.max(0, bestPStart - 50));
  if (firstWordPos !== -1) {
    bestPStart = firstWordPos;
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
  const chunkDiff = chunkNorm.slice(diffOffset, Math.min(chunkNorm.length, diffOffset + 40));
  const pageDiff = pageNorm.slice(pIdx, Math.min(pageNorm.length, pIdx + 40));
  const pageSnippet = pageNorm.slice(Math.max(0, pIdx - 30), Math.min(pageNorm.length, pIdx + 70));

  let reason = '';
  if (chunkNorm.includes('|')) {
    reason = 'Markdown table pipe delimiters ("|") added during manual curation';
  } else if (chunkDiff.startsWith('detailed information:')) {
    reason = 'Section header label "detailed information:" inserted into chunk text';
  } else if (chunkNorm.includes('₹') || chunkDiff.includes('₹') || pageDiff.includes('rs.')) {
    reason = 'Currency notation difference ("₹" in chunk vs "rs." in PDF)';
  } else if (chunkDiff.includes('http') || pageDiff.includes('http')) {
    reason = 'URL formatting or line-break difference in web link';
  } else if (chunkDiff.startsWith('apply on:')) {
    reason = 'Inserted prefix "apply on:" not present in PDF text stream at that offset';
  } else {
    reason = `Extracted token divergence at char ${diffOffset} ("${chunkDiff.slice(0, 15)}" vs "${pageDiff.slice(0, 15)}")`;
  }

  return { pageSnippet, diffOffset, chunkDiff, pageDiff, reason };
}

async function main() {
  const pages = await extractPagesSpatial();
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const chunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  // The 16 target scheme chunks requested by user:
  // Pages 10, 14, 16, 19, 22, 25 (x2), 29, 34, 39, 43, 45, 46, 47, 48, 51
  const targetPageMap = [
    { page: 10, selector: (c: any) => c.sectionTitle.includes('Extent') || c.text.includes('|') },
    { page: 14, selector: (c: any) => c.sectionTitle.includes('apply') || c.text.includes('SPVs') },
    { page: 16, selector: (c: any) => c.text.includes('Advance MDP') },
    { page: 19, selector: (c: any) => c.text.includes('Mahila Coir') },
    { page: 22, selector: (c: any) => c.text.includes('PMS Scheme guidelines') },
    { page: 25, selector: (c: any) => c.text.includes('Publicity Cost') },
    { page: 25, selector: (c: any) => c.text.includes('MoUs with 18') },
    { page: 29, selector: (c: any) => c.text.includes('Livelihood Business') },
    { page: 34, selector: (c: any) => c.text.includes('State Government or any') },
    { page: 39, selector: (c: any) => c.text.includes('Total Quality Management') },
    { page: 43, selector: (c: any) => c.text.includes('in order to enhance their') },
    { page: 45, selector: (c: any) => c.text.includes('Student Project:') || c.text.includes('75%') },
    { page: 46, selector: (c: any) => c.text.includes('champions. This will act') },
    { page: 47, selector: (c: any) => c.text.includes('Implementation Cost') || c.text.includes('1,20,000') },
    { page: 48, selector: (c: any) => c.text.includes('Beneficiary Contribution:') },
    { page: 51, selector: (c: any) => c.text.includes('Fund Type Daughter') }
  ];

  console.log('================================================================================');
  console.log('  ITEM 1: THE 16 SCHEME NO-MATCH CHUNKS DETAILED COMPARISON');
  console.log('================================================================================\n');

  let idx = 0;
  for (const item of targetPageMap) {
    idx++;
    const pageChunks = chunks.filter(c => c.pageNumber === item.page);
    const chunk = pageChunks.find(item.selector) || pageChunks[0];

    let body = chunk.text;
    const dnl = body.indexOf('\n\n');
    if (dnl !== -1 && dnl < 150) body = body.slice(dnl + 2).trim();

    const normBody = normalizeText(body);
    const pageData = pages.get(item.page)!;
    const { pageSnippet, diffOffset, chunkDiff, pageDiff, reason } = findDetailedDiff(normBody, pageData.normText);

    console.log(`[#${idx}] CHUNK _id: ${chunk._id} | Page: ${chunk.pageNumber}`);
    console.log(`  Scheme: "${chunk.schemeName}" | Section: "${chunk.sectionTitle}"`);
    console.log(`  NORMALIZED CHUNK BODY (100 chars):`);
    console.log(`    "${normBody.slice(0, 100)}..."`);
    console.log(`  BEST-MATCHING NORMALIZED PAGE TEXT (100 chars):`);
    console.log(`    "...${pageSnippet.slice(0, 100)}..."`);
    console.log(`  FIRST POINT OF DIFFERENCE:`);
    console.log(`    Offset in chunk: char ${diffOffset}`);
    console.log(`    Chunk has: "${chunkDiff.slice(0, 30)}"`);
    console.log(`    Page has:  "${pageDiff.slice(0, 30)}"`);
    console.log(`  WHY IT FAILS: ${reason}\n`);
  }
}

main().catch(console.error);
