import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createKnowledgeInsertGraphWrite } from '../../src/domain/knowledge-insert-graph-write.js';
import { createGraphNode, type GraphNode } from '../../src/domain/graph-node.js';
import type { GraphDatabaseClient } from '../../src/storage/graph-database.js';
import { buildGraphProjection } from '../../src/storage/graph-projection-store.js';
import { loadTopicGraphProjectionInput } from '../../src/storage/load-topic-graph-projection.js';
import { saveKnowledgeInsertGraphWrite } from '../../src/storage/save-knowledge-insert-graph-write.js';

describe('loadTopicGraphProjectionInput', () => {
  it('loads the topic neighborhood needed by buildGraphProjection', async () => {
    const taxonomy = createNode({
      id: 'taxonomy:engineering',
      kind: 'taxonomy',
      title: 'Engineering'
    });
    const topic = createNode({
      id: 'topic:patch-first',
      kind: 'topic',
      title: 'Patch First'
    });
    const section = createNode({
      id: 'section:patch-first-overview',
      kind: 'section',
      title: 'Patch First Overview'
    });
    const entity = createNode({
      id: 'entity:graph-reader',
      kind: 'entity',
      title: 'Graph Reader'
    });
    const assertion = createNode({
      id: 'assertion:patch-first-stability',
      kind: 'assertion',
      title: 'Patch-first graph reads stay stable'
    });
    const evidence = createNode({
      id: 'evidence:patch-first-spec',
      kind: 'evidence',
      title: 'Patch First Spec',
      provenance: 'source-derived',
      attributes: {
        locator: 'spec.md#patch-first',
        excerpt: 'Load enough neighbors to build the projection.'
      }
    });
    const source = createNode({
      id: 'source:patch-first-spec',
      kind: 'source',
      title: 'Patch First Source'
    });
    const unrelatedTopic = createNode({
      id: 'topic:unrelated',
      kind: 'topic',
      title: 'Unrelated'
    });

    const client = createFakeGraphClient({
      nodes: [taxonomy, topic, section, entity, assertion, evidence, source, unrelatedTopic],
      edges: [
        createEdge({
          edge_id: 'edge:belongs-to-taxonomy:patch-first',
          from_id: topic.id,
          from_kind: 'topic',
          type: 'belongs_to_taxonomy',
          to_id: taxonomy.id,
          to_kind: 'taxonomy'
        }),
        createEdge({
          edge_id: 'edge:mentions:patch-first',
          from_id: topic.id,
          from_kind: 'topic',
          type: 'mentions',
          to_id: entity.id,
          to_kind: 'entity'
        }),
        createEdge({
          edge_id: 'edge:part-of:patch-first',
          from_id: section.id,
          from_kind: 'section',
          type: 'part_of',
          to_id: topic.id,
          to_kind: 'topic'
        }),
        createEdge({
          edge_id: 'edge:grounded-by:patch-first',
          from_id: section.id,
          from_kind: 'section',
          type: 'grounded_by',
          to_id: evidence.id,
          to_kind: 'evidence'
        }),
        createEdge({
          edge_id: 'edge:about:patch-first',
          from_id: assertion.id,
          from_kind: 'assertion',
          type: 'about',
          to_id: topic.id,
          to_kind: 'topic'
        }),
        createEdge({
          edge_id: 'edge:supported-by:patch-first',
          from_id: assertion.id,
          from_kind: 'assertion',
          type: 'supported_by',
          to_id: evidence.id,
          to_kind: 'evidence'
        }),
        createEdge({
          edge_id: 'edge:derived-from:patch-first',
          from_id: evidence.id,
          from_kind: 'evidence',
          type: 'derived_from',
          to_id: source.id,
          to_kind: 'source'
        }),
        createEdge({
          edge_id: 'edge:mentions:unrelated',
          from_id: unrelatedTopic.id,
          from_kind: 'topic',
          type: 'mentions',
          to_id: entity.id,
          to_kind: 'entity'
        })
      ]
    });

    const result = await loadTopicGraphProjectionInput(client, 'patch-first');

    expect(result?.rootId).toBe('topic:patch-first');
    expect(result?.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'topic:patch-first',
        'taxonomy:engineering',
        'section:patch-first-overview',
        'entity:graph-reader',
        'assertion:patch-first-stability',
        'evidence:patch-first-spec',
        'source:patch-first-spec'
      ])
    );
    expect(result?.edges.map((edge) => edge.type)).toEqual(
      expect.arrayContaining([
        'belongs_to_taxonomy',
        'part_of',
        'grounded_by',
        'mentions',
        'about',
        'supported_by',
        'derived_from'
      ])
    );
    expect(result?.nodes).toHaveLength(7);
    expect(result?.edges).toHaveLength(7);
    expect(client.calls.slice(0, 7)).toEqual([
      'node:topic:patch-first',
      'outgoing:topic:patch-first',
      'incoming:topic:patch-first',
      'node:taxonomy:engineering',
      'node:entity:graph-reader',
      'node:section:patch-first-overview',
      'node:assertion:patch-first-stability'
    ]);
    expect(client.calls).toEqual(
      expect.arrayContaining([
        'outgoing:section:patch-first-overview',
        'node:evidence:patch-first-spec',
        'outgoing:assertion:patch-first-stability',
        'outgoing:evidence:patch-first-spec',
        'node:source:patch-first-spec'
      ])
    );
  });

  it('returns null when the topic root is missing', async () => {
    const client = createFakeGraphClient({ nodes: [], edges: [] });

    await expect(loadTopicGraphProjectionInput(client, 'missing')).resolves.toBeNull();
    expect(client.calls).toEqual(['node:topic:missing']);
  });

  it('loads a full graph write persisted from knowledge-insert artifacts', async () => {
    const client = createWritableFakeGraphClient();
    const graphWrite = createKnowledgeInsertGraphWrite({
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
    });

    await saveKnowledgeInsertGraphWrite(client, graphWrite);

    const result = await loadTopicGraphProjectionInput(client, 'design-patterns');
    const projection = buildGraphProjection(result!);

    expect(result?.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'topic:design-patterns',
        'taxonomy:engineering',
        'section:design-patterns#1',
        'entity:patch-first-system',
        'assertion:patch-first-stability',
        'evidence:src-001#1',
        'source:src-001'
      ])
    );
    expect(result?.edges.map((edge) => edge.type)).toEqual(
      expect.arrayContaining([
        'belongs_to_taxonomy',
        'part_of',
        'grounded_by',
        'derived_from',
        'mentions',
        'about',
        'supported_by'
      ])
    );
    expect(projection.root.id).toBe('topic:design-patterns');
    expect(projection.sections[0]?.node.id).toBe('section:design-patterns#1');
    expect(projection.sections[0]?.grounding.source_paths).toEqual(['raw/accepted/design-patterns.md']);
    expect(projection.assertions[0]?.evidence[0]?.source?.id).toBe('source:src-001');
  });

  it('recursively loads the rooted taxonomy chain, section tree, mentions, assertions, evidence, and sources', async () => {
    const taxonomyParent = createNode({
      id: 'taxonomy:engineering',
      kind: 'taxonomy',
      title: 'Engineering'
    });
    const taxonomyChild = createNode({
      id: 'taxonomy:platform',
      kind: 'taxonomy',
      title: 'Platform'
    });
    const topic = createNode({
      id: 'topic:graph-projection',
      kind: 'topic',
      title: 'Graph Projection'
    });
    const sectionParent = createNode({
      id: 'section:projection-overview',
      kind: 'section',
      title: 'Projection Overview'
    });
    const sectionChild = createNode({
      id: 'section:projection-overview-details',
      kind: 'section',
      title: 'Projection Details'
    });
    const entityTopic = createNode({
      id: 'entity:graph-reader',
      kind: 'entity',
      title: 'Graph Reader'
    });
    const entitySection = createNode({
      id: 'entity:section-reader',
      kind: 'entity',
      title: 'Section Reader'
    });
    const entityEvidence = createNode({
      id: 'entity:evidence-anchor',
      kind: 'entity',
      title: 'Evidence Anchor'
    });
    const entitySource = createNode({
      id: 'entity:source-index',
      kind: 'entity',
      title: 'Source Index'
    });
    const entityAssertion = createNode({
      id: 'entity:assertion-reader',
      kind: 'entity',
      title: 'Assertion Reader'
    });
    const assertionSection = createNode({
      id: 'assertion:section-claim',
      kind: 'assertion',
      title: 'Section claim'
    });
    const assertionEntity = createNode({
      id: 'assertion:entity-claim',
      kind: 'assertion',
      title: 'Entity claim'
    });
    const evidenceGrounding = createNode({
      id: 'evidence:section-grounding',
      kind: 'evidence',
      title: 'Section grounding',
      provenance: 'source-derived',
      attributes: {
        locator: 'projection.md#section-grounding',
        excerpt: 'Section grounding anchor.'
      }
    });
    const evidenceSectionAssertion = createNode({
      id: 'evidence:section-claim-proof',
      kind: 'evidence',
      title: 'Section claim proof',
      provenance: 'source-derived',
      attributes: {
        locator: 'projection.md#section-claim',
        excerpt: 'Section assertion anchor.'
      }
    });
    const evidenceEntityAssertion = createNode({
      id: 'evidence:entity-claim-proof',
      kind: 'evidence',
      title: 'Entity claim proof',
      provenance: 'source-derived',
      attributes: {
        locator: 'projection.md#entity-claim',
        excerpt: 'Entity assertion anchor.'
      }
    });
    const sourceShared = createNode({
      id: 'source:projection-spec',
      kind: 'source',
      title: 'Projection Spec'
    });
    const sourceEntity = createNode({
      id: 'source:entity-spec',
      kind: 'source',
      title: 'Entity Spec'
    });
    const unrelatedTopic = createNode({
      id: 'topic:unrelated',
      kind: 'topic',
      title: 'Unrelated'
    });

    const client = createFakeGraphClient({
      nodes: [
        taxonomyParent,
        taxonomyChild,
        topic,
        sectionParent,
        sectionChild,
        entityTopic,
        entitySection,
        entityEvidence,
        entitySource,
        entityAssertion,
        assertionSection,
        assertionEntity,
        evidenceGrounding,
        evidenceSectionAssertion,
        evidenceEntityAssertion,
        sourceShared,
        sourceEntity,
        unrelatedTopic
      ],
      edges: [
        createEdge({
          edge_id: 'edge:belongs-to-taxonomy:topic-platform',
          from_id: topic.id,
          from_kind: 'topic',
          type: 'belongs_to_taxonomy',
          to_id: taxonomyChild.id,
          to_kind: 'taxonomy'
        }),
        createEdge({
          edge_id: 'edge:part-of:taxonomy-platform-engineering',
          from_id: taxonomyChild.id,
          from_kind: 'taxonomy',
          type: 'part_of',
          to_id: taxonomyParent.id,
          to_kind: 'taxonomy'
        }),
        createEdge({
          edge_id: 'edge:part-of:section-parent-topic',
          from_id: sectionParent.id,
          from_kind: 'section',
          type: 'part_of',
          to_id: topic.id,
          to_kind: 'topic'
        }),
        createEdge({
          edge_id: 'edge:part-of:section-child-parent',
          from_id: sectionChild.id,
          from_kind: 'section',
          type: 'part_of',
          to_id: sectionParent.id,
          to_kind: 'section'
        }),
        createEdge({
          edge_id: 'edge:mentions:topic-entity',
          from_id: topic.id,
          from_kind: 'topic',
          type: 'mentions',
          to_id: entityTopic.id,
          to_kind: 'entity'
        }),
        createEdge({
          edge_id: 'edge:mentions:section-entity',
          from_id: sectionChild.id,
          from_kind: 'section',
          type: 'mentions',
          to_id: entitySection.id,
          to_kind: 'entity'
        }),
        createEdge({
          edge_id: 'edge:grounded-by:section-evidence',
          from_id: sectionChild.id,
          from_kind: 'section',
          type: 'grounded_by',
          to_id: evidenceGrounding.id,
          to_kind: 'evidence'
        }),
        createEdge({
          edge_id: 'edge:derived-from:evidence-shared-source',
          from_id: evidenceGrounding.id,
          from_kind: 'evidence',
          type: 'derived_from',
          to_id: sourceShared.id,
          to_kind: 'source'
        }),
        createEdge({
          edge_id: 'edge:mentions:evidence-entity',
          from_id: evidenceGrounding.id,
          from_kind: 'evidence',
          type: 'mentions',
          to_id: entityEvidence.id,
          to_kind: 'entity'
        }),
        createEdge({
          edge_id: 'edge:mentions:source-entity',
          from_id: sourceShared.id,
          from_kind: 'source',
          type: 'mentions',
          to_id: entitySource.id,
          to_kind: 'entity'
        }),
        createEdge({
          edge_id: 'edge:about:assertion-section',
          from_id: assertionSection.id,
          from_kind: 'assertion',
          type: 'about',
          to_id: sectionChild.id,
          to_kind: 'section'
        }),
        createEdge({
          edge_id: 'edge:supported-by:assertion-section',
          from_id: assertionSection.id,
          from_kind: 'assertion',
          type: 'supported_by',
          to_id: evidenceSectionAssertion.id,
          to_kind: 'evidence'
        }),
        createEdge({
          edge_id: 'edge:mentions:assertion-entity',
          from_id: assertionSection.id,
          from_kind: 'assertion',
          type: 'mentions',
          to_id: entityAssertion.id,
          to_kind: 'entity'
        }),
        createEdge({
          edge_id: 'edge:derived-from:assertion-section-source',
          from_id: evidenceSectionAssertion.id,
          from_kind: 'evidence',
          type: 'derived_from',
          to_id: sourceShared.id,
          to_kind: 'source'
        }),
        createEdge({
          edge_id: 'edge:about:assertion-entity',
          from_id: assertionEntity.id,
          from_kind: 'assertion',
          type: 'about',
          to_id: entitySource.id,
          to_kind: 'entity'
        }),
        createEdge({
          edge_id: 'edge:supported-by:assertion-entity',
          from_id: assertionEntity.id,
          from_kind: 'assertion',
          type: 'supported_by',
          to_id: evidenceEntityAssertion.id,
          to_kind: 'evidence'
        }),
        createEdge({
          edge_id: 'edge:derived-from:assertion-entity-source',
          from_id: evidenceEntityAssertion.id,
          from_kind: 'evidence',
          type: 'derived_from',
          to_id: sourceEntity.id,
          to_kind: 'source'
        }),
        createEdge({
          edge_id: 'edge:mentions:unrelated-topic',
          from_id: unrelatedTopic.id,
          from_kind: 'topic',
          type: 'mentions',
          to_id: entityTopic.id,
          to_kind: 'entity'
        })
      ]
    });

    const result = await loadTopicGraphProjectionInput(client, 'graph-projection');

    expect(result?.rootId).toBe(topic.id);
    expect(result?.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        topic.id,
        taxonomyParent.id,
        taxonomyChild.id,
        sectionParent.id,
        sectionChild.id,
        entityTopic.id,
        entitySection.id,
        entityEvidence.id,
        entitySource.id,
        entityAssertion.id,
        assertionSection.id,
        assertionEntity.id,
        evidenceGrounding.id,
        evidenceSectionAssertion.id,
        evidenceEntityAssertion.id,
        sourceShared.id,
        sourceEntity.id
      ])
    );
    expect(result?.nodes.map((node) => node.id)).not.toContain(unrelatedTopic.id);
    expect(result?.edges.map((edge) => edge.edge_id)).toEqual(
      expect.arrayContaining([
        'edge:belongs-to-taxonomy:topic-platform',
        'edge:part-of:taxonomy-platform-engineering',
        'edge:part-of:section-parent-topic',
        'edge:part-of:section-child-parent',
        'edge:mentions:topic-entity',
        'edge:mentions:section-entity',
        'edge:grounded-by:section-evidence',
        'edge:derived-from:evidence-shared-source',
        'edge:mentions:evidence-entity',
        'edge:mentions:source-entity',
        'edge:about:assertion-section',
        'edge:supported-by:assertion-section',
        'edge:mentions:assertion-entity',
        'edge:derived-from:assertion-section-source',
        'edge:about:assertion-entity',
        'edge:supported-by:assertion-entity',
        'edge:derived-from:assertion-entity-source'
      ])
    );
    expect(result?.edges.map((edge) => edge.edge_id)).not.toContain('edge:mentions:unrelated-topic');
    expect(result?.nodes).toHaveLength(17);
    expect(result?.edges).toHaveLength(17);
  });
});

