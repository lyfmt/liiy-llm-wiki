import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGraphNode } from '../../../src/domain/graph-node.js';
import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createReadWikiPageTool } from '../../../src/runtime/tools/read-wiki-page.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';
import { loadTopicGraphPage } from '../../../src/storage/load-topic-graph-page.js';

vi.mock('../../../src/storage/load-topic-graph-page.js', () => ({
  loadTopicGraphPage: vi.fn(async () => null)
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('createReadWikiPageTool', () => {
  it('falls back to the markdown page when no topic graph page is available', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-page-fallback-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/queries/what-is-patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/navigation-overview.md',
          kind: 'topic',
          title: 'Navigation Overview',
          summary: 'Shows how pages connect.',
          tags: ['navigation'],
          source_refs: ['raw/accepted/overview.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Navigation Overview\n\nShows how pages connect.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/design-memo.md',
          kind: 'source',
          title: 'Design Memo',
          summary: 'Original memo for the patch-first topic.',
          tags: ['memo'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Design Memo\n\nOriginal memo for the patch-first topic.\n'
      );
      vi.mocked(loadTopicGraphPage).mockResolvedValue(null);

      const tool = createReadWikiPageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-page-001'
        })
      );

      const result = await tool.execute('tool-call-1', { kind: 'topic', slug: 'patch-first' });

      expect(vi.mocked(loadTopicGraphPage)).toHaveBeenCalledWith(root, 'patch-first');
      expect(result.details.summary).toBe('read wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('raw/accepted/design.md');
      expect(result.details.evidence).toContain('wiki/topics/navigation-overview.md');
      expect(result.details.evidence).toContain('wiki/sources/design-memo.md');
      expect(result.details.resultMarkdown).toContain('Title: Patch First');
      expect(result.details.resultMarkdown).toContain(
        'Suggested source follow-ups: read_raw_source:raw/accepted/design.md'
      );
      expect(result.details.resultMarkdown).toContain('Body:');
      expect(result.details.resultMarkdown).not.toContain('Topic graph summary:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to the markdown page when the topic graph is unavailable because GRAPH_DATABASE_URL is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-page-graph-unavailable-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/queries/what-is-patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/navigation-overview.md',
          kind: 'topic',
          title: 'Navigation Overview',
          summary: 'Shows how pages connect.',
          tags: ['navigation'],
          source_refs: ['raw/accepted/overview.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Navigation Overview\n\nShows how pages connect.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/design-memo.md',
          kind: 'source',
          title: 'Design Memo',
          summary: 'Original memo for the patch-first topic.',
          tags: ['memo'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Design Memo\n\nOriginal memo for the patch-first topic.\n'
      );
      vi.mocked(loadTopicGraphPage).mockRejectedValue(new Error('Missing GRAPH_DATABASE_URL'));

      const tool = createReadWikiPageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-page-graph-unavailable-001'
        })
      );

      const result = await tool.execute('tool-call-graph-unavailable-1', { kind: 'topic', slug: 'patch-first' });

      expect(vi.mocked(loadTopicGraphPage)).toHaveBeenCalledWith(root, 'patch-first');
      expect(result.details.summary).toBe('read wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('raw/accepted/design.md');
      expect(result.details.evidence).toContain('wiki/topics/navigation-overview.md');
      expect(result.details.evidence).toContain('wiki/sources/design-memo.md');
      expect(result.details.resultMarkdown).toContain('Title: Patch First');
      expect(result.details.resultMarkdown).toContain('Outgoing links: wiki/queries/what-is-patch-first.md');
      expect(result.details.resultMarkdown).toContain('Incoming links: wiki/topics/navigation-overview.md');
      expect(result.details.resultMarkdown).toContain('Related pages via shared source refs: wiki/sources/design-memo.md');
      expect(result.details.resultMarkdown).toContain(
        'Suggested source follow-ups: read_raw_source:raw/accepted/design.md'
      );
      expect(result.details.resultMarkdown).toContain('Body:');
      expect(result.details.resultMarkdown).not.toContain('Topic graph summary:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rethrows unexpected topic graph loading errors', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-page-graph-error-'));

    try {
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
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      vi.mocked(loadTopicGraphPage).mockRejectedValue(new Error('graph projection parse failed'));

      const tool = createReadWikiPageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-page-graph-error-001'
        })
      );

      await expect(tool.execute('tool-call-graph-error-1', { kind: 'topic', slug: 'patch-first' })).rejects.toThrow(
        'graph projection parse failed'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the topic graph page body and metadata and appends a graph summary block', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-page-graph-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Markdown Patch First',
          summary: 'Markdown summary should not win.',
          tags: ['markdown'],
          source_refs: ['raw/accepted/markdown.md'],
          outgoing_links: [],
          status: 'stale',
          updated_at: '2026-04-10T00:00:00.000Z'
        }),
        '# Markdown Patch First\n\nThis body should not be returned.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/patch-first-spec.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-20T00:10:00.000Z'
        }),
        '# Patch First Question\n\nPatch first is a reusable answer.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/patch-first-spec.md',
          kind: 'source',
          title: 'Patch First Spec',
          summary: 'Original graph spec.',
          source_refs: ['raw/accepted/patch-first-spec.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-20T00:20:00.000Z'
        }),
        '# Patch First Spec\n\nOriginal graph spec.\n'
      );
      vi.mocked(loadTopicGraphPage).mockResolvedValue(
        buildMockTopicGraphPage({
          page: createKnowledgePage({
            path: 'wiki/topics/patch-first.md',
            kind: 'topic',
            title: 'Patch First',
            aliases: ['Patching First'],
            summary: 'Graph summary wins.',
            tags: ['graph'],
            source_refs: ['raw/accepted/patch-first-spec.md'],
            outgoing_links: ['wiki/queries/patch-first-question.md'],
            status: 'active',
            updated_at: '2026-04-20T12:00:00.000Z'
          }),
          body: '# Patch First\n\nRendered from the topic graph.\n'
        })
      );

      const tool = createReadWikiPageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-page-graph-001'
        })
      );

      const result = await tool.execute('tool-call-graph-1', { kind: 'topic', slug: 'patch-first' });

      expect(vi.mocked(loadTopicGraphPage)).toHaveBeenCalledWith(root, 'patch-first');
      expect(result.details.summary).toBe('read wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('raw/accepted/patch-first-spec.md');
      expect(result.details.evidence).toContain('wiki/queries/patch-first-question.md');
      expect(result.details.evidence).toContain('wiki/sources/patch-first-spec.md');
      expect(result.details.resultMarkdown).toContain('Title: Patch First');
      expect(result.details.resultMarkdown).toContain('Aliases: Patching First');
      expect(result.details.resultMarkdown).toContain('Summary: Graph summary wins.');
      expect(result.details.resultMarkdown).toContain('Status: active');
      expect(result.details.resultMarkdown).toContain('Rendered from the topic graph.');
      expect(result.details.resultMarkdown).not.toContain('Markdown Patch First');
      expect(result.details.resultMarkdown).toContain('Topic graph summary:');
      expect(result.details.resultMarkdown).toContain('Taxonomy: Engineering');
      expect(result.details.resultMarkdown).toContain('Sections: Patch First Overview');
      expect(result.details.resultMarkdown).toContain('Grounding: raw/accepted/patch-first-spec.md');
      expect(result.details.resultMarkdown).toContain('locators: patch-first-spec.md#stable');
      expect(result.details.resultMarkdown).toContain('anchors: 1');
      expect(result.details.resultMarkdown).toContain('Entities: Graph Reader');
      expect(result.details.resultMarkdown).toContain('Assertions: Patch First Stability (evidence: 1)');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a synthesized topic graph page even when the markdown file is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-page-synth-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/patch-first-spec.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-20T00:10:00.000Z'
        }),
        '# Patch First Question\n\nPatch first is a reusable answer.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/patch-first-spec.md',
          kind: 'source',
          title: 'Patch First Spec',
          summary: 'Original graph spec.',
          source_refs: ['raw/accepted/patch-first-spec.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-20T00:20:00.000Z'
        }),
        '# Patch First Spec\n\nOriginal graph spec.\n'
      );
      vi.mocked(loadTopicGraphPage).mockResolvedValue(buildMockTopicGraphPage());

      const tool = createReadWikiPageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-page-synth-001'
        })
      );

      const result = await tool.execute('tool-call-synth-1', { kind: 'topic', slug: 'patch-first' });

      expect(vi.mocked(loadTopicGraphPage)).toHaveBeenCalledWith(root, 'patch-first');
      expect(result.details.summary).toBe('read wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('raw/accepted/patch-first-spec.md');
      expect(result.details.evidence).toContain('wiki/sources/patch-first-spec.md');
      expect(result.details.resultMarkdown).toContain('Title: Patch First');
      expect(result.details.resultMarkdown).toContain('Synthesized from the topic graph.');
      expect(result.details.resultMarkdown).toContain('Outgoing links: wiki/sources/patch-first-spec.md');
      expect(result.details.resultMarkdown).toContain('Topic graph summary:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps non-topic pages on the markdown-only path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-page-query-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/what-is-patch-first.md',
          kind: 'query',
          title: 'What is Patch First?',
          summary: 'Reusable answer for patch-first questions.',
          tags: ['query'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-20T00:00:00.000Z'
        }),
        '# What is Patch First?\n\nPatch first is a reusable answer.\n'
      );

      const tool = createReadWikiPageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-page-query-001'
        })
      );

      const result = await tool.execute('tool-call-query-1', { kind: 'query', slug: 'what-is-patch-first' });

      expect(vi.mocked(loadTopicGraphPage)).not.toHaveBeenCalled();
      expect(result.details.summary).toBe('read wiki/queries/what-is-patch-first.md');
      expect(result.details.resultMarkdown).toContain('Kind: query');
      expect(result.details.resultMarkdown).toContain('Title: What is Patch First?');
      expect(result.details.resultMarkdown).not.toContain('Topic graph summary:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function buildMockTopicGraphPage(input?: {
  page?: ReturnType<typeof createKnowledgePage>;
  body?: string;
}) {
  const topic = createGraphNode({
    id: 'topic:patch-first',
    kind: 'topic',
    title: 'Patch First',
    summary: 'Graph summary wins.',
    aliases: ['Patching First'],
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T12:00:00.000Z'
  });
  const taxonomy = createGraphNode({
    id: 'taxonomy:engineering',
    kind: 'taxonomy',
    title: 'Engineering',
    summary: 'Shared engineering taxonomy.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const section = createGraphNode({
    id: 'section:patch-first-overview',
    kind: 'section',
    title: 'Patch First Overview',
    summary: 'Overview section.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const entity = createGraphNode({
    id: 'entity:graph-reader',
    kind: 'entity',
    title: 'Graph Reader',
    summary: 'Topic graph reader.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const assertion = createGraphNode({
    id: 'assertion:patch-first-stability',
    kind: 'assertion',
    title: 'Patch First Stability',
    summary: 'Patch-first updates keep the reading path stable.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {
      statement: 'Patch-first updates keep the reading path stable.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const evidence = createGraphNode({
    id: 'evidence:patch-first-spec',
    kind: 'evidence',
    title: 'Patch First spec excerpt',
    summary: 'Evidence summary.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    attributes: {
      locator: 'patch-first-spec.md#stable',
      excerpt: 'Patch-first updates keep the reading path stable.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const source = createGraphNode({
    id: 'source:patch-first-spec',
    kind: 'source',
    title: 'Patch First Spec',
    summary: 'Original graph spec.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {
      path: 'raw/accepted/patch-first-spec.md'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });

  return {
    page:
      input?.page ??
      createKnowledgePage({
        path: 'wiki/topics/patch-first.md',
        kind: 'topic',
        title: 'Patch First',
        aliases: ['Patching First'],
        summary: 'Graph summary wins.',
        tags: [],
        source_refs: ['raw/accepted/patch-first-spec.md'],
        outgoing_links: ['wiki/sources/patch-first-spec.md'],
        status: 'active',
        updated_at: '2026-04-20T12:00:00.000Z'
      }),
    body: input?.body ?? '# Patch First\n\nSynthesized from the topic graph.\n',
    projection: {
      root: topic,
      taxonomy: [taxonomy],
      sections: [
        {
          node: section,
          grounding: {
            source_paths: ['raw/accepted/patch-first-spec.md'],
            locators: ['patch-first-spec.md#stable'],
            anchor_count: 1
          }
        }
      ],
      entities: [entity],
      assertions: [
        {
          node: assertion,
          evidence: [{ node: evidence, source }]
        }
      ],
      evidence: [{ node: evidence, source }]
    }
  };
}
