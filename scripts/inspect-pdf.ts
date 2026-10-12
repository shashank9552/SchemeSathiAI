/**
 * SchemeSathi - PDF Text Extraction & Devanagari Quality Inspector
 * 
 * Inspects PDF pages to verify extraction fidelity, page mapping,
 * and detects corrupted font encodings / garbled Devanagari text.
 * 
 * Usage:
 *   npx tsx scripts/inspect-pdf.ts --file <filename-or-path> [--page <pageNumber>]
 *   npx tsx scripts/inspect-pdf.ts --summary [--file <filename>]
 *   npm run inspect:pdf -- --summary
 */

import fs from 'node:fs';
import path from 'node:path';

export interface GarbleAnalysis {
  garbleCount: number;
  garbleRatePer1000: number;
  totalChars: number;
  devanagariChars: number;
  devanagariRatio: number;
  signatures: {
    sequenceMpa: number;            // "म्प्" artifact
    detachedMatras: number;         // Consonant + space + matra
    orphanMatras: number;           // Space/start + matra
    replacementGlyphs: number;      // \uFFFD
    danglingHalant: number;         // Halant without valid consonant
    legacyFontArtifacts: number;    // Legacy font artifacts («»¿¡)
  };
  isGarbled: boolean;
  quarantineReason?: 'under_100_characters' | 'garble_rate_exceeded' | 'scanned_page';
}

// Known corruption signatures in broken Indian government / coaching PDFs
export function analyzeGarble(text: string, maxGarbleRate = 5.0): GarbleAnalysis {
  const totalChars = text.length;
  const devanagariMatches = text.match(/[\u0900-\u097F]/g) || [];
  const devanagariChars = devanagariMatches.length;
  const devanagariRatio = totalChars > 0 ? (devanagariChars / totalChars) : 0;

  // 1. Signature: sequence "म्प्" (common legacy KrutiDev/broken CID font artifact)
  const sequenceMpa = (text.match(/म्प्/g) || []).length;

  // 2. Signature: Devanagari consonant followed by space then detached matra
  const detachedMatras = (text.match(/[\u0915-\u0939]\s+[\u093E-\u094C\u0962\u0963]/g) || []).length;

  // 3. Signature: Orphan matras (start of word or following space without consonant)
  const orphanMatras = (text.match(/(?:^|\s)[\u093E-\u094C\u0962\u0963]/g) || []).length;

  // 4. Signature: Unicode replacement characters \uFFFD
  const replacementGlyphs = (text.match(/\uFFFD/g) || []).length;

  // 5. Signature: Dangling halant (followed by space or non-consonant)
  const danglingHalant = (text.match(/[\u094D](?:\s+|$|[^\u0915-\u0939])/g) || []).length;

  // 6. Signature: Legacy font artifacts
  const legacyFontArtifacts = (text.match(/[«»¿¡¶§]/g) || []).length;

  const signatures = {
    sequenceMpa,
    detachedMatras,
    orphanMatras,
    replacementGlyphs,
    danglingHalant,
    legacyFontArtifacts,
  };

  const garbleCount = sequenceMpa + detachedMatras + orphanMatras + replacementGlyphs + danglingHalant + legacyFontArtifacts;
  const garbleRatePer1000 = totalChars > 0 ? (garbleCount / totalChars) * 1000 : 0;

  let quarantineReason: GarbleAnalysis['quarantineReason'];
  if (totalChars === 0) {
    quarantineReason = 'scanned_page';
  } else if (totalChars < 100) {
    quarantineReason = 'under_100_characters';
  } else if (garbleRatePer1000 > maxGarbleRate) {
    quarantineReason = 'garble_rate_exceeded';
  }

  const isGarbled = Boolean(quarantineReason);

  return {
    garbleCount,
    garbleRatePer1000,
    totalChars,
    devanagariChars,
    devanagariRatio,
    signatures,
    isGarbled,
    quarantineReason,
  };
}

