import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { buildRuntimeToolCatalog } from '../../../src/runtime/tool-catalog.js';
import { createIngestSourceToGraphTool } from '../../../src/runtime/tools/ingest-source-to-graph.js';
import { runSourceGroundedIngestFlow } from '../../../src/flows/ingest/run-source-grounded-ingest-flow.js';

vi.mock('../../../src/flows/ingest/run-source-grounded-ingest-flow.js', () => ({
  runSourceGroundedIngestFlow: vi.fn()
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('createIngestSourceToGraphTool', () => {
  it('calls the source-grounded ingest flow and reports generated topic and sections', async () => {
    vi.mocked(runSourceGroundedIngestFlow).mockResolvedValue({
      sourceId: 'src-001',
      sourcePath: 'raw/accepted/design.md',
      topic: {
        id: 'topic:source-src-001',
        slug: 'source-src-001',
        title: 'Patch First Design',
        summary: 'Patch-first overview.'
      },
      sections: [
        {
          id: 'section:source-src-001#1',
          title: 'Patch First',
          summary: 'Overview section.',
          grounded_evidence_ids: ['evidence:src-001#1']
        },
        {
          id: 'section:source-src-001#2',
          title: 'Workflow',
          summary: 'Workflow section.',
          grounded_evidence_ids: ['evidence:src-001#2']
        }
      ],
      evidence: [
        {
          id: 'evidence:src-001#1',
          title: 'Patch First',
          locator: 'design.md#patch-first:p1',
          excerpt: 'Patch-first updates keep page structure stable.',
          order: 1,
          heading_path: ['Patch First']
        },
        {
          id: 'evidence:src-001#2',
          title: 'Workflow',
          locator: 'design.md#patch-first/workflow:p1',
          excerpt: 'Start with the smallest compatible patch.',
          order: 2,
          heading_path: ['Patch First', 'Workflow']
        }
      ],
      coverage: {
        total_anchor_count: 2,
        covered_anchor_count: 2,
        uncovered_anchor_ids: [],
        coverage_status: 'complete'
      },
      graphTarget: 'graph:topic:source-src-001',
      changeSet: {
        target_files: ['wiki/sources/src-001.md', 'wiki/index.md', 'wiki/log.md'],
        patch_summary: 'persisted source-grounded graph for topic:source-src-001',
        rationale: 'ingest source src-001',
        source_refs: ['raw/accepted/design.md'],
        risk_level: 'low',
        needs_review: false
      },
      review: {
        needs_review: false,
        reasons: []
      },
      persisted: ['wiki/sources/src-001.md', 'wiki/index.md', 'wiki/log.md']
    });

    const tool = createIngestSourceToGraphTool(
      createRuntimeContext({
        root: '/repo',
        runId: 'runtime-parent-001'
      })
    );

    const result = await tool.execute('tool-call-1', {
      sourceId: 'src-001'
    });

    expect(vi.mocked(runSourceGroundedIngestFlow)).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({
        sourceId: 'src-001'
      })
    );
    expect(result.details.summary).toContain('generated topic');
    expect(result.details.summary).toContain('2 sections');
    expect(result.details.evidence).toEqual(['raw/accepted/design.md']);
    expect(result.details.resultMarkdown).toContain('Graph target: graph:topic:source-src-001');
    expect(result.details.resultMarkdown).toContain('Sections: 2');
    expect(result.details.resultMarkdown).toContain('Source: raw/accepted/design.md');
    expect(result.details.resultMarkdown).toContain('Coverage status: complete');
    expect(result.details.resultMarkdown).toContain('Covered anchors: 2/2');
    expect(result.details.resultMarkdown).not.toContain('wiki/topics/source-src-001.md');
    expect(result.details.data).toMatchObject({
      graphTarget: 'graph:topic:source-src-001',
      sourceCoverage: {
        total_anchor_count: 2,
        covered_anchor_count: 2,
        uncovered_anchor_ids: [],
        coverage_status: 'complete'
      }
    });
  });

  it('makes review state explicit when the source-grounded ingest is queued for review', async () => {
    vi.mocked(runSourceGroundedIngestFlow).mockResolvedValue({
      sourceId: 'src-001',
      sourcePath: 'raw/accepted/design.md',
      topic: {
        id: 'topic:source-src-001',
        slug: 'source-src-001',
        title: 'Patch First Design',
        summary: 'Patch-first overview.'
      },
      sections: [
        {
          id: 'section:source-src-001#1',
          title: 'Patch First',
          summary: 'Overview section.',
          grounded_evidence_ids: ['evidence:src-001#1']
        }
      ],
      evidence: [
        {
          id: 'evidence:src-001#1',
          title: 'Patch First',
          locator: 'design.md#patch-first:p1',
          excerpt: 'Patch-first updates keep page structure stable.',
          order: 1,
          heading_path: ['Patch First']
        }
      ],
      coverage: {
        total_anchor_count: 2,
        covered_anchor_count: 1,
        uncovered_anchor_ids: ['evidence:src-001#2'],
        coverage_status: 'partial'
      },
      graphTarget: 'graph:topic:source-src-001',
      changeSet: {
        target_files: ['wiki/sources/src-001.md', 'wiki/index.md', 'wiki/log.md'],
        patch_summary: 'source-grounded ingest queued for review because of graph conflict',
        rationale: 'ingest source src-001',
        source_refs: ['raw/accepted/design.md'],
        risk_level: 'low',
        needs_review: true
      },
      review: {
        needs_review: true,
        reasons: ['Conflicting topic node already exists: topic:source-src-001']
      },
      persisted: ['wiki/sources/src-001.md', 'wiki/index.md', 'wiki/log.md']
    });

    const tool = createIngestSourceToGraphTool(
      createRuntimeContext({
        root: '/repo',
        runId: 'runtime-parent-002'
      })
    );

    const result = await tool.execute('tool-call-2', {
      sourcePath: 'raw/accepted/design.md'
    });

    expect(result.details.needsReview).toBe(true);
    expect(result.details.summary).toContain('queued for review');
    expect(result.details.resultMarkdown).toContain('Queued for review');
    expect(result.details.resultMarkdown).toContain('Graph conflict: Conflicting topic node already exists: topic:source-src-001');
    expect(result.details.resultMarkdown).toContain('Coverage status: partial');
    expect(result.details.resultMarkdown).toContain('Covered anchors: 1/2');
    expect(result.details.resultMarkdown).toContain('Uncovered anchors: evidence:src-001#2');
    expect(result.details.resultMarkdown).toContain('raw/accepted/design.md');
  });

  it('registers ingest_source_to_graph in the runtime tool catalog', () => {
    const tools = buildRuntimeToolCatalog(
      createRuntimeContext({
        root: '/repo',
        runId: 'runtime-parent-003'
      })
    );

    expect(tools.ingest_source_to_graph).toBeDefined();
  });
});
