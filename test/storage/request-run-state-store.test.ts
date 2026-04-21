import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';
import { createRequestRun } from '../../src/domain/request-run.js';
import { buildRequestRunArtifactPaths } from '../../src/storage/request-run-artifact-paths.js';
import {
  loadRequestRunState,
  saveRequestRunState
} from '../../src/storage/request-run-state-store.js';

const missingArtifacts = [
  'request.json',
  'plan.json',
  'evidence.json',
  'tool-outcomes.json',
  'draft.md',
  'changeset.json',
  'result.md',
  'checkpoint.json'
] as const;

const malformedJsonArtifacts = [
  'request.json',
  'plan.json',
  'evidence.json',
  'tool-outcomes.json',
  'changeset.json',
  'checkpoint.json',
  'events.json',
  'timeline.json'
] as const;

const semanticallyInvalidArtifacts = [
  {
    fileName: 'request.json',
    content: '{\n  "user_request": "ingest this source",\n  "intent": "ingest"\n}\n',
    expectedMessage: 'Invalid request run state: invalid request.json'
  },
  {
    fileName: 'request.json',
    content: '{\n  "run_id": "run-999",\n  "user_request": "ingest this source",\n  "intent": "ingest"\n}\n',
    expectedMessage: 'Invalid request run state: invalid request.json'
  },
  {
    fileName: 'plan.json',
    content: '"read raw source"\n',
    expectedMessage: 'Invalid request run state: invalid plan.json'
  },
  {
    fileName: 'checkpoint.json',
    content:
      '{\n  "status": "unknown",\n  "touched_files": [],\n  "decisions": [],\n  "result_summary": ""\n}\n',
    expectedMessage: 'Invalid request run state: invalid checkpoint.json'
  },
  {
    fileName: 'tool-outcomes.json',
    content: '{\n  "toolName": "query_wiki"\n}\n',
    expectedMessage: 'Invalid request run state: invalid tool-outcomes.json'
  },
  {
    fileName: 'changeset.json',
    content: '{\n  "patch_summary": "missing target files"\n}\n',
    expectedMessage: 'Invalid request run state: invalid changeset.json'
  },
  {
    fileName: 'timeline.json',
    content: '{\n  "lane": "assistant"\n}\n',
    expectedMessage: 'Invalid request run state: invalid timeline.json'
  }
] as const;

