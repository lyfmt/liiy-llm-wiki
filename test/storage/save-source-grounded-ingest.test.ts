import { describe, expect, it } from 'vitest';

import { createGraphNode } from '../../src/domain/graph-node.js';
import { createSourceGroundedIngest } from '../../src/domain/source-grounded-ingest.js';
import type { GraphDatabaseClient } from '../../src/storage/graph-database.js';
import { listOutgoingGraphEdges, loadGraphNode, saveGraphNode } from '../../src/storage/graph-store.js';
import {
  SOURCE_GROUNDED_INGEST_CONFLICT,
  SourceGroundedIngestConflictError,
  saveSourceGroundedIngest
} from '../../src/storage/save-source-grounded-ingest.js';

describe('saveSourceGroundedIngest', () => {
  it('writes topic, section, evidence, source, and grounding edges for a minimal ingest', async () => {
    const client = createFakeGraphClient();
    const ingest = createMinimalIngest();

    await saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z');

    const topic = await loadGraphNode(client, ingest.topic.id);
    const section = await loadGraphNode(client, ingest.sections[0]!.id);
    const evidence = await loadGraphNode(client, ingest.evidence[0]!.id);
    const source = await loadGraphNode(client, `source:${ingest.sourceId}`);
    const sectionEdges = await listOutgoingGraphEdges(client, ingest.sections[0]!.id);
    const evidenceEdges = await listOutgoingGraphEdges(client, ingest.evidence[0]!.id);

    expect([topic?.id, section?.id, evidence?.id, source?.id]).toEqual(
      expect.arrayContaining([
        'topic:design-patterns',
        'section:design-patterns-intro',
        'evidence:src-001#1',
        'source:src-001'
      ])
    );
    expect(topic).toMatchObject({
      kind: 'topic',
      title: 'Design Patterns',
      summary: 'Pattern overview.'
    });
    expect(section).toMatchObject({
      kind: 'section',
      title: 'Introduction',
      summary: 'Intro section.'
    });
    expect(evidence).toMatchObject({
      kind: 'evidence',
      title: 'Patterns intro anchor',
      attributes: {
        locator: 'design-patterns.md#introduction:p1',
        excerpt: 'Design patterns are reusable solutions.',
        order: 1,
        heading_path: ['Introduction']
      }
    });
    expect(source).toMatchObject({
      kind: 'source',
      attributes: {
        path: 'raw/accepted/design-patterns.md',
        source_id: 'src-001'
      }
    });
    expect(sectionEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edge_id: 'edge:part_of:section:design-patterns-intro->topic:design-patterns',
          type: 'part_of',
          to_id: 'topic:design-patterns'
        }),
        expect.objectContaining({
          edge_id: 'edge:grounded_by:section:design-patterns-intro->evidence:src-001#1',
          type: 'grounded_by',
          to_id: 'evidence:src-001#1'
        })
      ])
    );
    expect(evidenceEdges).toEqual([
      expect.objectContaining({
        edge_id: 'edge:derived_from:evidence:src-001#1->source:src-001',
        type: 'derived_from',
        to_id: 'source:src-001'
      })
    ]);
  });

  it('treats identical repeated ingest as an idempotent no-op for nodes and edges', async () => {
    const client = createFakeGraphClient();
    const ingest = createMinimalIngest();

    await saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z');
    const firstNodeUpserts = client.nodeUpserts.length;
    const firstEdgeUpserts = client.edgeUpserts.length;
    const firstTopicUpdatedAt = (await loadGraphNode(client, ingest.topic.id))?.updated_at;
    const firstSectionEdgeUpdatedAt = (await listOutgoingGraphEdges(client, ingest.sections[0]!.id)).find(
      (edge) => edge.type === 'part_of'
    )?.updated_at;

    await saveSourceGroundedIngest(client, ingest, '2026-04-20T12:00:00.000Z');

    expect(client.nodeUpserts).toHaveLength(firstNodeUpserts);
    expect(client.edgeUpserts).toHaveLength(firstEdgeUpserts);
    await expect(loadGraphNode(client, ingest.topic.id)).resolves.toMatchObject({
      updated_at: firstTopicUpdatedAt
    });
    expect(
      (await listOutgoingGraphEdges(client, ingest.sections[0]!.id)).find((edge) => edge.type === 'part_of')?.updated_at
    ).toBe(firstSectionEdgeUpdatedAt);
  });

  it('returns a stable business error when an existing topic has conflicting core content', async () => {
    const client = createFakeGraphClient();
    const ingest = createMinimalIngest();

    await seedNode(
      client,
      createGraphNode({
        id: ingest.topic.id,
        kind: 'topic',
        title: 'Different Topic Title',
        summary: ingest.topic.summary,
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        retrieval_text: 'Different Topic Title\nPattern overview.',
        attributes: { slug: ingest.topic.slug },
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    );

    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toMatchObject({
      name: 'SourceGroundedIngestConflictError',
      code: SOURCE_GROUNDED_INGEST_CONFLICT,
      entityKind: 'topic',
      entityId: ingest.topic.id
    });
  });

  it('returns a stable business error when the payload repeats a section id with different content', async () => {
    const client = createFakeGraphClient();
    const ingest = createSourceGroundedIngest({
      sourceId: 'src-001',
      sourcePath: 'raw/accepted/design-patterns.md',
      topic: {
        slug: 'design-patterns',
        title: 'Design Patterns',
        summary: 'Pattern overview.'
      },
      sections: [
        {
          id: 'section:design-patterns-intro',
          title: 'Introduction',
          summary: 'Intro section.',
          grounded_evidence_ids: ['evidence:src-001#1']
        },
        {
          id: 'section:design-patterns-intro',
          title: 'Introduction Revised',
          summary: 'Different intro section.',
          grounded_evidence_ids: ['evidence:src-001#1']
        }
      ],
      evidence: [
        {
          id: 'evidence:src-001#1',
          title: 'Patterns intro anchor',
          locator: 'design-patterns.md#introduction:p1',
          excerpt: 'Design patterns are reusable solutions.',
          order: 1,
          heading_path: ['Introduction']
        }
      ]
    });

    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toMatchObject({
      code: SOURCE_GROUNDED_INGEST_CONFLICT,
      entityKind: 'section',
      entityId: 'section:design-patterns-intro'
    });
    expect(client.nodeUpserts).toHaveLength(0);
    expect(client.edgeUpserts).toHaveLength(0);
  });

  it('returns a stable business error when the payload repeats an evidence id with different content', async () => {
    const client = createFakeGraphClient();
    const ingest = createSourceGroundedIngest({
      sourceId: 'src-001',
      sourcePath: 'raw/accepted/design-patterns.md',
      topic: {
        slug: 'design-patterns',
        title: 'Design Patterns',
        summary: 'Pattern overview.'
      },
      sections: [
        {
          id: 'section:design-patterns-intro',
          title: 'Introduction',
          summary: 'Intro section.',
          grounded_evidence_ids: ['evidence:src-001#1']
        }
      ],
      evidence: [
        {
          id: 'evidence:src-001#1',
          title: 'Patterns intro anchor',
          locator: 'design-patterns.md#introduction:p1',
          excerpt: 'Design patterns are reusable solutions.',
          order: 1,
          heading_path: ['Introduction']
        },
        {
          id: 'evidence:src-001#1',
          title: 'Patterns intro anchor',
          locator: 'design-patterns.md#introduction:p1',
          excerpt: 'Different excerpt.',
          order: 1,
          heading_path: ['Introduction']
        }
      ]
    });

    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toMatchObject({
      code: SOURCE_GROUNDED_INGEST_CONFLICT,
      entityKind: 'evidence',
      entityId: 'evidence:src-001#1'
    });
    expect(client.nodeUpserts).toHaveLength(0);
    expect(client.edgeUpserts).toHaveLength(0);
  });

  it('returns a stable business error when an existing section has conflicting core content and does not upsert anything', async () => {
    const client = createFakeGraphClient();
    const ingest = createMinimalIngest();

    await seedNode(
      client,
      createGraphNode({
        id: ingest.sections[0]!.id,
        kind: 'section',
        title: 'Different Section Title',
        summary: ingest.sections[0]!.summary,
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        retrieval_text: 'Different Section Title\nIntro section.',
        attributes: {
          grounded_evidence_ids: ingest.sections[0]!.grounded_evidence_ids
        },
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    );
    const baselineNodeUpserts = client.nodeUpserts.length;
    const baselineEdgeUpserts = client.edgeUpserts.length;

    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toMatchObject({
      code: SOURCE_GROUNDED_INGEST_CONFLICT,
      entityKind: 'section',
      entityId: ingest.sections[0]!.id
    });
    expect(client.nodeUpserts).toHaveLength(baselineNodeUpserts);
    expect(client.edgeUpserts).toHaveLength(baselineEdgeUpserts);
  });

  it('returns a stable business error when an existing source has conflicting content', async () => {
    const client = createFakeGraphClient();
    const ingest = createMinimalIngest();

    await seedNode(
      client,
      createGraphNode({
        id: `source:${ingest.sourceId}`,
        kind: 'source',
        title: 'design-patterns.md',
        summary: '',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        retrieval_text: 'raw/accepted/other.md',
        attributes: {
          path: 'raw/accepted/other.md',
          source_id: ingest.sourceId
        },
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    );

    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toBeInstanceOf(
      SourceGroundedIngestConflictError
    );
    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toMatchObject({
      code: SOURCE_GROUNDED_INGEST_CONFLICT,
      entityKind: 'source',
      entityId: `source:${ingest.sourceId}`
    });
  });

  it('returns a stable business error when an existing evidence node has conflicting content', async () => {
    const client = createFakeGraphClient();
    const ingest = createMinimalIngest();

    await seedNode(
      client,
      createGraphNode({
        id: ingest.evidence[0]!.id,
        kind: 'evidence',
        title: ingest.evidence[0]!.title,
        summary: 'Conflicting excerpt.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        retrieval_text: 'Patterns intro anchor\nConflicting excerpt.',
        attributes: {
          locator: ingest.evidence[0]!.locator,
          excerpt: 'Conflicting excerpt.',
          order: ingest.evidence[0]!.order,
          heading_path: ingest.evidence[0]!.heading_path
        },
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    );

    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toMatchObject({
      code: SOURCE_GROUNDED_INGEST_CONFLICT,
      entityKind: 'evidence',
      entityId: ingest.evidence[0]!.id
    });
  });

  it('treats evidence summary drift as a conflict instead of an idempotent no-op', async () => {
    const client = createFakeGraphClient();
    const ingest = createMinimalIngest();

    await seedNode(
      client,
      createGraphNode({
        id: ingest.evidence[0]!.id,
        kind: 'evidence',
        title: ingest.evidence[0]!.title,
        summary: 'Stale summary despite matching attributes.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        retrieval_text: [ingest.evidence[0]!.title, ingest.evidence[0]!.excerpt].join('\n'),
        attributes: {
          locator: ingest.evidence[0]!.locator,
          excerpt: ingest.evidence[0]!.excerpt,
          order: ingest.evidence[0]!.order,
          heading_path: ingest.evidence[0]!.heading_path
        },
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    );
    const baselineNodeUpserts = client.nodeUpserts.length;
    const baselineEdgeUpserts = client.edgeUpserts.length;

    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toMatchObject({
      code: SOURCE_GROUNDED_INGEST_CONFLICT,
      entityKind: 'evidence',
      entityId: ingest.evidence[0]!.id
    });
    expect(client.nodeUpserts).toHaveLength(baselineNodeUpserts);
    expect(client.edgeUpserts).toHaveLength(baselineEdgeUpserts);
  });

  it('raises a business conflict when another ingest inserts a conflicting topic after the initial existence check', async () => {
    const ingest = createMinimalIngest();
    const client = createFakeGraphClient({
      concurrentNodeRows: [
        createGraphNode({
          id: ingest.topic.id,
          kind: 'topic',
          title: 'Conflicting Topic Title',
          summary: ingest.topic.summary,
          aliases: [],
          status: 'active',
          confidence: 'asserted',
          provenance: 'agent-synthesized',
          review_state: 'reviewed',
          retrieval_text: 'Conflicting Topic Title\nPattern overview.',
          attributes: { slug: ingest.topic.slug },
          created_at: '2026-04-19T00:00:00.000Z',
          updated_at: '2026-04-19T00:00:00.000Z'
        })
      ]
    });

    await expect(saveSourceGroundedIngest(client, ingest, '2026-04-20T00:00:00.000Z')).rejects.toMatchObject({
      code: SOURCE_GROUNDED_INGEST_CONFLICT,
      entityKind: 'topic',
      entityId: ingest.topic.id
    });
    expect(client.nodeUpserts).toEqual([]);
    expect(client.edgeUpserts).toEqual([]);
    await expect(loadGraphNode(client, `source:${ingest.sourceId}`)).resolves.toBeNull();
    await expect(loadGraphNode(client, ingest.topic.id)).resolves.toMatchObject({
      title: 'Conflicting Topic Title'
    });
  });
});

async function seedNode(client: GraphDatabaseClient, node: ReturnType<typeof createGraphNode>): Promise<void> {
  await saveGraphNode(client, node);
}

function createMinimalIngest() {
  return createSourceGroundedIngest({
    sourceId: 'src-001',
    sourcePath: 'raw/accepted/design-patterns.md',
    topic: {
      slug: 'design-patterns',
      title: 'Design Patterns',
      summary: 'Pattern overview.'
    },
    sections: [
      {
        id: 'section:design-patterns-intro',
        title: 'Introduction',
        summary: 'Intro section.',
        grounded_evidence_ids: ['evidence:src-001#1']
      }
    ],
    evidence: [
      {
        id: 'evidence:src-001#1',
        title: 'Patterns intro anchor',
        locator: 'design-patterns.md#introduction:p1',
        excerpt: 'Design patterns are reusable solutions.',
        order: 1,
        heading_path: ['Introduction']
      }
    ]
  });
}

function createFakeGraphClient(input: {
  concurrentNodeRows?: Array<ReturnType<typeof createGraphNode>>;
} = {}): GraphDatabaseClient & {
  nodeUpserts: string[];
  edgeUpserts: string[];
} {
  let nodeRows = new Map<string, Record<string, unknown>>();
  let edgeRows = new Map<string, Record<string, unknown>>();
  let activeNodeRows = nodeRows;
  let activeEdgeRows = edgeRows;
  let insideTransaction = false;
  const nodeUpserts: string[] = [];
  const edgeUpserts: string[] = [];
  const concurrentNodeRows = new Map(
    (input.concurrentNodeRows ?? []).map((node) => [node.id, toStoredNodeRow(node)])
  );

  const client: GraphDatabaseClient & {
    nodeUpserts: string[];
    edgeUpserts: string[];
  } = {
    nodeUpserts,
    edgeUpserts,
    async transaction<T>(work: (transactionClient: GraphDatabaseClient) => Promise<T>) {
      const transactionNodeRows = cloneRowMap(nodeRows);
      const transactionEdgeRows = cloneRowMap(edgeRows);
      const baselineNodeUpserts = nodeUpserts.length;
      const baselineEdgeUpserts = edgeUpserts.length;
      const previousInsideTransaction = insideTransaction;

      activeNodeRows = transactionNodeRows;
      activeEdgeRows = transactionEdgeRows;
      insideTransaction = true;

      try {
        const result = await work(client);
        nodeRows = transactionNodeRows;
        edgeRows = transactionEdgeRows;
        return result;
      } catch (error) {
        nodeUpserts.splice(baselineNodeUpserts);
        edgeUpserts.splice(baselineEdgeUpserts);
        throw error;
      } finally {
        activeNodeRows = nodeRows;
        activeEdgeRows = edgeRows;
        insideTransaction = previousInsideTransaction;
      }
    },
    async end() {
      // no-op in tests
    },
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('insert into graph_nodes')) {
        const row = toNodeRow(params ?? []);
        injectConcurrentNode(String(row.id));
        const existing = activeNodeRows.get(String(row.id));

        if (sql.includes('on conflict (id) do nothing')) {
          if (existing) {
            return { rows: [] };
          }

          activeNodeRows.set(String(row.id), row);
          nodeUpserts.push(String(row.id));
          return { rows: [{ id: row.id }] };
        }

        activeNodeRows.set(String(row.id), existing ? { ...row, created_at: existing.created_at } : row);
        nodeUpserts.push(String(row.id));
        return { rows: [] };
      }

      if (sql.includes('insert into graph_edges')) {
        const row = toEdgeRow(params ?? []);
        const existing = activeEdgeRows.get(String(row.edge_id));

        if (sql.includes('on conflict (edge_id) do nothing')) {
          if (existing) {
            return { rows: [] };
          }

          activeEdgeRows.set(String(row.edge_id), row);
          edgeUpserts.push(String(row.edge_id));
          return { rows: [{ edge_id: row.edge_id }] };
        }

        activeEdgeRows.set(String(row.edge_id), existing ? { ...row, created_at: existing.created_at } : row);
        edgeUpserts.push(String(row.edge_id));
        return { rows: [] };
      }

      if (sql.includes('from graph_nodes') && sql.includes('where id = $1')) {
        const id = String(params?.[0] ?? '');
        return { rows: activeNodeRows.has(id) ? [cloneRow(activeNodeRows.get(id)!)] : [] };
      }

      if (sql.includes('from graph_edges') && sql.includes('where edge_id = $1')) {
        const edgeId = String(params?.[0] ?? '');
        return { rows: activeEdgeRows.has(edgeId) ? [cloneRow(activeEdgeRows.get(edgeId)!)] : [] };
      }

      if (sql.includes('from graph_edges') && sql.includes('where from_id = $1')) {
        const fromId = String(params?.[0] ?? '');
        const rows = [...activeEdgeRows.values()]
          .filter((row) => row.from_id === fromId)
          .sort((left, right) => String(left.edge_id).localeCompare(String(right.edge_id)))
          .map(cloneRow);
        return { rows };
      }

      if (sql.includes('from graph_edges') && sql.includes('where to_id = $1')) {
        const toId = String(params?.[0] ?? '');
        const rows = [...activeEdgeRows.values()]
          .filter((row) => row.to_id === toId)
          .sort((left, right) => String(left.edge_id).localeCompare(String(right.edge_id)))
          .map(cloneRow);
        return { rows };
      }

      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  return client;

  function injectConcurrentNode(id: string) {
    const concurrentRow = concurrentNodeRows.get(id);

    if (!concurrentRow) {
      return;
    }

    concurrentNodeRows.delete(id);
    nodeRows.set(id, cloneRow(concurrentRow));

    if (insideTransaction) {
      activeNodeRows.set(id, cloneRow(concurrentRow));
    }
  }
}

function toNodeRow(params: unknown[]): Record<string, unknown> {
  return {
    id: params[0],
    kind: params[1],
    title: params[2],
    summary: params[3],
    aliases: JSON.parse(String(params[4])),
    status: params[5],
    confidence: params[6],
    provenance: params[7],
    review_state: params[8],
    retrieval_text: params[9],
    attributes: JSON.parse(String(params[10])),
    created_at: params[11],
    updated_at: params[12]
  };
}

function toEdgeRow(params: unknown[]): Record<string, unknown> {
  return {
    edge_id: params[0],
    from_id: params[1],
    from_kind: params[2],
    type: params[3],
    to_id: params[4],
    to_kind: params[5],
    status: params[6],
    confidence: params[7],
    provenance: params[8],
    review_state: params[9],
    sort_order: params[10],
    qualifiers: JSON.parse(String(params[11])),
    created_at: params[12],
    updated_at: params[13]
  };
}

function cloneRow(row: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(row);
}

function cloneRowMap(rows: Map<string, Record<string, unknown>>): Map<string, Record<string, unknown>> {
  return new Map([...rows.entries()].map(([key, row]) => [key, cloneRow(row)]));
}

function toStoredNodeRow(node: ReturnType<typeof createGraphNode>): Record<string, unknown> {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    summary: node.summary,
    aliases: node.aliases,
    status: node.status,
    confidence: node.confidence,
    provenance: node.provenance,
    review_state: node.review_state,
    retrieval_text: node.retrieval_text,
    attributes: structuredClone(node.attributes),
    created_at: node.created_at,
    updated_at: node.updated_at
  };
}
