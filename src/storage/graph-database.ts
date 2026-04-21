import { createRequire } from 'node:module';

import { parseProjectEnv } from './project-env-store.js';

const require = createRequire(import.meta.url);
const { Pool } = require('pg') as { Pool: new (options: { connectionString: string }) => PgPoolLike };

const sharedGraphClientsByDatabaseUrl = new Map<string, GraphDatabaseClient>();

interface PgPoolLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  connect: () => Promise<PgPoolClientLike>;
  end: () => Promise<void>;
}

interface PgPoolClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
}

export interface GraphDatabaseClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  transaction?: <T>(work: (transactionClient: GraphDatabaseClient) => Promise<T>) => Promise<T>;
  end?: () => Promise<void>;
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
    },
    async transaction<T>(work: (transactionClient: GraphDatabaseClient) => Promise<T>): Promise<T> {
      const connection = await pool.connect();
      const transactionClient: GraphDatabaseClient = {
        query(sql: string, params?: unknown[]) {
          return connection.query(sql, params);
        }
      };

      try {
        await connection.query('begin');
        const result = await work(transactionClient);
        await connection.query('commit');
        return result;
      } catch (error) {
        await connection.query('rollback');
        throw error;
      } finally {
        connection.release();
      }
    },
    end() {
      return pool.end();
    }
  };
}

export function getSharedGraphDatabasePool(databaseUrl: string): GraphDatabaseClient {
  const cachedClient = sharedGraphClientsByDatabaseUrl.get(databaseUrl);

  if (cachedClient) {
    return cachedClient;
  }

  const client = createGraphDatabasePool(databaseUrl);
  sharedGraphClientsByDatabaseUrl.set(databaseUrl, client);
  return client;
}

export async function disposeGraphDatabasePools(): Promise<void> {
  const clients = [...new Set(sharedGraphClientsByDatabaseUrl.values())];
  sharedGraphClientsByDatabaseUrl.clear();

  for (const client of clients) {
    await client.end?.();
  }
}