describe('saveRequestRunState', () => {
  it('writes the selected request-run artifact bundle and checkpoint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      const requestRun = createRequestRun({
        run_id: 'run-001',
        user_request: 'ingest this source',
        intent: 'ingest',
        plan: ['read raw source', 'update wiki'],
        status: 'needs_review',
        evidence: ['raw/accepted/source.md'],
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['queue review gate'],
        result_summary: 'awaiting review'
      });
      const changeSet = createChangeSet({
        target_files: ['wiki/topics/llm-wiki.md'],
        patch_summary: 'add a synthesis paragraph',
        rationale: 'new source clarifies the storage boundary',
        source_refs: ['raw/accepted/source.md'],
        risk_level: 'medium',
        needs_review: true
      });

      const paths = await saveRequestRunState(root, {
        request_run: requestRun,
        tool_outcomes: [
          {
            order: 1,
            toolName: 'query_wiki',
            summary: 'answered from wiki',
            evidence: ['raw/accepted/source.md'],
            touchedFiles: ['wiki/topics/llm-wiki.md'],
            resultMarkdown: 'Patch-first answer',
            needsReview: false,
            reviewReasons: [],
            data: { synthesisMode: 'deterministic' }
          }
        ],
        events: [
          {
            type: 'run_started',
            timestamp: '2026-04-15T00:00:00.000Z',
            summary: 'Run started for ingest request',
            status: 'running'
          }
        ],
        timeline_items: [
          {
            lane: 'user',
            title: 'User request',
            summary: 'ingest this source',
            meta: 'intent: ingest'
          },
          {
            lane: 'system',
            title: 'Latest persisted event',
            summary: 'Run started for ingest request',
            timestamp: '2026-04-15T00:00:00.000Z',
            meta: 'run_started · status: running'
          }
        ],
        draft_markdown: '# Draft\n\nInterim draft content.\n',
        result_markdown: '# Result\n\nFinal result content.\n',
        changeset: changeSet
      });

      expect(JSON.parse(await readFile(paths.request, 'utf8'))).toEqual({
        run_id: 'run-001',
        session_id: null,
        user_request: 'ingest this source',
        intent: 'ingest',
        attachments: []
      });
      expect(JSON.parse(await readFile(paths.plan, 'utf8'))).toEqual(['read raw source', 'update wiki']);
      expect(JSON.parse(await readFile(paths.evidence, 'utf8'))).toEqual(['raw/accepted/source.md']);
      expect(JSON.parse(await readFile(paths.toolOutcomes, 'utf8'))).toEqual([
        {
          order: 1,
          toolName: 'query_wiki',
          summary: 'answered from wiki',
          evidence: ['raw/accepted/source.md'],
          touchedFiles: ['wiki/topics/llm-wiki.md'],
          resultMarkdown: 'Patch-first answer',
          needsReview: false,
          reviewReasons: [],
          data: { synthesisMode: 'deterministic' }
        }
      ]);
      expect(JSON.parse(await readFile(paths.events, 'utf8'))).toEqual([
        {
          type: 'run_started',
          timestamp: '2026-04-15T00:00:00.000Z',
          summary: 'Run started for ingest request',
          status: 'running'
        }
      ]);
      expect(JSON.parse(await readFile(paths.timeline, 'utf8'))).toEqual([
        {
          lane: 'user',
          title: 'User request',
          summary: 'ingest this source',
          meta: 'intent: ingest'
        },
        {
          lane: 'system',
          title: 'Latest persisted event',
          summary: 'Run started for ingest request',
          timestamp: '2026-04-15T00:00:00.000Z',
          meta: 'run_started · status: running'
        }
      ]);
      expect(await readFile(paths.draft, 'utf8')).toBe('# Draft\n\nInterim draft content.\n');
      expect(JSON.parse(await readFile(paths.changeset, 'utf8'))).toEqual({
        target_files: ['wiki/topics/llm-wiki.md'],
        patch_summary: 'add a synthesis paragraph',
        rationale: 'new source clarifies the storage boundary',
        source_refs: ['raw/accepted/source.md'],
        risk_level: 'medium',
        needs_review: true
      });
      expect(await readFile(paths.result, 'utf8')).toBe('# Result\n\nFinal result content.\n');
      expect(JSON.parse(await readFile(paths.checkpoint, 'utf8'))).toEqual({
        status: 'needs_review',
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['queue review gate'],
        result_summary: 'awaiting review'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('overwrites the artifact bundle when the same run is saved again', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        tool_outcomes: [],
        events: [
          {
            type: 'run_started',
            timestamp: '2026-04-15T00:00:00.000Z',
            summary: 'Run started',
            status: 'running'
          }
        ],
        draft_markdown: '# Draft\n\nFirst draft.\n',
        result_markdown: '# Result\n\nFirst result.\n',
        changeset: null
      });

      const paths = await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source', 'update wiki'],
          status: 'done',
          evidence: ['raw/accepted/source.md'],
          touched_files: ['wiki/topics/llm-wiki.md'],
          decisions: ['apply low-risk patch'],
          result_summary: 'ingest complete'
        }),
        tool_outcomes: [
          {
            order: 1,
            toolName: 'ingest_source',
            summary: 'applied low-risk patch',
            touchedFiles: ['wiki/topics/llm-wiki.md']
          }
        ],
        events: [
          {
            type: 'run_completed',
            timestamp: '2026-04-15T00:00:01.000Z',
            summary: 'Run completed',
            status: 'done'
          }
        ],
        timeline_items: [
          {
            lane: 'assistant',
            title: 'Result summary',
            summary: 'ingest complete',
            meta: 'output: result available'
          }
        ],
        draft_markdown: '# Draft\n\nUpdated draft.\n',
        result_markdown: '# Result\n\nUpdated result.\n',
        changeset: null
      });

      expect(JSON.parse(await readFile(paths.plan, 'utf8'))).toEqual(['read raw source', 'update wiki']);
      expect(JSON.parse(await readFile(paths.evidence, 'utf8'))).toEqual(['raw/accepted/source.md']);
      expect(JSON.parse(await readFile(paths.toolOutcomes, 'utf8'))).toEqual([
        {
          order: 1,
          toolName: 'ingest_source',
          summary: 'applied low-risk patch',
          touchedFiles: ['wiki/topics/llm-wiki.md']
        }
      ]);
      expect(JSON.parse(await readFile(paths.events, 'utf8'))).toEqual([
        {
          type: 'run_completed',
          timestamp: '2026-04-15T00:00:01.000Z',
          summary: 'Run completed',
          status: 'done'
        }
      ]);
      expect(JSON.parse(await readFile(paths.timeline, 'utf8'))).toEqual([
        {
          lane: 'assistant',
          title: 'Result summary',
          summary: 'ingest complete',
          meta: 'output: result available'
        }
      ]);
      expect(await readFile(paths.result, 'utf8')).toBe('# Result\n\nUpdated result.\n');
      expect(JSON.parse(await readFile(paths.checkpoint, 'utf8'))).toEqual({
        status: 'done',
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['apply low-risk patch'],
        result_summary: 'ingest complete'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads persisted tool outcomes alongside request-run metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-002',
          user_request: 'answer this question',
          intent: 'query',
          plan: ['read wiki', 'draft answer'],
          status: 'done',
          evidence: ['wiki/topics/llm-wiki.md'],
          touched_files: ['wiki/queries/storage.md'],
          decisions: ['write reusable query page'],
          result_summary: 'saved answer'
        }),
        tool_outcomes: [
          {
            order: 1,
            toolName: 'draft_query_page',
            summary: 'drafted reusable query page',
            evidence: ['wiki/topics/llm-wiki.md'],
            touchedFiles: [],
            resultMarkdown: '# Query Page Draft\n',
            needsReview: false,
            reviewReasons: [],
            data: { synthesisMode: 'llm' }
          }
        ],
        events: [
          {
            type: 'draft_updated',
            timestamp: '2026-04-15T00:00:02.000Z',
            summary: 'Draft updated',
            status: 'running'
          }
        ],
        timeline_items: [
          {
            lane: 'assistant',
            title: 'Execution plan',
            summary: '2 steps planned',
            meta: 'read wiki → draft answer'
          }
        ],
        draft_markdown: '# Draft\n\nDraft answer.\n',
        result_markdown: '# Result\n\nFinal answer.\n',
        changeset: null
      });

      const loaded = await loadRequestRunState(root, 'run-002');
      expect(loaded.tool_outcomes).toEqual([
        {
          order: 1,
          toolName: 'draft_query_page',
          summary: 'drafted reusable query page',
          evidence: ['wiki/topics/llm-wiki.md'],
          touchedFiles: [],
          resultMarkdown: '# Query Page Draft\n',
          needsReview: false,
          reviewReasons: [],
          data: { synthesisMode: 'llm' }
        }
      ]);
      expect(loaded.events).toEqual([
        {
          type: 'draft_updated',
          timestamp: '2026-04-15T00:00:02.000Z',
          summary: 'Draft updated',
          status: 'running'
        }
      ]);
      expect(loaded.timeline_items).toEqual([
        {
          lane: 'assistant',
          title: 'Execution plan',
          summary: '2 steps planned',
          meta: 'read wiki → draft answer'
        }
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('request run state storage', () => {
  it('loads a saved request-run bundle back into domain objects', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'answer this question',
          intent: 'query',
          plan: ['read wiki', 'draft answer'],
          status: 'done',
          evidence: ['wiki/topics/llm-wiki.md'],
          touched_files: ['wiki/queries/storage.md'],
          decisions: ['write reusable query page'],
          result_summary: 'saved answer'
        }),
        tool_outcomes: [
          {
            order: 1,
            toolName: 'draft_query_page',
            summary: 'drafted reusable query page',
            evidence: ['wiki/topics/llm-wiki.md'],
            touchedFiles: [],
            resultMarkdown: '# Query Page Draft\n',
            data: { synthesisMode: 'llm' }
          },
          {
            order: 2,
            toolName: 'apply_draft_upsert',
            summary: 'applied drafted page',
            evidence: ['wiki/topics/llm-wiki.md'],
            touchedFiles: ['wiki/queries/storage.md'],
            resultMarkdown: 'Draft target: wiki/queries/storage.md'
          }
        ],
        events: [
          {
            type: 'tool_started',
            timestamp: '2026-04-15T00:00:03.000Z',
            summary: 'Starting apply_draft_upsert',
            status: 'running',
            tool_name: 'apply_draft_upsert',
            tool_call_id: 'tool-001'
          }
        ],
        timeline_items: [
          {
            lane: 'tool',
            title: 'Latest tool outcome · apply_draft_upsert',
            summary: 'applied drafted page',
            meta: 'clear · files: wiki/queries/storage.md'
          }
        ],
        draft_markdown: '# Draft\n\nDraft answer.\n',
        result_markdown: '# Result\n\nFinal answer.\n',
        changeset: createChangeSet({
          target_files: ['wiki/queries/storage.md'],
          patch_summary: 'add a reusable answer page',
          rationale: 'query produced long-term value',
          source_refs: ['wiki/topics/llm-wiki.md'],
          risk_level: 'low'
        })
      });

      const loaded = await loadRequestRunState(root, 'run-001');

      expect(loaded).toEqual({
        request_run: {
          run_id: 'run-001',
          session_id: null,
          user_request: 'answer this question',
          intent: 'query',
          plan: ['read wiki', 'draft answer'],
          status: 'done',
          evidence: ['wiki/topics/llm-wiki.md'],
          touched_files: ['wiki/queries/storage.md'],
          decisions: ['write reusable query page'],
          result_summary: 'saved answer',
          attachments: []
        },
        tool_outcomes: [
          {
            order: 1,
            toolName: 'draft_query_page',
            summary: 'drafted reusable query page',
            evidence: ['wiki/topics/llm-wiki.md'],
            touchedFiles: [],
            resultMarkdown: '# Query Page Draft\n',
            data: { synthesisMode: 'llm' }
          },
          {
            order: 2,
            toolName: 'apply_draft_upsert',
            summary: 'applied drafted page',
            evidence: ['wiki/topics/llm-wiki.md'],
            touchedFiles: ['wiki/queries/storage.md'],
            resultMarkdown: 'Draft target: wiki/queries/storage.md'
          }
        ],
        events: [
          {
            type: 'tool_started',
            timestamp: '2026-04-15T00:00:03.000Z',
            summary: 'Starting apply_draft_upsert',
            status: 'running',
            tool_name: 'apply_draft_upsert',
            tool_call_id: 'tool-001'
          }
        ],
        timeline_items: [
          {
            lane: 'tool',
            title: 'Latest tool outcome · apply_draft_upsert',
            summary: 'applied drafted page',
            meta: 'clear · files: wiki/queries/storage.md'
          }
        ],
        draft_markdown: '# Draft\n\nDraft answer.\n',
        result_markdown: '# Result\n\nFinal answer.\n',
        changeset: {
          target_files: ['wiki/queries/storage.md'],
          patch_summary: 'add a reusable answer page',
          rationale: 'query produced long-term value',
          source_refs: ['wiki/topics/llm-wiki.md'],
          risk_level: 'low',
          needs_review: false
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists subagent lifecycle events alongside the request run state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-subagent-001',
          user_request: 'delegate this task',
          intent: 'mixed',
          plan: ['delegate', 'collect receipt'],
          status: 'done',
          result_summary: 'delegation complete'
        }),
        tool_outcomes: [],
        events: [
          {
            type: 'subagent_spawned',
            timestamp: '2026-04-21T00:00:00.000Z',
            summary: 'Spawned subagent worker',
            status: 'running'
          },
          {
            type: 'subagent_completed',
            timestamp: '2026-04-21T00:00:01.000Z',
            summary: 'Subagent worker completed',
            status: 'done'
          }
        ],
        draft_markdown: '# Draft\n\nSubagent delegation.\n',
        result_markdown: '# Result\n\nSubagent delegation completed.\n',
        changeset: null
      });

      const loaded = await loadRequestRunState(root, 'run-subagent-001');

      expect(loaded.events).toEqual([
        expect.objectContaining({ type: 'subagent_spawned', summary: 'Spawned subagent worker', status: 'running' }),
        expect.objectContaining({ type: 'subagent_completed', summary: 'Subagent worker completed', status: 'done' })
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(missingArtifacts)('rejects a missing required artifact: %s', async (fileName) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n\nDraft content.\n',
        result_markdown: '# Result\n\nResult content.\n',
        changeset: null
      });

      const paths = buildRequestRunArtifactPaths(root, 'run-001');
      await unlink(path.join(paths.runDirectory, fileName));

      await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(
        `Incomplete request run state: missing ${fileName}`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(malformedJsonArtifacts)('rejects malformed JSON in %s', async (fileName) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n\nDraft content.\n',
        result_markdown: '# Result\n\nResult content.\n',
        changeset: null
      });

      const paths = buildRequestRunArtifactPaths(root, 'run-001');
      await writeFile(path.join(paths.runDirectory, fileName), '{', 'utf8');

      await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(
        `Invalid request run state: malformed ${fileName}`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(semanticallyInvalidArtifacts)(
    'rejects schema-invalid artifact content in $fileName',
    async ({ fileName, content, expectedMessage }) => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

      try {
        await saveRequestRunState(root, {
          request_run: createRequestRun({
            run_id: 'run-001',
            user_request: 'ingest this source',
            intent: 'ingest',
            plan: ['read raw source'],
            status: 'running'
          }),
          tool_outcomes: [],
          draft_markdown: '# Draft\n\nDraft content.\n',
          result_markdown: '# Result\n\nResult content.\n',
          changeset: null
        });

        const paths = buildRequestRunArtifactPaths(root, 'run-001');
        await writeFile(path.join(paths.runDirectory, fileName), content, 'utf8');

        await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(expectedMessage);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );
});
