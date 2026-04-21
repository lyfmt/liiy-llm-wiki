import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createGraphNode, type GraphNode } from '../../src/domain/graph-node.js';
import type { GraphDatabaseClient } from '../../src/storage/graph-database.js';
import { loadTopicGraphProjectionInput } from '../../src/storage/load-topic-graph-projection.js';

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

function toRow(value: object): Record<string, unknown> {
  return { ...value };
}
