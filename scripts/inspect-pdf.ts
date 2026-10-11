/**
 * SchemeSathi - PDF Text Extraction & Devanagari Quality Inspector
 * 
 * Inspects a PDF page to verify extraction fidelity, page mapping,
 * and Hindi (Devanagari) Unicode rendering.
 * 
 * Usage:
 *   npx tsx scripts/inspect-pdf.ts --file <filename-or-path> [--page <pageNumber>]
 *   npm run inspect:pdf -- --file <filename> --page 1
 */

import fs from 'node:fs';
import path from 'node:path';

// Parse command line arguments
function parseArgs(): { file?: string; page: number } {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let page = 1;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      file = args[++i];
    } else if (arg === '--page' || arg === '-p') {
      page = Number.parseInt(args[++i], 10);
    } else if (!file && !arg.startsWith('-')) {
      file = arg;
    } else if (file && !arg.startsWith('-')) {
      const parsedPage = Number.parseInt(arg, 10);
      if (!Number.isNaN(parsedPage)) {
        page = parsedPage;
      }
    }
  }

  return { file, page: Number.isNaN(page) || page < 1 ? 1 : page };
}

// Resolve PDF path (supports both relative/absolute paths and filenames in data/raw_pdfs)
function resolvePdfPath(targetFile?: string): string | null {
  const rootDir = process.cwd();
  const rawPdfsDir = path.resolve(rootDir, 'data', 'raw_pdfs');

  if (!targetFile) {
    return null;
  }

  // Check direct path first
  const directPath = path.resolve(rootDir, targetFile);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    return directPath;
  }

  // Check inside data/raw_pdfs
  const inRawPdfs = path.resolve(rawPdfsDir, targetFile);
  if (fs.existsSync(inRawPdfs) && fs.statSync(inRawPdfs).isFile()) {
    return inRawPdfs;
  }

  return null;
}

