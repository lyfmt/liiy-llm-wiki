import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  registerFauxProvider,
  type AssistantMessage,
  type Context,
  type ToolCall
} from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';
import { createWebServer } from '../../src/app/web-server.js';
import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import { createSourceManifest } from '../../src/domain/source-manifest.js';
import { runRuntimeAgent } from '../../src/runtime/agent-session.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../src/storage/knowledge-page-store.js';
import { loadRequestRunState } from '../../src/storage/request-run-state-store.js';
import { saveSourceManifest } from '../../src/storage/source-manifest-store.js';

const liveApiKey = process.env.RUNTIME_API_KEY?.trim();
const liveDescribe = liveApiKey ? describe : describe.skip;
const LIVE_TIMEOUT_MS = 240_000;

interface JsonResponse<T> {
  status: number;
  body: T;
}

describe('stub knowledge insert runtime', () => {
  it('applies the governed draft only after the reviewer subagent passes', async () => {
    const passed = await runKnowledgeInsertGovernedStubScenario('done');
    const failed = await runKnowledgeInsertGovernedStubScenario('needs_review');

    try {
      expect(await readFile(path.join(passed.root, 'state', 'artifacts', 'subagents', 'run-insert-001--writer-1', 'draft.md'), 'utf8')).toContain(
        'Patch First Inserted'
      );
      expect(passed.result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual(['read_skill', 'run_skill']);
      expect(passed.result.toolOutcomes[1]?.resultMarkdown).toContain('run_subagent: ran subagent worker');
      expect(passed.result.toolOutcomes[1]?.resultMarkdown).toContain('run_subagent: ran subagent reviewer');
      expect(passed.result.toolOutcomes[1]?.resultMarkdown).toContain('apply_draft_upsert');
      expect(passed.result.toolOutcomes[1]?.resultMarkdown).toContain('lint_wiki');
      expect(await readFile(path.join(passed.root, 'wiki', 'topics', 'patch-first-inserted.md'), 'utf8')).toContain(
        '# Patch First Inserted'
      );

      expect(await readFile(path.join(failed.root, 'state', 'artifacts', 'subagents', 'run-insert-001--writer-1', 'draft.md'), 'utf8')).toContain(
        'Patch First Inserted'
      );
      expect(failed.result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual(['read_skill', 'run_skill']);
      expect(failed.result.toolOutcomes[1]?.resultMarkdown).toContain('run_subagent: ran subagent reviewer');
      expect(failed.result.toolOutcomes[1]?.resultMarkdown).not.toContain('- apply_draft_upsert:');
      await expect(readFile(path.join(failed.root, 'wiki', 'topics', 'patch-first-inserted.md'), 'utf8')).rejects.toThrow();
    } finally {
      await passed.cleanup();
      await failed.cleanup();
    }
  });
});

liveDescribe('live llm-wiki-liiy runtime', () => {
  it(
    'answers a wiki query through the configured remote Claude-native model',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-live-llm-wiki-liiy-'));

      try {
        await seedLiveProject(root);

        const result = await runRuntimeAgent({
          root,
          userRequest: 'what is patch first?',
          runId: 'live-llm-wiki-liiy-query-001'
        });

        expect(result.intent).toBe('query');
        expect(result.toolOutcomes.length).toBeGreaterThan(0);
        expect(result.toolOutcomes.some((outcome) => outcome.data?.synthesisMode === 'llm')).toBe(true);
        expect(result.assistantText.length).toBeGreaterThan(0);
        expect(result.assistantText.toLowerCase()).toContain('patch');

        const runState = await loadRequestRunState(root, 'live-llm-wiki-liiy-query-001');
        expect(runState.request_run.status).toBe('done');
        expect(runState.request_run.result_summary.length).toBeGreaterThan(0);
        expect(runState.result_markdown).toContain('Synthesis mode: llm');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    LIVE_TIMEOUT_MS
  );

  it(
    'creates a new durable wiki page through the remote draft-then-apply flow',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-live-llm-wiki-liiy-'));

      try {
        await seedLiveProject(root);

        const result = await runRuntimeAgent({
          root,
          userRequest:
            'create a new wiki page for patch first using raw/accepted/design.md as evidence, make it a durable topic page, and apply the draft if it is well-grounded',
          runId: 'live-llm-wiki-liiy-create-page-001'
        });

        expect(result.intent).toBe('mixed');
        expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toContain('draft_knowledge_page');
        expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toContain('apply_draft_upsert');
        expect(result.toolOutcomes.some((outcome) => outcome.data?.synthesisMode === 'llm')).toBe(true);
        expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Knowledge Page Draft');
        expect(result.assistantText.length).toBeGreaterThan(0);

        const pageContents = await readFile(path.join(root, 'wiki', 'topics', 'patch-first.md'), 'utf8');
        expect(pageContents).toContain('# Patch First');
        expect(pageContents.toLowerCase()).toContain('patch-first');

        const runState = await loadRequestRunState(root, 'live-llm-wiki-liiy-create-page-001');
        expect(runState.request_run.status).toBe('done');
        expect(runState.request_run.touched_files).toContain('wiki/topics/patch-first.md');
        expect(runState.result_markdown).toContain('Synthesis mode: llm');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    LIVE_TIMEOUT_MS
  );
});

liveDescribe('live llm-wiki-liiy web runtime', () => {
  it(
    'answers a wiki query from the web surface with project .env runtime readiness',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-live-web-llm-wiki-liiy-'));

      try {
        await seedLiveProject(root);
        const { server, baseUrl } = await startLiveWebServer(root);

        try {
          const operations = await fetchJson<{
            runtime_readiness: {
              ready: boolean;
              status: string;
              configured_api_key_env: string;
              project_env_has_configured_key: boolean;
              project_env_has_graph_database_url: boolean;
            };
          }>(`${baseUrl}/api/chat/operations`);
          expect(operations.status).toBe(200);
          expect(operations.body.runtime_readiness).toMatchObject({
            ready: true,
            status: 'ready',
            configured_api_key_env: 'RUNTIME_API_KEY',
            project_env_has_configured_key: true,
            project_env_has_graph_database_url: true
          });

          const launched = await fetchJson<{
            ok: boolean;
            runId: string;
            run_id: string;
            intent: string;
            result_summary: string;
            touched_files: string[];
            status: string;
            tool_outcomes: Array<{ tool_name: string }>;
            run_url: string;
            review_url: string | null;
            task_url: string | null;
            task_id: string | null;
          }>(`${baseUrl}/api/chat/runs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              userRequest: 'What is patch first according to the current wiki and source evidence?'
            })
          });

          expect(launched.status).toBe(200);
          expect(launched.body.ok).toBe(true);
          expect(launched.body.run_id).toBe(launched.body.runId);
          expect(launched.body.intent).toBe('query');
          expect(launched.body.status).toBe('done');
          expect(launched.body.result_summary.toLowerCase()).toContain('patch');
          expect(launched.body.touched_files).toEqual([]);
          expect(launched.body.run_url).toBe(`/api/runs/${launched.body.runId}`);
          expect(launched.body.review_url).toBeNull();
          expect(launched.body.task_url).toBeNull();
          expect(launched.body.task_id).toBeNull();
          expect(launched.body.tool_outcomes.map((outcome) => outcome.tool_name)).toContain('list_wiki_pages');
          expect(launched.body.tool_outcomes.map((outcome) => outcome.tool_name)).toContain('read_wiki_page');
          expect(
            launched.body.tool_outcomes.some((outcome) => outcome.tool_name === 'read_raw_source' || outcome.tool_name === 'query_wiki')
          ).toBe(true);

          const runState = await loadRequestRunState(root, launched.body.runId);
          expect(runState.request_run.status).toBe('done');
          expect(runState.request_run.touched_files).toEqual([]);
          expect(runState.request_run.result_summary.toLowerCase()).toContain('patch');
        } finally {
          await closeServer(server);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    LIVE_TIMEOUT_MS
  );

  it(
    'writes back a durable query page from the web surface through the remote draft-then-apply flow',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-live-web-llm-wiki-liiy-'));

      try {
        await seedLiveProject(root);
        const { server, baseUrl } = await startLiveWebServer(root);

        try {
          await configureLiveChatSettings(root, baseUrl, { allowQueryWriteback: true });

          const launched = await fetchJson<{
            ok: boolean;
            runId: string;
            run_id: string;
            intent: string;
            result_summary: string;
            touched_files: string[];
            status: string;
            tool_outcomes: Array<{ tool_name: string }>;
            run_url: string;
            review_url: string | null;
            task_url: string | null;
            task_id: string | null;
          }>(`${baseUrl}/api/chat/runs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              userRequest:
                'Inspect the wiki and source evidence for patch first, then create a durable reusable query page answering: what evidence currently defines patch first? Apply the governed draft if the answer is well-grounded.'
            })
          });

          expect(launched.status).toBe(200);
          expect(launched.body.ok).toBe(true);
          expect(launched.body.run_id).toBe(launched.body.runId);
          expect(launched.body.intent).toBe('mixed');
          expect(launched.body.status).toBe('done');
          expect(launched.body.tool_outcomes.map((outcome) => outcome.tool_name)).toContain('draft_query_page');
          expect(launched.body.tool_outcomes.map((outcome) => outcome.tool_name)).toContain('apply_draft_upsert');
          expect(launched.body.touched_files).toEqual([
            'wiki/queries/what-evidence-currently-defines-patch-first.md',
            'wiki/index.md',
            'wiki/log.md'
          ]);
          expect(launched.body.review_url).toBe(`/api/reviews/${launched.body.runId}`);
          expect(launched.body.task_id).toBeNull();
          expect(launched.body.task_url).toBeNull();
          expect(launched.body.result_summary.toLowerCase()).toContain('evidence');

          const queryPage = await loadKnowledgePage(root, 'query', 'what-evidence-currently-defines-patch-first');
          expect(queryPage.page.title.toLowerCase()).toContain('patch first');
          expect(queryPage.page.source_refs).toContain('raw/accepted/design.md');
          expect(queryPage.body.toLowerCase()).toContain('patch first');

          const runState = await loadRequestRunState(root, launched.body.runId);
          expect(runState.request_run.status).toBe('done');
          expect(runState.request_run.touched_files).toEqual([
            'wiki/queries/what-evidence-currently-defines-patch-first.md',
            'wiki/index.md',
            'wiki/log.md'
          ]);
          expect(runState.tool_outcomes.map((outcome) => outcome.toolName)).toContain('draft_query_page');
          expect(runState.tool_outcomes.map((outcome) => outcome.toolName)).toContain('apply_draft_upsert');

          const review = await fetchJson<{
            status: string;
            can_resolve: boolean;
            changeset: { needs_review: boolean; target_files: string[] };
          }>(`${baseUrl}/api/reviews/${launched.body.runId}`);
          expect(review.status).toBe(200);
          expect(review.body.status).toBe('done');
          expect(review.body.can_resolve).toBe(false);
          expect(review.body.changeset.needs_review).toBe(false);
          expect(review.body.changeset.target_files).toEqual([
            'wiki/queries/what-evidence-currently-defines-patch-first.md',
            'wiki/index.md',
            'wiki/log.md'
          ]);
        } finally {
          await closeServer(server);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    LIVE_TIMEOUT_MS
  );

  it(
    'creates a new durable topic page from the web surface through the remote draft-then-apply flow',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-live-web-llm-wiki-liiy-'));

      try {
        await seedLiveProject(root);
        const { server, baseUrl } = await startLiveWebServer(root);

        try {
          await configureLiveChatSettings(root, baseUrl, { allowQueryWriteback: false });

          const launched = await fetchJson<{
            ok: boolean;
            runId: string;
            run_id: string;
            intent: string;
            result_summary: string;
            touched_files: string[];
            status: string;
            tool_outcomes: Array<{ tool_name: string }>;
            run_url: string;
            review_url: string | null;
            task_url: string | null;
            task_id: string | null;
          }>(`${baseUrl}/api/chat/runs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              userRequest:
                'Inspect the current wiki and raw evidence for patch first, then create a new durable topic page at wiki/topics/patch-first-evidence.md summarizing what evidence currently defines patch first. Keep it narrowly grounded in the observed evidence and apply the governed draft if it is well-grounded.'
            })
          });

          expect(launched.status).toBe(200);
          expect(launched.body.ok).toBe(true);
          expect(launched.body.run_id).toBe(launched.body.runId);
          expect(launched.body.intent).toBe('mixed');
          expect(launched.body.status).toBe('done');
          expect(launched.body.tool_outcomes.map((outcome) => outcome.tool_name)).toContain('draft_knowledge_page');
          expect(launched.body.tool_outcomes.map((outcome) => outcome.tool_name)).toContain('apply_draft_upsert');
          expect(launched.body.touched_files).toEqual(['wiki/topics/patch-first-evidence.md', 'wiki/index.md', 'wiki/log.md']);
          expect(launched.body.review_url).toBe(`/api/reviews/${launched.body.runId}`);
          expect(launched.body.task_id).toBeNull();
          expect(launched.body.task_url).toBeNull();
          expect(launched.body.result_summary.toLowerCase()).toContain('observed evidence');

          const topicPage = await loadKnowledgePage(root, 'topic', 'patch-first-evidence');
          expect(topicPage.page.title).toBe('Patch First Evidence');
          expect(topicPage.page.source_refs).toEqual(['raw/accepted/design.md']);
          expect(topicPage.page.summary.toLowerCase()).toContain('evidence');
          expect(topicPage.body.toLowerCase()).toContain('patch first');

          const runState = await loadRequestRunState(root, launched.body.runId);
          expect(runState.request_run.status).toBe('done');
          expect(runState.request_run.touched_files).toEqual(['wiki/topics/patch-first-evidence.md', 'wiki/index.md', 'wiki/log.md']);
          expect(runState.tool_outcomes.map((outcome) => outcome.toolName)).toContain('draft_knowledge_page');
          expect(runState.tool_outcomes.map((outcome) => outcome.toolName)).toContain('apply_draft_upsert');

          const review = await fetchJson<{
            status: string;
            can_resolve: boolean;
            changeset: { needs_review: boolean; target_files: string[] };
          }>(`${baseUrl}/api/reviews/${launched.body.runId}`);
          expect(review.status).toBe(200);
          expect(review.body.status).toBe('done');
          expect(review.body.can_resolve).toBe(false);
          expect(review.body.changeset.needs_review).toBe(false);
          expect(review.body.changeset.target_files).toEqual(['wiki/topics/patch-first-evidence.md', 'wiki/index.md', 'wiki/log.md']);
        } finally {
          await closeServer(server);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    LIVE_TIMEOUT_MS
  );

  it(
    'queues review for a web-launched core topic grounding rewrite instead of applying it',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-live-web-llm-wiki-liiy-'));

      try {
        await seedReviewRewriteProject(root);
        const { server, baseUrl } = await startLiveWebServer(root);

        try {
          await configureLiveChatSettings(root, baseUrl, { allowQueryWriteback: false });

          const launched = await fetchJson<{
            ok: boolean;
            runId: string;
            run_id: string;
            intent: string;
            result_summary: string;
            touched_files: string[];
            status: string;
            tool_outcomes: Array<{ tool_name: string; needs_review?: boolean; review_reasons?: string[] }>;
            run_url: string;
            review_url: string | null;
            task_url: string | null;
            task_id: string | null;
          }>(`${baseUrl}/api/chat/runs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              userRequest:
                'Inspect wiki/topics/patch-first.md plus raw/accepted/old-design.md and raw/accepted/design.md. Then create a governed update draft for wiki/topics/patch-first.md using raw/accepted/design.md as the new source grounding, and call apply_draft_upsert so the governance layer can decide whether to persist or queue review. Do not stop at draft only. Because this changes the core topic grounding away from raw/accepted/old-design.md, the governed result should queue review instead of applying the rewrite.'
            })
          });

          expect(launched.status).toBe(200);
          expect(launched.body.ok).toBe(true);
          expect(launched.body.run_id).toBe(launched.body.runId);
          expect(launched.body.intent).toBe('mixed');
          expect(launched.body.status).toBe('needs_review');
          expect(launched.body.touched_files).toEqual([]);
          expect(launched.body.tool_outcomes.map((outcome) => outcome.tool_name)).toContain('draft_knowledge_page');
          expect(launched.body.tool_outcomes.map((outcome) => outcome.tool_name)).toContain('apply_draft_upsert');
          expect(
            launched.body.tool_outcomes.some(
              (outcome) => outcome.tool_name === 'apply_draft_upsert' && outcome.needs_review === true
            )
          ).toBe(true);
          expect(launched.body.review_url).toBe(`/api/reviews/${launched.body.runId}`);
          expect(launched.body.task_id).toBe(`review-${launched.body.runId}`);
          expect(launched.body.task_url).toBe(`/api/tasks/review-${launched.body.runId}`);
          expect(launched.body.result_summary.toLowerCase()).toContain('governed writeback');

          const topicPage = await loadKnowledgePage(root, 'topic', 'patch-first');
          expect(topicPage.page.source_refs).toEqual(['raw/accepted/old-design.md']);
          expect(topicPage.page.summary).toBe('Stable patch-first baseline from older source grounding.');
          expect(topicPage.body).toContain('older source grounding');

          const runState = await loadRequestRunState(root, launched.body.runId);
          expect(runState.request_run.status).toBe('needs_review');
          expect(runState.request_run.touched_files).toEqual([]);
          expect(runState.request_run.decisions).toContain('apply_draft_upsert: rewrites a core topic page');
          expect(runState.tool_outcomes.map((outcome) => outcome.toolName)).toContain('apply_draft_upsert');
          expect(runState.tool_outcomes.flatMap((outcome) => outcome.reviewReasons ?? [])).toContain('rewrites a core topic page');
          expect(runState.changeset).toEqual({
            target_files: ['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md'],
            patch_summary: 'upsert topic page wiki/topics/patch-first.md',
            rationale:
              'Updated the topic page to align with the newer accepted design source and replaced the older grounding. The body stays conservative because the supplied evidence contains a single bounded statement.',
            source_refs: ['raw/accepted/design.md'],
            risk_level: 'high',
            needs_review: true
          });

          const review = await fetchJson<{
            status: string;
            can_resolve: boolean;
            changeset: { needs_review: boolean; target_files: string[] };
          }>(`${baseUrl}/api/reviews/${launched.body.runId}`);
          expect(review.status).toBe(200);
          expect(review.body.status).toBe('needs_review');
          expect(review.body.can_resolve).toBe(true);
          expect(review.body.changeset.needs_review).toBe(true);
          expect(review.body.changeset.target_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);

          const task = await fetchJson<{
            id: string;
            status: string;
            title: string;
            evidence: string[];
            links: { api: string };
          }>(`${baseUrl}/api/tasks/review-${launched.body.runId}`);
          expect(task.status).toBe(200);
          expect(task.body).toMatchObject({
            id: `review-${launched.body.runId}`,
            status: 'needs_review',
            links: {
              api: `/api/tasks/review-${launched.body.runId}`
            }
          });
          expect(task.body.title).toContain('Review: Inspect wiki/topics/patch-first.md');
          expect(task.body.evidence).toEqual([
            'raw/accepted/old-design.md',
            'raw/accepted/design.md',
            'wiki/topics/patch-first.md',
            'wiki/index.md',
            'wiki/log.md'
          ]);
        } finally {
          await closeServer(server);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    LIVE_TIMEOUT_MS
  );
});

async function seedLiveProject(root: string): Promise<void> {
  await bootstrapProject(root);
  await writeProjectEnv(root);
  await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
  await writeFile(
    path.join(root, 'raw', 'accepted', 'design.md'),
    '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n',
    'utf8'
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
}

async function seedReviewRewriteProject(root: string): Promise<void> {
  await bootstrapProject(root);
  await writeProjectEnv(root);
  await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
  await writeFile(
    path.join(root, 'raw', 'accepted', 'old-design.md'),
    '# Patch First Old\n\nPatch-first preserved the existing baseline structure.\n',
    'utf8'
  );
  await writeFile(
    path.join(root, 'raw', 'accepted', 'design.md'),
    '# Patch First New\n\nPatch-first updates keep page structure stable in source form while incorporating new evidence.\n',
    'utf8'
  );
  await saveSourceManifest(
    root,
    createSourceManifest({
      id: 'src-old',
      path: 'raw/accepted/old-design.md',
      title: 'Patch First Old Design',
      type: 'markdown',
      status: 'accepted',
      hash: 'sha256:old-design',
      imported_at: '2026-04-14T00:00:00.000Z',
      tags: ['patch-first', 'old']
    })
  );
  await saveSourceManifest(
    root,
    createSourceManifest({
      id: 'src-new',
      path: 'raw/accepted/design.md',
      title: 'Patch First New Design',
      type: 'markdown',
      status: 'accepted',
      hash: 'sha256:new-design',
      imported_at: '2026-04-14T00:00:00.000Z',
      tags: ['patch-first', 'new']
    })
  );
  await saveKnowledgePage(
    root,
    createKnowledgePage({
      path: 'wiki/topics/patch-first.md',
      kind: 'topic',
      title: 'Patch First',
      summary: 'Stable patch-first baseline from older source grounding.',
      tags: ['patch-first'],
      source_refs: ['raw/accepted/old-design.md'],
      outgoing_links: [],
      status: 'active',
      updated_at: '2026-04-14T00:00:00.000Z'
    }),
    '# Patch First\n\nStable patch-first baseline from older source grounding.\n'
  );
}

async function writeProjectEnv(root: string): Promise<void> {
  await writeFile(path.join(root, '.env'), `RUNTIME_API_KEY=${getRequiredLiveApiKey()}\n`, 'utf8');
}

function getRequiredLiveApiKey(): string {
  if (!liveApiKey) {
    throw new Error('Set RUNTIME_API_KEY to run live llm-wiki-liiy tests.');
  }

  return liveApiKey;
}

async function startLiveWebServer(root: string): Promise<{ server: ReturnType<typeof createWebServer>; baseUrl: string }> {
  const server = createWebServer(root);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Server did not bind to a port');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`
  };
}

async function closeServer(server: ReturnType<typeof createWebServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function configureLiveChatSettings(
  root: string,
  baseUrl: string,
  options: { allowQueryWriteback: boolean }
): Promise<void> {
  const projectEnvContents = await readFile(path.join(root, '.env'), 'utf8');
  const response = await fetchJson<{ ok: boolean; settings: { allow_query_writeback: boolean } }>(`${baseUrl}/api/chat/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4',
      provider: 'llm-wiki-liiy',
      api: 'anthropic-messages',
      base_url: 'http://runtime.example.invalid/v1',
      api_key_env: 'RUNTIME_API_KEY',
      reasoning: true,
      allow_query_writeback: options.allowQueryWriteback,
      allow_lint_autofix: false,
      project_env_contents: projectEnvContents
    })
  });

  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.settings.allow_query_writeback).toBe(options.allowQueryWriteback);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(url, init);

  return {
    status: response.status,
    body: (await response.json()) as T
  };
}

async function runKnowledgeInsertGovernedStubScenario(reviewerStatus: 'done' | 'needs_review') {
  const root = await mkdtemp(path.join(tmpdir(), `llm-wiki-knowledge-insert-${reviewerStatus}-`));
  const faux = registerFauxProvider({
    api: `test-runtime-live-knowledge-insert-${reviewerStatus}`,
    provider: `test-runtime-live-knowledge-insert-${reviewerStatus}`,
    models: [
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 8192
      }
    ]
  });

  await bootstrapProject(root);
  await mkdir(path.join(root, '.agents', 'skills', 'knowledge-insert'), { recursive: true });
  await writeFile(
    path.join(root, '.agents', 'skills', 'knowledge-insert', 'SKILL.md'),
    `---
name: knowledge-insert
description: Insert governed knowledge drafts into the wiki.
allowed-tools:
  - run_subagent
  - read_artifact
  - draft_knowledge_page
  - apply_draft_upsert
  - lint_wiki
---

# Knowledge Insert
`,
    'utf8'
  );
  await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
  await writeFile(
    path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
    `---
name: worker
description: Writer subagent for draft preparation.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker
`,
    'utf8'
  );
  await mkdir(path.join(root, '.agents', 'subagents', 'reviewer'), { recursive: true });
  await writeFile(
    path.join(root, '.agents', 'subagents', 'reviewer', 'SUBAGENT.md'),
    `---
name: reviewer
description: Reviewer subagent for governed drafts.
default-tools: read_artifact
max-tools: read_artifact
receipt-schema: minimal-receipt-v1
---

# Reviewer
`,
    'utf8'
  );
  await writeFile(
    path.join(root, 'raw', 'accepted', 'design.md'),
    '# Design\n\nPatch-first insertions stay grounded in observed evidence.\n',
    'utf8'
  );
  await mkdir(path.join(root, 'state', 'artifacts', 'subagents', 'input'), { recursive: true });
  await writeFile(
    path.join(root, 'state', 'artifacts', 'subagents', 'input', 'blocks.json'),
    '{\n  "blocks": [\n    { "blockId": "block-001" }\n  ]\n}\n',
    'utf8'
  );

  faux.setResponses([
    buildSingleToolCallingAssistantMessage('tool-call-live-run-writer-1', 'run_subagent', {
      profile: 'worker',
      taskPrompt: 'Write a grounded draft artifact for the proposed knowledge page.',
      inputArtifacts: ['state/artifacts/subagents/input/blocks.json'],
      outputDir: 'state/artifacts/subagents/run-insert-001--writer-1',
      requestedTools: ['read_artifact', 'write_artifact']
    }),
    buildSingleToolCallingAssistantMessage('tool-call-live-writer-read-1', 'read_artifact', {
      artifactPath: 'state/artifacts/subagents/input/blocks.json'
    }),
    buildSingleToolCallingAssistantMessage('tool-call-live-writer-write-1', 'write_artifact', {
      artifactPath: 'state/artifacts/subagents/run-insert-001--writer-1/draft.md',
      content: '# Patch First Inserted\n\nObserved evidence remains grounded in raw/accepted/design.md.\n'
    }),
    fauxAssistantMessage(
      JSON.stringify({
        status: 'done',
        summary: 'Writer produced a governed draft artifact.',
        outputArtifacts: ['state/artifacts/subagents/run-insert-001--writer-1/draft.md']
      })
    ),
    buildSingleToolCallingAssistantMessage('tool-call-live-read-draft-1', 'read_artifact', {
      artifactPath: 'state/artifacts/subagents/run-insert-001--writer-1/draft.md'
    }),
    buildSingleToolCallingAssistantMessage('tool-call-live-draft-page-1', 'draft_knowledge_page', {
      kind: 'topic',
      slug: 'patch-first-inserted',
      title: 'Patch First Inserted',
      summary: 'Observed evidence for the inserted patch-first topic.',
      status: 'active',
      body: '# Patch First Inserted\n\nObserved evidence remains grounded in raw/accepted/design.md.\n',
      rationale: 'capture durable inserted knowledge',
      source_refs: ['raw/accepted/design.md'],
      outgoing_links: [],
      aliases: [],
      tags: ['patch-first', 'inserted']
    }),
    buildSingleToolCallingAssistantMessage('tool-call-live-run-reviewer-1', 'run_subagent', {
      profile: 'reviewer',
      taskPrompt: 'Review the proposed draft artifact and return a receipt.',
      inputArtifacts: ['state/artifacts/subagents/run-insert-001--writer-1/draft.md'],
      outputDir: 'state/artifacts/subagents/run-insert-001--reviewer-1'
    }),
    buildSingleToolCallingAssistantMessage('tool-call-live-reviewer-read-1', 'read_artifact', {
      artifactPath: 'state/artifacts/subagents/run-insert-001--writer-1/draft.md'
    }),
    fauxAssistantMessage(
      JSON.stringify({
        status: reviewerStatus,
        summary:
          reviewerStatus === 'done'
            ? 'Reviewer confirmed the draft stays source-grounded.'
            : 'Reviewer could not confirm the draft is source-grounded.',
        outputArtifacts: []
      })
    ),
    ...(reviewerStatus === 'done'
      ? [
          buildSingleToolCallingAssistantMessage('tool-call-live-apply-draft-1', 'apply_draft_upsert', {
            targetPath: 'wiki/topics/patch-first-inserted.md',
            upsertArguments: {
              kind: 'topic',
              slug: 'patch-first-inserted',
              title: 'Patch First Inserted',
              summary: 'Observed evidence for the inserted patch-first topic.',
              status: 'active',
              updated_at: '2026-04-21T00:00:00.000Z',
              body: '# Patch First Inserted\n\nObserved evidence remains grounded in raw/accepted/design.md.\n',
              rationale: 'capture durable inserted knowledge',
              source_refs: ['raw/accepted/design.md'],
              outgoing_links: [],
              aliases: [],
              tags: ['patch-first', 'inserted']
            }
          }),
          buildSingleToolCallingAssistantMessage('tool-call-live-lint-1', 'lint_wiki', {
            userRequest: 'lint wiki after knowledge insert'
          }),
          fauxAssistantMessage('Knowledge insert draft applied after reviewer approval.')
        ]
      : [fauxAssistantMessage('Knowledge insert draft stopped at reviewer gate.')])
  ]);

  const model = faux.getModel('gpt-5.4');

  if (!model) {
    throw new Error('missing faux model');
  }

  const result = await runRuntimeAgent({
    root,
    userRequest: 'insert the observed patch-first evidence into the wiki with review',
    runId: `runtime-live-knowledge-insert-${reviewerStatus}-001`,
    model,
    streamFn: createReadAndRunKnowledgeInsertSkillStream()
  });

  return {
    root,
    result,
    cleanup: async () => {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  };
}

function createReadAndRunKnowledgeInsertSkillStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildSingleToolCallingAssistantMessage('tool-call-live-read-skill-1', 'read_skill', {
            name: 'knowledge-insert'
          })
        : callCount === 2
          ? buildSingleToolCallingAssistantMessage('tool-call-live-run-skill-1', 'run_skill', {
              name: 'knowledge-insert',
              task: 'Use writer and reviewer subagents, then only apply the draft when review passes.'
            })
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
