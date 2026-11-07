import path from 'node:path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';

interface CliArgs {
  source?: string;
  keep?: string;
  confirm: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    confirm: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--source' && i + 1 < args.length) {
      parsed.source = args[++i];
    } else if (arg === '--keep' && i + 1 < args.length) {
      parsed.keep = args[++i];
    } else if (arg === '--confirm') {
      parsed.confirm = true;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs();

  console.log('================================================================================');
  console.log('  SchemeSathi - Prune Old Ingestion Runs');
  console.log('================================================================================\n');

  if (!args.source || !args.keep) {
    console.error('❌ Missing required arguments.');
    console.error('Usage: npx tsx scripts/prune-old-runs.ts --source <file> --keep <runId> [--confirm]\n');
    console.error('Options:');
    console.error('  --source <file>   PDF file name in Atlas to prune (e.g. MSMESchemebooklet2025-26.pdf)');
    console.error('  --keep <runId>    The specific ingestRunId to preserve');
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

    const totalInCollection = await collection.countDocuments();
    const totalForSource = await collection.countDocuments({ sourceFile: args.source });
    const countToKeep = await collection.countDocuments({ sourceFile: args.source, ingestRunId: args.keep });

    const pruneFilter = {
      sourceFile: args.source,
      ingestRunId: { $ne: args.keep },
    };
    const countToPrune = await collection.countDocuments(pruneFilter);

    // Group candidates by run ID to give visibility
    const candidateRuns = await collection.aggregate([
      { $match: pruneFilter },
      { $group: { _id: '$ingestRunId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log(`Database Statistics:`);
    console.log(`  Total documents in collection           : ${totalInCollection}`);
    console.log(`  Total documents for source "${args.source}" : ${totalForSource}`);
    console.log(`  Documents to keep (run "${args.keep}")      : ${countToKeep}`);
    console.log(`  Documents eligible to prune             : ${countToPrune}`);

    if (candidateRuns.length > 0) {
      console.log(`\nBreakdown of runs to be pruned:`);
      candidateRuns.forEach((r) => {
        const label = r._id === null || r._id === undefined ? '(no ingestRunId / legacy)' : `"${r._id}"`;
        console.log(`  - Run ${label}: ${r.count} chunks`);
      });
    }

    if (countToPrune === 0) {
      console.log('\n✅ No older chunks found matching prune filter. Nothing to prune.');
      return;
    }

    if (!args.confirm) {
      console.log('\n--------------------------------------------------------------------------------');
      console.log(`⚠️  DRY RUN ONLY: ${countToPrune} documents would be deleted.`);
      console.log('To execute the deletion, re-run this command with the --confirm flag:');
      console.log(`npx tsx scripts/prune-old-runs.ts --source "${args.source}" --keep "${args.keep}" --confirm`);
      console.log('--------------------------------------------------------------------------------');
    } else {
      console.log('\n🗑️  Executing deletion with --confirm...');
      const result = await collection.deleteMany(pruneFilter);
      console.log(`✅ Successfully deleted ${result.deletedCount} older chunks.`);
      const remainingTotal = await collection.countDocuments();
      console.log(`📊 Updated collection count: ${remainingTotal} documents.`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('❌ Error executing prune script:', err);
  process.exit(1);
});
