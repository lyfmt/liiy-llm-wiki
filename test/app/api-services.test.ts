import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';
import {
  buildChatModelsResponseDto,
  buildChatOperationsSummaryDto,
  buildFailedChatRunResponseDto,
  summarizeChatRunResponseDto
} from '../../src/app/api/services/chat.js';
import {
  parseChatRunStartRequestDto,
  parseChatSettingsUpdateRequestDto,
  parseKnowledgePageUpsertRequestDto,
  parseReviewDecisionRequestDto,
  parseSourceManifestUpsertRequestDto,
  parseTaskUpsertRequestDto
} from '../../src/app/api/services/command.js';
import {
  listChangeSetSummariesDto,
  listRunSummariesDto,
  loadReviewSummaryDto,
  loadRunDetailResponseDto
} from '../../src/app/api/services/run.js';
import { buildChatConversationHistory, loadChatSessionDetailDto } from '../../src/app/api/services/chat-session.js';
import { createChatSession } from '../../src/domain/chat-session.js';
import { createRequestRun } from '../../src/domain/request-run.js';
import { syncReviewTask } from '../../src/flows/review/sync-review-task.js';
import { saveBufferedChatAttachment, toChatAttachmentRef } from '../../src/storage/chat-attachment-store.js';
import { saveChatSession } from '../../src/storage/chat-session-store.js';
import { saveRequestRunState, type RequestRunState } from '../../src/storage/request-run-state-store.js';
import { buildRequestRunArtifactPaths } from '../../src/storage/request-run-artifact-paths.js';

