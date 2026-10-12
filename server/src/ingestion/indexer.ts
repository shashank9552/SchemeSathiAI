/**
 * SchemeSathi - Ingestion & Vector Indexing Pipeline
 * 
 * 1. Reads registered PDFs from data/raw_pdfs/manifest.json.
 * 2. Applies Quality Gate: quarantines pages with < 100 characters or high garble rate.
 *    Writes quarantined pages to data/processed/quarantine.json.
 * 3. Cleans text (stripping repeating headers/footers, publisher URLs).
 * 4. Chunks text using heading awareness and list preservation.
 * 5. Generates embeddings using the configured embedding provider.
 * 6. Stores chunks and vectors idempotently into MongoDB Atlas.
 * 
 * Usage:
 *   npm run ingest
 *   npx tsx src/ingestion/indexer.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { connectToDatabase, getChunksCollection, closeDatabaseConnection } from '../db/index.js';
import { getEmbeddingProvider } from '../providers/index.js';
import { TextCleaner, DocumentPageText } from './cleaner.js';
import { DocumentChunker, PageContent, DocumentInfo, GeneratedChunk } from './chunker.js';
import { analyzeGarble } from './garbleDetector.js';

interface ManifestSchemeEntry {
  file: string;
  schemeName: string;
  category: string;
  level: 'central' | 'state';
  language: string;
  sourceUrl: string;
}

interface Manifest {
  schemes: ManifestSchemeEntry[];
}

interface QuarantineRecord {
  file: string;
  pageNumber: number;
  reason: 'under_100_characters' | 'garble_rate_exceeded' | 'scanned_page';
  charCount: number;
  garbleRatePer1000: number;
  signatures: Record<string, number>;
  timestamp: string;
}

export async function runIngestion() {
  console.log('\n======================================================================');
  console.log('  SchemeSathi — PDF Ingestion & Vector Indexing Pipeline (Phase 1)');
  console.log('======================================================================\n');

  // Find project root directory containing data/raw_pdfs
  let rootDir = path.resolve(process.cwd());
  if (!fs.existsSync(path.resolve(rootDir, 'data', 'raw_pdfs')) && fs.existsSync(path.resolve(rootDir, '..', 'data', 'raw_pdfs'))) {
    rootDir = path.resolve(rootDir, '..');
  }

  const rawPdfsDir = path.resolve(rootDir, 'data', 'raw_pdfs');
  const processedDir = path.resolve(rootDir, 'data', 'processed');
  const manifestPath = path.resolve(rawPdfsDir, 'manifest.json');
  const quarantinePath = path.resolve(processedDir, 'quarantine.json');

  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }

  // 1. Check data/raw_pdfs directory
  if (!fs.existsSync(rawPdfsDir)) {
    console.error(`❌ Directory not found: ${rawPdfsDir}`);
    process.exit(1);
  }

  const physicalPdfs = fs
    .readdirSync(rawPdfsDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (physicalPdfs.length === 0) {
    console.log('ℹ️  No PDF files found in data/raw_pdfs/.');
    console.log('Please place official scheme PDFs into data/raw_pdfs/ and register them in manifest.json.');
    console.log('Pipeline stopped without inventing data.\n');
    return;
  }

  // 2. Read manifest.json
  let manifest: Manifest = { schemes: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      const rawManifest = fs.readFileSync(manifestPath, 'utf8');
      manifest = JSON.parse(rawManifest);
    } catch (err: any) {
      console.error(`❌ Failed to parse manifest.json: ${err.message}`);
      process.exit(1);
    }
  }

  const manifestMap = new Map<string, ManifestSchemeEntry>();
  for (const entry of manifest.schemes) {
    manifestMap.set(entry.file.toLowerCase(), entry);
  }

  // Warn about physical PDFs not registered in manifest
  for (const pdfFile of physicalPdfs) {
    if (!manifestMap.has(pdfFile.toLowerCase())) {
      console.warn(`⚠️  WARNING: "${pdfFile}" exists in data/raw_pdfs/ but is NOT registered in manifest.json. It will be skipped.`);
    }
  }

  if (manifest.schemes.length === 0) {
    console.log('\nℹ️  manifest.json currently contains 0 registered schemes.');
    console.log('To ingest PDFs:');
    console.log('  1. Register the approved English PDFs in data/raw_pdfs/manifest.json');
    console.log('  2. Re-run: npm run ingest\n');
    return;
  }

  // Filter to eligible files
  // Exclude corrupted Vision IAS Hindi PDFs as decided
  const eligibleEntries = manifest.schemes.filter((entry) => {
    const isCorruptedHindi =
      entry.language.toLowerCase() === 'hi' ||
      entry.file.includes('hindi') ||
      entry.file.includes('comprehensive-part-2');
    if (isCorruptedHindi) {
      console.log(`🚫 EXCLUDING "${entry.file}": Corrupted Hindi PDF excluded from Phase 1 corpus.`);
      return false;
    }
    return true;
  });

  if (eligibleEntries.length === 0) {
    console.log('ℹ️  No eligible English PDFs registered in manifest.json.');
    return;
  }

  // Dynamic import of pdfjs-dist
  let pdfjs: any;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    pdfjs = await import('pdfjs-dist');
  }

  const embeddingProvider = getEmbeddingProvider();
  console.log(`Using Embedding Provider: ${embeddingProvider.name} (${embeddingProvider.dimensions} dims)`);

  let collection: any = null;
  try {
    if (config.MONGODB_URI && !config.MONGODB_URI.includes('<cluster-url>')) {
      collection = await getChunksCollection();
    } else {
      console.log('⚠️  MONGODB_URI in .env is a placeholder (<cluster-url>).');
      console.log('   Chunks & embeddings will be processed and saved to data/processed/chunks_cache.json.');
    }
  } catch (dbErr: any) {
    console.warn(`⚠️  Could not connect to MongoDB Atlas (${dbErr.message}). Chunks will be cached to disk.`);
  }

  const quarantineRecords: QuarantineRecord[] = [];
  const chunker = new DocumentChunker(config.CHUNK_SIZE, config.CHUNK_OVERLAP);

  let totalDocsProcessed = 0;
  let totalPagesProcessed = 0;
  let totalPagesQuarantined = 0;
  let totalChunksIndexed = 0;

  for (const entry of eligibleEntries) {
    const filePath = path.resolve(rawPdfsDir, entry.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  File not found on disk: ${filePath}. Skipping.`);
      continue;
    }

    console.log(`\n----------------------------------------------------------------------`);
    console.log(`📖 Ingesting: ${entry.schemeName} (${entry.file})`);
    console.log(`   Category: ${entry.category} | Level: ${entry.level} | Lang: ${entry.language}`);

    const fileData = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjs.getDocument({
      data: fileData,
      useSystemFonts: true,
      disableFontFace: false,
    });
    const doc = await loadingTask.promise;
    const numPages = doc.numPages;

    const rawPages: DocumentPageText[] = [];
    const validPages: PageContent[] = [];

    // Extract pages & apply Quality Gate
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      totalPagesProcessed++;
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as Array<{ str: string; transform: number[] }>;

      // Reconstruct lines by Y position
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
      rawPages.push({
        pageNumber: pageNum,
        rawText: pageText,
        lines: reconstructedLines,
      });

      // Quality Gate check
      const analysis = analyzeGarble(pageText, config.MAX_GARBLE_RATE);
      if (analysis.isGarbled) {
        totalPagesQuarantined++;
        quarantineRecords.push({
          file: entry.file,
          pageNumber: pageNum,
          reason: analysis.quarantineReason!,
          charCount: analysis.totalChars,
          garbleRatePer1000: analysis.garbleRatePer1000,
          signatures: analysis.signatures,
          timestamp: new Date().toISOString(),
        });
      } else {
        validPages.push({
          pageNumber: pageNum,
          text: pageText,
        });
      }
    }

    console.log(`   Pages: ${numPages} total | ${validPages.length} eligible | ${numPages - validPages.length} quarantined`);

    if (validPages.length === 0) {
      console.warn(`⚠️  All pages of ${entry.file} were quarantined. No chunks will be created.`);
      continue;
    }

    // Cleaning: find repeating headers/footers across pages
    const repeatingBlacklist = TextCleaner.findRepeatingHeaderFooters(rawPages);
    if (repeatingBlacklist.size > 0) {
      console.log(`   Stripping ${repeatingBlacklist.size} repeating header/footer patterns.`);
    }

    const cleanedPages: PageContent[] = validPages.map((vp) => {
      const rawPageObj = rawPages.find((rp) => rp.pageNumber === vp.pageNumber)!;
      const cleaned = TextCleaner.cleanPageText(rawPageObj, repeatingBlacklist);
      return {
        pageNumber: vp.pageNumber,
        text: cleaned,
      };
    });

    // Chunking: heading-aware chunking preserving lists
    const docInfo: DocumentInfo = {
      sourceFile: entry.file,
      documentTitle: entry.schemeName,
      defaultSchemeName: entry.schemeName,
      category: entry.category,
      level: entry.level,
      language: entry.language,
    };

    const chunks: GeneratedChunk[] = chunker.chunkDocument(cleanedPages, docInfo);
    console.log(`   Generated ${chunks.length} chunks. Computing embeddings...`);

    if (chunks.length === 0) {
      continue;
    }

    // Embed chunks (reusing pre-computed cache if available to prevent redundant API calls)
    const chunkTexts = chunks.map((c) => c.text);
    const cacheFile = path.resolve(processedDir, `embeddings_${path.basename(entry.file, '.pdf')}.json`);
    const fallbackProofCache = path.resolve(processedDir, 'proof_embeddings.json');
    let embeddings: number[][] = [];

    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (Array.isArray(cached) && cached.length === chunks.length) {
          embeddings = cached;
          console.log(`   ✅ Loaded ${embeddings.length} cached embeddings from disk.`);
        }
      } catch {}
    } else if (fs.existsSync(fallbackProofCache)) {
      try {
        const cached = JSON.parse(fs.readFileSync(fallbackProofCache, 'utf8'));
        if (Array.isArray(cached) && cached.length === chunks.length) {
          embeddings = cached;
          console.log(`   ✅ Loaded ${embeddings.length} pre-computed embeddings from proof cache.`);
        }
      } catch {}
    }

    if (embeddings.length === 0) {
      embeddings = await embeddingProvider.embedDocuments(chunkTexts);
      fs.writeFileSync(cacheFile, JSON.stringify(embeddings), 'utf8');
    }

    // Prepare database documents
    const dbDocs = chunks.map((c, idx) => ({
      schemeName: c.metadata.schemeName,
      documentTitle: c.metadata.documentTitle,
      sourceFile: c.metadata.sourceFile,
      pageNumber: c.metadata.pageNumber,
      chunkIndex: c.metadata.chunkIndex,
      text: c.text,
      category: c.metadata.category,
      level: c.metadata.level,
      language: c.metadata.language,
      embedding: embeddings[idx],
      createdAt: new Date(),
    }));

    if (collection) {
      // Idempotent upsert: delete existing chunks for this sourceFile before inserting
      await collection.deleteMany({ sourceFile: entry.file });
      const insertResult = await collection.insertMany(dbDocs);
      console.log(`   ✅ Stored ${insertResult.insertedCount} chunks in MongoDB Atlas.`);
      totalChunksIndexed += insertResult.insertedCount;
    } else {
      const cacheFile = path.resolve(processedDir, `chunks_${path.basename(entry.file, '.pdf')}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(dbDocs, null, 2), 'utf8');
      console.log(`   ✅ Saved ${dbDocs.length} chunks with embeddings to ${cacheFile}.`);
      totalChunksIndexed += dbDocs.length;
    }
    totalDocsProcessed++;
  }

  // Write quarantine.json
  fs.writeFileSync(quarantinePath, JSON.stringify(quarantineRecords, null, 2), 'utf8');
  console.log(`\nQuarantine records saved to: ${quarantinePath} (${quarantineRecords.length} pages quarantined)`);

  console.log('\n======================================================================');
  console.log('🎉 INGESTION PIPELINE FINISHED');
  console.log(`   Documents Processed:   ${totalDocsProcessed}`);
  console.log(`   Total Pages Analyzed:  ${totalPagesProcessed}`);
  console.log(`   Pages Quarantined:     ${totalPagesQuarantined}`);
  console.log(`   Total Chunks Indexed:  ${totalChunksIndexed}`);
  console.log('======================================================================\n');

  if (collection) {
    await closeDatabaseConnection();
  }
}

// Execute when invoked directly
if (process.argv[1] && process.argv[1].endsWith('indexer.ts')) {
  runIngestion().catch((err) => {
    console.error('❌ Ingestion execution failed:');
    console.error(err);
    process.exit(1);
  });
}