// Parse command line arguments
function parseArgs(): { file?: string; page: number; summary: boolean; maxGarbleRate: number } {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let page = 1;
  let summary = false;
  let maxGarbleRate = 5.0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      file = args[++i];
    } else if (arg === '--page' || arg === '-p') {
      page = Number.parseInt(args[++i], 10);
    } else if (arg === '--summary' || arg === '-s') {
      summary = true;
    } else if (arg === '--max-garble-rate') {
      maxGarbleRate = Number.parseFloat(args[++i]);
    } else if (!file && !arg.startsWith('-')) {
      file = arg;
    } else if (file && !arg.startsWith('-')) {
      const parsedPage = Number.parseInt(arg, 10);
      if (!Number.isNaN(parsedPage)) {
        page = parsedPage;
      }
    }
  }

  return {
    file,
    page: Number.isNaN(page) || page < 1 ? 1 : page,
    summary,
    maxGarbleRate: Number.isNaN(maxGarbleRate) ? 5.0 : maxGarbleRate,
  };
}

// Resolve PDF path
function resolvePdfPath(targetFile?: string): string | null {
  const rootDir = process.cwd();
  const rawPdfsDir = path.resolve(rootDir, 'data', 'raw_pdfs');

  if (!targetFile) return null;

  const directPath = path.resolve(rootDir, targetFile);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    return directPath;
  }

  const inRawPdfs = path.resolve(rawPdfsDir, targetFile);
  if (fs.existsSync(inRawPdfs) && fs.statSync(inRawPdfs).isFile()) {
    return inRawPdfs;
  }

  return null;
}

