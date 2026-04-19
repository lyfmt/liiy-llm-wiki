import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAssistantMessageEventStream, type AssistantMessage, type Context, type ToolCall } from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';
import { createWebServer } from '../../src/app/web-server.js';
import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import { createRequestRun } from '../../src/domain/request-run.js';
import { createSourceManifest } from '../../src/domain/source-manifest.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../src/storage/knowledge-page-store.js';
import { saveRequestRunState, type RequestRunState } from '../../src/storage/request-run-state-store.js';
import { buildRequestRunArtifactPaths } from '../../src/storage/request-run-artifact-paths.js';
import { syncReviewTask } from '../../src/flows/review/sync-review-task.js';
import { saveSourceManifest } from '../../src/storage/source-manifest-store.js';

interface JsonResponse<T> {
  status: number;
  body: T;
}

interface CapturedChatRunInput {
  userRequest: string;
  sessionId?: string;
  currentUserMessage?: unknown;
  conversationHistory?: unknown;
}

describe('createWebServer', () => {
  it('serves SPA shell plus wiki, task, review, and chat endpoints', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-server-'));
    const calls: Array<{
      userRequest: string;
      model?: {
        provider: string;
        id: string;
        api: string;
        baseUrl: string;
        reasoning: boolean;
        contextWindow: number;
        maxTokens: number;
      };
      getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
      allowQueryWriteback?: boolean;
      allowLintAutoFix?: boolean;
    }> = [];

    try {
      await bootstrapProject(root);
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/queries/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first.md',
          kind: 'query',
          title: 'What is Patch First?',
          summary: 'Reusable answer for patch first.',
          tags: ['patch-first', 'query'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:30:00.000Z'
        }),
        '# What is Patch First?\n\nPatch first is a reusable query answer.\n'
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
          imported_at: '2026-04-13T00:00:00.000Z',
          tags: ['patch-first']
        })
      );
      const reviewRunState: RequestRunState = {
        request_run: createRequestRun({
          run_id: 'run-review-001',
          user_request: 'review this changeset',
          intent: 'query',
          plan: ['inspect'],
          status: 'needs_review',
          evidence: ['wiki/topics/patch-first.md'],
          touched_files: ['wiki/queries/patch-first.md'],
          decisions: ['query_wiki: requires review'],
          result_summary: 'waiting for review'
        }),
        tool_outcomes: [
          {
            order: 1,
            toolName: 'query_wiki',
            summary: 'answered from durable wiki evidence',
            evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
            touchedFiles: [],
            resultMarkdown: 'Answer:\nPatch first answer\n\nSynthesis mode: llm',
            needsReview: true,
            reviewReasons: ['durable query writeback queued for review'],
            data: { synthesisMode: 'llm' }
          },
          {
            order: 2,
            toolName: 'apply_draft_upsert',
            summary: 'queued query page writeback',
            evidence: ['wiki/queries/patch-first.md'],
            touchedFiles: ['wiki/queries/patch-first.md'],
            resultMarkdown: 'Draft target: wiki/queries/patch-first.md',
            needsReview: true,
            reviewReasons: ['durable query writeback queued for review']
          }
        ],
        timeline_items: [
          {
            lane: 'user',
            title: 'User request',
            summary: 'review this changeset',
            meta: 'intent: query'
          },
          {
            lane: 'tool',
            title: 'Latest tool outcome · apply_draft_upsert',
            summary: 'queued query page writeback',
            meta: 'needs review · files: wiki/queries/patch-first.md'
          }
        ],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: {
          target_files: ['wiki/queries/patch-first.md'],
          patch_summary: 'persist query answer',
          rationale: 'capture durable answer',
          source_refs: ['raw/accepted/design.md'],
          risk_level: 'medium',
          needs_review: true
        }
      };
      await saveRequestRunState(root, reviewRunState);
      await syncReviewTask(root, reviewRunState);

      const server = createWebServer(root, {
        runRuntimeAgent: async ({ userRequest, model, getApiKey, allowQueryWriteback, allowLintAutoFix, runId, root: projectRoot }) => {
          calls.push({
            userRequest,
            model: model
              ? {
                  provider: model.provider,
                  id: model.id,
                  api: model.api,
                  baseUrl: model.baseUrl,
                  reasoning: model.reasoning,
                  contextWindow: model.contextWindow,
                  maxTokens: model.maxTokens
                }
              : undefined,
            getApiKey,
            allowQueryWriteback,
            allowLintAutoFix
          });
          return {
            runId,
            intent: 'query',
            plan: ['query wiki'],
            assistantText: 'Patch-first updates keep page structure stable.',
            toolOutcomes: [],
            savedRunState: path.join(projectRoot, 'state', 'runs', runId)
          };
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const health = await fetchJson<{ ok: boolean }>(`${baseUrl}/health`);
        const rootResponse = await fetch(`${baseUrl}/`, { redirect: 'manual' });
        const discoveryApp = await fetchText(`${baseUrl}/app/discovery`);
        const readingApp = await fetchText(`${baseUrl}/app/pages/topic/patch-first`);
        const discoveryDto = await fetchJson<{ totals: { topics: number }; sections: Array<{ kind: string; items: Array<{ links: { app: string; api: string } }> }> }>(`${baseUrl}/api/discovery`);
        const readingDto = await fetchJson<{ page: { title: string; tags: string[]; body: string }; navigation: { source_refs: Array<{ links: { api: string | null; app: string | null } }>; related_by_source: Array<{ links: { app: string; api: string } }> } }>(`${baseUrl}/api/pages/topic/patch-first`);
        const wikiIndex = await fetchJson<{ topics: string[] }>(`${baseUrl}/api/wiki/index`);
        const wikiPage = await fetchJson<{ page: { title: string; tags: string[]; summary: string }; navigation: { backlinks: unknown[] } }>(`${baseUrl}/api/pages/topic/patch-first`);
        const chatOperations = await fetchJson<{ settings: { model: string }; project_env: { source: 'project_root_env'; keys: string[] }; runtime_readiness: { status: string; ready: boolean; configured_api_key_env: string; project_env_has_configured_key: boolean; summary: string }; recent_runs: Array<{ run_id: string }>; suggested_requests: string[] }>(`${baseUrl}/api/chat/operations`);
        const chatModels = await fetchJson<{ default_provider: string; providers: Array<{ id: string; models: Array<{ id: string; provider: string; selected: boolean; built_in: boolean; api: string; base_url: string; api_key_env?: string; reasoning: boolean; context_window: number; max_tokens: number }> }>; selected: { provider: string; model: string; api: string; base_url: string; api_key_env?: string; reasoning?: boolean; context_window?: number; max_tokens?: number } }>(`${baseUrl}/api/chat/models`);
        const sources = await fetchJson<Array<{ id: string; title: string; type: string; status: string; raw_path: string; imported_at: string; tags: string[]; has_notes: boolean; links: { api: string } }>>(`${baseUrl}/api/sources`);
        const runs = await fetchJson<Array<{ run_id: string; has_changeset: boolean }>>(`${baseUrl}/api/runs`);
        const changesets = await fetchJson<Array<{ run_id: string; changeset: { needs_review: boolean } }>>(`${baseUrl}/api/changesets`);
        const review = await fetchJson<{ status: string; changeset: { needs_review: boolean }; can_resolve: boolean }>(`${baseUrl}/api/reviews/run-review-001`);

        expect(health).toEqual({ status: 200, body: { ok: true } });
        expect(rootResponse.status).toBe(302);
        expect(rootResponse.headers.get('location')).toBe('/app');
        expect(discoveryApp).toContain('<title>LLM Wiki Web</title>');
        expect(discoveryApp).toContain('<div id="root"></div>');
        expect(discoveryApp).toContain('/assets/');
        expect(readingApp).toContain('<div id="root"></div>');
        expect(discoveryDto.status).toBe(200);
        expect(discoveryDto.body.totals.topics).toBe(1);
        expect(discoveryDto.body.sections.find((section) => section.kind === 'topic')?.items[0]?.links).toEqual({
          app: '/app/pages/topic/patch-first',
          api: '/api/pages/topic/patch-first'
        });
        expect(readingDto.status).toBe(200);
        expect(readingDto.body.page.title).toBe('Patch First');
        expect(readingDto.body.page.tags).toEqual(['patch-first']);
        expect(readingDto.body.page.body).toContain('Patch-first updates keep page structure stable.');
        expect(readingDto.body.navigation.source_refs[0]?.links).toEqual({
          app: null,
          api: '/api/sources/src-001'
        });
        expect(readingDto.body.navigation.related_by_source[0]?.links).toEqual({
          app: '/app/pages/query/patch-first',
          api: '/api/pages/query/patch-first'
        });
        expect(wikiIndex.status).toBe(200);
        expect(wikiIndex.body.topics).toEqual(['patch-first']);
        expect(wikiPage.body.page.title).toBe('Patch First');
        expect(wikiPage.body.page.tags).toEqual(['patch-first']);
        expect(wikiPage.body.page.summary).toBe('Patch-first updates keep page');
        expect(Array.isArray(wikiPage.body.navigation.backlinks)).toBe(true);
        expect(chatOperations.body.settings.model).toBe('gpt-5.4');
        expect(chatOperations.body.project_env).toEqual({ source: 'project_root_env', keys: ['RUNTIME_API_KEY'] });
        expect(chatOperations.body.runtime_readiness).toMatchObject({
          ready: false,
          status: 'missing_api_key',
          configured_api_key_env: 'RUNTIME_API_KEY',
          project_env_has_configured_key: false
        });
        expect(chatOperations.body.runtime_readiness.summary).toContain('Runtime is blocked');
        expect(chatOperations.body.recent_runs).toEqual([
          {
            run_id: 'run-review-001',
            session_id: null,
            status: 'needs_review',
            intent: 'query',
            result_summary: 'waiting for review',
            touched_files: ['wiki/queries/patch-first.md'],
            has_changeset: true,
            review_task_id: 'review-run-review-001'
          }
        ]);
        expect(chatOperations.body.suggested_requests).toContain('Write back a durable patch first answer as a reusable query page after inspecting the wiki and evidence.');
        expect(chatModels.status).toBe(200);
        expect(chatModels.body.default_provider).toBe('llm-wiki-liiy');
        expect(chatModels.body.providers[0]).toMatchObject({ id: 'llm-wiki-liiy' });
        expect(chatModels.body.providers[0]?.models).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'gpt-5.4',
              provider: 'llm-wiki-liiy',
              selected: true,
              built_in: true,
              api: 'anthropic-messages',
              base_url: 'http://runtime.example.invalid'
            })
          ])
        );
        expect(chatModels.body.selected).toEqual({
          provider: 'llm-wiki-liiy',
          model: 'gpt-5.4',
          api: 'anthropic-messages',
          base_url: 'http://runtime.example.invalid/v1',
          api_key_env: 'RUNTIME_API_KEY',
          reasoning: true
        });
        expect(sources.body).toEqual([
          {
            id: 'src-001',
            title: 'Patch First Design',
            type: 'markdown',
            status: 'accepted',
            raw_path: 'raw/accepted/design.md',
            imported_at: '2026-04-13T00:00:00.000Z',
            tags: ['patch-first'],
            has_notes: false,
            links: {
              api: '/api/sources/src-001'
            }
          }
        ]);
        expect(runs.body).toEqual([
          {
            run_id: 'run-review-001',
            session_id: null,
            status: 'needs_review',
            intent: 'query',
            result_summary: 'waiting for review',
            touched_files: ['wiki/queries/patch-first.md'],
            has_changeset: true,
            review_task_id: 'review-run-review-001'
          }
        ]);
        expect(changesets.body).toEqual([
          {
            run_id: 'run-review-001',
            status: 'needs_review',
            changeset: {
              target_files: ['wiki/queries/patch-first.md'],
              patch_summary: 'persist query answer',
              rationale: 'capture durable answer',
              source_refs: ['raw/accepted/design.md'],
              risk_level: 'medium',
              needs_review: true
            }
          }
        ]);
        expect(review.body.status).toBe('needs_review');
        expect(review.body.changeset.needs_review).toBe(true);
        expect(review.body.can_resolve).toBe(false);

        const savedPage = await fetchJson<{
          ok: boolean;
          status: string;
          review: { needs_review: boolean; reasons: string[] };
          touched_files: string[];
          page: { page: { title: string; summary: string }; navigation: { source_refs: Array<unknown> } };
        }>(`${baseUrl}/api/pages/topic/patch-first`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: 'Patch First',
            aliases: [],
            summary: 'Patch-first updates keep page structure stable and auditable.',
            tags: ['patch-first'],
            source_refs: ['raw/accepted/design.md'],
            outgoing_links: [],
            status: 'active',
            updated_at: '2026-04-13T01:00:00.000Z',
            body: '# Patch First\n\nPatch-first updates keep page structure stable and auditable.\n',
            rationale: 'manual review-safe page refresh'
          })
        });
        const savedTask = await fetchJson<{ ok: boolean; task: { id: string; status: string; assignee: string; links: { api: string } } }>(`${baseUrl}/api/tasks/task-001`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: 'Review patch-first page',
            description: 'Check the medium-risk query writeback.',
            status: 'needs_review',
            evidence: ['wiki/queries/patch-first.md'],
            assignee: 'editor',
            created_at: '2026-04-13T00:00:00.000Z'
          })
        });
        const taskList = await fetchJson<Array<{ id: string; title: string; description: string; status: string; evidence: string[]; assignee: string; created_at: string; updated_at: string; links: { api: string } }>>(`${baseUrl}/api/tasks?status=needs_review`);
        const activeTaskList = await fetchJson<Array<{ id: string; title: string; description: string; status: string; evidence: string[]; assignee: string; created_at: string; updated_at: string; links: { api: string } }>>(`${baseUrl}/api/tasks?status=in_progress`);

        expect(savedPage.body.ok).toBe(true);
        expect(savedPage.body.status).toBe('done');
        expect(savedPage.body.review).toEqual({ needs_review: false, reasons: [] });
        expect(savedPage.body.touched_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
        expect(savedPage.body.page.page.summary).toBe('Patch-first updates keep page');
        expect(Array.isArray(savedPage.body.page.navigation.source_refs)).toBe(true);
        expect(savedTask.body.ok).toBe(true);
        expect(savedTask.body.task).toMatchObject({
          id: 'task-001',
          status: 'needs_review',
          assignee: 'editor',
          links: { api: '/api/tasks/task-001' }
        });
        expect(activeTaskList.body).toEqual([]);
        expect(taskList.body).toEqual([
          { id: 'review-run-review-001', title: 'Review: review this changeset', description: expect.stringContaining('Governed review task for run run-review-001.'), status: 'needs_review', evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md', 'wiki/queries/patch-first.md'], assignee: 'operator', created_at: expect.any(String), updated_at: expect.any(String), links: { api: '/api/tasks/review-run-review-001' } },
          { id: 'task-001', title: 'Review patch-first page', description: 'Check the medium-risk query writeback.', status: 'needs_review', evidence: ['wiki/queries/patch-first.md'], assignee: 'editor', created_at: '2026-04-13T00:00:00.000Z', updated_at: '2026-04-13T00:00:00.000Z', links: { api: '/api/tasks/task-001' } }
        ]);

        const currentSettings = await fetchJson<{ settings: { model: string; provider?: string; api?: string; base_url?: string; api_key_env?: string; reasoning?: boolean; context_window?: number; max_tokens?: number; allow_query_writeback: boolean; allow_lint_autofix: boolean }; project_env: { source: 'project_root_env'; keys: string[]; contents: string } }>(`${baseUrl}/api/chat/settings`);
        const updatedSettings = await fetchJson<{ ok: boolean; settings: { model: string; provider?: string; api?: string; base_url?: string; api_key_env?: string; reasoning?: boolean; context_window?: number; max_tokens?: number; allow_query_writeback: boolean; allow_lint_autofix: boolean }; project_env: { source: 'project_root_env'; keys: string[]; contents: string } }>(`${baseUrl}/api/chat/settings`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.4',
            provider: 'llm-wiki-liiy',
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid/v1',
            api_key_env: 'RUNTIME_API_KEY',
            project_env_contents: 'RUNTIME_API_KEY=web-updated-key\nMODEL_NOTES="operator ready"\n',
            reasoning: true,
            context_window: 256000,
            max_tokens: 32768,
            allow_query_writeback: true,
            allow_lint_autofix: true
          })
        });
        const chatRun = await fetchJson<{ accepted?: boolean; runId: string; run_id: string; run_url: string; review_url: string | null; task_url: string | null; task_id: string | null; touched_files: string[]; status: string; result_summary: string; tool_outcomes: Array<{ tool_name: string }> }>(`${baseUrl}/api/chat/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userRequest: 'what is patch first?' })
        });

        expect(currentSettings.body.settings.model).toBe('gpt-5.4');
        expect(currentSettings.body.project_env).toEqual({
          source: 'project_root_env',
          keys: ['RUNTIME_API_KEY'],
          contents: 'RUNTIME_API_KEY=\n'
        });
        expect(updatedSettings.body.settings).toMatchObject({
          model: 'gpt-5.4',
          provider: 'llm-wiki-liiy',
          api: 'anthropic-messages',
          base_url: 'http://runtime.example.invalid/v1',
          api_key_env: 'RUNTIME_API_KEY',
          reasoning: true,
          context_window: 256000,
          max_tokens: 32768,
          allow_query_writeback: true,
          allow_lint_autofix: true
        });
        expect(updatedSettings.body.project_env.source).toBe('project_root_env');
        expect(updatedSettings.body.project_env.keys).toEqual(['RUNTIME_API_KEY']);
        expect(updatedSettings.body.project_env.contents).toContain('RUNTIME_API_KEY=web-updated-key');
        expect(updatedSettings.body.project_env.contents).toContain('MODEL_NOTES="operator ready"');
        expect(await readFile(path.join(root, '.env'), 'utf8')).toContain('RUNTIME_API_KEY=web-updated-key');
        const chatOperationsReady = await fetchJson<{ runtime_readiness: { status: string; ready: boolean; project_env_has_configured_key: boolean; summary: string } }>(`${baseUrl}/api/chat/operations`);
        expect(chatOperationsReady.body.runtime_readiness).toMatchObject({
          ready: true,
          status: 'ready',
          project_env_has_configured_key: true
        });
        expect(chatOperationsReady.body.runtime_readiness.summary).toContain('Runtime is ready');
        expect(chatRun.body.run_id).toBe(chatRun.body.runId);
        expect(chatRun.body.run_url).toMatch(/^\/api\/runs\/.+$/);
        expect(chatRun.body.review_url).toBeNull();
        expect(chatRun.body.task_url).toBeNull();
        expect(chatRun.body.task_id).toBeNull();
        expect(chatRun.body.touched_files).toEqual([]);
        expect(chatRun.status).toBe(200);
        expect(chatRun.body.accepted).toBeUndefined();
        expect(chatRun.body.status).toBe('done');
        expect(chatRun.body.result_summary).toContain('Patch-first updates keep page structure stable.');
        expect(chatRun.body.tool_outcomes).toEqual([]);
        expect(calls).toHaveLength(1);

        const launchedRun = await waitForRunState<{
          request_run: { status: string; result_summary: string; touched_files: string[] };
        }>(`${baseUrl}/api/runs/${chatRun.body.runId}`, (body) => body.request_run.status === 'done');
        expect(launchedRun.request_run.status).toBe('done');
        expect(launchedRun.request_run.result_summary).toContain('Patch-first updates keep page structure stable.');
        expect(launchedRun.request_run.touched_files).toEqual([]);
        expect(calls[0]).toMatchObject({
          userRequest: 'what is patch first?',
          model: {
            provider: 'llm-wiki-liiy',
            id: 'gpt-5.4',
            api: 'anthropic-messages',
            baseUrl: 'http://runtime.example.invalid',
            reasoning: true,
            contextWindow: 256000,
            maxTokens: 32768
          },
          allowQueryWriteback: true,
          allowLintAutoFix: true
        });
        expect(typeof calls[0]?.getApiKey).toBe('function');
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs a web-launched durable query writeback flow end to end', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-server-'));

    try {
      await bootstrapProject(root);
      await writeFile(path.join(root, '.env'), 'RUNTIME_API_KEY=web-test-key\n', 'utf8');
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
          updated_at: '2026-04-13T00:00:00.000Z'
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
          imported_at: '2026-04-13T00:00:00.000Z',
          tags: ['patch-first']
        })
      );

      const server = createWebServer(root, {
        runRuntimeAgent: async ({ userRequest, runId, sessionId, conversationHistory, model, getApiKey, allowQueryWriteback, allowLintAutoFix, root: runtimeRoot }) => {
          const { runRuntimeAgent } = await import('../../src/runtime/agent-session.js');
          return await runRuntimeAgent({
            root: runtimeRoot,
            userRequest,
            runId,
            sessionId,
            conversationHistory,
            model,
            getApiKey,
            allowQueryWriteback,
            allowLintAutoFix,
            streamFn: createQueryDraftThenUpsertStream()
          });
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        await fetchJson(`${baseUrl}/api/chat/settings`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.4',
            provider: 'llm-wiki-liiy',
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid/v1',
            api_key_env: 'RUNTIME_API_KEY',
            project_env_contents: 'RUNTIME_API_KEY=web-test-key\n',
            allow_query_writeback: true,
            allow_lint_autofix: false
          })
        });

        const launched = await fetchJson<{
          ok: boolean;
          intent: string;
          runId: string;
          session_id: string;
          run_url: string;
          review_url: string;
          task_url: string;
          task_id: string;
          status: string;
          touched_files: string[];
          assistantText: string;
          toolOutcomes: Array<{ toolName: string }>;
        }>(`${baseUrl}/api/chat/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userRequest: 'Write back a durable patch first answer as a reusable query page after inspecting the wiki and evidence.'
          })
        });

        expect(launched.status).toBe(202);
        expect(launched.body.ok).toBe(true);
        expect(launched.body.intent).toBe('mixed');
        expect(launched.body.status).toBe('running');
        expect(launched.body.touched_files).toEqual([]);
        expect(launched.body.review_url).toBeNull();
        expect(launched.body.task_id).toBeNull();
        expect(launched.body.task_url).toBeNull();
        expect(launched.body.run_url).toBe(`/api/runs/${launched.body.runId}`);

        const persistedRun = await waitForRunState<{
          request_run: { status: string; touched_files: string[] };
          tool_outcomes: Array<{ tool_name: string }>;
        }>(`${baseUrl}/api/runs/${launched.body.runId}`, (body) => body.request_run.status === 'done');
        expect(persistedRun.request_run.status).toBe('done');
        expect(persistedRun.request_run.touched_files).toEqual([
          'wiki/queries/what-is-patch-first.md',
          'wiki/index.md',
          'wiki/log.md'
        ]);
        expect(persistedRun.tool_outcomes.map((outcome) => outcome.tool_name)).toEqual([
          'query_wiki',
          'draft_query_page',
          'apply_draft_upsert'
        ]);

        const queryPage = await loadKnowledgePage(root, 'query', 'what-is-patch-first');
        expect(queryPage.page.title).toBe('What Is Patch First');
        expect(queryPage.body).toContain('Patch First (wiki/topics/patch-first.md)');
        const review = await fetchJson<{ status: string; can_resolve: boolean; changeset: { needs_review: boolean } }>(
          `${baseUrl}/api/reviews/${launched.body.runId}`
        );
        expect(review.body.status).toBe('done');
        expect(review.body.can_resolve).toBe(false);
        expect(review.body.changeset.needs_review).toBe(false);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs a web-launched knowledge page creation flow end to end', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-server-'));

    try {
      await bootstrapProject(root);
      await writeFile(path.join(root, '.env'), 'RUNTIME_API_KEY=web-test-key\n', 'utf8');
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-13T00:00:00.000Z',
          tags: ['patch-first']
        })
      );

      const server = createWebServer(root, {
        runRuntimeAgent: async ({ userRequest, runId, sessionId, conversationHistory, model, getApiKey, allowQueryWriteback, allowLintAutoFix, root: runtimeRoot }) => {
          const { runRuntimeAgent } = await import('../../src/runtime/agent-session.js');
          return await runRuntimeAgent({
            root: runtimeRoot,
            userRequest,
            runId,
            sessionId,
            conversationHistory,
            model,
            getApiKey,
            allowQueryWriteback,
            allowLintAutoFix,
            streamFn: createDraftThenApplyPageStream()
          });
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        await fetchJson(`${baseUrl}/api/chat/settings`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.4',
            provider: 'llm-wiki-liiy',
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid/v1',
            api_key_env: 'RUNTIME_API_KEY',
            project_env_contents: 'RUNTIME_API_KEY=web-test-key\n',
            allow_query_writeback: false,
            allow_lint_autofix: false
          })
        });

        const launched = await fetchJson<{
          ok: boolean;
          intent: string;
          runId: string;
          session_id: string;
          run_url: string;
          review_url: string | null;
          task_url: string | null;
          task_id: string | null;
          status: string;
          touched_files: string[];
          assistantText: string;
          toolOutcomes: Array<{ toolName: string }>;
        }>(`${baseUrl}/api/chat/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userRequest: 'Create or update a durable patch first topic page from source-backed evidence after inspecting the wiki.'
          })
        });

        expect(launched.status).toBe(202);
        expect(launched.body.ok).toBe(true);
        expect(launched.body.intent).toBe('mixed');
        expect(launched.body.status).toBe('running');
        expect(launched.body.touched_files).toEqual([]);
        expect(launched.body.review_url).toBeNull();
        expect(launched.body.task_id).toBeNull();
        expect(launched.body.task_url).toBeNull();
        expect(launched.body.run_url).toBe(`/api/runs/${launched.body.runId}`);

        const persistedRun = await waitForRunState<{
          request_run: { status: string; touched_files: string[] };
          tool_outcomes: Array<{ tool_name: string }>;
        }>(`${baseUrl}/api/runs/${launched.body.runId}`, (body) => body.request_run.status === 'done');
        expect(persistedRun.request_run.status).toBe('done');
        expect(persistedRun.request_run.touched_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
        expect(persistedRun.tool_outcomes.map((outcome) => outcome.tool_name)).toEqual(['draft_knowledge_page', 'apply_draft_upsert']);

        const topicPage = await loadKnowledgePage(root, 'topic', 'patch-first');
        expect(topicPage.page.title).toBe('Patch First');
        expect(topicPage.body).toContain('Patch-first updates keep page structure stable.');

        const wikiIndex = await fetchJson<{ topics: string[] }>(`${baseUrl}/api/wiki/index`);
        expect(wikiIndex.body.topics).toContain('patch-first');

        const review = await fetchJson<{ status: string; can_resolve: boolean; changeset: { needs_review: boolean; target_files: string[] } }>(
          `${baseUrl}/api/reviews/${launched.body.runId}`
        );
        expect(review.body.status).toBe('done');
        expect(review.body.can_resolve).toBe(false);
        expect(review.body.changeset.needs_review).toBe(false);
        expect(review.body.changeset.target_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);

        const chatOperations = await fetchJson<{
          recent_runs: Array<{ run_id: string; status: string; touched_files: string[]; review_task_id: string | null }>;
        }>(`${baseUrl}/api/chat/operations`);
        expect(chatOperations.body.recent_runs).toEqual([
          {
            run_id: launched.body.runId,
            session_id: launched.body.session_id,
            status: 'done',
            intent: 'mixed',
            result_summary: expect.stringContaining('Persisted: wiki/topics/patch-first.md'),
            touched_files: ['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md'],
            has_changeset: true,
            review_task_id: null
          }
        ]);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs a review-gated web-launched knowledge page update flow end to end', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-server-'));

    try {
      await bootstrapProject(root);
      await writeFile(path.join(root, '.env'), 'RUNTIME_API_KEY=web-test-key\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Stable patch-first baseline.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/old-design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Patch First\n\nStable patch-first baseline.\n'
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
          imported_at: '2026-04-13T00:00:00.000Z',
          tags: ['patch-first']
        })
      );

      const server = createWebServer(root, {
        runRuntimeAgent: async ({ userRequest, runId, sessionId, conversationHistory, model, getApiKey, allowQueryWriteback, allowLintAutoFix, root: runtimeRoot }) => {
          const { runRuntimeAgent } = await import('../../src/runtime/agent-session.js');
          return await runRuntimeAgent({
            root: runtimeRoot,
            userRequest,
            runId,
            sessionId,
            conversationHistory,
            model,
            getApiKey,
            allowQueryWriteback,
            allowLintAutoFix,
            streamFn: createReviewQueuedDraftThenApplyPageStream()
          });
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        await fetchJson(`${baseUrl}/api/chat/settings`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.4',
            provider: 'llm-wiki-liiy',
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid/v1',
            api_key_env: 'RUNTIME_API_KEY',
            project_env_contents: 'RUNTIME_API_KEY=web-test-key\n',
            allow_query_writeback: false,
            allow_lint_autofix: false
          })
        });

        const launched = await fetchJson<{
          ok: boolean;
          intent: string;
          runId: string;
          session_id: string;
          run_url: string;
          review_url: string | null;
          task_url: string | null;
          task_id: string | null;
          status: string;
          touched_files: string[];
          assistantText: string;
          toolOutcomes: Array<{ toolName: string; needsReview?: boolean; reviewReasons?: string[] }>;
        }>(`${baseUrl}/api/chat/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userRequest: 'Update the durable patch first topic page from new source evidence and queue review if it rewrites core topic grounding.'
          })
        });

        expect(launched.status).toBe(202);
        expect(launched.body.ok).toBe(true);
        expect(launched.body.intent).toBe('mixed');
        expect(launched.body.status).toBe('running');
        expect(launched.body.touched_files).toEqual([]);
        expect(launched.body.review_url).toBeNull();
        expect(launched.body.task_id).toBeNull();
        expect(launched.body.task_url).toBeNull();
        expect(launched.body.run_url).toBe(`/api/runs/${launched.body.runId}`);

        const topicPage = await loadKnowledgePage(root, 'topic', 'patch-first');
        expect(topicPage.page.source_refs).toEqual(['raw/accepted/old-design.md']);
        expect(topicPage.body).toContain('Stable patch-first baseline.');

        const persistedRun = await waitForRunState<{
          request_run: { status: string; touched_files: string[]; decisions: string[] };
          changeset: { needs_review: boolean; target_files: string[]; source_refs: string[] };
          tool_outcomes: Array<{ tool_name: string; needs_review?: boolean; review_reasons?: string[] }>;
        }>(`${baseUrl}/api/runs/${launched.body.runId}`, (body) => body.request_run.status === 'needs_review');
        expect(persistedRun.request_run.status).toBe('needs_review');
        expect(persistedRun.request_run.touched_files).toEqual([]);
        expect(persistedRun.request_run.decisions).toContain('apply_draft_upsert: rewrites a core topic page');
        expect(persistedRun.changeset.needs_review).toBe(true);
        expect(persistedRun.changeset.target_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
        expect(persistedRun.changeset.source_refs).toEqual(['raw/accepted/design.md']);
        expect(persistedRun.tool_outcomes[1]).toMatchObject({
          tool_name: 'apply_draft_upsert',
          needs_review: true,
          review_reasons: ['rewrites a core topic page']
        });

        const review = await fetchJson<{ status: string; can_resolve: boolean; changeset: { needs_review: boolean; target_files: string[] } }>(
          `${baseUrl}/api/reviews/${launched.body.runId}`
        );
        expect(review.body.status).toBe('needs_review');
        expect(review.body.can_resolve).toBe(true);
        expect(review.body.changeset.needs_review).toBe(true);
        expect(review.body.changeset.target_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);

        const task = await fetchJson<{
          id: string;
          status: string;
          assignee: string;
          evidence: string[];
          links: { api: string };
        }>(`${baseUrl}/api/tasks/review-${launched.body.runId}`);
        expect(task.body).toMatchObject({
          id: `review-${launched.body.runId}`,
          status: 'needs_review',
          assignee: 'operator',
          links: {
            api: `/api/tasks/review-${launched.body.runId}`
          }
        });
        expect(task.body.evidence).toEqual(['wiki/topics/patch-first.md', 'raw/accepted/design.md', 'wiki/index.md', 'wiki/log.md']);

        const taskList = await fetchJson<Array<{ id: string; title: string; description: string; status: string; evidence: string[]; assignee: string; created_at: string; updated_at: string; links: { api: string } }>>(`${baseUrl}/api/tasks?status=needs_review`);
        expect(taskList.body).toContainEqual({
          id: `review-${launched.body.runId}`,
          title: expect.stringContaining('Review: Update the durable patch first topic page from new source evidence'),
          description: expect.stringContaining(`Governed review task for run ${launched.body.runId}.`),
          status: 'needs_review',
          evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md', 'wiki/index.md', 'wiki/log.md'],
          assignee: 'operator',
          created_at: expect.any(String),
          updated_at: expect.any(String),
          links: {
            api: `/api/tasks/review-${launched.body.runId}`
          }
        });

        const chatOperations = await fetchJson<{
          recent_runs: Array<{ run_id: string; status: string; touched_files: string[]; review_task_id: string | null }>;
        }>(`${baseUrl}/api/chat/operations`);
        expect(chatOperations.body.recent_runs).toEqual([
          {
            run_id: launched.body.runId,
            session_id: launched.body.session_id,
            status: 'needs_review',
            intent: 'mixed',
            result_summary: expect.stringContaining('Queued for review: rewrites a core topic page'),
            touched_files: [],
            has_changeset: true,
            review_task_id: `review-${launched.body.runId}`
          }
        ]);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips incomplete run artifacts in run summaries and chat operations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-server-'));

    try {
      await bootstrapProject(root);
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-complete-001',
          user_request: 'answer from the wiki',
          intent: 'query',
          plan: ['inspect'],
          status: 'done',
          evidence: ['wiki/topics/patch-first.md'],
          touched_files: [],
          decisions: ['query_wiki: answered from wiki'],
          result_summary: 'answered from wiki'
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: null
      });
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-incomplete-001',
          user_request: 'broken partial artifact',
          intent: 'query',
          plan: ['inspect'],
          status: 'done',
          evidence: ['wiki/topics/patch-first.md'],
          touched_files: [],
          decisions: ['query_wiki: answered from wiki'],
          result_summary: 'should be skipped'
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: null
      });
      await unlink(buildRequestRunArtifactPaths(root, 'run-incomplete-001').toolOutcomes);
      const server = createWebServer(root);

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const runs = await fetchJson<Array<{ run_id: string; result_summary: string }>>(`${baseUrl}/api/runs`);
        const chatOperations = await fetchJson<{
          runtime_readiness: { status: string; ready: boolean };
          recent_runs: Array<{ run_id: string; result_summary: string }>;
        }>(`${baseUrl}/api/chat/operations`);

        expect(runs.status).toBe(200);
        expect(runs.body).toEqual([
          {
            run_id: 'run-complete-001',
            session_id: null,
            status: 'done',
            intent: 'query',
            result_summary: 'answered from wiki',
            touched_files: [],
            has_changeset: false,
            review_task_id: null
          }
        ]);
        expect(chatOperations.status).toBe(200);
        expect(chatOperations.body.runtime_readiness).toMatchObject({
          ready: false,
          status: 'missing_api_key'
        });
        expect(chatOperations.body.recent_runs).toEqual([
          {
            run_id: 'run-complete-001',
            session_id: null,
            status: 'done',
            intent: 'query',
            result_summary: 'answered from wiki',
            touched_files: [],
            has_changeset: false,
            review_task_id: null
          }
        ]);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns actionable preflight and runtime failure responses for chat runs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-server-'));

    try {
      await bootstrapProject(root);
      const server = createWebServer(root, {
        runRuntimeAgent: async ({ runId }) => {
          throw new Error(`synthetic launch failure for ${runId}`);
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const missingApiKey = await fetchJson<{
          ok: boolean;
          code: string;
          error: string;
          config_hint: string;
          settings_url: string;
          status: string;
          missing_api_key_env: string;
          run_url: string | null;
        }>(`${baseUrl}/api/chat/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userRequest: 'what is patch first?' })
        });

        expect(missingApiKey.status).toBe(400);
        expect(missingApiKey.body).toMatchObject({
          ok: false,
          code: 'missing_api_key',
          status: 'failed_preflight',
          settings_url: '/api/chat/settings',
          missing_api_key_env: 'RUNTIME_API_KEY',
          run_url: null
        });
        expect(missingApiKey.body.error).toContain('Missing API key in project .env');
        expect(missingApiKey.body.config_hint).toContain('RUNTIME_API_KEY');

        const updatedSettings = await fetchJson<{ ok: boolean }>(`${baseUrl}/api/chat/settings`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.4',
            provider: 'llm-wiki-liiy',
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid/v1',
            api_key_env: 'RUNTIME_API_KEY',
            project_env_contents: 'RUNTIME_API_KEY=web-updated-key\n',
            allow_query_writeback: false,
            allow_lint_autofix: false
          })
        });

        expect(updatedSettings.body.ok).toBe(true);

        const runtimeFailure = await fetchJson<{
          ok: boolean;
          code: string;
          error: string;
          status: string;
          settings_url: string;
          run_id: string;
          run_url: string;
          result_summary: string;
        }>(`${baseUrl}/api/chat/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userRequest: 'what is patch first?' })
        });

        expect(runtimeFailure.status).toBe(500);
        expect(runtimeFailure.body.ok).toBe(false);
        expect(runtimeFailure.body.code).toBe('runtime_error');
        expect(runtimeFailure.body.status).toBe('failed');
        expect(runtimeFailure.body.settings_url).toBe('/api/chat/settings');
        expect(runtimeFailure.body.run_id).toMatch(/[0-9a-f-]{36}/u);
        expect(runtimeFailure.body.run_url).toBe(`/api/runs/${runtimeFailure.body.run_id}`);
        expect(runtimeFailure.body.error).toContain('synthetic launch failure');
        expect(runtimeFailure.body.result_summary).toContain('synthetic launch failure');
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uploads a buffered attachment and forwards it into the chat run context', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-server-'));
    let capturedInput: CapturedChatRunInput | null = null;

    try {
      await bootstrapProject(root);

      const server = createWebServer(root, {
        runRuntimeAgent: async ({ userRequest, sessionId, currentUserMessage, conversationHistory, runId }) => {
          capturedInput = {
            userRequest,
            sessionId,
            currentUserMessage,
            conversationHistory
          };

          return {
            runId,
            intent: 'general',
            plan: ['answer directly'],
            assistantText: 'attachment received',
            toolOutcomes: [],
            savedRunState: path.join(root, 'state', 'runs', runId)
          };
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        await fetchJson(`${baseUrl}/api/chat/settings`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.4',
            provider: 'llm-wiki-liiy',
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid/v1',
            api_key_env: 'RUNTIME_API_KEY',
            project_env_contents: 'RUNTIME_API_KEY=web-test-key\n',
            allow_query_writeback: false,
            allow_lint_autofix: false
          })
        });

        const upload = await fetchJson<{
          ok: boolean;
          session_id: string;
          attachment: {
            attachment_id: string;
            file_name: string;
            mime_type: string;
            kind: string;
          };
        }>(`${baseUrl}/api/chat/uploads`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fileName: 'brief.txt',
            mimeType: 'text/plain',
            dataBase64: Buffer.from('Attachment body from web upload\n', 'utf8').toString('base64')
          })
        });

        expect(upload.status).toBe(201);
        expect(upload.body.ok).toBe(true);
        expect(upload.body.session_id).toMatch(/[0-9a-f-]{36}/u);
        expect(upload.body.attachment).toMatchObject({
          file_name: 'brief.txt',
          mime_type: 'text/plain',
          kind: 'text'
        });

        const launched = await fetchJson<{
          ok: boolean;
          run_id: string;
          session_id: string;
          status: string;
          result_summary: string;
        }>(`${baseUrl}/api/chat/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userRequest: 'summarize the uploaded file',
            sessionId: upload.body.session_id,
            attachmentIds: [upload.body.attachment.attachment_id]
          })
        });

        expect(launched.status).toBe(200);
        expect(launched.body.ok).toBe(true);
        expect(launched.body.session_id).toBe(upload.body.session_id);
        expect(capturedInput).not.toBeNull();
        if (capturedInput === null) {
          throw new Error('expected captured runtime input');
        }
        const launchInput: CapturedChatRunInput = capturedInput;
        expect(launchInput.userRequest).toBe('summarize the uploaded file');
        expect(launchInput.sessionId).toBe(upload.body.session_id);
        expect(launchInput.conversationHistory).toEqual([]);
        expect(launchInput.currentUserMessage).toMatchObject({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'text', text: 'summarize the uploaded file' }),
            expect.objectContaining({ type: 'text', text: expect.stringContaining('brief.txt') }),
            expect.objectContaining({ type: 'text', text: expect.stringContaining('Attachment body from web upload') })
          ])
        });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  return await response.text();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: (await response.json()) as T
  };
}

async function waitForRunState<T>(url: string, isReady: (body: T) => boolean, attempts = 50): Promise<T> {
  let lastBody: T | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetchJson<T>(url);
    lastBody = response.body;

    if (response.status === 200 && isReady(response.body)) {
      return response.body;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Run did not reach expected state: ${JSON.stringify(lastBody)}`);
}

function createQueryDraftThenUpsertStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildQueryToolCallingAssistantMessage()
        : callCount === 2
          ? buildDraftQueryPageToolCallingAssistantMessage()
          : callCount === 3
            ? buildApplyDraftUpsertToolCallingAssistantMessage()
            : buildFinalAssistantMessage(context);

    queueMicrotask(() => {
      stream.push({ type: 'start', partial: assistantMessage });

      if (assistantMessage.stopReason === 'toolUse') {
        stream.push({ type: 'toolcall_start', contentIndex: 0, partial: assistantMessage });
        stream.push({
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: assistantMessage.content[0] as ToolCall,
          partial: assistantMessage
        });
        stream.push({ type: 'done', reason: 'toolUse', message: assistantMessage });
        return;
      }

      stream.push({ type: 'text_start', contentIndex: 0, partial: assistantMessage });
      stream.push({
        type: 'text_delta',
        contentIndex: 0,
        delta: (assistantMessage.content[0] as { type: 'text'; text: string }).text,
        partial: assistantMessage
      });
      stream.push({
        type: 'text_end',
        contentIndex: 0,
        content: (assistantMessage.content[0] as { type: 'text'; text: string }).text,
        partial: assistantMessage
      });
      stream.push({ type: 'done', reason: 'stop', message: assistantMessage });
    });

    return stream;
  };
}

function buildQueryToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-query-1', 'query_wiki', {
    question: 'what is patch first?',
    persistQueryPage: false
  });
}

function buildDraftQueryPageToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-draft-query-page-1', 'draft_query_page', {
    question: 'what is patch first?',
    rationale: 'capture a durable query answer'
  });
}

function buildApplyDraftUpsertToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-apply-draft-query-page-1', 'apply_draft_upsert', {
    targetPath: 'wiki/queries/what-is-patch-first.md',
    upsertArguments: {
      kind: 'query',
      slug: 'what-is-patch-first',
      title: 'What Is Patch First',
      summary: 'Durable answer for: what is patch first?',
      status: 'active',
      updated_at: '2026-04-13T00:00:00.000Z',
      body: '# What Is Patch First\n\n## Answer\nPatch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable. Source evidence: raw/accepted/design.md => Patch-first updates keep page structure stable in source form.\n\n## Wiki Evidence\n- wiki/topics/patch-first.md\n\n## Raw Evidence\n- raw/accepted/design.md: Patch-first updates keep page structure stable in source form.',
      rationale: 'capture a durable query answer',
      source_refs: ['raw/accepted/design.md'],
      outgoing_links: ['wiki/topics/patch-first.md'],
      aliases: [],
      tags: ['patch', 'first']
    }
  });
}

function createDraftThenApplyPageStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildDraftKnowledgePageToolCallingAssistantMessage()
        : callCount === 2
          ? buildApplyDraftUpsertPageToolCallingAssistantMessage()
          : buildFinalAssistantMessage(context);

    queueMicrotask(() => {
      stream.push({ type: 'start', partial: assistantMessage });

      if (assistantMessage.stopReason === 'toolUse') {
        stream.push({ type: 'toolcall_start', contentIndex: 0, partial: assistantMessage });
        stream.push({
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: assistantMessage.content[0] as ToolCall,
          partial: assistantMessage
        });
        stream.push({ type: 'done', reason: 'toolUse', message: assistantMessage });
        return;
      }

      stream.push({ type: 'text_start', contentIndex: 0, partial: assistantMessage });
      stream.push({
        type: 'text_delta',
        contentIndex: 0,
        delta: (assistantMessage.content[0] as { type: 'text'; text: string }).text,
        partial: assistantMessage
      });
      stream.push({
        type: 'text_end',
        contentIndex: 0,
        content: (assistantMessage.content[0] as { type: 'text'; text: string }).text,
        partial: assistantMessage
      });
      stream.push({ type: 'done', reason: 'stop', message: assistantMessage });
    });

    return stream;
  };
}

function createReviewQueuedDraftThenApplyPageStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildReviewQueuedDraftKnowledgePageToolCallingAssistantMessage()
        : callCount === 2
          ? buildReviewQueuedApplyDraftUpsertPageToolCallingAssistantMessage()
          : buildFinalAssistantMessage(context);

    queueMicrotask(() => {
      stream.push({ type: 'start', partial: assistantMessage });

      if (assistantMessage.stopReason === 'toolUse') {
        stream.push({ type: 'toolcall_start', contentIndex: 0, partial: assistantMessage });
        stream.push({
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: assistantMessage.content[0] as ToolCall,
          partial: assistantMessage
        });
        stream.push({ type: 'done', reason: 'toolUse', message: assistantMessage });
        return;
      }

      stream.push({ type: 'text_start', contentIndex: 0, partial: assistantMessage });
      stream.push({
        type: 'text_delta',
        contentIndex: 0,
        delta: (assistantMessage.content[0] as { type: 'text'; text: string }).text,
        partial: assistantMessage
      });
      stream.push({
        type: 'text_end',
        contentIndex: 0,
        content: (assistantMessage.content[0] as { type: 'text'; text: string }).text,
        partial: assistantMessage
      });
      stream.push({ type: 'done', reason: 'stop', message: assistantMessage });
    });

    return stream;
  };
}

function buildDraftKnowledgePageToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-draft-page-1', 'draft_knowledge_page', {
    kind: 'topic',
    slug: 'patch-first',
    title: 'Patch First',
    summary: 'Patch-first updates keep page structure stable.',
    status: 'active',
    body: '# Patch First\n\nPatch-first updates keep page structure stable.\n',
    rationale: 'capture durable knowledge',
    source_refs: ['raw/accepted/design.md'],
    outgoing_links: [],
    aliases: [],
    tags: ['patch-first']
  });
}

function buildReviewQueuedDraftKnowledgePageToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-draft-page-review-1', 'draft_knowledge_page', {
    kind: 'topic',
    slug: 'patch-first',
    title: 'Patch First',
    summary: 'Patch-first updates now incorporate new evidence.',
    status: 'active',
    body: '# Patch First\n\nPatch-first updates now incorporate new evidence.\n',
    rationale: 'refresh durable knowledge from new source evidence',
    source_refs: ['raw/accepted/design.md'],
    outgoing_links: [],
    aliases: [],
    tags: ['patch-first', 'updated']
  });
}

function buildApplyDraftUpsertPageToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-apply-draft-page-1', 'apply_draft_upsert', {
    targetPath: 'wiki/topics/patch-first.md',
    upsertArguments: {
      kind: 'topic',
      slug: 'patch-first',
      title: 'Patch First',
      summary: 'Patch-first updates keep page structure stable.',
      status: 'active',
      updated_at: '2026-04-13T00:00:00.000Z',
      body: '# Patch First\n\nPatch-first updates keep page structure stable.\n',
      rationale: 'capture durable knowledge',
      source_refs: ['raw/accepted/design.md'],
      outgoing_links: [],
      aliases: [],
      tags: ['patch-first']
    }
  });
}

