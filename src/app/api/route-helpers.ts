import type { IncomingMessage, ServerResponse } from 'node:http';

import type { RequestRunState } from '../../storage/request-run-state-store.js';
import { loadRequestRunState } from '../../storage/request-run-state-store.js';

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  if (!isRecord(value)) {
    throw new Error('Invalid JSON body');
  }

  return value;
}

export function decodePageLocator(value: string): ['source' | 'entity' | 'topic' | 'query', string] {
  const [kind, slug] = value.split('/', 2);

  if (!slug) {
    throw new Error('Invalid page locator');
  }

  if (kind !== 'source' && kind !== 'entity' && kind !== 'topic' && kind !== 'query') {
    throw new Error('Invalid page locator');
  }

  return [kind, decodeURIComponent(slug)];
}

export function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function writeHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(html);
}

export async function loadRequestRunStateIfExists(root: string, runId: string): Promise<RequestRunState | null> {
  try {
    return await loadRequestRunState(root, runId);
  } catch (error: unknown) {
    if (
      error instanceof Error
      && (
        error.message.startsWith('Incomplete request run state: missing ')
        || error.message.startsWith('Invalid request run state: ')
      )
    ) {
      return null;
    }

    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