// List all PDFs found in data/raw_pdfs
function listAvailablePdfs(): string[] {
  const rawPdfsDir = path.resolve(process.cwd(), 'data', 'raw_pdfs');
  if (!fs.existsSync(rawPdfsDir)) return [];
  return fs.readdirSync(rawPdfsDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
}

// Helper to extract lines from a PDF page using pdfjs-dist
async function extractPageText(doc: any, pageNum: number): Promise<{ text: string; lines: string[] }> {
  const page = await doc.getPage(pageNum);
  const textContent = await page.getTextContent();
  const items = textContent.items as Array<{
    str: string;
    transform: number[];
    width: number;
    height: number;
  }>;

  if (items.length === 0) {
    return { text: '', lines: [] };
  }

  const linesMap = new Map<number, Array<{ x: number; text: string }>>();
  const Y_TOLERANCE = 3.0;

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

  const sortedYKeys = Array.from(linesMap.keys()).sort((a, b) => b - a);
  const reconstructedLines: string[] = [];

  for (const y of sortedYKeys) {
    const lineItems = linesMap.get(y)!;
    lineItems.sort((a, b) => a.x - b.x);
    const lineText = lineItems.map((item) => item.text).join(' ').trim();
    if (lineText) {
      reconstructedLines.push(lineText);
    }
  }

  return {
    text: reconstructedLines.join('\n'),
    lines: reconstructedLines,
  };
}

// Run summary on a specific PDF
async function runSummaryOnPdf(pdfjs: any, filePath: string, maxGarbleRate: number) {
  const fileName = path.basename(filePath);
  console.log(`\n======================================================================`);
  console.log(`FILE: ${fileName}`);
  console.log(`PATH: ${filePath}`);
  console.log(`======================================================================`);

  const fileData = new Uint8Array(fs.readFileSync(filePath));
  let doc: any;
  try {
    const loadingTask = pdfjs.getDocument({
      data: fileData,
      useSystemFonts: true,
      disableFontFace: false,
    });
    doc = await loadingTask.promise;
  } catch (err: any) {
    console.error(`❌ Failed to load PDF "${fileName}": ${err.message}`);
    return;
  }

  const numPages = doc.numPages;
  console.log(`Total Pages: ${numPages}`);
  console.log(`Max Allowed Garble Rate: ${maxGarbleRate.toFixed(1)} per 1000 chars\n`);

  let totalCharsAllPages = 0;
  let totalDevanagariAllPages = 0;
  let totalGarbleAllPages = 0;
  let validPagesCount = 0;
  const quarantinedPages: Array<{ page: number; reason: string; chars: number; rate: number }> = [];

  console.log('PAGE-BY-PAGE INSPECTION REPORT:');
  console.log('----------------------------------------------------------------------');

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const { text } = await extractPageText(doc, pageNum);
    const analysis = analyzeGarble(text, maxGarbleRate);

    totalCharsAllPages += analysis.totalChars;
    totalDevanagariAllPages += analysis.devanagariChars;
    totalGarbleAllPages += analysis.garbleCount;

    const devPct = analysis.totalChars > 0 ? (analysis.devanagariRatio * 100).toFixed(1) : '0.0';
    const rateStr = analysis.garbleRatePer1000.toFixed(2);

    if (analysis.isGarbled) {
      quarantinedPages.push({
        page: pageNum,
        reason: analysis.quarantineReason!,
        chars: analysis.totalChars,
        rate: analysis.garbleRatePer1000,
      });
      console.log(
        `[Page ${String(pageNum).padStart(3, ' ')}] Chars: ${String(analysis.totalChars).padStart(5, ' ')} | Devanagari: ${devPct.padStart(5, ' ')}% | Garble: ${rateStr.padStart(6, ' ')}/1k | ⚠️ QUARANTINE (${analysis.quarantineReason})`
      );
    } else {
      validPagesCount++;
      console.log(
        `[Page ${String(pageNum).padStart(3, ' ')}] Chars: ${String(analysis.totalChars).padStart(5, ' ')} | Devanagari: ${devPct.padStart(5, ' ')}% | Garble: ${rateStr.padStart(6, ' ')}/1k | ✅ OK`
      );
    }
  }

  const overallGarbleRate = totalCharsAllPages > 0 ? (totalGarbleAllPages / totalCharsAllPages) * 1000 : 0;
  const overallDevPct = totalCharsAllPages > 0 ? (totalDevanagariAllPages / totalCharsAllPages) * 100 : 0;

  console.log('----------------------------------------------------------------------');
  console.log(`SUMMARY FOR ${fileName}:`);
  console.log(`  Total Pages:            ${numPages}`);
  console.log(`  Valid Pages (Eligible): ${validPagesCount}`);
  console.log(`  Quarantined Pages:      ${quarantinedPages.length}`);
  console.log(`  Total Characters:       ${totalCharsAllPages.toLocaleString()}`);
  console.log(`  Devanagari Ratio:       ${overallDevPct.toFixed(2)}%`);
  console.log(`  Overall Garble Rate:    ${overallGarbleRate.toFixed(2)} per 1000 chars`);

  if (quarantinedPages.length > 0) {
    console.log(`  Quarantine Breakdown:`);
    const reasons: Record<string, number> = {};
    for (const q of quarantinedPages) {
      reasons[q.reason] = (reasons[q.reason] || 0) + 1;
    }
    for (const [r, count] of Object.entries(reasons)) {
      console.log(`    - ${r}: ${count} pages`);
    }
  }

  let verdict = '✅ ELIGIBLE FOR INGESTION';
  if (quarantinedPages.length === numPages) {
    verdict = '❌ 100% QUARANTINED (SCANNED OR FULLY CORRUPTED)';
  } else if (overallGarbleRate > maxGarbleRate) {
    verdict = '❌ EXCLUDED (HIGH CORRUPTION RATE)';
  } else if (quarantinedPages.length > 0) {
    verdict = '⚠️ PARTIALLY ELIGIBLE (SOME PAGES WILL BE QUARANTINED)';
  }

  console.log(`  VERDICT:                ${verdict}`);
  console.log(`======================================================================\n`);
}

