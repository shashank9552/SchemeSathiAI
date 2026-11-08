import path from 'node:path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';

export interface CliArgs {
  source?: string;
  keep?: string;
  confirm: boolean;
}

export interface PruneResult {
  totalInCollection: number;
  totalForSource: number;
  countToKeep: number;
  countToPrune: number;
  deletedCount: number;
  dryRun: boolean;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const parsed: CliArgs = {
    confirm: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source' && i + 1 < argv.length) {
      parsed.source = argv[++i];
    } else if (arg === '--keep' && i + 1 < argv.length) {
      parsed.keep = argv[++i];
    } else if (arg === '--confirm') {
      parsed.confirm = true;
    }
  }

  return parsed;
}

export async function executePrune(collection: any, args: CliArgs): Promise<PruneResult> {
  if (!args.source || !args.keep) {
    throw new Error('Refusing to prune: Missing required arguments. Both --source and --keep must be provided.');
  }

  const totalInCollection = await collection.countDocuments();
  const totalForSource = await collection.countDocuments({ sourceFile: args.source });
  const countToKeep = await collection.countDocuments({ sourceFile: args.source, ingestRunId: args.keep });

  if (countToKeep === 0) {
    throw new Error(
      `Refusing to prune: Keep run "${args.keep}" has 0 chunks for source "${args.source}". Target keep run must have at least 1 chunk.`
    );
  }

  const pruneFilter = {
    sourceFile: args.source,
    ingestRunId: { $ne: args.keep },
  };
  const countToPrune = await collection.countDocuments(pruneFilter);

  let deletedCount = 0;
  if (args.confirm && countToPrune > 0) {
    const result = await collection.deleteMany(pruneFilter);
    deletedCount = result.deletedCount || 0;
  }

  return {
    totalInCollection,
    totalForSource,
    countToKeep,
    countToPrune,
    deletedCount,
    dryRun: !args.confirm,
  };
}

async function main() {
  const args = parseArgs();

  console.log('================================================================================');
  console.log('  SchemeSathi - Prune Old Ingestion Runs');
  console.log('================================================================================\n');

  if (!args.source || !args.keep) {
    console.error('❌ Refusing to prune: Missing required arguments.');
    console.error('Usage: npx tsx scripts/prune-old-runs.ts --source <file> --keep <runId> [--confirm]\n');
    console.error('Options:');
    console.error('  --source <file>   PDF file name in Atlas to prune (e.g. MSMESchemebooklet2025-26.pdf)');
    console.error('  --keep <runId>    The specific ingestRunId to preserve (must have >= 1 chunk)');
    console.error('  --confirm         Perform actual deletion (defaults to dry run if omitted)');
    process.exit(1);
  }

  console.log(`Target Source File : ${args.source}`);
  console.log(`Run ID to Keep     : ${args.keep}`);
  console.log(`Execution Mode     : ${args.confirm ? '🔴 LIVE DELETION (--confirm active)' : '🟢 DRY RUN (safe mode)'}\n`);

  const client = new MongoClient(config.MONGODB_URI);
  try {
    await client.connect();
    const collection = client.db(config.MONGODB_DB_NAME).collection(config.MONGODB_COLLECTION_NAME);

    // Group candidates by run ID to give visibility
    const pruneFilter = { sourceFile: args.source, ingestRunId: { $ne: args.keep } };
    const candidateRuns = await collection.aggregate([
      { $match: pruneFilter },
      { $group: { _id: '$ingestRunId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    const res = await executePrune(collection, args);

    console.log(`Database Statistics:`);
    console.log(`  Total documents in collection           : ${res.totalInCollection}`);
    console.log(`  Total documents for source "${args.source}" : ${res.totalForSource}`);
    console.log(`  Documents to keep (run "${args.keep}")      : ${res.countToKeep}`);
    console.log(`  Documents eligible to prune             : ${res.countToPrune}`);

    if (candidateRuns.length > 0) {
      console.log(`\nBreakdown of runs to be pruned:`);
      candidateRuns.forEach((r: any) => {
        const label = r._id === null || r._id === undefined ? '(no ingestRunId / legacy)' : `"${r._id}"`;
        console.log(`  - Run ${label}: ${r.count} chunks`);
      });
    }

    if (res.countToPrune === 0) {
      console.log('\n✅ No older chunks found matching prune filter. Nothing to prune.');
      return;
    }

    if (res.dryRun) {
      console.log('\n--------------------------------------------------------------------------------');
      console.log(`⚠️  DRY RUN ONLY: ${res.countToPrune} documents would be deleted.`);
      console.log('To execute the deletion, re-run this command with the --confirm flag:');
      console.log(`npx tsx scripts/prune-old-runs.ts --source "${args.source}" --keep "${args.keep}" --confirm`);
      console.log('--------------------------------------------------------------------------------');
    } else {
      console.log('\n🗑️  Executing deletion with --confirm...');
      console.log(`✅ Successfully deleted ${res.deletedCount} older chunks.`);
      const remainingTotal = await collection.countDocuments();
      console.log(`📊 Updated collection count: ${remainingTotal} documents.`);
    }
  } catch (err: any) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('prune-old-runs.ts')) {
  main().catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
}
