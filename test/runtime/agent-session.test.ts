import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  getModel,
  registerFauxProvider,
  type AssistantMessage,
  type Context,
  type ToolCall
} from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';
import { createChatSession } from '../../src/domain/chat-session.js';
import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import { createSourceManifest } from '../../src/domain/source-manifest.js';
import { runRuntimeAgent } from '../../src/runtime/agent-session.js';
import { runUpsertKnowledgePageFlow } from '../../src/flows/wiki/run-upsert-knowledge-page-flow.js';
import { saveKnowledgePage } from '../../src/storage/knowledge-page-store.js';
import { loadRequestRunState } from '../../src/storage/request-run-state-store.js';
import { saveChatSession } from '../../src/storage/chat-session-store.js';
import { loadKnowledgeTask } from '../../src/storage/task-store.js';
import { saveSourceManifest } from '../../src/storage/source-manifest-store.js';

describe('runRuntimeAgent', () => {
  it('supports direct general replies without forcing wiki tools', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      const result = await runRuntimeAgent({
        root,
        userRequest: 'test',
        runId: 'runtime-agent-general-001',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createDirectAnswerStream((context) => {
          const userMessages = context.messages.filter((message) => message.role === 'user');
          expect(userMessages).toHaveLength(2);

          const reminderMessage = userMessages[0]!;
          const requestMessage = userMessages[1]!;
          const reminderText = extractTextFromMessage(reminderMessage);
          const requestText = extractTextFromMessage(requestMessage);

          expect(reminderText).toContain('<system-reminder>');
          expect(reminderText).toContain('may or may not be relevant');
          expect(reminderText).not.toContain('Detected intent:');
          expect(requestText).toBe('test');
        })
      });

      expect(result.intent).toBe('general');
      expect(result.toolOutcomes).toHaveLength(0);
      expect(result.assistantText).toContain('Direct response');
      const runState = await loadRequestRunState(root, 'runtime-agent-general-001');
      expect(runState.request_run.intent).toBe('general');
      expect(runState.request_run.status).toBe('done');
      expect(runState.request_run.decisions).toEqual([]);
      expect(runState.request_run.result_summary).toContain('Direct response');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts a rich current user message with attachment-derived content blocks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));
    const imageBase64 = Buffer.from('fake-image-data').toString('base64');

    try {
      const result = await runRuntimeAgent({
        root,
        userRequest: 'describe the uploaded files',
        runId: 'runtime-agent-rich-user-001',
        currentUserMessage: {
          role: 'user',
          content: [
            { type: 'text', text: 'describe the uploaded files' },
            { type: 'text', text: 'Attached file: brief.txt\n\nAttachment body' },
            { type: 'image', data: imageBase64, mimeType: 'image/png' }
          ],
          timestamp: Date.now()
        },
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createDirectAnswerStream((context) => {
          const userMessages = context.messages.filter((message) => message.role === 'user');
          expect(userMessages).toHaveLength(2);

          const requestMessage = userMessages[1]!;
          expect(requestMessage.content).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ type: 'text', text: 'describe the uploaded files' }),
              expect.objectContaining({ type: 'text', text: expect.stringContaining('brief.txt') }),
              expect.objectContaining({ type: 'image', data: imageBase64, mimeType: 'image/png' })
            ])
          );
        })
      });

      expect(result.intent).toBe('general');
      expect(result.toolOutcomes).toHaveLength(0);
      expect(result.assistantText).toContain('Direct response');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('exposes only skill entry tools to the main model while hiding skill-owned tools', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-skill-agent',
      provider: 'test-runtime-skill-agent',
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

    try {
      const skillDirectory = path.join(root, '.agents', 'skills', 'source-to-wiki');
      await mkdir(skillDirectory, { recursive: true });
      await writeFile(
        path.join(skillDirectory, 'SKILL.md'),
        `---
name: source-to-wiki
description: Turn source material into governed wiki drafts.
allowed-tools: create_source_from_attachment find_source_manifest read_source_manifest read_raw_source draft_knowledge_page apply_draft_upsert
---

# Source To Wiki

Use this skill when the user wants to turn a source into governed wiki content.
`,
        'utf8'
      );
      await bootstrapProject(root);
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      faux.setResponses([
        buildSingleToolCallingAssistantMessage('tool-call-skill-1', 'read_source_manifest', {
          sourceId: 'src-001'
        }),
        fauxAssistantMessage('Skill execution completed for source-to-wiki.')
      ]);
      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const result = await runRuntimeAgent({
        root,
        userRequest: 'add this file into the wiki',
        runId: 'runtime-agent-skill-001',
        model,
        streamFn: createReadAndRunSkillStream((context) => {
          expect(context.systemPrompt).toContain('# Available Skills');
          expect(context.systemPrompt).toContain('source-to-wiki');
          expect(context.systemPrompt).toContain('Turn source material into governed wiki drafts.');
          expect(context.tools?.map((tool) => tool.name)).toContain('read_skill');
          expect(context.tools?.map((tool) => tool.name)).toContain('run_skill');
          expect(context.tools?.map((tool) => tool.name)).not.toContain('read_source_manifest');
          expect(context.tools?.map((tool) => tool.name)).not.toContain('read_raw_source');
          expect(context.tools?.map((tool) => tool.name)).not.toContain('draft_knowledge_page');
          expect(context.tools?.map((tool) => tool.name)).not.toContain('apply_draft_upsert');
        })
      });

      expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual(['read_skill', 'run_skill']);
      expect(result.toolOutcomes[0]?.summary).toBe('read skill source-to-wiki');
      expect(result.toolOutcomes[1]?.summary).toBe('ran skill source-to-wiki');
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('read_source_manifest');
      expect(result.assistantText).toContain('Skill execution completed for source-to-wiki.');
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs a PI-backed query flow and persists a single runtime snapshot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(path.join(root, 'raw', 'accepted', 'design.md'), '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'what is patch first?',
        runId: 'runtime-agent-001',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createQueryOnlyStream()
      });

      expect(result.intent).toBe('query');
      expect(result.toolOutcomes).toHaveLength(1);
      expect(result.toolOutcomes[0]?.toolName).toBe('query_wiki');
      expect(result.toolOutcomes[0]?.data).toEqual({
        synthesisMode: 'deterministic',
        synthesisFallbackReason: null,
        wikiEvidence: [
          {
            path: 'wiki/topics/patch-first.md',
            kind: 'topic',
            sourceRefs: ['raw/accepted/design.md'],
            matchReasons: expect.arrayContaining(['title:patch', 'title:first'])
          }
        ]
      });
      expect(result.assistantText).toContain('Patch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable.');
      const runState = await loadRequestRunState(root, 'runtime-agent-001');
      expect(runState.events?.map((event) => event.type)).toEqual([
        'run_started',
        'plan_available',
        'tool_started',
        'tool_finished',
        'evidence_added',
        'draft_updated',
        'run_completed'
      ]);
      expect(runState.timeline_items).toEqual([
        {
          lane: 'user',
          title: 'User request',
          summary: 'what is patch first?',
          meta: 'intent: query'
        },
        {
          lane: 'assistant',
          title: 'Execution plan',
          summary: '3 steps planned',
          meta: 'inspect whether wiki evidence is actually needed → gather only the necessary wiki or source context → answer clearly and write back only if durable value is obvious'
        },
        {
          lane: 'system',
          title: 'Latest persisted event',
          summary: expect.stringContaining('Patch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable.'),
          timestamp: expect.any(String),
          meta: 'run_completed · status: done'
        },
        {
          lane: 'tool',
          title: 'Latest tool outcome · query_wiki',
          summary: expect.stringContaining('Patch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable.'),
          meta: 'clear'
        },
        {
          lane: 'assistant',
          title: 'Result summary',
          summary: expect.stringContaining('Patch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable.'),
          meta: 'output: result available'
        }
      ]);
      expect(runState.request_run.intent).toBe('query');
      expect(runState.request_run.touched_files).toEqual([]);
      expect(runState.request_run.result_summary).toContain('Patch-first updates keep page structure stable.');
      await expect(loadRequestRunState(root, 'runtime-agent-001--query-1')).rejects.toThrow(
        'Incomplete request run state: missing checkpoint.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs a PI-backed ingest flow from sourcePath and records the ingest outcome', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n',
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
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'ingest raw/accepted/design.md',
        runId: 'runtime-agent-002',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createIngestByPathStream()
      });

      expect(result.intent).toBe('ingest');
      expect(result.toolOutcomes).toHaveLength(1);
      expect(result.toolOutcomes[0]?.toolName).toBe('ingest_source');
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Resolved raw/accepted/design.md');
      const runState = await loadRequestRunState(root, 'runtime-agent-002');
      expect(runState.request_run.intent).toBe('ingest');
      expect(runState.timeline_items?.[2]).toMatchObject({
        lane: 'system',
        title: 'Latest persisted event',
        meta: 'run_completed · status: done'
      });
      expect(runState.request_run.result_summary).toContain('Resolved raw/accepted/design.md to src-001.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses deterministic ingest for direct accepted source-path requests without model access', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n',
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
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'ingest raw/accepted/design.md',
        runId: 'runtime-agent-direct-ingest-001'
      });

      expect(result.intent).toBe('ingest');
      expect(result.toolOutcomes).toHaveLength(1);
      expect(result.toolOutcomes[0]?.toolName).toBe('ingest_source');
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Resolved raw/accepted/design.md to src-001.');
      const runState = await loadRequestRunState(root, 'runtime-agent-direct-ingest-001');
      expect(runState.request_run.status).toBe('done');
      expect(runState.request_run.result_summary).toContain('Persisted:');
      expect(runState.request_run.touched_files).toEqual(expect.arrayContaining(['wiki/sources/src-001.md']));
      expect(runState.request_run.touched_files).not.toContain('wiki/topics/patch-first-design.md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses discovery before strict ingest for a natural-language source reference', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n',
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
          imported_at: '2026-04-12T00:00:00.000Z',
          tags: ['patch-first']
        })
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'ingest the patch first design doc',
        runId: 'runtime-agent-003',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createDiscoveryThenIngestStream()
      });

      expect(result.intent).toBe('ingest');
      expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual([
        'find_source_manifest',
        'ingest_source'
      ]);
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Selected candidate: src-001');
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('Persisted:');
      const runState = await loadRequestRunState(root, 'runtime-agent-003');
      expect(runState.request_run.decisions[0]).toContain('find_source_manifest');
      expect(runState.request_run.decisions[1]).toContain('ingest_source');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses observe-first wiki tools before querying when the model requests them', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(path.join(root, 'raw', 'accepted', 'design.md'), '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'what is patch first?',
        runId: 'runtime-agent-004',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createObserveThenQueryStream()
      });

      expect(result.intent).toBe('query');
      expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual(['list_wiki_pages', 'read_wiki_page', 'read_raw_source', 'query_wiki']);
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('wiki/topics/patch-first.md');
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('Suggested source follow-ups: read_raw_source:raw/accepted/design.md');
      expect(result.toolOutcomes[2]?.resultMarkdown).toContain('Patch-first updates keep page structure stable in source form.');
      expect(result.toolOutcomes[3]?.summary).toContain('Patch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable.');
      expect(result.toolOutcomes[3]?.resultMarkdown).toContain('Synthesis mode: deterministic');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('normalizes failed observe-first tool results into persisted runtime outcomes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await saveChatSession(
        root,
        createChatSession({
          session_id: 'session-runtime-005',
          last_run_id: 'runtime-agent-005',
          run_ids: ['runtime-agent-005'],
          summary: 'broken observe-first tool result',
          status: 'done'
        })
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'read the missing patch first page',
        runId: 'runtime-agent-005',
        sessionId: 'session-runtime-005',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createMissingReadWikiPageStream()
      });

      expect(result.toolOutcomes).toEqual([
        expect.objectContaining({
          toolName: 'read_wiki_page',
          summary: expect.stringContaining('ENOENT: no such file or directory, open'),
          resultMarkdown: expect.stringContaining('ENOENT: no such file or directory, open')
        })
      ]);

      const runState = await loadRequestRunState(root, 'runtime-agent-005');
      expect(runState.tool_outcomes).toEqual([
        expect.objectContaining({
          order: 1,
          toolName: 'read_wiki_page',
          summary: expect.stringContaining('ENOENT: no such file or directory, open'),
          resultMarkdown: expect.stringContaining('ENOENT: no such file or directory, open')
        })
      ]);
      expect(runState.request_run.decisions).toEqual([
        expect.stringContaining('read_wiki_page: ENOENT: no such file or directory, open')
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads runtime model settings from project chat settings when no explicit model is provided', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-settings-'));

    try {
      await bootstrapProject(root);
      expect(await readFile(path.join(root, 'state', 'artifacts', 'chat-settings.json'), 'utf8')).toContain('"provider": "llm-wiki-liiy"');
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(path.join(root, 'raw', 'accepted', 'design.md'), '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      let seenModel: {
        provider: string;
        id: string;
        api: string;
        baseUrl: string;
        reasoning: boolean;
        contextWindow: number;
        maxTokens: number;
      } | null = null;

      const result = await runRuntimeAgent({
        root,
        userRequest: 'what is patch first?',
        runId: 'runtime-agent-settings-001',
        getApiKey: () => 'test-llm-wiki-liiy-key',
        streamFn: createQueryOnlyStream((model) => {
          seenModel = {
            provider: model.provider,
            id: model.id,
            api: model.api,
            baseUrl: model.baseUrl,
            reasoning: model.reasoning,
            contextWindow: model.contextWindow,
            maxTokens: model.maxTokens
          };
        })
      });

      expect(result.intent).toBe('query');
      expect(seenModel).toEqual({
        provider: 'llm-wiki-liiy',
        id: 'gpt-5.4',
        api: 'anthropic-messages',
        baseUrl: 'http://runtime.example.invalid',
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 8192
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns discovery ambiguity without ingesting when candidates tie', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/patch-first-a.md',
          title: 'Patch First',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:a',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-002',
          path: 'raw/accepted/patch-first-b.md',
          title: 'Patch First',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:b',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'ingest the patch first doc',
        runId: 'runtime-agent-005',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createDiscoveryOnlyStream()
      });

      expect(result.intent).toBe('ingest');
      expect(result.toolOutcomes).toHaveLength(1);
      expect(result.toolOutcomes[0]?.toolName).toBe('find_source_manifest');
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Ambiguous candidates');
      const runState = await loadRequestRunState(root, 'runtime-agent-005');
      expect(runState.request_run.touched_files).toEqual([]);
      expect(runState.request_run.result_summary).toContain('Ambiguous candidates');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows draft-first durable writeback tools in query runtime flows when the model requests them', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(path.join(root, 'raw', 'accepted', 'design.md'), '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'write back a durable patch first answer',
        runId: 'runtime-agent-006b',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createQueryDraftThenUpsertStream()
      });

      expect(result.intent).toBe('mixed');
      expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual([
        'query_wiki',
        'draft_query_page',
        'apply_draft_upsert'
      ]);
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('# Query Page Draft');
      expect(result.toolOutcomes[2]?.resultMarkdown).toContain('Draft target: wiki/queries/what-is-patch-first.md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('supports governed draft-first page creation in mixed runtime flows', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);

      const result = await runRuntimeAgent({
        root,
        userRequest: 'create and update a durable patch first topic page',
        runId: 'runtime-agent-006',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createDraftThenApplyPageStream()
      });

      expect(result.intent).toBe('mixed');
      expect(result.toolOutcomes).toHaveLength(2);
      expect(result.toolOutcomes[0]?.toolName).toBe('draft_knowledge_page');
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('# Knowledge Page Draft');
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Synthesis mode: deterministic');
      expect(result.toolOutcomes[0]?.data).toEqual({
        synthesisMode: 'deterministic',
        synthesisFallbackReason: null,
        draft: {
          targetPath: 'wiki/topics/patch-first.md',
          upsertArguments: expect.objectContaining({
            kind: 'topic',
            slug: 'patch-first',
            title: 'Patch First'
          })
        }
      });
      expect(result.toolOutcomes[1]?.toolName).toBe('apply_draft_upsert');
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('Draft target: wiki/topics/patch-first.md');
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('Target page: wiki/topics/patch-first.md');
      expect(result.toolOutcomes[1]?.data).toEqual({
        draft: {
          targetPath: 'wiki/topics/patch-first.md',
          upsertArguments: expect.objectContaining({
            kind: 'topic',
            slug: 'patch-first',
            title: 'Patch First'
          })
        }
      });
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('Source refs: raw/accepted/design.md');
      expect(result.toolOutcomes[1]?.touchedFiles).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
      const runState = await loadRequestRunState(root, 'runtime-agent-006');
      expect(runState.request_run.touched_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
      expect(runState.result_markdown).toContain('Touched files: wiki/topics/patch-first.md, wiki/index.md, wiki/log.md');
      expect(runState.result_markdown).toContain('Evidence: wiki/topics/patch-first.md, raw/accepted/design.md');
      expect(runState.request_run.result_summary).toContain('Persisted: wiki/topics/patch-first.md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs knowledge page draft synthesis through the configured runtime model when no stream override is provided', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-knowledge-draft',
      provider: 'test-runtime-knowledge-draft',
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

    try {
      await bootstrapProject(root);
      faux.setResponses([
        buildDraftKnowledgePageToolCallingAssistantMessage(),
        fauxAssistantMessage(
          JSON.stringify({
            title: 'Patch First',
            summary: 'Synthesized patch-first summary.',
            body: '# Patch First\n\nSynthesized durable patch-first knowledge.\n',
            aliases: ['Patch Strategy', 'Patch-First Workflow'],
            tags: ['patch-first', 'synthesized'],
            outgoing_links: [],
            source_refs: ['raw/accepted/design.md'],
            status: 'active',
            rationale: 'synthesize a durable topic draft'
          })
        ),
        buildApplyDraftUpsertPageToolCallingAssistantMessage({
          summary: 'Synthesized patch-first summary.',
          body: '# Patch First\n\nSynthesized durable patch-first knowledge.\n',
          rationale: 'synthesize a durable topic draft',
          aliases: ['Patch Strategy', 'Patch-First Workflow'],
          tags: ['patch-first', 'synthesized']
        }),
        fauxAssistantMessage('Applied synthesized draft successfully.')
      ]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const result = await runRuntimeAgent({
        root,
        userRequest: 'create a new wiki page for patch first',
        runId: 'runtime-agent-knowledge-draft-llm',
        model
      });

      expect(result.intent).toBe('mixed');
      expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual(['draft_knowledge_page', 'apply_draft_upsert']);
      expect(result.toolOutcomes[0]?.data).toEqual({
        synthesisMode: 'llm',
        synthesisFallbackReason: null,
        draft: {
          targetPath: 'wiki/topics/patch-first.md',
          upsertArguments: expect.objectContaining({
            title: 'Patch First',
            summary: 'Synthesized patch-first summary.',
            body: '# Patch First\n\nSynthesized durable patch-first knowledge.',
            rationale: 'synthesize a durable topic draft',
            tags: ['patch-first', 'synthesized'],
            aliases: ['Patch Strategy', 'Patch-First Workflow']
          })
        }
      });
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Synthesis mode: llm');
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Synthesized durable patch-first knowledge.');
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('Draft target: wiki/topics/patch-first.md');
      expect(result.toolOutcomes[1]?.data).toEqual({
        draft: {
          targetPath: 'wiki/topics/patch-first.md',
          upsertArguments: expect.objectContaining({
            kind: 'topic',
            slug: 'patch-first',
            title: 'Patch First'
          })
        }
      });
      expect(result.assistantText).toContain('Applied synthesized draft successfully.');
      const runState = await loadRequestRunState(root, 'runtime-agent-knowledge-draft-llm');
      expect(runState.result_markdown).toContain('Synthesis mode: llm');
      expect(runState.request_run.result_summary).toContain('Applied synthesized draft successfully.');
      expect(await readFile(path.join(root, 'wiki', 'topics', 'patch-first.md'), 'utf8')).toContain(
        'Synthesized durable patch-first knowledge.'
      );
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('blocks multi-topic write flows behind review instead of applying them directly', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);

      const first = await runUpsertKnowledgePageFlow(root, {
        runId: randomUUID(),
        userRequest: 'seed first topic',
        kind: 'topic',
        slug: 'patch-first-a',
        title: 'Patch First A',
        aliases: [],
        summary: 'First patch-first topic.',
        tags: ['patch-first'],
        source_refs: ['raw/accepted/design-a.md'],
        outgoing_links: [],
        status: 'active',
        updated_at: '2026-04-14T00:00:00.000Z',
        body: '# Patch First A\n\nFirst patch-first topic.\n',
        rationale: 'seed first topic'
      });
      const second = await runUpsertKnowledgePageFlow(root, {
        runId: randomUUID(),
        userRequest: 'seed second topic',
        kind: 'topic',
        slug: 'patch-first-b',
        title: 'Patch First B',
        aliases: [],
        summary: 'Second patch-first topic.',
        tags: ['patch-first'],
        source_refs: ['raw/accepted/design-b.md'],
        outgoing_links: [],
        status: 'active',
        updated_at: '2026-04-14T00:00:00.000Z',
        body: '# Patch First B\n\nSecond patch-first topic.\n',
        rationale: 'seed second topic'
      });

      expect(first.review).toEqual({ needs_review: false, reasons: [] });
      expect(second.review).toEqual({ needs_review: false, reasons: [] });

      const result = await runRuntimeAgent({
        root,
        userRequest: 'update two patch-first topic pages together',
        runId: 'runtime-agent-multi-topic-review',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createTwoTopicUpsertStream()
      });

      expect(result.intent).toBe('mixed');
      expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual(['upsert_knowledge_page', 'upsert_knowledge_page']);
      expect(result.toolOutcomes.every((outcome) => outcome.needsReview)).toBe(true);
      expect(result.toolOutcomes[0]?.reviewReasons).toEqual(['rewrites a core topic page']);
      expect(result.toolOutcomes[1]?.reviewReasons).toEqual(['rewrites a core topic page']);
      expect(result.toolOutcomes[0]?.touchedFiles).toEqual([]);
      expect(result.toolOutcomes[1]?.touchedFiles).toEqual([]);

      const runState = await loadRequestRunState(root, 'runtime-agent-multi-topic-review');
      expect(runState.request_run.status).toBe('needs_review');
      expect(runState.request_run.decisions).toContain('upsert_knowledge_page: rewrites a core topic page');
      expect(runState.changeset?.target_files).toEqual([
        'wiki/topics/patch-first-a.md',
        'wiki/index.md',
        'wiki/log.md',
        'wiki/topics/patch-first-b.md'
      ]);
      expect(runState.changeset?.needs_review).toBe(true);
      await expect(loadKnowledgeTask(root, 'review-runtime-agent-multi-topic-review')).resolves.toMatchObject({
        id: 'review-runtime-agent-multi-topic-review',
        status: 'needs_review',
        assignee: 'operator',
        evidence: expect.arrayContaining(['wiki/topics/patch-first-a.md', 'wiki/topics/patch-first-b.md'])
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createQueryOnlyStream(inspectModel?: (model: ReturnType<typeof getModel>) => void): StreamFn {
  let callCount = 0;

  return async (model, context) => {
    inspectModel?.(model as ReturnType<typeof getModel>);
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1 ? buildToolCallingAssistantMessage(context) : buildFinalAssistantMessage(context);

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

function createDirectAnswerStream(inspectContext?: (context: Context) => void): StreamFn {
  return async (_model, context) => {
    inspectContext?.(context);
    const stream = createAssistantMessageEventStream();
    const assistantMessage = fauxAssistantMessage('Direct response without wiki lookup.');

    queueMicrotask(() => {
      stream.push({ type: 'start', partial: assistantMessage });
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

function buildToolCallingAssistantMessage(context: Context): AssistantMessage {
  const question = extractQuestion(context.messages[context.messages.length - 1]);

  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'tool-call-query-1',
        name: 'query_wiki',
        arguments: {
          question,
          persistQueryPage: false
        }
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

function createIngestByPathStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1 ? buildIngestToolCallingAssistantMessage() : buildFinalAssistantMessage(context);

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

function createReadAndRunSkillStream(inspectContext?: (context: Context) => void): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    inspectContext?.(context);
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildSingleToolCallingAssistantMessage('tool-call-read-skill-1', 'read_skill', {
            name: 'source-to-wiki'
          })
        : callCount === 2
          ? buildSingleToolCallingAssistantMessage('tool-call-run-skill-1', 'run_skill', {
              name: 'source-to-wiki',
              task: 'Read the source manifest and complete the skill task.'
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

function createDiscoveryThenIngestStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildFindSourceManifestToolCallingAssistantMessage('patch first design doc')
        : callCount === 2
          ? buildIngestToolCallingAssistantMessageWithSourceId('src-001')
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

function createObserveThenQueryStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildListWikiPagesToolCallingAssistantMessage()
        : callCount === 2
          ? buildReadWikiPageToolCallingAssistantMessage('topic', 'patch-first')
          : callCount === 3
            ? buildReadRawSourceToolCallingAssistantMessage('raw/accepted/design.md')
            : callCount === 4
              ? buildToolCallingAssistantMessage(context)
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

function createQueryDraftThenUpsertStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildToolCallingAssistantMessage(context)
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

function createDiscoveryOnlyStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildFindSourceManifestToolCallingAssistantMessage('patch first doc')
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

function buildListWikiPagesToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-list-pages-1', 'list_wiki_pages', {
    kind: 'topic',
    query: 'patch first',
    limit: 5
  });
}

function buildReadWikiPageToolCallingAssistantMessage(kind: 'source' | 'entity' | 'topic' | 'query', slug: string): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-read-page-1', 'read_wiki_page', { kind, slug });
}

function buildReadRawSourceToolCallingAssistantMessage(rawPath: string): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-read-raw-1', 'read_raw_source', { rawPath });
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

function buildDraftQueryPageToolCallingAssistantMessage(): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-draft-query-page-1', 'draft_query_page', {
    question: 'what is patch first?',
    rationale: 'capture a durable query answer'
  });
}

function buildApplyDraftUpsertPageToolCallingAssistantMessage(
  overrides: Partial<{
    title: string;
    summary: string;
    body: string;
    rationale: string;
    source_refs: string[];
    outgoing_links: string[];
    aliases: string[];
    tags: string[];
  }> = {}
): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-apply-draft-page-1', 'apply_draft_upsert', {
    targetPath: 'wiki/topics/patch-first.md',
    upsertArguments: {
      kind: 'topic',
      slug: 'patch-first',
      title: overrides.title ?? 'Patch First',
      summary: overrides.summary ?? 'Patch-first updates keep page structure stable.',
      status: 'active',
      updated_at: '2026-04-13T00:00:00.000Z',
      body: overrides.body ?? '# Patch First\n\nPatch-first updates keep page structure stable.\n',
      rationale: overrides.rationale ?? 'capture durable knowledge',
      source_refs: overrides.source_refs ?? ['raw/accepted/design.md'],
      outgoing_links: overrides.outgoing_links ?? [],
      aliases: overrides.aliases ?? [],
      tags: overrides.tags ?? ['patch-first']
    }
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

function createMissingReadWikiPageStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildReadWikiPageToolCallingAssistantMessage('topic', 'missing-page')
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

function createTwoTopicUpsertStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildTwoTopicUpsertToolCallingAssistantMessage('tool-call-upsert-page-a-1', 'patch-first-a', 'Patch First A')
        : callCount === 2
          ? buildTwoTopicUpsertToolCallingAssistantMessage('tool-call-upsert-page-b-1', 'patch-first-b', 'Patch First B')
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

function buildTwoTopicUpsertToolCallingAssistantMessage(id: string, slug: string, title: string): AssistantMessage {
  return buildSingleToolCallingAssistantMessage(id, 'upsert_knowledge_page', {
    kind: 'topic',
    slug,
    title,
    aliases: [],
    summary: `${title} refreshed together.`,
    tags: ['patch-first'],
    source_refs: [`raw/accepted/${slug}.md`],
    outgoing_links: [],
    status: 'active',
    updated_at: '2026-04-14T01:00:00.000Z',
    body: `# ${title}\n\n${title} refreshed together.\n`,
    rationale: 'update related patch-first topics together'
  });
}

function buildIngestToolCallingAssistantMessage(): AssistantMessage {
  return buildIngestToolCallingAssistantMessageWithArgs({
    sourcePath: 'raw/accepted/design.md'
  });
}

function buildIngestToolCallingAssistantMessageWithSourceId(sourceId: string): AssistantMessage {
  return buildIngestToolCallingAssistantMessageWithArgs({ sourceId });
}

function buildIngestToolCallingAssistantMessageWithArgs(argumentsValue: Record<string, string>): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-ingest-1', 'ingest_source', argumentsValue);
}

function buildFindSourceManifestToolCallingAssistantMessage(query: string): AssistantMessage {
  return buildSingleToolCallingAssistantMessage('tool-call-find-source-1', 'find_source_manifest', { query });
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

function extractTextFromMessage(message: Context['messages'][number]): string {
  return typeof message.content === 'string'
    ? message.content
    : message.content
        .filter((block): block is Extract<(typeof message.content)[number], { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join(' ');
}

function extractQuestion(message: Context['messages'][number] | undefined): string {
  if (!message || message.role !== 'user') {
    return 'what is patch first?';
  }

  const content = extractTextFromMessage(message).trim();
  if (content.includes('<system-reminder>')) {
    return 'what is patch first?';
  }

  const match = content.match(/User request:\s*(.+?)\s+Detected intent:/i);

  return match?.[1] ?? (content.length > 0 ? content : 'what is patch first?');
}
