import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { writeHtml } from './api/route-helpers.js';

interface WebAppFallbackRenderer {
  renderHtmlDocument: (title: string, body: string) => string;
}

interface WebAppShellRouteInput extends WebAppFallbackRenderer {
  response: ServerResponse;
  method: string;
  pathname: string;
  webDistDirectory: string;
}

interface WebAssetRouteInput {
  response: ServerResponse;
  method: string;
  pathname: string;
  webDistDirectory: string;
}

export async function writeWebAppDocument(
  response: ServerResponse,
  webDistDirectory: string,
  { renderHtmlDocument }: WebAppFallbackRenderer
): Promise<void> {
  try {
    const html = await readFile(path.join(webDistDirectory, 'index.html'), 'utf8');
    response.statusCode = 200;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(html);
  } catch {
    writeHtml(
      response,
      503,
      renderHtmlDocument(
        'Web build missing',
        `<div class="app-shell management-shell"><section class="panel"><h1>Web build missing</h1><p>Run <code>npm run build:web</code> before opening <code>/app</code> routes.</p></section></div>`
      )
    );
  }
}

export async function writeWebAsset(response: ServerResponse, webDistDirectory: string, pathname: string): Promise<void> {
  try {
    const filePath = path.join(webDistDirectory, pathname.replace(/^\//u, ''));
    const asset = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader('content-type', contentTypeForAsset(filePath));
    response.end(asset);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
}

export async function handleWebAppShellRoute({
  response,
  method,
  pathname,
  webDistDirectory,
  renderHtmlDocument
}: WebAppShellRouteInput): Promise<boolean> {
  if (method !== 'GET') {
    return false;
  }

  if (pathname !== '/app' && !pathname.startsWith('/app/')) {
    return false;
  }

  await writeWebAppDocument(response, webDistDirectory, { renderHtmlDocument });
  return true;
}

export async function handleWebAssetRoute({ response, method, pathname, webDistDirectory }: WebAssetRouteInput): Promise<boolean> {
  if (method !== 'GET' || !pathname.startsWith('/assets/')) {
    return false;
  }

  await writeWebAsset(response, webDistDirectory, pathname);
  return true;
}

function contentTypeForAsset(filePath: string): string {
  if (filePath.endsWith('.js')) {
    return 'application/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  if (filePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  return 'application/octet-stream';
}
