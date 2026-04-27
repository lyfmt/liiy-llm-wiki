import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const { saveKnowledgeInsertGraphWrite } = vi.hoisted(() => ({
  saveKnowledgeInsertGraphWrite: vi.fn(async () => {})
}));

vi.mock('../../src/storage/project-env-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/project-env-store.js')>();
  const mockedState = {
    path: '/tmp/project.env',
    contents: 'GRAPH_DATABASE_URL=postgres://graph.example.invalid/llm_wiki_liiy\n',
    values: { GRAPH_DATABASE_URL: 'postgres://graph.example.invalid/llm_wiki_liiy' },
    keys: ['GRAPH_DATABASE_URL']
  };

  return {
    ...actual,
    loadProjectEnv: vi.fn(async () => mockedState),
    loadProjectEnvSync: vi.fn(() => mockedState)
  };
});

vi.mock('../../src/storage/graph-database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/graph-database.js')>();

  return {
    ...actual,
    resolveGraphDatabaseUrl: vi.fn(() => 'postgres://graph.example.invalid/llm_wiki_liiy'),
    getSharedGraphDatabasePool: vi.fn(() => ({
      query: vi.fn(async () => ({ rows: [] }))
    }))
  };
});

vi.mock('../../src/storage/save-knowledge-insert-graph-write.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/save-knowledge-insert-graph-write.js')>();

  return {
    ...actual,
    saveKnowledgeInsertGraphWrite
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

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

  it('exposes run_subagent to the main runtime and persists the subagent receipt in tool outcomes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent-agent',
      provider: 'test-runtime-subagent-agent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for longer-running wiki tasks.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker

Read the provided artifacts and write outputs into the requested artifact directory.
`,
        'utf8'
      );
      await mkdir(path.join(root, 'state', 'artifacts', 'subagents', 'input'), { recursive: true });
      await writeFile(
        path.join(root, 'state', 'artifacts', 'subagents', 'input', 'source.json'),
        '{\n  "topic": "patch-first"\n}\n',
        'utf8'
      );

      faux.setResponses([
        buildSingleToolCallingAssistantMessage('tool-call-subagent-read-1', 'read_artifact', {
          artifactPath: 'state/artifacts/subagents/input/source.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-subagent-write-1', 'write_artifact', {
          artifactPath: 'state/artifacts/subagents/run-001--subagent-1/receipt.json',
          content: '{\n  "status": "done"\n}\n'
        }),
        fauxAssistantMessage(
          JSON.stringify({
            status: 'done',
            summary: 'Subagent worker completed the requested artifact task.',
            outputArtifacts: ['state/artifacts/subagents/run-001--subagent-1/receipt.json']
          })
        )
      ]);
      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const result = await runRuntimeAgent({
        root,
        userRequest: 'delegate this artifact processing task',
        runId: 'runtime-agent-subagent-001',
        model,
        streamFn: createRunSubagentStream((context) => {
          expect(context.tools?.map((tool) => tool.name)).toContain('run_subagent');
          expect(context.tools?.map((tool) => tool.name)).toContain('read_artifact');
          expect(context.tools?.map((tool) => tool.name)).toContain('write_artifact');
        })
      });

      expect(result.toolOutcomes).toEqual([
        expect.objectContaining({
          toolName: 'run_subagent',
          summary: 'ran subagent worker',
          data: expect.objectContaining({
            effectiveTools: ['read_artifact', 'write_artifact'],
            receipt: {
              status: 'done',
              summary: 'Subagent worker completed the requested artifact task.',
              outputArtifacts: ['state/artifacts/subagents/run-001--subagent-1/receipt.json']
            }
          }),
          resultMarkdown: expect.stringContaining('Subagent worker completed the requested artifact task.')
        })
      ]);
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('routes knowledge insertion through the V3 pipeline launcher shim without exposing legacy internals', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));
    const projectKnowledgeInsertSkillPath = path.join(process.cwd(), '.agents', 'skills', 'knowledge-insert', 'SKILL.md');
    const tempKnowledgeInsertSkillPath = path.join(root, '.agents', 'skills', 'knowledge-insert', 'SKILL.md');
    const faux = registerFauxProvider({
      api: 'test-runtime-knowledge-insert-agent',
      provider: 'test-runtime-knowledge-insert-agent',
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
      await mkdir(path.join(root, '.agents', 'skills', 'knowledge-insert'), { recursive: true });
      await writeFile(tempKnowledgeInsertSkillPath, await readFile(projectKnowledgeInsertSkillPath, 'utf8'), 'utf8');
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for knowledge extraction batches.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker
`,
        'utf8'
      );
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Pattern Constraints\n\nPattern constraints keep patch-first systems stable.\n',
        'utf8'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Pattern Constraints Source',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:pattern-constraints',
          imported_at: '2026-04-21T00:00:00.000Z'
        })
      );
      await mkdir(path.join(root, 'wiki', 'taxonomy'), { recursive: true });
      await writeFile(
        path.join(root, 'wiki', 'taxonomy', 'engineering.md'),
        `---
kind: "taxonomy"
title: "Engineering"
aliases:
  - "Platform Engineering"
summary: "Top-level taxonomy"
tags:
  - "taxonomy"
source_refs:
  - "raw/accepted/taxonomy.md"
outgoing_links: []
status: "active"
updated_at: "2026-04-23T00:00:00.000Z"
taxonomy_root: true
---
# Engineering

Top-level taxonomy.
`,
        'utf8'
      );

      faux.setResponses([
        buildSingleToolCallingAssistantMessage('tool-call-find-source-1', 'find_source_manifest', {
          query: 'pattern constraints source'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-prepare-source-1', 'prepare_source_resource', {
          manifestId: 'src-001',
          rawPath: 'raw/accepted/design.md',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-split-blocks-1', 'split_resource_blocks', {
          resourceArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/blocks.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-split-batches-1', 'split_block_batches', {
          blocksArtifact: 'state/artifacts/knowledge-insert/run-001/blocks.json',
          batchSize: 20,
          batchRunIdPrefix: 'run-001--worker-',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/block-batches.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-run-subagent-knowledge-1', 'run_subagent', {
          profile: 'worker',
          taskPrompt: 'Extract grounded knowledge candidates and write a batch extraction artifact.',
          inputArtifacts: ['state/artifacts/subagents/run-001--worker-01/input/blocks.json'],
          outputDir: 'state/artifacts/subagents/run-001--worker-01',
          requestedTools: ['read_artifact', 'write_artifact']
        }),
        buildSingleToolCallingAssistantMessage('tool-call-subagent-read-knowledge-1', 'read_artifact', {
          artifactPath: 'state/artifacts/subagents/run-001--worker-01/input/blocks.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-subagent-write-knowledge-1', 'write_artifact', {
          artifactPath: 'state/artifacts/subagents/run-001--worker-01/extraction.json',
          content: JSON.stringify(
            {
              entities: [],
              assertions: [
                {
                  assertionId: 'assert-001',
                  text: 'Pattern constraints keep patch-first systems stable.',
                  sectionCandidateId: 'sec-candidate-001',
                  evidenceAnchorIds: ['anchor-001', 'anchor-002']
                }
              ],
              relations: [],
              evidenceAnchors: [
                {
                  anchorId: 'anchor-001',
                  blockId: 'block-001',
                  quote: 'Pattern constraints keep patch-first systems stable.',
                  title: 'Pattern Constraints',
                  locator: 'h1:Pattern Constraints#p1',
                  order: 1,
                  heading_path: ['Pattern Constraints']
                },
                {
                  anchorId: 'anchor-002',
                  blockId: 'block-001',
                  quote: 'Stable constraints keep the topic grounded.',
                  title: 'Pattern Constraints',
                  locator: 'h1:Pattern Constraints#p1',
                  order: 2,
                  heading_path: ['Pattern Constraints']
                }
              ],
              sectionCandidates: [
                {
                  sectionCandidateId: 'sec-candidate-001',
                  title: 'Pattern Constraints',
                  summary: 'Pattern constraints keep patch-first systems stable.',
                  body: 'Pattern constraints keep patch-first systems stable.',
                  assertionIds: ['assert-001'],
                  evidenceAnchorIds: ['anchor-001', 'anchor-002'],
                  topicHints: []
                }
              ],
              topicHints: []
            },
            null,
            2
          )
        }),
        fauxAssistantMessage(
          JSON.stringify({
            status: 'done',
            summary: 'Worker wrote extracted knowledge for the prepared source.',
            outputArtifacts: ['state/artifacts/subagents/run-001--worker-01/extraction.json']
          })
        ),
        buildSingleToolCallingAssistantMessage('tool-call-merge-extracted-1', 'merge_extracted_knowledge', {
          inputArtifacts: ['state/artifacts/subagents/run-001--worker-01/extraction.json'],
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-audit-coverage-1', 'audit_extraction_coverage', {
          blocksArtifact: 'state/artifacts/knowledge-insert/run-001/blocks.json',
          mergedCandidatesArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/coverage.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-merge-sections-1', 'merge_section_candidates', {
          mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-build-topic-catalog-1', 'build_topic_catalog', {
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-build-taxonomy-catalog-1', 'build_taxonomy_catalog', {
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-catalog.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-resolve-source-topics-1', 'resolve_source_topics', {
          preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json',
          mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
          sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
          topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-assign-sections-1', 'assign_sections_to_topics', {
          sourceTopicsArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json',
          sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/hosted-sections.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-resolve-topic-taxonomy-1', 'resolve_topic_taxonomy', {
          sourceTopicsArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json',
          taxonomyCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-catalog.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-audit-topic-hosting-1', 'audit_topic_hosting', {
          hostedSectionsArtifact: 'state/artifacts/knowledge-insert/run-001/hosted-sections.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-host-audit.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-audit-taxonomy-hosting-1', 'audit_taxonomy_hosting', {
          topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-host-audit.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-build-plan-1', 'build_topic_insertion_plan', {
          hostedSectionsArtifact: 'state/artifacts/knowledge-insert/run-001/hosted-sections.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-plan.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-draft-topic-pages-1', 'draft_topic_pages_from_plan', {
          topicInsertionPlanArtifact: 'state/artifacts/knowledge-insert/run-001/topic-plan.json',
          topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
          sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
          mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
          preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-drafts.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-upsert-knowledge-graph-1', 'upsert_knowledge_insert_graph', {
          topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
          topicDraftsArtifact: 'state/artifacts/knowledge-insert/run-001/topic-drafts.json',
          sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
          mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
          preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/graph-write.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-apply-draft-upsert-1', 'apply_draft_upsert', {
          targetPath: 'wiki/topics/pattern-constraints.md',
          upsertArguments: {
            kind: 'topic',
            slug: 'pattern-constraints',
            title: 'Pattern Constraints',
            aliases: [],
            summary: 'Pattern constraints keep patch-first systems stable.',
            tags: [],
            source_refs: ['raw/accepted/design.md'],
            outgoing_links: [],
            status: 'active',
            updated_at: '2026-04-21T00:00:00.000Z',
            body:
              '# Pattern Constraints\n\n## Pattern Constraints\n\nPattern constraints keep patch-first systems stable.\n\nSource refs:\n- raw/accepted/design.md\n\nEvidence anchors:\n- anchor-001 (block-001): "Pattern constraints keep patch-first systems stable."\n- anchor-002 (block-001): "Stable constraints keep the topic grounded."\n\nEvidence summaries:\n- Pattern constraints keep patch-first systems stable.\n\nLocators:\n- raw/accepted/design.md#block-001',
            rationale: 'create deterministic topic draft from insertion plan src-001'
          }
        }),
        buildSingleToolCallingAssistantMessage('tool-call-lint-wiki-1', 'lint_wiki', {}),
        fauxAssistantMessage('Knowledge insert skill completed for src-001.')
      ]);
      faux.setResponses([fauxAssistantMessage('Knowledge insert now starts the V3 pipeline launcher only.')]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const result = await runRuntimeAgent({
        root,
        userRequest: 'insert the accepted design source into the wiki as durable knowledge',
        runId: 'runtime-agent-knowledge-insert-001',
        model,
        streamFn: createReadAndRunKnowledgeInsertSkillStream((context) => {
          expect(context.systemPrompt).toContain('# Available Skills');
          expect(context.systemPrompt).toContain('knowledge-insert');
          expect(context.tools?.map((tool) => tool.name)).toContain('read_skill');
          expect(context.tools?.map((tool) => tool.name)).toContain('run_skill');
          expect(context.tools?.map((tool) => tool.name)).toContain('start_knowledge_insert_pipeline');
          expect(context.tools?.map((tool) => tool.name)).not.toContain('prepare_source_resource');
          expect(context.tools?.map((tool) => tool.name)).not.toContain('split_resource_blocks');
        })
      });

      expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual(['read_skill', 'run_skill']);
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('Allowed tools: start_knowledge_insert_pipeline');
      expect(result.toolOutcomes[1]?.resultMarkdown).not.toContain('prepare_source_resource');
      expect(result.toolOutcomes[1]?.resultMarkdown).not.toContain('resolve_source_topics');
      expect(result.toolOutcomes[1]?.resultMarkdown).not.toContain('upsert_knowledge_insert_graph');
      expect(result.assistantText).toContain('Knowledge insert now starts the V3 pipeline launcher only.');
      expect(await readFile(tempKnowledgeInsertSkillPath, 'utf8')).toBe(await readFile(projectKnowledgeInsertSkillPath, 'utf8'));
      expect(saveKnowledgeInsertGraphWrite).not.toHaveBeenCalled();
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('marks failed subagent receipts as failed lifecycle events and failed runtime status', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent-agent',
      provider: 'test-runtime-subagent-agent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for longer-running wiki tasks.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker

Read the provided artifacts and write outputs into the requested artifact directory.
`,
        'utf8'
      );
      faux.setResponses([
        fauxAssistantMessage(
          JSON.stringify({
            status: 'failed',
            summary: 'Subagent worker could not complete the requested task.',
            outputArtifacts: []
          })
        )
      ]);
      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const result = await runRuntimeAgent({
        root,
        userRequest: 'delegate this artifact processing task',
        runId: 'runtime-agent-subagent-failed-001',
        model,
        streamFn: createRunSubagentStream()
      });

      expect(result.toolOutcomes).toEqual([
        expect.objectContaining({
          toolName: 'run_subagent',
          data: expect.objectContaining({
            receipt: {
              status: 'failed',
              summary: 'Subagent worker could not complete the requested task.',
              outputArtifacts: []
            }
          })
        })
      ]);

      const runState = await loadRequestRunState(root, 'runtime-agent-subagent-failed-001');
      expect(runState.request_run.status).toBe('failed');
      expect(runState.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'subagent_spawned', status: 'running' }),
          expect.objectContaining({ type: 'subagent_failed', status: 'failed', summary: 'Subagent worker failed' }),
          expect.objectContaining({ type: 'run_failed', status: 'failed' })
        ])
      );
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

function createReadAndRunKnowledgeInsertSkillStream(inspectContext?: (context: Context) => void): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    inspectContext?.(context);
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildSingleToolCallingAssistantMessage('tool-call-read-skill-knowledge-1', 'read_skill', {
            name: 'knowledge-insert'
          })
        : callCount === 2
          ? buildSingleToolCallingAssistantMessage('tool-call-run-skill-knowledge-1', 'run_skill', {
              name: 'knowledge-insert',
              task: 'Prepare the source, split it into blocks, use a worker subagent, and audit coverage.'
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

function createRunSubagentStream(inspectContext?: (context: Context) => void): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    inspectContext?.(context);
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildSingleToolCallingAssistantMessage('tool-call-run-subagent-1', 'run_subagent', {
            profile: 'worker',
            taskPrompt: 'Read the provided artifact and write a receipt.',
            inputArtifacts: ['state/artifacts/subagents/input/source.json'],
            outputDir: 'state/artifacts/subagents/run-001--subagent-1',
            requestedTools: ['read_artifact', 'write_artifact', 'apply_draft_upsert']
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
