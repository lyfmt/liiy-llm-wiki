import { createRequire } from 'node:module';

import { parseProjectEnv } from './project-env-store.js';

const require = createRequire(import.meta.url);
const { Pool } = require('pg') as { Pool: new (options: { connectionString: string }) => PgPoolLike };

interface PgPoolLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface GraphDatabaseClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export function resolveGraphDatabaseUrl(projectEnvText: string): string {
  const databaseUrl = parseProjectEnv(projectEnvText).GRAPH_DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('Missing GRAPH_DATABASE_URL');
  }

  return databaseUrl;
}

export function createGraphDatabasePool(databaseUrl: string): GraphDatabaseClient {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    query(sql: string, params?: unknown[]) {
      return pool.query(sql, params);
    }
  };
}