async function inspectPdf() {
  const { file: requestedFile, page: targetPage, summary, maxGarbleRate } = parseArgs();

  let pdfjs: any;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    try {
      pdfjs = await import('pdfjs-dist');
    } catch (importErr) {
      console.error('❌ Failed to load pdfjs-dist. Ensure node_modules are installed.');
      console.error(importErr);
      process.exit(1);
    }
  }

  // If --summary flag is passed
  if (summary) {
    console.log('\n======================================================');
    console.log('  SchemeSathi — Batch PDF Summary & Quality Gate');
    console.log('======================================================');

    const availablePdfs = listAvailablePdfs();
    const filesToProcess = requestedFile ? [requestedFile] : availablePdfs;

    if (filesToProcess.length === 0) {
      console.log('No PDFs found in data/raw_pdfs/.');
      return;
    }

    for (const file of filesToProcess) {
      const resolved = resolvePdfPath(file);
      if (resolved) {
        await runSummaryOnPdf(pdfjs, resolved, maxGarbleRate);
      } else {
        console.error(`❌ PDF not found: ${file}`);
      }
    }
    return;
  }

  // Single page inspection mode
  console.log('\n======================================================');
  console.log('  SchemeSathi — PDF Text & Devanagari Inspector');
  console.log('======================================================\n');

  if (!requestedFile) {
    const available = listAvailablePdfs();
    console.log('No PDF file specified.');
    if (available.length === 0) {
      console.log('ℹ️  No PDF files currently found in data/raw_pdfs/.');
    } else {
      console.log('Available PDFs in data/raw_pdfs/:');
      for (const f of available) {
        console.log(`  - ${f}`);
      }
      console.log(`\nExample usage:`);
      console.log(`  npm run inspect:pdf -- --file "${available[0]}" --page 1`);
      console.log(`  npm run inspect:pdf -- --summary\n`);
    }
    return;
  }

  const resolvedPath = resolvePdfPath(requestedFile);
  if (!resolvedPath) {
    console.error(`❌ Error: PDF file not found: "${requestedFile}"`);
    return;
  }

  console.log(`📄 Target File: ${path.basename(resolvedPath)}`);
  console.log(`📁 Full Path:   ${resolvedPath}`);
  console.log(`📑 Target Page: ${targetPage}`);

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

  const { text: fullPageText, lines: reconstructedLines } = await extractPageText(doc, targetPage);
  const analysis = analyzeGarble(fullPageText, maxGarbleRate);

  const latinChars = (fullPageText.match(/[a-zA-Z]/g) || []).length;
  const wordCount = fullPageText.trim().split(/\s+/).filter(Boolean).length;

  console.log('--- Page Extraction Metrics ---');
  console.log(`Total Characters:       ${analysis.totalChars}`);
  console.log(`Word Count:             ${wordCount}`);
  console.log(`Devanagari Characters:  ${analysis.devanagariChars} (${(analysis.devanagariRatio * 100).toFixed(1)}%)`);
  console.log(`Latin (English) Chars:  ${latinChars} (${analysis.totalChars > 0 ? ((latinChars / analysis.totalChars) * 100).toFixed(1) : 0}%)`);
  console.log(`Total Garble Signatures:${analysis.garbleCount}`);
  console.log(`Garble Rate:            ${analysis.garbleRatePer1000.toFixed(2)} per 1000 characters`);
  console.log(`Quarantine Status:      ${analysis.isGarbled ? `⚠️ QUARANTINED (${analysis.quarantineReason})` : '✅ PASSED'}`);

  console.log('\n--- Detected Corruption Signatures Breakdown ---');
  console.log(`  - "म्प्" Sequence:             ${analysis.signatures.sequenceMpa}`);
  console.log(`  - Detached Matras:            ${analysis.signatures.detachedMatras}`);
  console.log(`  - Orphan Matras:              ${analysis.signatures.orphanMatras}`);
  console.log(`  - Replacement Glyphs (\uFFFD):    ${analysis.signatures.replacementGlyphs}`);
  console.log(`  - Dangling Halants:           ${analysis.signatures.danglingHalant}`);
  console.log(`  - Legacy Artifacts:           ${analysis.signatures.legacyFontArtifacts}`);

  console.log('\n--- Extracted Text Preview (Page ' + targetPage + ') ---');
  console.log('------------------------------------------------------');
  reconstructedLines.forEach((line, idx) => {
    console.log(`[L${String(idx + 1).padStart(3, '0')}] ${line}`);
  });
  console.log('------------------------------------------------------\n');
}

if (process.argv[1] && process.argv[1].includes('inspect-pdf')) {
  inspectPdf().catch((err) => {
    console.error('\n❌ Unexpected error during PDF inspection:');
    console.error(err);
    process.exit(1);
  });
}
