import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ApiRouteContext } from './api/route-context.js';
import type { WebServerDependencies } from './web-server-dependencies.js';
import { writeJson } from './api/route-helpers.js';
import { handleApiRoute } from './api/routes.js';
import { renderHtmlDocument } from './html-shell.js';
import { assertTaskStatus } from './task-queue.js';
import { handleWebAppShellRoute, handleWebAssetRoute } from './web-assets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistDirectory = path.resolve(__dirname, '../../web/dist');

export async function handleWebServerRequest(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: WebServerDependencies
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/health') {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (method === 'GET' && pathname === '/favicon.ico') {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method === 'GET' && pathname === '/') {
    response.statusCode = 302;
    response.setHeader('location', '/app');
    response.end();
    return;
  }

  if (await handleWebAppShellRoute({ response, method, pathname, webDistDirectory, renderHtmlDocument })) {
    return;
  }

  if (await handleWebAssetRoute({ response, method, pathname, webDistDirectory })) {
    return;
  }


  const apiRouteContext: ApiRouteContext = {
    root,
    request,
    response,
    method,
    pathname,
    url,
    dependencies,
    assertTaskStatus
  };

  if (await handleApiRoute(apiRouteContext)) {
    return;
  }

  writeJson(response, 404, { error: `Not found: ${method} ${pathname}` });
}
