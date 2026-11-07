import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
import { config } from '../server/src/config/index.js';
import { normalizeText } from './verify-all-190-normalized.js';

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

async function main() {
  const pages = await extractPagesSpatial();
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const coll = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);
  const chunks = await coll.find({}).sort({ pageNumber: 1, chunkIndex: 1 }).toArray();
  await client.close();

  const userPages = [10, 14, 16, 19, 22, 25, 29, 34, 39, 43, 45, 46, 47, 48, 51];
  console.log(`Checking chunks on pages: ${userPages.join(', ')}`);

  for (const p of userPages) {
    const pChunks = chunks.filter(c => c.pageNumber === p);
    const pageData = pages.get(p)!;
    console.log(`\n=== PAGE ${p} (Total Chunks: ${pChunks.length}) ===`);
    pChunks.forEach((c, idx) => {
      let body = c.text;
      const dnl = body.indexOf('\n\n');
      if (dnl !== -1 && dnl < 150) body = body.slice(dnl + 2).trim();
      const normBody = normalizeText(body);
      const exactMatch = pageData.rawText.includes(body);
      const normMatch = pageData.normText.includes(normBody);
      console.log(`[Chunk ${idx + 1}] _id: ${c._id} | Exact: ${exactMatch} | NormMatch: ${normMatch}`);
      console.log(`  Scheme: "${c.schemeName}" | Section: "${c.sectionTitle}"`);
      console.log(`  First 80 norm: "${normBody.slice(0, 80)}"`);
    });
  }
}

main().catch(console.error);
