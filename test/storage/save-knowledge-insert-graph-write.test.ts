import { describe, expect, it } from 'vitest';

import {
  createKnowledgeInsertGraphWrite,
  type CreateKnowledgeInsertGraphWriteInput
} from '../../src/domain/knowledge-insert-graph-write.js';
import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createGraphNode } from '../../src/domain/graph-node.js';
import type { GraphDatabaseClient } from '../../src/storage/graph-database.js';
import { listOutgoingGraphEdges, loadGraphNode } from '../../src/storage/graph-store.js';
import {
  KNOWLEDGE_INSERT_GRAPH_WRITE_CONFLICT,
  KnowledgeInsertGraphWriteConflictError,
  saveKnowledgeInsertGraphWrite
} from '../../src/storage/save-knowledge-insert-graph-write.js';

describe('saveKnowledgeInsertGraphWrite', () => {
  it('writes the full durable graph layer for a normalized knowledge-insert graph write', async () => {
    const client = createFakeGraphClient();
    const graphWrite = createKnowledgeInsertGraphWrite(createSampleInput());

    await saveKnowledgeInsertGraphWrite(client, graphWrite);

    const topic = await loadGraphNode(client, 'topic:design-patterns');
    const section = await loadGraphNode(client, 'section:design-patterns#1');
    const entity = await loadGraphNode(client, 'entity:patch-first-system');
    const assertion = await loadGraphNode(client, 'assertion:patch-first-stability');
    const evidence = await loadGraphNode(client, 'evidence:src-001#1');
    const source = await loadGraphNode(client, 'source:src-001');
    const topicEdges = await listOutgoingGraphEdges(client, 'topic:design-patterns');
    const sectionEdges = await listOutgoingGraphEdges(client, 'section:design-patterns#1');
    const assertionEdges = await listOutgoingGraphEdges(client, 'assertion:patch-first-stability');

    expect([topic?.id, section?.id, entity?.id, assertion?.id, evidence?.id, source?.id]).toEqual(
      expect.arrayContaining([
        'topic:design-patterns',
        'section:design-patterns#1',
        'entity:patch-first-system',
        'assertion:patch-first-stability',
        'evidence:src-001#1',
        'source:src-001'
      ])
    );
    expect(topicEdges.map((edge) => edge.type)).toEqual(expect.arrayContaining(['belongs_to_taxonomy', 'mentions']));
    expect(sectionEdges.map((edge) => edge.type)).toEqual(expect.arrayContaining(['part_of', 'grounded_by', 'mentions']));
    expect(assertionEdges.map((edge) => edge.type)).toEqual(expect.arrayContaining(['about', 'supported_by', 'mentions']));
  });

  it('treats identical repeated writes as an idempotent no-op', async () => {
    const client = createFakeGraphClient();
    const graphWrite = createKnowledgeInsertGraphWrite(createSampleInput());

    await saveKnowledgeInsertGraphWrite(client, graphWrite, '2026-04-23T00:00:00.000Z');
    const firstNodeUpserts = client.nodeUpserts.length;
    const firstEdgeUpserts = client.edgeUpserts.length;

    await saveKnowledgeInsertGraphWrite(client, graphWrite, '2026-04-24T00:00:00.000Z');

    expect(client.nodeUpserts).toHaveLength(firstNodeUpserts);
    expect(client.edgeUpserts).toHaveLength(firstEdgeUpserts);
  });

  it('rejects conflicting existing nodes instead of silently overwriting them', async () => {
    const client = createFakeGraphClient();
    const graphWrite = createKnowledgeInsertGraphWrite(createSampleInput());

    await seedNode(
      client,
      createGraphNode({
        id: 'topic:design-patterns',
        kind: 'topic',
        title: 'Different Topic Title',
        summary: 'Pattern overview.',
        aliases: ['Pattern Intent'],
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        retrieval_text: 'Different Topic Title\nPattern overview.',
        attributes: {
          slug: 'design-patterns',
          tags: ['engineering'],
          source_refs: ['raw/accepted/design-patterns.md'],
          outgoing_links: ['wiki/sources/src-001.md'],
          rationale: 'create deterministic topic draft from insertion plan src-001'
        },
        created_at: '2026-04-22T00:00:00.000Z',
        updated_at: '2026-04-22T00:00:00.000Z'
      })
    );

    await expect(saveKnowledgeInsertGraphWrite(client, graphWrite)).rejects.toMatchObject({
      name: 'KnowledgeInsertGraphWriteConflictError',
      code: KNOWLEDGE_INSERT_GRAPH_WRITE_CONFLICT,
      entityKind: 'topic',
      entityId: 'topic:design-patterns'
    });
    await expect(saveKnowledgeInsertGraphWrite(client, graphWrite)).rejects.toBeInstanceOf(
      KnowledgeInsertGraphWriteConflictError
    );
  });

  it('merges existing semantic concept nodes with the same title and queues a review candidate', async () => {
    const client = createFakeGraphClient();
    const queuedCandidates: unknown[] = [];
    const existingConcept = createGraphNode({
      id: 'concept:design-patterns',
      kind: 'concept',
      title: '设计模式',
      summary: '旧来源中的概念摘要。',
      aliases: [],
      status: 'active',
      confidence: 'asserted',
      provenance: 'agent-extracted',
      review_state: 'reviewed',
      retrieval_text: '设计模式\n旧来源中的概念摘要。',
      attributes: {
        source_concept_id: 'concept-design-patterns'
      },
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const desiredConcept = createGraphNode({
      ...existingConcept,
      summary: '新来源中的概念摘要。',
      retrieval_text: '设计模式\n新来源中的概念摘要。',
      created_at: '2026-04-23T00:00:00.000Z',
      updated_at: '2026-04-23T00:00:00.000Z'
    });

    await seedNode(client, existingConcept);

    await expect(saveKnowledgeInsertGraphWrite(client, {
      sourceId: 'src-002',
      topicIds: [],
      sectionIdMap: {},
      evidenceIdMap: {},
      conceptIdMap: { 'concept-design-patterns': 'concept:design-patterns' },
      nodes: [desiredConcept],
      edges: []
    }, undefined, {
      semanticMergeQueue: {
        enqueue: (candidate) => {
          queuedCandidates.push(candidate);
        }
      }
    })).resolves.toBeUndefined();
    expect(await loadGraphNode(client, 'concept:design-patterns')).toMatchObject({
      title: '设计模式',
      summary: '旧来源中的概念摘要。\n\n新来源中的概念摘要。',
      retrieval_text: '设计模式\n旧来源中的概念摘要。\n\n设计模式\n新来源中的概念摘要。'
    });
    expect(queuedCandidates).toHaveLength(1);
  });

  it('treats legacy source-grounded topic/source/evidence nodes as idempotent equivalents', async () => {
    const client = createFakeGraphClient();
    const graphWrite = createKnowledgeInsertGraphWrite(createSampleInput());

    await seedNode(
      client,
      createGraphNode({
        id: 'topic:design-patterns',
        kind: 'topic',
        title: 'Design Patterns',
        summary: 'Pattern overview.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        retrieval_text: 'Design Patterns\nPattern overview.',
        attributes: {
          slug: 'design-patterns'
        },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );
    await seedNode(
      client,
      createGraphNode({
        id: 'source:src-001',
        kind: 'source',
        title: 'design-patterns.md',
        summary: '',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        retrieval_text: 'raw/accepted/design-patterns.md',
        attributes: {
          path: 'raw/accepted/design-patterns.md',
          source_id: 'src-001'
        },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );
    await seedNode(
      client,
      createGraphNode({
        id: 'evidence:src-001#1',
        kind: 'evidence',
        title: 'Patterns intro anchor',
        summary: 'Patch-first systems keep durable notes.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        retrieval_text: 'Patterns intro anchor\nPatch-first systems keep durable notes.',
        attributes: {
          locator: 'design-patterns.md#introduction:p1',
          excerpt: 'Patch-first systems keep durable notes.',
          order: 1,
          heading_path: ['Introduction']
        },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );

    await expect(saveKnowledgeInsertGraphWrite(client, graphWrite)).resolves.toBeUndefined();
    expect(await loadGraphNode(client, 'topic:design-patterns')).toMatchObject({
      title: 'Design Patterns',
      attributes: {
        slug: 'design-patterns'
      }
    });
    expect(await loadGraphNode(client, 'source:src-001')).toMatchObject({
      title: 'design-patterns.md',
      attributes: {
        path: 'raw/accepted/design-patterns.md',
        source_id: 'src-001'
      }
    });
    expect(await loadGraphNode(client, 'evidence:src-001#1')).toMatchObject({
      title: 'Patterns intro anchor',
      attributes: {
        locator: 'design-patterns.md#introduction:p1',
        excerpt: 'Patch-first systems keep durable notes.',
        order: 1,
        heading_path: ['Introduction']
      }
    });
  });

  it('treats a legacy source-grounded section node as an idempotent equivalent', async () => {
    const client = createFakeGraphClient();
    const graphWrite = createKnowledgeInsertGraphWrite(createSampleInput());

    await seedNode(
      client,
      createGraphNode({
        id: 'section:design-patterns#1',
        kind: 'section',
        title: 'Pattern Intent',
        summary: 'Patch-first systems keep durable notes.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        retrieval_text: 'Pattern Intent\nPatch-first systems keep durable notes.',
        attributes: {
          grounded_evidence_ids: ['evidence:src-001#1']
        },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );

    await expect(saveKnowledgeInsertGraphWrite(client, graphWrite)).resolves.toBeUndefined();
    expect(await loadGraphNode(client, 'section:design-patterns#1')).toMatchObject({
      title: 'Pattern Intent',
      summary: 'Patch-first systems keep durable notes.',
      retrieval_text: 'Pattern Intent\nPatch-first systems keep durable notes.',
      attributes: {
        grounded_evidence_ids: ['evidence:src-001#1']
      }
    });
  });

  it('persists every about edge when one assertion is about multiple sections', async () => {
    const client = createFakeGraphClient();
    const input = createSampleInput();
    const graphWrite = createKnowledgeInsertGraphWrite({
      ...input,
      topicDraftsArtifact: {
        topics: [
          {
            ...input.topicDraftsArtifact.topics[0]!,
            sections: [
              {
                sectionId: 'section-001',
                title: 'Pattern Intent',
                body: 'Section one body.',
                source_refs: ['raw/accepted/design-patterns.md'],
                evidence_anchor_ids: ['anchor-001'],
                locators: ['raw/accepted/design-patterns.md#block-001']
              },
              {
                sectionId: 'section-002',
                title: 'Pattern Constraints',
                body: 'Section two body.',
                source_refs: ['raw/accepted/design-patterns.md'],
                evidence_anchor_ids: ['anchor-001'],
                locators: ['raw/accepted/design-patterns.md#block-001']
              }
            ]
          }
        ]
      },
      sectionsArtifact: {
        sections: [
          {
            sectionId: 'section-001',
            title: 'Pattern Intent',
            summary: 'Section one body.',
            body: 'Section one body.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-001'],
            sourceSectionCandidateIds: ['sec-candidate-001'],
            topicHints: ['design-patterns']
          },
          {
            sectionId: 'section-002',
            title: 'Pattern Constraints',
            summary: 'Section two body.',
            body: 'Section two body.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-001'],
            sourceSectionCandidateIds: ['sec-candidate-002'],
            topicHints: ['design-patterns']
          }
        ]
      }
    });

    await saveKnowledgeInsertGraphWrite(client, graphWrite);

    const assertionEdges = await listOutgoingGraphEdges(client, 'assertion:patch-first-stability');

    expect(
      assertionEdges.filter((edge) => edge.type === 'about' && edge.to_kind === 'section').map((edge) => edge.to_id)
    ).toEqual(expect.arrayContaining(['section:design-patterns#1', 'section:design-patterns#2']));
  });

  it('rejects an alternative topic connected only through assertion supported_by evidence chains', async () => {
    const client = createFakeGraphClient();
    const graphWrite = createKnowledgeInsertGraphWrite(createSampleInput());

    await seedNode(
      client,
      createGraphNode({
        id: 'source:src-001',
        kind: 'source',
        title: 'design-patterns.md',
        summary: '',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        retrieval_text: 'raw/accepted/design-patterns.md',
        attributes: {
          path: 'raw/accepted/design-patterns.md',
          source_id: 'src-001'
        },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );
    await seedNode(
      client,
      createGraphNode({
        id: 'evidence:src-001#9',
        kind: 'evidence',
        title: 'Foreign evidence',
        summary: 'Foreign excerpt.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        retrieval_text: 'Foreign evidence\nForeign excerpt.',
        attributes: {
          locator: 'foreign.md#evidence',
          excerpt: 'Foreign excerpt.',
          order: 9,
          heading_path: ['Foreign']
        },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );
    await seedNode(
      client,
      createGraphNode({
        id: 'assertion:foreign-claim',
        kind: 'assertion',
        title: 'Foreign claim',
        summary: 'Foreign statement.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-extracted',
        review_state: 'reviewed',
        retrieval_text: 'Foreign statement.',
        attributes: {
          statement: 'Foreign statement.'
        },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );
    await seedNode(
      client,
      createGraphNode({
        id: 'topic:other-topic',
        kind: 'topic',
        title: 'Other Topic',
        summary: 'Other topic summary.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        retrieval_text: 'Other Topic\nOther topic summary.',
        attributes: {
          slug: 'other-topic'
        },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );
    await seedEdge(
      client,
      createGraphEdge({
        edge_id: 'edge:derived_from:evidence:src-001#9->source:src-001',
        from_id: 'evidence:src-001#9',
        from_kind: 'evidence',
        type: 'derived_from',
        to_id: 'source:src-001',
        to_kind: 'source',
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        qualifiers: {},
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );
    await seedEdge(
      client,
      createGraphEdge({
        edge_id: 'edge:supported_by:assertion:foreign-claim->evidence:src-001#9',
        from_id: 'assertion:foreign-claim',
        from_kind: 'assertion',
        type: 'supported_by',
        to_id: 'evidence:src-001#9',
        to_kind: 'evidence',
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        qualifiers: {},
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );
    await seedEdge(
      client,
      createGraphEdge({
        edge_id: 'edge:about:assertion:foreign-claim->topic:other-topic',
        from_id: 'assertion:foreign-claim',
        from_kind: 'assertion',
        type: 'about',
        to_id: 'topic:other-topic',
        to_kind: 'topic',
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        qualifiers: {},
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    );

    await expect(saveKnowledgeInsertGraphWrite(client, graphWrite)).rejects.toMatchObject({
      name: 'KnowledgeInsertGraphWriteConflictError',
      code: KNOWLEDGE_INSERT_GRAPH_WRITE_CONFLICT,
      entityKind: 'topic',
      entityId: 'topic:other-topic'
    });
  });
});

function createSampleInput(): CreateKnowledgeInsertGraphWriteInput {
  return {
    topicTaxonomyArtifact: {
      topics: [
        {
          sourceTopicId: 'source-topic-001',
          topicSlug: 'design-patterns',
          topicTitle: 'Design Patterns',
          topicAction: 'reuse-topic',
          sectionIds: ['section-001'],
          taxonomyAction: 'attach-existing',
          taxonomySlug: 'engineering',
          taxonomy: {
            rootTaxonomySlug: 'engineering',
            parentTaxonomySlug: null,
            leafTaxonomySlug: 'engineering'
          },
          conflictTaxonomySlugs: []
        }
      ]
    },
    topicDraftsArtifact: {
      topics: [
        {
          topicSlug: 'design-patterns',
          targetPath: 'wiki/topics/design-patterns.md',
          sections: [
            {
              sectionId: 'section-001',
              title: 'Pattern Intent',
              body: 'Patch-first systems keep durable notes.',
              source_refs: ['raw/accepted/design-patterns.md'],
              evidence_anchor_ids: ['anchor-001'],
              locators: ['raw/accepted/design-patterns.md#block-001']
            }
          ],
          upsertArguments: {
            kind: 'topic',
            slug: 'design-patterns',
            title: 'Design Patterns',
            aliases: ['Pattern Intent'],
            summary: 'Pattern overview.',
            tags: ['engineering'],
            source_refs: ['raw/accepted/design-patterns.md'],
            outgoing_links: ['wiki/sources/src-001.md'],
            status: 'active',
            updated_at: '2026-04-23T00:00:00.000Z',
            body: '# Design Patterns\n\n## Pattern Intent\n\nPatch-first systems keep durable notes.\n',
            rationale: 'create deterministic topic draft from insertion plan src-001'
          }
        }
      ]
    },
    sectionsArtifact: {
      sections: [
        {
          sectionId: 'section-001',
          title: 'Pattern Intent',
          summary: 'Patch-first systems keep durable notes.',
          body: 'Patch-first systems keep durable notes.',
          entityIds: ['patch-first-system'],
          assertionIds: ['patch-first-stability'],
          evidenceAnchorIds: ['anchor-001'],
          sourceSectionCandidateIds: ['sec-candidate-001'],
          topicHints: ['design-patterns']
        }
      ]
    },
    mergedKnowledgeArtifact: {
      inputArtifacts: ['state/artifacts/knowledge-insert/run-001/batches/batch-001.json'],
      entities: [{ entityId: 'patch-first-system', name: 'Patch First System' }],
      assertions: [
        {
          assertionId: 'patch-first-stability',
          text: 'Patch-first writes stay stable.',
          sectionCandidateId: 'sec-candidate-001',
          evidenceAnchorIds: ['anchor-001'],
          entityIds: ['patch-first-system']
        }
      ],
      relations: [],
      evidenceAnchors: [
        {
          anchorId: 'anchor-001',
          blockId: 'block-001',
          quote: 'Patch-first systems keep durable notes.',
          title: 'Patterns intro anchor',
          locator: 'design-patterns.md#introduction:p1',
          order: 1,
          heading_path: ['Introduction']
        }
      ],
      sectionCandidates: [
        {
          sectionCandidateId: 'sec-candidate-001',
          title: 'Pattern Intent',
          summary: 'Patch-first systems keep durable notes.',
          entityIds: ['patch-first-system'],
          assertionIds: ['patch-first-stability'],
          evidenceAnchorIds: ['anchor-001']
        }
      ],
      topicHints: [{ topicSlug: 'design-patterns', confidence: 'high' }]
    },
    preparedResourceArtifact: {
      manifestId: 'src-001',
      rawPath: 'raw/accepted/design-patterns.md',
      structuredMarkdown: '# Design Patterns\n\n## Pattern Intent\n\nPatch-first systems keep durable notes.\n',
      sectionHints: [],
      topicHints: ['design-patterns'],
      sections: [{ headingPath: ['Design Patterns', 'Pattern Intent'], startLine: 3, endLine: 5 }],
      metadata: {
        title: 'Design Patterns',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:src-001',
        importedAt: '2026-04-21T00:00:00.000Z',
        preparedAt: '2026-04-23T00:00:00.000Z'
      }
    }
  };
}

function createFakeGraphClient(): GraphDatabaseClient & {
  nodeUpserts: string[];
  edgeUpserts: string[];
} {
  let nodeRows = new Map<string, Record<string, unknown>>();
  let edgeRows = new Map<string, Record<string, unknown>>();
  let activeNodeRows = nodeRows;
  let activeEdgeRows = edgeRows;
  const nodeUpserts: string[] = [];
  const edgeUpserts: string[] = [];

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

      activeNodeRows = transactionNodeRows;
      activeEdgeRows = transactionEdgeRows;

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
      }
    },
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('insert into graph_nodes')) {
        const row = toNodeRow(params ?? []);
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
}

async function seedNode(client: GraphDatabaseClient, node: ReturnType<typeof createGraphNode>): Promise<void> {
  await client.query(
    'insert into graph_nodes (id, kind, title, summary, aliases, status, confidence, provenance, review_state, retrieval_text, attributes, created_at, updated_at) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)',
    toNodeParams(node)
  );
}

async function seedEdge(client: GraphDatabaseClient, edge: ReturnType<typeof createGraphEdge>): Promise<void> {
  await client.query(
    'insert into graph_edges (edge_id, from_id, from_kind, type, to_id, to_kind, status, confidence, provenance, review_state, sort_order, qualifiers, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)',
    toEdgeParams(edge)
  );
}

function toNodeParams(node: ReturnType<typeof createGraphNode>): unknown[] {
  return [
    node.id,
    node.kind,
    node.title,
    node.summary,
    JSON.stringify(node.aliases),
    node.status,
    node.confidence,
    node.provenance,
    node.review_state,
    node.retrieval_text,
    JSON.stringify(node.attributes),
    node.created_at,
    node.updated_at
  ];
}

function toEdgeParams(edge: ReturnType<typeof createGraphEdge>): unknown[] {
  return [
    edge.edge_id,
    edge.from_id,
    edge.from_kind,
    edge.type,
    edge.to_id,
    edge.to_kind,
    edge.status,
    edge.confidence,
    edge.provenance,
    edge.review_state,
    0,
    JSON.stringify(edge.qualifiers),
    edge.created_at,
    edge.updated_at
  ];
}

function toNodeRow(params: unknown[]): Record<string, unknown> {
  return {
    id: String(params[0]),
    kind: String(params[1]),
    title: String(params[2]),
    summary: String(params[3]),
    aliases: JSON.parse(String(params[4])),
    status: String(params[5]),
    confidence: String(params[6]),
    provenance: String(params[7]),
    review_state: String(params[8]),
    retrieval_text: String(params[9]),
    attributes: JSON.parse(String(params[10])),
    created_at: String(params[11]),
    updated_at: String(params[12])
  };
}

function toEdgeRow(params: unknown[]): Record<string, unknown> {
  return {
    edge_id: String(params[0]),
    from_id: String(params[1]),
    from_kind: String(params[2]),
    type: String(params[3]),
    to_id: String(params[4]),
    to_kind: String(params[5]),
    status: String(params[6]),
    confidence: String(params[7]),
    provenance: String(params[8]),
    review_state: String(params[9]),
    qualifiers: JSON.parse(String(params[11])),
    created_at: String(params[12]),
    updated_at: String(params[13])
  };
}

function cloneRowMap(source: Map<string, Record<string, unknown>>): Map<string, Record<string, unknown>> {
  return new Map([...source.entries()].map(([key, value]) => [key, cloneRow(value)]));
}

function cloneRow<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
