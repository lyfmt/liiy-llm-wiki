import { describe, expect, it } from 'vitest';

import { createGraphDatabasePool, resolveGraphDatabaseUrl } from '../../src/storage/graph-database.js';

describe('resolveGraphDatabaseUrl', () => {
  it('reads GRAPH_DATABASE_URL from project env text', () => {
    expect(resolveGraphDatabaseUrl('RUNTIME_API_KEY=\nGRAPH_DATABASE_URL=postgres://localhost:5432/llm_wiki_liiy\n')).toBe(
      'postgres://localhost:5432/llm_wiki_liiy'
    );
  });

  it('rejects missing GRAPH_DATABASE_URL', () => {
    expect(() => resolveGraphDatabaseUrl('RUNTIME_API_KEY=\n')).toThrow('Missing GRAPH_DATABASE_URL');
  });
});

describe('createGraphDatabasePool', () => {
  it('returns a database client with a query method', () => {
    const client = createGraphDatabasePool('postgres://localhost:5432/llm_wiki_liiy');

    expect(typeof client.query).toBe('function');
  });
});
