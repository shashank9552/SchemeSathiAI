import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runIngestion } from '../src/ingestion/indexer.js';
import { EmbeddingCache } from '../src/providers/embeddingCache.js';

describe('Real Ingest Atlas Connection Failure Tests', () => {
  it('stops with non-zero exit code and "NOT STORED IN ATLAS" when Atlas connection fails', async () => {
    const priorExitCode = process.exitCode;
    process.exitCode = 0;

    const mockedFailedConnection = async () => {
      const err: any = new Error('SSL alert 80: alert handshaking failure');
      err.code = 'ERR_SSL_ALERT_80';
      throw err;
    };

    const mockEmbeddingProvider = {
      name: 'mock-gemini',
      dimensions: 768,
      embedDocuments: async (texts: string[]) => {
        return texts.map((t, idx) => {
          const vec = new Array(768).fill(0.01);
          vec[0] = (idx + 1) * 0.05;
          vec[1] = Math.sin(t.length);
          return vec;
        });
      },
    };

    let caughtError: any = null;
    try {
      await runIngestion({
        dryRun: false,
        getCollectionFn: mockedFailedConnection,
        embeddingProvider: mockEmbeddingProvider,
      });
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Must throw an error when Atlas connection fails');
    assert.match(
      caughtError.message,
      /NOT STORED IN ATLAS/,
      `Error message must contain "NOT STORED IN ATLAS". Got: "${caughtError.message}"`
    );
    assert.equal(
      process.exitCode,
      1,
      'process.exitCode must be set to 1 on Atlas connection failure'
    );

    // Verify disk cache of embeddings still exists and was not wiped
    const cache = new EmbeddingCache();
    assert.ok(
      cache.size() > 0,
      'Embedding disk cache must remain intact and accessible'
    );

    // Restore exitCode for subsequent tests
    process.exitCode = priorExitCode;
  });

  it('stops with "NOT STORED IN ATLAS" if write to Atlas fails', async () => {
    const priorExitCode = process.exitCode;
    process.exitCode = 0;

    const mockedFailedInsertCollection = async () => ({
      countDocuments: async () => 0,
      deleteMany: async () => ({ deletedCount: 0 }),
      insertMany: async () => {
        throw new Error('MongoNetworkError: connection timed out');
      },
    });

    const mockEmbeddingProvider = {
      name: 'mock-gemini',
      dimensions: 768,
      embedDocuments: async (texts: string[]) => {
        return texts.map((t, idx) => {
          const vec = new Array(768).fill(0.01);
          vec[0] = (idx + 1) * 0.05;
          vec[1] = Math.sin(t.length);
          return vec;
        });
      },
    };

    let caughtError: any = null;
    try {
      await runIngestion({
        dryRun: false,
        getCollectionFn: mockedFailedInsertCollection,
        embeddingProvider: mockEmbeddingProvider,
      });
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Must throw an error when Atlas insert fails');
    assert.match(
      caughtError.message,
      /NOT STORED IN ATLAS/,
      `Error message must contain "NOT STORED IN ATLAS". Got: "${caughtError.message}"`
    );
    assert.equal(process.exitCode, 1, 'process.exitCode must be set to 1');

    process.exitCode = priorExitCode;
  });
});