describe('app api services', () => {
  it('returns contractized run, changeset, detail, and review summaries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-api-services-'));

    try {
      await bootstrapProject(root);

      const reviewRunState: RequestRunState = {
        request_run: createRequestRun({
          run_id: 'run-review-service-001',
          user_request: 'review the governed draft',
          intent: 'mixed',
          plan: ['observe', 'govern'],
          status: 'needs_review',
          evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
          touched_files: ['wiki/queries/patch-first.md'],
          decisions: ['apply_draft_upsert: durable query writeback queued for review'],
          result_summary: 'waiting for review'
        }),
        tool_outcomes: [
          {
            order: 1,
            toolName: 'apply_draft_upsert',
            summary: 'queued query page writeback',
            evidence: ['wiki/queries/patch-first.md'],
            touchedFiles: [],
            needsReview: true,
            reviewReasons: ['durable query writeback queued for review'],
            resultMarkdown: 'Draft target: wiki/queries/patch-first.md',
            data: {
              draft: {
                targetPath: 'wiki/queries/patch-first.md',
                upsertArguments: {
                  kind: 'query',
                  slug: 'patch-first',
                  title: 'Patch First',
                  body: '# Patch First\n'
                }
              }
            }
          }
        ],
        events: [
          {
            type: 'run_started',
            timestamp: '2026-04-15T00:00:00.000Z',
            summary: 'Run accepted for mixed request',
            status: 'running'
          }
        ],
        timeline_items: [
          {
            lane: 'user',
            title: 'User request',
            summary: 'review the governed draft'
          }
        ],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: {
          target_files: ['wiki/queries/patch-first.md'],
          patch_summary: 'persist reusable answer',
          rationale: 'capture durable answer',
          source_refs: ['raw/accepted/design.md'],
          risk_level: 'medium',
          needs_review: true
        }
      };

      await saveRequestRunState(root, reviewRunState);
      await syncReviewTask(root, reviewRunState);

      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-incomplete-service-001',
          user_request: 'broken partial artifact',
          intent: 'query',
          plan: ['observe'],
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
      await unlink(buildRequestRunArtifactPaths(root, 'run-incomplete-service-001').toolOutcomes);

      const runs = await listRunSummariesDto(root);
      const changesets = await listChangeSetSummariesDto(root);
      const detail = await loadRunDetailResponseDto(root, 'run-review-service-001');
      const review = await loadReviewSummaryDto(root, 'run-review-service-001');

      expect(runs).toEqual([
        {
          run_id: 'run-review-service-001',
          session_id: null,
          status: 'needs_review',
          intent: 'mixed',
          result_summary: 'waiting for review',
          touched_files: ['wiki/queries/patch-first.md'],
          has_changeset: true,
          review_task_id: 'review-run-review-service-001'
        }
      ]);
      expect(changesets).toEqual([
        {
          run_id: 'run-review-service-001',
          status: 'needs_review',
          changeset: {
            target_files: ['wiki/queries/patch-first.md'],
            patch_summary: 'persist reusable answer',
            rationale: 'capture durable answer',
            source_refs: ['raw/accepted/design.md'],
            risk_level: 'medium',
            needs_review: true
          }
        }
      ]);
      expect(detail.request_run).toMatchObject({
        run_id: 'run-review-service-001',
        user_request: 'review the governed draft',
        intent: 'mixed',
        status: 'needs_review',
        decisions: ['apply_draft_upsert: durable query writeback queued for review']
      });
      expect(detail.tool_outcomes).toEqual([
        {
          order: 1,
          tool_name: 'apply_draft_upsert',
          summary: 'queued query page writeback',
          evidence: ['wiki/queries/patch-first.md'],
          touched_files: [],
          change_set: null,
          result_markdown: 'Draft target: wiki/queries/patch-first.md',
          needs_review: true,
          review_reasons: ['durable query writeback queued for review'],
          has_structured_data: true
        }
      ]);
      expect(detail.events).toEqual([
        {
          type: 'run_started',
          timestamp: '2026-04-15T00:00:00.000Z',
          summary: 'Run accepted for mixed request',
          status: 'running',
          tool_name: null,
          tool_call_id: null,
          evidence: [],
          touched_files: [],
          has_structured_data: false
        }
      ]);
      expect(detail.timeline_items).toEqual([
        {
          lane: 'user',
          title: 'User request',
          summary: 'review the governed draft',
          timestamp: null,
          meta: null
        }
      ]);
      expect(review).toEqual({
        run_id: 'run-review-service-001',
        user_request: 'review the governed draft',
        status: 'needs_review',
        changeset: {
          target_files: ['wiki/queries/patch-first.md'],
          patch_summary: 'persist reusable answer',
          rationale: 'capture durable answer',
          source_refs: ['raw/accepted/design.md'],
          risk_level: 'medium',
          needs_review: true
        },
        decisions: ['apply_draft_upsert: durable query writeback queued for review'],
        evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
        touched_files: ['wiki/queries/patch-first.md'],
        can_resolve: true
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns chat operations summary with readiness and recent run slice', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-api-services-'));

    try {
      await bootstrapProject(root);

      for (const index of [1, 2, 3, 4, 5, 6]) {
        await saveRequestRunState(root, {
          request_run: createRequestRun({
            run_id: `run-00${index}`,
            user_request: `request ${index}`,
            intent: 'query',
            plan: ['observe'],
            status: index === 6 ? 'needs_review' : 'done',
            evidence: [],
            touched_files: index === 6 ? ['wiki/queries/latest.md'] : [],
            decisions: [],
            result_summary: `result ${index}`
          }),
          tool_outcomes: [],
          draft_markdown: '# Draft\n',
          result_markdown: '# Result\n',
          changeset:
            index === 6
              ? {
                  target_files: ['wiki/queries/latest.md'],
                  patch_summary: 'latest governed change',
                  rationale: 'keep query page fresh',
                  source_refs: ['raw/accepted/design.md'],
                  risk_level: 'medium',
                  needs_review: true
                }
              : null
        });
      }

      const operations = await buildChatOperationsSummaryDto(root);

      expect(operations.settings.model).toBe('gpt-5.4');
      expect(operations.project_env).toMatchObject({
        source: 'project_root_env'
      });
      expect(operations.project_env.keys).toEqual(expect.arrayContaining(['RUNTIME_API_KEY', 'GRAPH_DATABASE_URL']));
      expect(operations.runtime_readiness).toMatchObject({
        ready: false,
        status: 'missing_api_key',
        configured_api_key_env: 'RUNTIME_API_KEY',
        project_env_has_configured_key: false,
        project_env_has_graph_database_url: true,
        settings_url: '/api/chat/settings'
      });
      expect(operations.runtime_readiness.issues).toEqual(['Project .env is missing RUNTIME_API_KEY.']);
      expect(operations.runtime_readiness.summary).toContain('Runtime is blocked');
      expect(operations.recent_runs.map((run) => run.run_id)).toEqual(['run-006', 'run-005', 'run-004', 'run-003', 'run-002']);
      expect(operations.recent_runs[0]).toMatchObject({
        run_id: 'run-006',
        status: 'needs_review',
        result_summary: 'result 6',
        touched_files: ['wiki/queries/latest.md'],
        has_changeset: true
      });
      expect(operations.suggested_requests).toHaveLength(4);
      expect(operations.suggested_requests[0]).toContain('Inspect the wiki for patch first');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports readiness as blocked when only GRAPH_DATABASE_URL is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-api-services-'));

    try {
      await bootstrapProject(root);
      await writeFile(path.join(root, '.env'), 'RUNTIME_API_KEY=runtime-key\n', 'utf8');

      const operations = await buildChatOperationsSummaryDto(root);

      expect(operations.runtime_readiness).toMatchObject({
        ready: false,
        status: 'missing_graph_database_url',
        configured_api_key_env: 'RUNTIME_API_KEY',
        project_env_has_configured_key: true,
        project_env_has_graph_database_url: false
      });
      expect(operations.runtime_readiness.issues).toEqual(['Project .env is missing GRAPH_DATABASE_URL.']);
      expect(operations.runtime_readiness.summary).toBe('Runtime is blocked until GRAPH_DATABASE_URL is set in the project .env.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports readiness as blocked when both API key and GRAPH_DATABASE_URL are missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-api-services-'));

    try {
      await bootstrapProject(root);
      const currentEnv = await readFile(path.join(root, '.env'), 'utf8');
      await writeFile(path.join(root, '.env'), currentEnv.replace(/^GRAPH_DATABASE_URL=.*\n?/mu, ''), 'utf8');

      const operations = await buildChatOperationsSummaryDto(root);

      expect(operations.runtime_readiness).toMatchObject({
        ready: false,
        status: 'missing_api_key_and_graph_database_url',
        configured_api_key_env: 'RUNTIME_API_KEY',
        project_env_has_configured_key: false,
        project_env_has_graph_database_url: false
      });
      expect(operations.runtime_readiness.issues).toEqual([
        'Project .env is missing RUNTIME_API_KEY.',
        'Project .env is missing GRAPH_DATABASE_URL.'
      ]);
      expect(operations.runtime_readiness.summary).toBe(
        'Runtime is blocked until RUNTIME_API_KEY and GRAPH_DATABASE_URL are set in the project .env.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns backend-owned chat model discovery with selected custom settings preserved', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-api-services-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'state', 'artifacts', 'chat-settings.json'),
        `${JSON.stringify(
          {
            model: 'custom-reasoner',
            provider: 'llm-wiki-liiy',
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid/v1',
            api_key_env: 'RUNTIME_API_KEY',
            reasoning: false,
            context_window: 64000,
            max_tokens: 4096,
            allow_query_writeback: false,
            allow_lint_autofix: false
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const models = await buildChatModelsResponseDto(root);

      expect(models.default_provider).toBe('llm-wiki-liiy');
      expect(models.providers[0]).toMatchObject({
        id: 'llm-wiki-liiy'
      });
      expect(models.providers[0]?.models).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'gpt-5.4',
            provider: 'llm-wiki-liiy'
          }),
          expect.objectContaining({
            id: 'custom-reasoner',
            provider: 'llm-wiki-liiy',
            selected: true,
            built_in: false,
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid',
            api_key_env: 'RUNTIME_API_KEY',
            reasoning: false,
            context_window: 64000,
            max_tokens: 4096
          })
        ])
      );
      expect(models.selected).toEqual({
        provider: 'llm-wiki-liiy',
        model: 'custom-reasoner',
        api: 'anthropic-messages',
        base_url: 'http://runtime.example.invalid/v1',
        api_key_env: 'RUNTIME_API_KEY',
        reasoning: false,
        context_window: 64000,
        max_tokens: 4096
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('parses backend command request contracts', () => {
    expect(
      parseKnowledgePageUpsertRequestDto({
        title: 'Patch First',
        aliases: ['Patch-First'],
        summary: 'Stable page structure',
        tags: ['patch-first'],
        source_refs: ['raw/accepted/design.md'],
        outgoing_links: ['wiki/queries/patch-first.md'],
        status: 'active',
        updated_at: '2026-04-15T00:00:00.000Z',
        body: '# Patch First\n',
        rationale: 'manual refresh'
      })
    ).toEqual({
      title: 'Patch First',
      aliases: ['Patch-First'],
      summary: 'Stable page structure',
      tags: ['patch-first'],
      source_refs: ['raw/accepted/design.md'],
      outgoing_links: ['wiki/queries/patch-first.md'],
      status: 'active',
      updated_at: '2026-04-15T00:00:00.000Z',
      body: '# Patch First\n',
      rationale: 'manual refresh'
    });

    expect(
      parseSourceManifestUpsertRequestDto({
        path: 'raw/accepted/design.md',
        title: 'Patch First Design',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:design',
        imported_at: '2026-04-15T00:00:00.000Z',
        tags: ['patch-first'],
        notes: 'operator curated'
      })
    ).toEqual({
      path: 'raw/accepted/design.md',
      title: 'Patch First Design',
      type: 'markdown',
      status: 'accepted',
      hash: 'sha256:design',
      imported_at: '2026-04-15T00:00:00.000Z',
      tags: ['patch-first'],
      notes: 'operator curated'
    });

    expect(
      parseReviewDecisionRequestDto({
        decision: 'approve',
        reviewer: 'operator',
        note: 'looks grounded'
      })
    ).toEqual({
      decision: 'approve',
      reviewer: 'operator',
      note: 'looks grounded'
    });

    expect(
      parseTaskUpsertRequestDto({
        title: 'Review patch-first page',
        description: 'Check the medium-risk writeback.',
        status: 'needs_review',
        evidence: ['wiki/queries/patch-first.md'],
        assignee: 'editor',
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:10:00.000Z'
      })
    ).toEqual({
      title: 'Review patch-first page',
      description: 'Check the medium-risk writeback.',
      status: 'needs_review',
      evidence: ['wiki/queries/patch-first.md'],
      assignee: 'editor',
      created_at: '2026-04-15T00:00:00.000Z',
      updated_at: '2026-04-15T00:10:00.000Z'
    });

    expect(
      parseChatSettingsUpdateRequestDto({
        model: 'gpt-5.4',
        provider: 'llm-wiki-liiy',
        api: 'anthropic-messages',
        base_url: 'http://runtime.example.invalid/v1',
        api_key_env: 'RUNTIME_API_KEY',
        project_env_contents: '',
        reasoning: true,
        context_window: 256000,
        max_tokens: 32768,
        allow_query_writeback: true,
        allow_lint_autofix: false
      })
    ).toEqual({
      model: 'gpt-5.4',
      provider: 'llm-wiki-liiy',
      api: 'anthropic-messages',
      base_url: 'http://runtime.example.invalid/v1',
      api_key_env: 'RUNTIME_API_KEY',
      project_env_contents: '',
      reasoning: true,
      context_window: 256000,
      max_tokens: 32768,
      allow_query_writeback: true,
      allow_lint_autofix: false
    });

    expect(parseChatRunStartRequestDto({ userRequest: 'what is patch first?' })).toEqual({
      userRequest: 'what is patch first?'
    });
    expect(parseChatRunStartRequestDto({ userRequest: 'what is patch first?', attachmentIds: ['att-001', 'att-002'] })).toEqual({
      userRequest: 'what is patch first?',
      attachmentIds: ['att-001', 'att-002']
    });

    expect(() => parseReviewDecisionRequestDto({ decision: 'later' })).toThrow('Invalid JSON body: expected review decision');
    expect(() => parseTaskUpsertRequestDto({ title: 'Bad task', created_at: '2026-04-15T00:00:00.000Z', status: 'later' })).toThrow(
      'Invalid JSON body: expected task status'
    );
    expect(() => parseChatRunStartRequestDto({ userRequest: 42 })).toThrow('Invalid JSON body: expected string userRequest');
  });

  it('returns linked and fallback chat run responses from chat services', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-api-services-'));

    try {
      await bootstrapProject(root);

      const linkedRunState: RequestRunState = {
        request_run: createRequestRun({
          run_id: 'run-chat-service-001',
          user_request: 'launch a governed writeback',
          intent: 'mixed',
          plan: ['observe', 'draft', 'govern'],
          status: 'failed',
          evidence: ['wiki/topics/patch-first.md'],
          touched_files: ['wiki/queries/patch-first.md'],
          decisions: ['apply_draft_upsert: failed after launch'],
          result_summary: 'synthetic runtime failure'
        }),
        tool_outcomes: [],
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

      await saveRequestRunState(root, linkedRunState);
      await syncReviewTask(root, linkedRunState);

      const links = await summarizeChatRunResponseDto(root, 'run-chat-service-001');
      const persistedFailure = await buildFailedChatRunResponseDto(root, 'run-chat-service-001', new Error('synthetic runtime failure'));
      const fallbackFailure = await buildFailedChatRunResponseDto(root, 'run-chat-service-missing', new Error('missing run state'));

      expect(links).toEqual({
        run_url: '/api/runs/run-chat-service-001',
        review_url: '/api/reviews/run-chat-service-001',
        task_url: null,
        task_id: null,
        touched_files: ['wiki/queries/patch-first.md'],
        status: 'failed'
      });
      expect(persistedFailure).toMatchObject({
        ok: false,
        code: 'runtime_error',
        run_id: 'run-chat-service-001',
        run_url: '/api/runs/run-chat-service-001',
        review_url: '/api/reviews/run-chat-service-001',
        task_url: null,
        task_id: null,
        touched_files: ['wiki/queries/patch-first.md'],
        status: 'failed',
        result_summary: 'synthetic runtime failure',
        settings_url: '/api/chat/settings'
      });
      expect(fallbackFailure).toMatchObject({
        ok: false,
        code: 'runtime_error',
        run_id: 'run-chat-service-missing',
        run_url: '/api/runs/run-chat-service-missing',
        review_url: null,
        task_url: null,
        task_id: null,
        touched_files: [],
        status: 'failed',
        result_summary: 'missing run state',
        settings_url: '/api/chat/settings'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('filters invalid run artifacts out of chat session detail and latest-run selection', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-api-services-'));

    try {
      await bootstrapProject(root);

      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-valid-001',
          session_id: 'session-chat-001',
          user_request: 'valid request',
          intent: 'query',
          plan: ['observe'],
          status: 'done',
          evidence: ['wiki/topics/patch-first.md'],
          touched_files: [],
          decisions: ['query_wiki: answered from wiki'],
          result_summary: 'valid answer'
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: null
      });

      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-invalid-001',
          session_id: 'session-chat-001',
          user_request: 'invalid request',
          intent: 'query',
          plan: ['observe'],
          status: 'done',
          evidence: [],
          touched_files: [],
          decisions: ['query_wiki: should be skipped'],
          result_summary: 'invalid answer'
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: null
      });
      await unlink(buildRequestRunArtifactPaths(root, 'run-invalid-001').toolOutcomes);

      await saveChatSession(
        root,
        createChatSession({
          session_id: 'session-chat-001',
          title: 'Session with invalid run',
          run_ids: ['run-valid-001', 'run-invalid-001'],
          last_run_id: 'run-invalid-001',
          summary: 'session summary',
          status: 'done'
        })
      );

      const detail = await loadChatSessionDetailDto(root, 'session-chat-001');
      const links = await summarizeChatRunResponseDto(root, 'run-invalid-001');

      expect(detail.session.last_run_id).toBe('run-valid-001');
      expect(detail.session.run_count).toBe(1);
      expect(detail.runs.map((run) => run.request_run.run_id)).toEqual(['run-valid-001']);
      expect(detail.runs[0]?.request_run.result_summary).toBe('valid answer');
      expect(links).toEqual({
        run_url: '/api/runs/run-invalid-001',
        review_url: null,
        task_url: null,
        task_id: null,
        touched_files: [],
        status: 'running'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rebuilds chat conversation history with buffered attachments as user content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-api-services-'));

    try {
      await bootstrapProject(root);

      const attachment = await saveBufferedChatAttachment(root, {
        sessionId: 'session-chat-attach-001',
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        data: Buffer.from('Patch first attachment body\n', 'utf8')
      });

      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-attach-001',
          session_id: 'session-chat-attach-001',
          user_request: 'use attached notes',
          intent: 'query',
          plan: ['observe'],
          status: 'done',
          evidence: [],
          touched_files: [],
          decisions: ['query_wiki: answered with attachment'],
          result_summary: 'used attached notes',
          attachments: [toChatAttachmentRef(attachment)]
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: null
      });

      await saveChatSession(
        root,
        createChatSession({
          session_id: 'session-chat-attach-001',
          title: 'Session with attachment',
          run_ids: ['run-attach-001'],
          last_run_id: 'run-attach-001',
          summary: 'session summary',
          status: 'done'
        })
      );

      const history = await buildChatConversationHistory(root, 'session-chat-attach-001');

      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        role: 'user'
      });
      expect(history[0]?.role).toBe('user');
      if (history[0]?.role !== 'user') {
        throw new Error('expected first history item to be a user message');
      }
      expect(history[0].content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'text', text: 'use attached notes' }),
          expect.objectContaining({ type: 'text', text: expect.stringContaining('notes.txt') }),
          expect.objectContaining({ type: 'text', text: expect.stringContaining('Patch first attachment body') })
        ])
      );
      expect(history[1]).toEqual({
        role: 'assistant',
        content: 'used attached notes'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
