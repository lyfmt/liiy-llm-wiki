import { createServer } from 'node:http';

import { writeJson } from './api/route-helpers.js';
import { handleWebServerRequest } from './request-handler.js';
import { defaultWebServerDependencies, type WebServerDependencies } from './web-server-dependencies.js';

export { type WebServerDependencies } from './web-server-dependencies.js';

export function createWebServer(root: string, dependencies: WebServerDependencies = defaultWebServerDependencies) {
  return createServer(async (request, response) => {
    try {
      await handleWebServerRequest(root, request, response, dependencies);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(response, 500, { error: message });
    }
  });
}
