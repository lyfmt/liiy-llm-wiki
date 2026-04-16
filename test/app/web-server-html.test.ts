import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';
import { createWebServer } from '../../src/app/web-server.js';

describe('createWebServer legacy html removal', () => {
  it('redirects root to the SPA and no longer serves legacy html views', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-html-removed-'));

    try {
      await bootstrapProject(root);
      const server = createWebServer(root);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const rootResponse = await fetch(`${baseUrl}/`, { redirect: 'manual' });
        const appShell = await fetchText(`${baseUrl}/app`);

        const legacyUrls = [
          '/wiki/index?view=html',
          '/wiki/pages/topic/patch-first?view=html',
          '/sources?view=html',
          '/sources/src-001?view=html',
          '/tasks?view=html',
          '/runs?view=html',
          '/runs/run-001?view=html',
          '/changesets?view=html',
          '/reviews/run-001?view=html',
          '/tasks/review-run-001?view=html',
          '/chat/settings?view=html',
          '/chat/operations?view=html'
        ] as const;

        expect(rootResponse.status).toBe(302);
        expect(rootResponse.headers.get('location')).toBe('/app');
        expect(appShell).toContain('<title>LLM Wiki Web</title>');
        expect(appShell).toContain('<div id="root"></div>');
        expect(appShell).toContain('/assets/');

        for (const url of legacyUrls) {
          const response = await fetch(`${baseUrl}${url}`);
          expect(response.status).toBe(404);
          expect(await response.json()).toEqual({ error: `Not found: GET ${new URL(url, baseUrl).pathname}` });
        }
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  return await response.text();
}
