import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executePrune, CliArgs } from '../../scripts/prune-old-runs.js';

interface MockDoc {
  _id: string;
  sourceFile: string;
  ingestRunId?: string;
  text: string;
}

function createMockCollection(initialDocs: MockDoc[]) {
  let docs = [...initialDocs];

  return {
    async countDocuments(filter?: any): Promise<number> {
      if (!filter || Object.keys(filter).length === 0) return docs.length;

      return docs.filter((d) => {
        if (filter.sourceFile && d.sourceFile !== filter.sourceFile) return false;
        if (filter.ingestRunId) {
          if (typeof filter.ingestRunId === 'object' && '$ne' in filter.ingestRunId) {
            return d.ingestRunId !== filter.ingestRunId.$ne;
          }
          return d.ingestRunId === filter.ingestRunId;
        }
        return true;
      }).length;
    },

    async deleteMany(filter: any): Promise<{ deletedCount: number }> {
      const before = docs.length;
      docs = docs.filter((d) => {
        if (filter.sourceFile && d.sourceFile !== filter.sourceFile) return true;
        if (filter.ingestRunId && '$ne' in filter.ingestRunId) {
          return d.ingestRunId === filter.ingestRunId.$ne;
        }
        return true;
      });
      const deletedCount = before - docs.length;
      return { deletedCount };
    },

    getDocs() {
      return docs;
    },
  };
}

describe('prune-old-runs.ts Unit Tests with Mocked Collection', () => {
  const seedDocs: MockDoc[] = [
    { _id: '1', sourceFile: 'MSMESchemebooklet2025-26.pdf', ingestRunId: 'run_legacy_1', text: 'chunk 1' },
    { _id: '2', sourceFile: 'MSMESchemebooklet2025-26.pdf', ingestRunId: 'run_legacy_1', text: 'chunk 2' },
    { _id: '3', sourceFile: 'MSMESchemebooklet2025-26.pdf', text: 'legacy chunk without run ID' },
    { _id: '4', sourceFile: 'MSMESchemebooklet2025-26.pdf', ingestRunId: 'run_active_target', text: 'target chunk 1' },
    { _id: '5', sourceFile: 'MSMESchemebooklet2025-26.pdf', ingestRunId: 'run_active_target', text: 'target chunk 2' },
    { _id: '6', sourceFile: 'OtherScheme.pdf', ingestRunId: 'run_other', text: 'other document chunk' },
  ];

  it('refuses to prune when --keep is missing', async () => {
    const coll = createMockCollection(seedDocs);
    const args: CliArgs = { source: 'MSMESchemebooklet2025-26.pdf', confirm: false };

    await assert.rejects(
      async () => executePrune(coll, args),
      /Missing required arguments/
    );
  });

  it('refuses to prune when keep run has 0 chunks for that source', async () => {
    const coll = createMockCollection(seedDocs);
    const args: CliArgs = {
      source: 'MSMESchemebooklet2025-26.pdf',
      keep: 'non_existent_run_id',
      confirm: false,
    };

    await assert.rejects(
      async () => executePrune(coll, args),
      /Keep run "non_existent_run_id" has 0 chunks for source/
    );
  });

  it('reports keep count and eligible prune count in dry run mode without deleting', async () => {
    const coll = createMockCollection(seedDocs);
    const args: CliArgs = {
      source: 'MSMESchemebooklet2025-26.pdf',
      keep: 'run_active_target',
      confirm: false,
    };

    const res = await executePrune(coll, args);
    assert.strictEqual(res.countToKeep, 2);
    assert.strictEqual(res.countToPrune, 3);
    assert.strictEqual(res.deletedCount, 0);
    assert.strictEqual(res.dryRun, true);
    assert.strictEqual(coll.getDocs().length, 6); // no documents deleted
  });

  it('deletes only older chunks for source and preserves keep run when --confirm is passed', async () => {
    const coll = createMockCollection(seedDocs);
    const args: CliArgs = {
      source: 'MSMESchemebooklet2025-26.pdf',
      keep: 'run_active_target',
      confirm: true,
    };

    const res = await executePrune(coll, args);
    assert.strictEqual(res.countToKeep, 2);
    assert.strictEqual(res.countToPrune, 3);
    assert.strictEqual(res.deletedCount, 3);
    assert.strictEqual(res.dryRun, false);

    const remaining = coll.getDocs();
    assert.strictEqual(remaining.length, 3);
    assert.ok(remaining.every((d) => d.ingestRunId === 'run_active_target' || d.sourceFile === 'OtherScheme.pdf'));
  });
});
