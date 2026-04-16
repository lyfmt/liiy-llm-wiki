import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli.js';
import { bootstrapProject } from '../../src/app/bootstrap-project.js';
import { createWebServer } from '../../src/app/web-server.js';
import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import { createSourceManifest } from '../../src/domain/source-manifest.js';
import { saveKnowledgePage } from '../../src/storage/knowledge-page-store.js';
import { saveSourceManifest } from '../../src/storage/source-manifest-store.js';

describe('main serve command', () => {
  it('starts the web server and prints the bound url', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cli-serve-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const server = createServer((_request, response) => {
        response.statusCode = 200;
        response.end('ok');
      });

      let bootstrapCalls = 0;
      await main(['node', 'cli.js', 'serve', root, '0'], {
        bootstrapProject: async () => {
          bootstrapCalls += 1;
          return { directories: [], files: [] };
        },
        runRuntimeAgent: async () => {
          throw new Error('runRuntimeAgent should not be called in serve test');
        },
        createWebServer: () => server
      });

      expect(bootstrapCalls).toBe(1);

      expect(logSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { root: string; port: number; url: string };
      expect(output.root).toBe(root);
      expect(output.port).toBeGreaterThan(0);
      expect(output.url).toContain(`http://0.0.0.0:${output.port}`);

      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    } finally {
      logSpy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('serves a deployment-adjacent web flow with project .env runtime readiness and chat launch wiring', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cli-serve-live-like-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await bootstrapProject(root);
      await writeFile(path.join(root, '.env'), 'RUNTIME_API_KEY=serve-test-key\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-14T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-14T00:00:00.000Z',
          tags: ['patch-first']
        })
      );

      let capturedServer: ReturnType<typeof createServer> | null = null;
      let capturedRunRuntimeAgentInput: {
        root: string;
        userRequest: string;
        model?: {
          provider: string;
          id: string;
          api: string;
          baseUrl: string;
          reasoning: boolean;
        };
        apiKey?: string | undefined;
        allowQueryWriteback?: boolean;
        allowLintAutoFix?: boolean;
      } | null = null;

      await main(['node', 'cli.js', 'serve', root, '0'], {
        bootstrapProject: async (projectRoot) => {
          await bootstrapProject(projectRoot);
          return { directories: [], files: [] };
        },
        runRuntimeAgent: async ({ root: projectRoot, userRequest, runId, model, getApiKey, allowQueryWriteback, allowLintAutoFix }) => {
          capturedRunRuntimeAgentInput = {
            root: projectRoot,
            userRequest,
            model: model
              ? {
                  provider: model.provider,
                  id: model.id,
                  api: model.api,
                  baseUrl: model.baseUrl,
                  reasoning: model.reasoning
                }
              : undefined,
            apiKey: model ? await getApiKey?.(model.provider) : undefined,
            allowQueryWriteback,
            allowLintAutoFix
          };

          return {
            runId,
            intent: 'query',
            plan: ['inspect the wiki', 'answer from wiki evidence'],
            assistantText: 'Patch First is the stable patch-first workflow summary.',
            toolOutcomes: [
              {
                toolName: 'query_wiki',
                summary: 'answered from wiki evidence',
                evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
                data: { synthesisMode: 'llm' }
              }
            ],
            savedRunState: path.join(projectRoot, 'state', 'runs', runId)
          };
        },
        createWebServer: (projectRoot, dependencies) => {
          const server = createWebServer(projectRoot, {
            runRuntimeAgent: async (input) => {
              return dependencies!.runRuntimeAgent(input);
            }
          });

          capturedServer = server;
          return server;
        }
      });

      expect(logSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { root: string; port: number; url: string };
      expect(output.root).toBe(root);
      expect(output.port).toBeGreaterThan(0);
      expect(output.url).toContain(`http://0.0.0.0:${output.port}`);

      const operationsResponse = await fetch(`http://127.0.0.1:${output.port}/api/chat/operations`);
      const operationsPayload = (await operationsResponse.json()) as {
        runtime_readiness: {
          ready: boolean;
          status: string;
          configured_api_key_env: string;
          project_env_has_configured_key: boolean;
        };
      };
      expect(operationsResponse.status).toBe(200);
      expect(operationsPayload.runtime_readiness).toMatchObject({
        ready: true,
        status: 'ready',
        configured_api_key_env: 'RUNTIME_API_KEY',
        project_env_has_configured_key: true
      });

      const chatRunResponse = await fetch(`http://127.0.0.1:${output.port}/api/chat/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userRequest: 'what is patch first?' })
      });
      const chatRunPayload = (await chatRunResponse.json()) as {
        ok: boolean;
        accepted?: boolean;
        runId: string;
        run_url: string;
        review_url: string | null;
        task_url: string | null;
        task_id: string | null;
        touched_files: string[];
        status: string;
      };

      expect(chatRunResponse.status).toBe(202);
      expect(chatRunPayload.ok).toBe(true);
      expect(chatRunPayload.accepted).toBe(true);
      expect(chatRunPayload.run_url).toMatch(/^\/api\/runs\/.+$/);
      expect(chatRunPayload.review_url).toBeNull();
      expect(chatRunPayload.task_url).toBeNull();
      expect(chatRunPayload.task_id).toBeNull();
      expect(chatRunPayload.touched_files).toEqual([]);
      expect(chatRunPayload.status).toBe('running');

      const launchedRunPayload = await waitForRunState<{
        request_run: { status: string; result_summary: string; touched_files: string[] };
      }>(`http://127.0.0.1:${output.port}/api/runs/${chatRunPayload.runId}`, (body) => body.request_run.status === 'done');
      expect(launchedRunPayload.request_run.status).toBe('done');
      expect(launchedRunPayload.request_run.result_summary).toContain('Patch First is the stable patch-first workflow summary.');
      expect(launchedRunPayload.request_run.touched_files).toEqual([]);

      expect(capturedRunRuntimeAgentInput).toMatchObject({
        root,
        userRequest: 'what is patch first?',
        model: {
          provider: 'llm-wiki-liiy',
          id: 'gpt-5.4',
          api: 'anthropic-messages',
          baseUrl: 'http://runtime.example.invalid',
          reasoning: true
        },
        apiKey: 'serve-test-key',
        allowQueryWriteback: false,
        allowLintAutoFix: false
      });
      expect(await readFile(path.join(root, '.env'), 'utf8')).toContain('RUNTIME_API_KEY=serve-test-key');

      await new Promise<void>((resolve, reject) => {
        if (!capturedServer) {
          reject(new Error('missing captured server'));
          return;
        }

        capturedServer.close((error) => (error ? reject(error) : resolve()));
      });
    } finally {
      logSpy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails fast when serve is missing a root', async () => {
    await expect(main(['node', 'cli.js', 'serve'])).rejects.toThrow(
      'Usage: node dist/cli.js serve <project-root> [port]'
    );
  });
});

async function waitForRunState<T>(url: string, isReady: (body: T) => boolean, attempts = 50): Promise<T> {
  let lastBody: T | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url);
    lastBody = (await response.json()) as T;

    if (response.status === 200 && isReady(lastBody)) {
      return lastBody;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Run did not reach expected state: ${JSON.stringify(lastBody)}`);
}