// List all PDFs found in data/raw_pdfs
function listAvailablePdfs(): string[] {
  const rawPdfsDir = path.resolve(process.cwd(), 'data', 'raw_pdfs');
  if (!fs.existsSync(rawPdfsDir)) {
    return [];
  }
  return fs
    .readdirSync(rawPdfsDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'));
}

async function inspectPdf() {
  const { file: requestedFile, page: targetPage } = parseArgs();

  console.log('\n======================================================');
  console.log('  SchemeSathi — PDF Text & Devanagari Inspector');
  console.log('======================================================\n');

  if (!requestedFile) {
    const available = listAvailablePdfs();
    console.log('No PDF file specified.');
    if (available.length === 0) {
      console.log('ℹ️  No PDF files currently found in data/raw_pdfs/.');
      console.log('\nTo test inspection:');
      console.log('  1. Place your official scheme PDF into data/raw_pdfs/');
      console.log('  2. Run: npm run inspect:pdf -- --file <filename.pdf> --page 1\n');
    } else {
      console.log('Available PDFs in data/raw_pdfs/:');
      for (const f of available) {
        console.log(`  - ${f}`);
      }
      console.log(`\nExample usage:`);
      console.log(`  npm run inspect:pdf -- --file "${available[0]}" --page 1\n`);
    }
    return;
  }

  const resolvedPath = resolvePdfPath(requestedFile);
  if (!resolvedPath) {
    console.error(`❌ Error: PDF file not found: "${requestedFile}"`);
    console.error(`Checked locations:`);
    console.error(`  - ${path.resolve(process.cwd(), requestedFile)}`);
    console.error(`  - ${path.resolve(process.cwd(), 'data', 'raw_pdfs', requestedFile)}`);
    return;
  }

  console.log(`📄 Target File: ${path.basename(resolvedPath)}`);
  console.log(`📁 Full Path:   ${resolvedPath}`);
  console.log(`📑 Target Page: ${targetPage}`);

  // Dynamic import of pdfjs-dist for Node environment
  // We use legacy build for Node.js compatibility
  let pdfjs: any;
  try {
    // pdfjs-dist legacy build has built-in Node polyfills
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (err) {
    try {
      pdfjs = await import('pdfjs-dist');
    } catch (importErr) {
      console.error('❌ Failed to load pdfjs-dist. Please ensure npm dependencies are installed.');
      console.error(importErr);
      process.exit(1);
    }
  }

  const fileData = new Uint8Array(fs.readFileSync(resolvedPath));
  const loadingTask = pdfjs.getDocument({
    data: fileData,
    useSystemFonts: true,
    disableFontFace: false,
  });

  const doc = await loadingTask.promise;
  const numPages = doc.numPages;

  console.log(`📊 Total Pages: ${numPages}\n`);

  if (targetPage > numPages) {
    console.error(`❌ Error: Requested page ${targetPage} exceeds total pages (${numPages}).`);
    return;
  }

  const page = await doc.getPage(targetPage);
  const textContent = await page.getTextContent();

  // Reconstruct layout lines by grouping items with similar vertical position (y coordinate)
  const items = textContent.items as Array<{
    str: string;
    transform: number[];
    width: number;
    height: number;
  }>;

  if (items.length === 0) {
    console.log('⚠️  WARNING: Zero text items extracted from this page!');
    console.log('   This is likely a SCANNED IMAGE PDF.');
    console.log('   Scanned documents require an OCR pipeline (e.g. Tesseract OCR) to extract text.\n');
    return;
  }

  // Sort items primarily by Y (top to bottom), then by X (left to right)
  // PDF coordinate system has Y=0 at the bottom, so higher Y is higher on the page
  const linesMap = new Map<number, Array<{ x: number; text: string }>>();
  const Y_TOLERANCE = 3.0; // Items within 3 points vertically are on the same line

  for (const item of items) {
    if (!item.str || item.str.trim() === '') continue;
    const x = item.transform[4];
    const y = item.transform[5];

    let foundY: number | null = null;
    for (const lineY of linesMap.keys()) {
      if (Math.abs(lineY - y) <= Y_TOLERANCE) {
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

  // Sort lines from top of page to bottom (descending Y)
  const sortedYKeys = Array.from(linesMap.keys()).sort((a, b) => b - a);
  const reconstructedLines: string[] = [];

  for (const y of sortedYKeys) {
    const lineItems = linesMap.get(y)!;
    // Sort items left to right
    lineItems.sort((a, b) => a.x - b.x);
    const lineText = lineItems.map((item) => item.text).join(' ').trim();
    if (lineText) {
      reconstructedLines.push(lineText);
    }
  }

  const fullPageText = reconstructedLines.join('\n');

  // Unicode analysis for Devanagari & fidelity
  const devanagariChars = fullPageText.match(/[\u0900-\u097F]/g) || [];
  const latinChars = fullPageText.match(/[a-zA-Z]/g) || [];
  const replacementChars = fullPageText.match(/\uFFFD/g) || [];
  const totalChars = fullPageText.length;
  const wordCount = fullPageText.trim().split(/\s+/).filter(Boolean).length;

  console.log('--- Page Extraction Metrics ---');
  console.log(`Total Characters:       ${totalChars}`);
  console.log(`Word Count:             ${wordCount}`);
  console.log(`Devanagari Characters:  ${devanagariChars.length} (${totalChars > 0 ? ((devanagariChars.length / totalChars) * 100).toFixed(1) : 0}%)`);
  console.log(`Latin (English) Chars:  ${latinChars.length} (${totalChars > 0 ? ((latinChars.length / totalChars) * 100).toFixed(1) : 0}%)`);
  console.log(`Replacement Glyphs:     ${replacementChars.length}`);

  // Quality checks
  let qualityWarning = false;
  if (replacementChars.length > 0) {
    qualityWarning = true;
    console.log('\n⚠️  WARNING: Detected replacement characters (\uFFFD). Some glyphs failed font decoding.');
  }

  // Check for orphan Devanagari vowel signs (matras appearing alone with spaces before them)
  const orphanMatras = fullPageText.match(/\s[\u093E-\u094C\u0962\u0963]/g) || [];
  if (orphanMatras.length > 3) {
    qualityWarning = true;
    console.log(`\n⚠️  WARNING: Detected ${orphanMatras.length} detached Devanagari vowel signs (matras).`);
    console.log('   This often indicates non-standard font encoding or reversed conjuncts.');
  }

  if (devanagariChars.length > 0) {
    console.log('\n✅ Devanagari text detected.');
  } else if (latinChars.length > 0) {
    console.log('\nℹ️  English / Latin text detected (no Devanagari script on this page).');
  }

  console.log('\n--- Extracted Text Preview (Page ' + targetPage + ') ---');
  console.log('------------------------------------------------------');
  reconstructedLines.forEach((line, idx) => {
    console.log(`[L${String(idx + 1).padStart(3, '0')}] ${line}`);
  });
  console.log('------------------------------------------------------\n');

  if (qualityWarning) {
    console.log('⚠️  POTENTIAL QUALITY ISSUE DETECTED. Please review the text above.');
  } else {
    console.log('✅ Extraction completed cleanly.');
  }
}

inspectPdf().catch((err) => {
  console.error('\n❌ Unexpected error during PDF inspection:');
  console.error(err);
  process.exit(1);
});
