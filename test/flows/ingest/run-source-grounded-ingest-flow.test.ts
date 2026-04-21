import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { runSourceGroundedIngestFlow } from '../../../src/flows/ingest/run-source-grounded-ingest-flow.js';
import { getSharedGraphDatabasePool } from '../../../src/storage/graph-database.js';
import { loadRequestRunState } from '../../../src/storage/request-run-state-store.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';
import { SourceGroundedIngestConflictError, saveSourceGroundedIngest } from '../../../src/storage/save-source-grounded-ingest.js';
import { runIngestFlow } from '../../../src/flows/ingest/run-ingest-flow.js';

vi.mock('../../../src/flows/ingest/run-ingest-flow.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/flows/ingest/run-ingest-flow.js')>(
    '../../../src/flows/ingest/run-ingest-flow.js'
  );

  return {
    ...actual,
    runIngestFlow: vi.fn(actual.runIngestFlow)
  };
});

vi.mock('../../../src/storage/save-source-grounded-ingest.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/storage/save-source-grounded-ingest.js')>(
    '../../../src/storage/save-source-grounded-ingest.js'
  );

  return {
    ...actual,
    saveSourceGroundedIngest: vi.fn(async () => {})
  };
});

vi.mock('../../../src/storage/graph-database.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/storage/graph-database.js')>(
    '../../../src/storage/graph-database.js'
  );

  return {
    ...actual,
    getSharedGraphDatabasePool: vi.fn(() => ({
      query: vi.fn(async () => ({ rows: [] }))
    }))
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runSourceGroundedIngestFlow', () => {
  it('reads an accepted source, refreshes compatibility ingest side effects, writes topic and sections to graph, and records coverage', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-grounded-flow-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        [
          '# Patch First',
          '',
          'Patch-first updates keep page structure stable.',
          '',
          'Patch-first edits stay easy to review.',
          '',
          '## Workflow',
          '',
          'Start with the smallest compatible patch.',
          ''
        ].join('\n'),
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
          imported_at: '2026-04-20T00:00:00.000Z'
        })
      );

      const result = await runSourceGroundedIngestFlow(root, {
        runId: 'run-source-grounded-001',
        userRequest: 'ingest source into graph',
        sourceId: 'src-001'
      });

      expect(vi.mocked(runIngestFlow)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(runIngestFlow)).toHaveBeenCalledWith(
        root,
        expect.objectContaining({
          sourceId: 'src-001'
        })
      );
      expect(await readFile(path.join(root, 'wiki', 'sources', 'src-001.md'), 'utf8')).toContain(
        'Patch-first updates keep page structure stable.'
      );
      expect(await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).toContain('sources/src-001.md');
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toContain('src-001');

      expect(vi.mocked(saveSourceGroundedIngest)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(getSharedGraphDatabasePool)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(saveSourceGroundedIngest).mock.calls[0]?.[1]).toMatchObject({
        sourceId: 'src-001',
        sourcePath: 'raw/accepted/design.md',
        topic: {
          id: 'topic:source-src-001',
          slug: 'source-src-001'
        },
        sections: [
          {
            id: 'section:source-src-001#1',
            grounded_evidence_ids: ['evidence:src-001#1', 'evidence:src-001#2']
          },
          {
            id: 'section:source-src-001#2',
            grounded_evidence_ids: ['evidence:src-001#3']
          }
        ],
        evidence: [
          { id: 'evidence:src-001#1', order: 1 },
          { id: 'evidence:src-001#2', order: 2 },
          { id: 'evidence:src-001#3', order: 3 }
        ]
      });
      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.coverage).toEqual({
        total_anchor_count: 3,
        covered_anchor_count: 3,
        uncovered_anchor_ids: [],
        coverage_status: 'complete'
      });
      expect(result.persisted).toEqual([
        'wiki/sources/src-001.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(result.graphTarget).toBe('graph:topic:source-src-001');

      const runState = await loadRequestRunState(root, 'run-source-grounded-001');
      expect(runState.request_run.status).toBe('done');
      expect(runState.request_run.evidence).toEqual(['raw/accepted/design.md']);
      expect(runState.request_run.touched_files).toEqual([
        'wiki/sources/src-001.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(runState.request_run.decisions).toContain('persist graph target graph:topic:source-src-001 with 2 sections');
      expect(runState.result_markdown).toContain('Graph target: graph:topic:source-src-001');
      expect(runState.result_markdown).toContain('Sections: 2');
      expect(runState.result_markdown).toContain('raw/accepted/design.md');
      expect(runState.result_markdown).not.toContain('wiki/topics/source-src-001.md');
      expect(runState.events?.at(-1)?.data).toMatchObject({
        graphWrite: {
          status: 'written',
          graphTarget: 'graph:topic:source-src-001',
          topicId: 'topic:source-src-001',
          sectionCount: 2
        },
        sourceCoverage: {
          total_anchor_count: 3,
          covered_anchor_count: 3,
          uncovered_anchor_ids: [],
          coverage_status: 'complete'
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('records a governed needs_review run state when graph ingest hits a business conflict', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-grounded-flow-conflict-'));

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
          imported_at: '2026-04-20T00:00:00.000Z'
        })
      );
      vi.mocked(saveSourceGroundedIngest).mockRejectedValueOnce(
        new SourceGroundedIngestConflictError(
          'topic',
          'topic:source-src-001',
          'Conflicting topic node already exists: topic:source-src-001'
        )
      );

      const result = await runSourceGroundedIngestFlow(root, {
        runId: 'run-source-grounded-conflict-001',
        userRequest: 'ingest source into graph',
        sourceId: 'src-001'
      });

      expect(result.review).toEqual({
        needs_review: true,
        reasons: ['Conflicting topic node already exists: topic:source-src-001']
      });

      const runState = await loadRequestRunState(root, 'run-source-grounded-conflict-001');
      expect(runState.request_run.status).toBe('needs_review');
      expect(runState.request_run.decisions).toContain(
        'queue review gate: Conflicting topic node already exists: topic:source-src-001'
      );
      expect(runState.request_run.decisions).toContain('graph conflict on graph:topic:source-src-001');
      expect(runState.result_markdown).toContain('Queued for review');
      expect(runState.result_markdown).toContain('Graph conflict: Conflicting topic node already exists: topic:source-src-001');
      expect(runState.result_markdown).toContain('topic:source-src-001');
      expect(runState.events?.at(-1)?.data).toMatchObject({
        graphWrite: {
          status: 'conflict',
          graphTarget: 'graph:topic:source-src-001'
        },
        conflictReason: 'Conflicting topic node already exists: topic:source-src-001'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps touched_files empty for compatibility no-op while still reporting a successful graph write target', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-grounded-flow-graph-only-'));

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
          imported_at: '2026-04-20T00:00:00.000Z'
        })
      );
      vi.mocked(runIngestFlow).mockResolvedValueOnce({
        changeSet: {
          target_files: [],
          patch_summary: 'no wiki changes required',
          rationale: 'ingest source src-001',
          source_refs: ['raw/accepted/design.md'],
          risk_level: 'low',
          needs_review: false
        },
        review: {
          needs_review: false,
          reasons: []
        },
        persisted: []
      });

      const result = await runSourceGroundedIngestFlow(root, {
        runId: 'run-source-grounded-graph-only-001',
        userRequest: 'ingest source into graph',
        sourceId: 'src-001'
      });

      expect(result.persisted).toEqual([]);
      expect(result.changeSet.target_files).toEqual([]);
      expect(result.changeSet.patch_summary).toContain('graph');

      const runState = await loadRequestRunState(root, 'run-source-grounded-graph-only-001');
      expect(runState.request_run.status).toBe('done');
      expect(runState.request_run.touched_files).toEqual([]);
      expect(runState.request_run.evidence).toEqual(['raw/accepted/design.md']);
      expect(runState.request_run.result_summary).toContain('graph');
      expect(runState.request_run.decisions).toContain('persist graph target graph:topic:source-src-001 with 1 sections');
      expect(runState.result_markdown).toContain('Graph target: graph:topic:source-src-001');
      expect(runState.result_markdown).not.toContain('wiki/topics/source-src-001.md');
      expect(runState.events?.at(-1)?.data).toMatchObject({
        graphWrite: {
          status: 'written',
          graphTarget: 'graph:topic:source-src-001'
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps topic and section ids stable when the source title changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-grounded-flow-stable-ids-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n\n## Workflow\n\nStart with the smallest compatible patch.\n',
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
          imported_at: '2026-04-20T00:00:00.000Z'
        })
      );

      const firstResult = await runSourceGroundedIngestFlow(root, {
        runId: 'run-source-grounded-stable-001',
        userRequest: 'ingest source into graph',
        sourceId: 'src-001'
      });

      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design Revised',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-20T00:00:00.000Z'
        })
      );

      const secondResult = await runSourceGroundedIngestFlow(root, {
        runId: 'run-source-grounded-stable-002',
        userRequest: 'ingest source into graph',
        sourceId: 'src-001'
      });

      expect(firstResult.topic.id).toBe(secondResult.topic.id);
      expect(firstResult.topic.slug).toBe(secondResult.topic.slug);
      expect(firstResult.sections.map((section) => section.id)).toEqual(secondResult.sections.map((section) => section.id));
      expect(firstResult.topic.title).toBe('Patch First Design');
      expect(secondResult.topic.title).toBe('Patch First Design Revised');
      expect(firstResult.graphTarget).toBe(secondResult.graphTarget);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires exactly one of sourceId or sourcePath', async () => {
    await expect(
      runSourceGroundedIngestFlow('/tmp/unused', {
        runId: 'run-source-grounded-invalid-001',
        userRequest: 'invalid',
        sourceId: 'src-001',
        sourcePath: 'raw/accepted/design.md'
      })
    ).rejects.toThrow('Invalid source locator: provide exactly one of sourceId or sourcePath');

    await expect(
      runSourceGroundedIngestFlow('/tmp/unused', {
        runId: 'run-source-grounded-invalid-002',
        userRequest: 'invalid'
      })
    ).rejects.toThrow('Invalid source locator: provide exactly one of sourceId or sourcePath');
  });
});
