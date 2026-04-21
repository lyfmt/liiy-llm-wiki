import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('resolveGraphDatabaseUrl', () => {
  it('reads GRAPH_DATABASE_URL from project env text', async () => {
    const { resolveGraphDatabaseUrl } = await import('../../src/storage/graph-database.js');

    expect(resolveGraphDatabaseUrl('RUNTIME_API_KEY=\nGRAPH_DATABASE_URL=postgres://localhost:5432/llm_wiki_liiy\n')).toBe(
      'postgres://localhost:5432/llm_wiki_liiy'
    );
  });

  it('rejects missing GRAPH_DATABASE_URL', async () => {
    const { resolveGraphDatabaseUrl } = await import('../../src/storage/graph-database.js');

    expect(() => resolveGraphDatabaseUrl('RUNTIME_API_KEY=\n')).toThrow('Missing GRAPH_DATABASE_URL');
  });
});

describe('shared graph database pools', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('node:module');
  });

  it('reuses one cached pool per database url and disposes it on demand', async () => {
    const constructorCalls: string[] = [];
    const endCalls: string[] = [];

    vi.doMock('node:module', () => ({
      createRequire: () => () => ({
        Pool: class FakePool {
          readonly connectionString: string;

          constructor(options: { connectionString: string }) {
            this.connectionString = options.connectionString;
            constructorCalls.push(options.connectionString);
          }

          async query() {
            return { rows: [] };
          }

          async connect() {
            throw new Error('connect should not be used in this test');
          }

          async end() {
            endCalls.push(this.connectionString);
          }
        }
      })
    }));

    const { disposeGraphDatabasePools, getSharedGraphDatabasePool } = await import('../../src/storage/graph-database.js');

    const first = getSharedGraphDatabasePool('postgres://localhost:5432/llm_wiki_liiy');
    const second = getSharedGraphDatabasePool('postgres://localhost:5432/llm_wiki_liiy');

    expect(first).toBe(second);
    expect(constructorCalls).toEqual(['postgres://localhost:5432/llm_wiki_liiy']);

    await disposeGraphDatabasePools();

    expect(endCalls).toEqual(['postgres://localhost:5432/llm_wiki_liiy']);

    const third = getSharedGraphDatabasePool('postgres://localhost:5432/llm_wiki_liiy');

    expect(third).not.toBe(first);
    expect(constructorCalls).toEqual([
      'postgres://localhost:5432/llm_wiki_liiy',
      'postgres://localhost:5432/llm_wiki_liiy'
    ]);

    await disposeGraphDatabasePools();
  });
});

describe('createGraphDatabasePool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('node:module');
  });

  it('returns a database client with query, transaction, and end methods', async () => {
    const statements: string[] = [];
    const releases: string[] = [];
    const ends: string[] = [];

    vi.doMock('node:module', () => ({
      createRequire: () => () => ({
        Pool: class FakePool {
          readonly connectionString: string;

          constructor(options: { connectionString: string }) {
            this.connectionString = options.connectionString;
          }

          async query(sql: string) {
            statements.push(`pool:${sql}`);
            return { rows: [] };
          }

          async connect() {
            return {
              query: async (sql: string) => {
                statements.push(sql.toLowerCase());
                return { rows: [] };
              },
              release: () => {
                releases.push(this.connectionString);
              }
            };
          }

          async end() {
            ends.push(this.connectionString);
          }
        }
      })
    }));

    const { createGraphDatabasePool } = await import('../../src/storage/graph-database.js');
    const client = createGraphDatabasePool('postgres://localhost:5432/llm_wiki_liiy');

    expect(typeof client.query).toBe('function');
    expect(typeof client.transaction).toBe('function');
    expect(typeof client.end).toBe('function');

    await client.query('select 1');
    await client.transaction?.(async (transactionClient) => {
      await transactionClient.query('select 2');
    });
    await client.end?.();

    expect(statements).toEqual(['pool:select 1', 'begin', 'select 2', 'commit']);
    expect(releases).toEqual(['postgres://localhost:5432/llm_wiki_liiy']);
    expect(ends).toEqual(['postgres://localhost:5432/llm_wiki_liiy']);
  });
});