function buildReviewQueuedApplyDraftUpsertPageToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-apply-draft-page-review-1', 'apply_draft_upsert', {
    targetPath: 'wiki/topics/patch-first.md',
    upsertArguments: {
      kind: 'topic',
      slug: 'patch-first',
      title: 'Patch First',
      summary: 'Patch-first updates now incorporate new evidence.',
      status: 'active',
      updated_at: '2026-04-13T01:00:00.000Z',
      body: '# Patch First\n\nPatch-first updates now incorporate new evidence.\n',
      rationale: 'refresh durable knowledge from new source evidence',
      source_refs: ['raw/accepted/design.md'],
      outgoing_links: [],
      aliases: [],
      tags: ['patch-first', 'updated']
    }
  });
}

function buildSingleToolCallingAssistantMessage(
  id: string,
  name: string,
  argumentsValue: Record<string, string | boolean | number | string[] | Record<string, unknown>>
): AssistantMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id,
        name,
        arguments: argumentsValue
      }
    ],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    },
    stopReason: 'toolUse',
    timestamp: Date.now()
  };
}

function buildFinalAssistantMessage(context: Context): AssistantMessage {
  const toolResult = context.messages[context.messages.length - 1];
  const text =
    toolResult && toolResult.role === 'toolResult'
      ? toolResult.content
          .filter((block): block is Extract<(typeof toolResult.content)[number], { type: 'text' }> => block.type === 'text')
          .map((block) => block.text)
          .join(' ')
      : 'No result';

  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    },
    stopReason: 'stop',
    timestamp: Date.now()
  };
}