function createNode(input: {
  id: string;
  kind: GraphNode['kind'];
  title: string;
  provenance?: GraphNode['provenance'];
  attributes?: Record<string, unknown>;
}): GraphNode {
  return createGraphNode({
    id: input.id,
    kind: input.kind,
    title: input.title,
    status: 'active',
    confidence: 'asserted',
    provenance: input.provenance ?? 'human-edited',
    review_state: 'reviewed',
    retrieval_text: input.title,
    attributes: input.attributes ?? {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
}

function createEdge(input: {
  edge_id: string;
  from_id: string;
  from_kind: Parameters<typeof createGraphEdge>[0]['from_kind'];
  type: Parameters<typeof createGraphEdge>[0]['type'];
  to_id: string;
  to_kind: Parameters<typeof createGraphEdge>[0]['to_kind'];
}) {
  return createGraphEdge({
    ...input,
    status: 'active',
    confidence: 'asserted',
    provenance: input.type === 'derived_from' ? 'source-derived' : 'human-edited',
    review_state: 'reviewed',
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
}

function createFakeGraphClient(input: {
  nodes: GraphNode[];
  edges: ReturnType<typeof createEdge>[];
}): GraphDatabaseClient & { calls: string[] } {
  const nodesById = new Map(input.nodes.map((node) => [node.id, toRow(node)]));
  const edgesByFromId = new Map<string, Record<string, unknown>[]>();
  const edgesByToId = new Map<string, Record<string, unknown>[]>();
  const calls: string[] = [];

  for (const edge of input.edges) {
    const edgeRow = toRow(edge);
    const outgoing = edgesByFromId.get(edge.from_id) ?? [];
    outgoing.push(edgeRow);
    edgesByFromId.set(edge.from_id, outgoing);

    const incoming = edgesByToId.get(edge.to_id) ?? [];
    incoming.push(edgeRow);
    edgesByToId.set(edge.to_id, incoming);
  }

  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      const id = String(params?.[0] ?? '');

      if (sql.includes('from graph_nodes') && sql.includes('where id = $1')) {
        calls.push(`node:${id}`);
        return { rows: nodesById.has(id) ? [nodesById.get(id) as Record<string, unknown>] : [] };
      }

      if (sql.includes('from graph_edges') && sql.includes('where from_id = $1')) {
        calls.push(`outgoing:${id}`);
        return { rows: edgesByFromId.get(id) ?? [] };
      }

      if (sql.includes('from graph_edges') && sql.includes('where to_id = $1')) {
        calls.push(`incoming:${id}`);
        return { rows: edgesByToId.get(id) ?? [] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

function createWritableFakeGraphClient(): GraphDatabaseClient & { calls: string[] } {
  let nodeRows = new Map<string, Record<string, unknown>>();
  let edgeRows = new Map<string, Record<string, unknown>>();
  let activeNodeRows = nodeRows;
  let activeEdgeRows = edgeRows;
  const calls: string[] = [];

  const client: GraphDatabaseClient & { calls: string[] } = {
    calls,
    async transaction<T>(work: (transactionClient: GraphDatabaseClient) => Promise<T>) {
      const transactionNodeRows = cloneRowMap(nodeRows);
      const transactionEdgeRows = cloneRowMap(edgeRows);

      activeNodeRows = transactionNodeRows;
      activeEdgeRows = transactionEdgeRows;

      try {
        const result = await work(client);
        nodeRows = transactionNodeRows;
        edgeRows = transactionEdgeRows;
        return result;
      } finally {
        activeNodeRows = nodeRows;
        activeEdgeRows = edgeRows;
      }
    },
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('insert into graph_nodes')) {
        const row = toStoredNodeRow(params ?? []);
        const existing = activeNodeRows.get(String(row.id));

        if (sql.includes('on conflict (id) do nothing')) {
          if (existing) {
            return { rows: [] };
          }

          activeNodeRows.set(String(row.id), row);
          return { rows: [{ id: row.id }] };
        }

        activeNodeRows.set(String(row.id), existing ? { ...row, created_at: existing.created_at } : row);
        return { rows: [] };
      }

      if (sql.includes('insert into graph_edges')) {
        const row = toStoredEdgeRow(params ?? []);
        const existing = activeEdgeRows.get(String(row.edge_id));

        if (sql.includes('on conflict (edge_id) do nothing')) {
          if (existing) {
            return { rows: [] };
          }

          activeEdgeRows.set(String(row.edge_id), row);
          return { rows: [{ edge_id: row.edge_id }] };
        }

        activeEdgeRows.set(String(row.edge_id), existing ? { ...row, created_at: existing.created_at } : row);
        return { rows: [] };
      }

      const id = String(params?.[0] ?? '');

      if (sql.includes('from graph_nodes') && sql.includes('where id = $1')) {
        calls.push(`node:${id}`);
        return { rows: activeNodeRows.has(id) ? [cloneRow(activeNodeRows.get(id)!)] : [] };
      }

      if (sql.includes('from graph_edges') && sql.includes('where edge_id = $1')) {
        return { rows: activeEdgeRows.has(id) ? [cloneRow(activeEdgeRows.get(id)!)] : [] };
      }

      if (sql.includes('from graph_edges') && sql.includes('where from_id = $1')) {
        calls.push(`outgoing:${id}`);
        const rows = [...activeEdgeRows.values()]
          .filter((row) => row.from_id === id)
          .sort((left, right) => String(left.edge_id).localeCompare(String(right.edge_id)))
          .map(cloneRow);
        return { rows };
      }

      if (sql.includes('from graph_edges') && sql.includes('where to_id = $1')) {
        calls.push(`incoming:${id}`);
        const rows = [...activeEdgeRows.values()]
          .filter((row) => row.to_id === id)
          .sort((left, right) => String(left.edge_id).localeCompare(String(right.edge_id)))
          .map(cloneRow);
        return { rows };
      }

      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  return client;
}

function toRow(value: object): Record<string, unknown> {
  return { ...value };
}

function toStoredNodeRow(params: unknown[]): Record<string, unknown> {
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

function toStoredEdgeRow(params: unknown[]): Record<string, unknown> {
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
