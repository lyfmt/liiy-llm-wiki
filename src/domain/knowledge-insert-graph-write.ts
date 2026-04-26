import path from 'node:path';

import { createGraphEdge, type GraphEdge } from './graph-edge.js';
import { createGraphNode, type GraphNode } from './graph-node.js';
import type { ConnectedKnowledgeArtifact, PartExtractionConcept } from '../flows/knowledge-insert/pipeline-schema.js';

export interface KnowledgeInsertTopicTaxonomyArtifact {
  topics: KnowledgeInsertTopicTaxonomyEntry[];
}

export interface KnowledgeInsertTopicTaxonomyEntry {
  sourceTopicId: string;
  topicSlug: string;
  topicTitle: string;
  topicAction: string;
  sectionIds: string[];
  taxonomyAction: string;
  taxonomySlug: string | null;
  taxonomy: {
    rootTaxonomySlug: string | null;
    parentTaxonomySlug: string | null;
    leafTaxonomySlug: string | null;
  };
  conflictTaxonomySlugs: string[];
}

export interface KnowledgeInsertTopicDraftArtifact {
  topics: KnowledgeInsertTopicDraft[];
}

export interface KnowledgeInsertTopicDraft {
  topicSlug: string;
  targetPath: string;
  sections: KnowledgeInsertTopicDraftSection[];
  upsertArguments: {
    kind: 'topic';
    slug: string;
    title: string;
    aliases: string[];
    summary: string;
    tags: string[];
    source_refs: string[];
    outgoing_links: string[];
    status: GraphNode['status'];
    updated_at: string;
    body: string;
    rationale: string;
  };
}

export interface KnowledgeInsertTopicDraftSection {
  sectionId: string;
  title: string;
  body: string;
  source_refs: string[];
  evidence_anchor_ids: string[];
  locators: string[];
  parentSectionId?: string;
}

export interface KnowledgeInsertSectionsArtifact {
  sections: KnowledgeInsertSection[];
}

export interface KnowledgeInsertSection {
  sectionId: string;
  title: string;
  summary: string;
  body: string;
  entityIds: string[];
  assertionIds: string[];
  evidenceAnchorIds: string[];
  sourceSectionCandidateIds: string[];
  topicHints: string[];
}

export interface KnowledgeInsertMergedKnowledgeArtifact {
  inputArtifacts: string[];
  entities: KnowledgeInsertEntityCandidate[];
  assertions: KnowledgeInsertAssertionCandidate[];
  relations: Array<Record<string, unknown>>;
  evidenceAnchors: KnowledgeInsertEvidenceAnchor[];
  sectionCandidates: Array<Record<string, unknown>>;
  topicHints: Array<Record<string, unknown>>;
}

export interface KnowledgeInsertEntityCandidate {
  entityId: string;
  name: string;
  [key: string]: unknown;
}

export interface KnowledgeInsertAssertionCandidate {
  assertionId: string;
  text: string;
  sectionCandidateId?: string;
  evidenceAnchorIds?: string[];
  entityIds?: string[];
  [key: string]: unknown;
}

export interface KnowledgeInsertEvidenceAnchor {
  anchorId: string;
  blockId: string;
  quote: string;
  title: string;
  locator: string;
  order: number;
  heading_path: string[];
  // quote is the required source-grounded fallback excerpt when excerpt is not provided.
  // V2 graph write must receive one of these directly from the artifact rather than guessing.
  excerpt?: string;
  [key: string]: unknown;
}

export interface KnowledgeInsertPreparedResourceArtifact {
  manifestId: string;
  rawPath: string;
  structuredMarkdown: string;
  sectionHints: string[];
  topicHints: string[];
  sections: Array<{
    headingPath: string[];
    startLine: number;
    endLine: number;
  }>;
  metadata: {
    title: string;
    type: string;
    status: string;
    hash: string;
    importedAt: string;
    preparedAt: string;
  };
}

export interface CreateKnowledgeInsertGraphWriteInput {
  topicTaxonomyArtifact: KnowledgeInsertTopicTaxonomyArtifact;
  topicDraftsArtifact: KnowledgeInsertTopicDraftArtifact;
  sectionsArtifact: KnowledgeInsertSectionsArtifact;
  mergedKnowledgeArtifact: KnowledgeInsertMergedKnowledgeArtifact;
  preparedResourceArtifact: KnowledgeInsertPreparedResourceArtifact;
}

export interface KnowledgeInsertGraphWrite {
  sourceId: string;
  topicIds: string[];
  sectionIdMap: Record<string, string>;
  evidenceIdMap: Record<string, string>;
  conceptIdMap?: Record<string, string>;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface AssertionUsage {
  sectionIds: Set<string>;
  topicIds: Set<string>;
  entityIds: Set<string>;
  evidenceAnchorIds: Set<string>;
}

interface EvidenceUsage {
  entityIds: Set<string>;
}

export function createKnowledgeInsertGraphWrite(input: CreateKnowledgeInsertGraphWriteInput): KnowledgeInsertGraphWrite {
  const savedAt = resolveSavedAt(input.preparedResourceArtifact);
  const sourceId = toSourceId(input.preparedResourceArtifact.manifestId);
  const sourceNode = buildSourceNode(input.preparedResourceArtifact, savedAt);
  const topicTaxonomyTopics = buildUniqueMap(
    input.topicTaxonomyArtifact.topics,
    (topic) => topic.topicSlug,
    (topicSlug) => `Duplicate topic taxonomy topic slug: ${topicSlug}`
  );
  const topicDraftsBySlug = buildUniqueMap(
    input.topicDraftsArtifact.topics,
    (draft) => draft.topicSlug,
    (slug) => `Duplicate topic draft slug: ${slug}`
  );
  const sectionsById = buildUniqueMap(
    input.sectionsArtifact.sections,
    (section) => section.sectionId,
    (sectionId) => `Duplicate section id: ${sectionId}`
  );
  const entitiesById = buildUniqueMap(
    input.mergedKnowledgeArtifact.entities,
    (entity) => normalizeSemanticId('entity', entity.entityId),
    (entityId) => `Duplicate entity candidate: ${entityId}`
  );
  const assertionsById = buildUniqueMap(
    input.mergedKnowledgeArtifact.assertions,
    (assertion) => normalizeSemanticId('assertion', assertion.assertionId),
    (assertionId) => `Duplicate assertion candidate: ${assertionId}`
  );
  const evidenceAnchorsById = buildUniqueMap(
    input.mergedKnowledgeArtifact.evidenceAnchors.map(validateEvidenceAnchor),
    (anchor) => anchor.anchorId,
    (anchorId) => `Duplicate evidence anchor id: ${anchorId}`
  );
  const evidenceIdsByAnchorId = createEvidenceIdsByAnchorId(input.preparedResourceArtifact.manifestId, evidenceAnchorsById);
  const sectionIdMap = new Map<string, string>();
  const evidenceUsageByAnchorId = new Map<string, EvidenceUsage>();
  const assertionUsageById = new Map<string, AssertionUsage>();
  const topicEntityIds = new Map<string, Set<string>>();
  const nodesById = new Map<string, GraphNode>([[sourceNode.id, sourceNode]]);
  const edgesById = new Map<string, GraphEdge>();

  for (const topicPlacement of topicTaxonomyTopics.values()) {
    if (topicPlacement.taxonomyAction === 'conflict') {
      throw new Error(`Cannot write graph for taxonomy conflict topic: ${topicPlacement.topicSlug}`);
    }

    const topicDraft = topicDraftsBySlug.get(topicPlacement.topicSlug);

    if (!topicDraft) {
      throw new Error(`Missing topic draft artifact for topic: ${topicPlacement.topicSlug}`);
    }

    const taxonomyIds = collectTaxonomyIds(topicPlacement);

    for (const taxonomyId of taxonomyIds) {
      nodesById.set(taxonomyId, buildTaxonomyNode(taxonomyId, savedAt));
    }

    for (const [childId, parentId] of collectTaxonomyEdges(topicPlacement)) {
      edgesById.set(edgeId('part_of', childId, parentId), buildEdge('part_of', childId, 'taxonomy', parentId, 'taxonomy', savedAt));
    }

    const topicId = toTopicId(topicDraft.topicSlug);
    const topicNode = buildTopicNode(topicDraft, savedAt);
    nodesById.set(topicId, topicNode);

    const taxonomyTargetId = resolveTopicTaxonomyTargetId(topicPlacement);
    edgesById.set(
      edgeId('belongs_to_taxonomy', topicId, taxonomyTargetId),
      buildEdge('belongs_to_taxonomy', topicId, 'topic', taxonomyTargetId, 'taxonomy', savedAt)
    );

    const currentTopicEntityIds = topicEntityIds.get(topicId) ?? new Set<string>();
    topicEntityIds.set(topicId, currentTopicEntityIds);

    for (const [index, draftSection] of topicDraft.sections.entries()) {
      const sectionGraphId = `section:${topicDraft.topicSlug}#${index + 1}`;
      const existingSectionId = sectionIdMap.get(draftSection.sectionId);

      if (existingSectionId && existingSectionId !== sectionGraphId) {
        throw new Error(`Section appears under multiple topic drafts: ${draftSection.sectionId}`);
      }

      sectionIdMap.set(draftSection.sectionId, sectionGraphId);
    }

    for (const [index, draftSection] of topicDraft.sections.entries()) {
      const sectionGraphId = `section:${topicDraft.topicSlug}#${index + 1}`;
      const normalizedSection = sectionsById.get(draftSection.sectionId);
      const sectionEntityIds = uniqueStrings([
        ...normalizeSemanticIds('entity', normalizedSection?.entityIds ?? []),
        ...normalizeSemanticIds('entity', readStringArray((normalizedSection as Record<string, unknown> | undefined)?.entityIds))
      ]);
      const sectionAssertionIds = uniqueStrings([
        ...normalizeSemanticIds('assertion', normalizedSection?.assertionIds ?? []),
        ...normalizeSemanticIds('assertion', readStringArray((normalizedSection as Record<string, unknown> | undefined)?.assertionIds))
      ]);
      const sectionEvidenceAnchorIds = uniqueStrings([
        ...draftSection.evidence_anchor_ids,
        ...(normalizedSection?.evidenceAnchorIds ?? []),
        ...readStringArray((normalizedSection as Record<string, unknown> | undefined)?.evidenceAnchorIds)
      ]);
      const parentSectionId = draftSection.parentSectionId?.trim();
      const parentGraphId = parentSectionId ? sectionIdMap.get(parentSectionId) : null;
      if (parentSectionId && !parentGraphId) {
        throw new Error(`Missing parent section mapping: ${parentSectionId}`);
      }
      const parentTargetId = parentGraphId ?? topicId;
      const parentTargetKind = parentGraphId ? 'section' : 'topic';
      const groundedEvidenceIds = uniqueStrings(
        sectionEvidenceAnchorIds.map((anchorId) => {
          const evidenceId = evidenceIdsByAnchorId.get(anchorId);

          if (!evidenceId) {
            throw new Error(`Missing evidence anchor for section: ${anchorId}`);
          }

          return evidenceId;
        })
      );

      nodesById.set(
        sectionGraphId,
        buildSectionNode(draftSection, normalizedSection, groundedEvidenceIds, sectionGraphId, savedAt)
      );
      edgesById.set(
        edgeId('part_of', sectionGraphId, parentTargetId),
        buildEdge('part_of', sectionGraphId, 'section', parentTargetId, parentTargetKind, savedAt)
      );

      for (const entityId of sectionEntityIds) {
        currentTopicEntityIds.add(entityId);
        getOrCreateSet(topicEntityIds, topicId).add(entityId);
        nodesById.set(entityId, buildEntityNode(entityId, entitiesById.get(entityId), savedAt));
        edgesById.set(edgeId('mentions', sectionGraphId, entityId), buildEdge('mentions', sectionGraphId, 'section', entityId, 'entity', savedAt));
      }

      for (const anchorId of sectionEvidenceAnchorIds) {
        const evidenceId = evidenceIdsByAnchorId.get(anchorId);

        if (!evidenceId) {
          throw new Error(`Missing evidence anchor for section: ${anchorId}`);
        }

        edgesById.set(
          edgeId('grounded_by', sectionGraphId, evidenceId),
          buildEdge('grounded_by', sectionGraphId, 'section', evidenceId, 'evidence', savedAt)
        );

        const evidenceUsage = getOrCreateEvidenceUsage(evidenceUsageByAnchorId, anchorId);

        for (const entityId of sectionEntityIds) {
          evidenceUsage.entityIds.add(entityId);
        }
      }

      for (const assertionId of sectionAssertionIds) {
        const usage = getOrCreateAssertionUsage(assertionUsageById, assertionId);
        usage.sectionIds.add(sectionGraphId);
        usage.topicIds.add(topicId);

        const assertionCandidate = assertionsById.get(assertionId);
        if (!assertionCandidate) {
          throw new Error(`Missing assertion candidate: ${assertionId}`);
        }
        const assertionEntityIds = uniqueStrings([
          ...sectionEntityIds,
          ...normalizeSemanticIds('entity', readStringArray(assertionCandidate?.entityIds))
        ]);
        const assertionEvidenceAnchorIds = uniqueStrings([
          ...sectionEvidenceAnchorIds,
          ...readStringArray(assertionCandidate?.evidenceAnchorIds)
        ]);

        for (const entityId of assertionEntityIds) {
          usage.entityIds.add(entityId);
          currentTopicEntityIds.add(entityId);
          nodesById.set(entityId, buildEntityNode(entityId, entitiesById.get(entityId), savedAt));
        }

        for (const anchorId of assertionEvidenceAnchorIds) {
          usage.evidenceAnchorIds.add(anchorId);
          const evidenceId = evidenceIdsByAnchorId.get(anchorId);

          if (!evidenceId) {
            throw new Error(`Missing evidence anchor for assertion: ${anchorId}`);
          }

          const evidenceUsage = getOrCreateEvidenceUsage(evidenceUsageByAnchorId, anchorId);

          for (const entityId of assertionEntityIds) {
            evidenceUsage.entityIds.add(entityId);
          }
        }
      }
    }

    for (const entityId of currentTopicEntityIds) {
      edgesById.set(edgeId('mentions', topicId, entityId), buildEdge('mentions', topicId, 'topic', entityId, 'entity', savedAt));
    }
  }

  const evidenceIdMap = new Map<string, string>();

  for (const anchorId of [...evidenceUsageByAnchorId.keys()].sort((left, right) => {
    const leftId = evidenceIdsByAnchorId.get(left) ?? '';
    const rightId = evidenceIdsByAnchorId.get(right) ?? '';
    return leftId.localeCompare(rightId);
  })) {
    const anchor = evidenceAnchorsById.get(anchorId);

    if (!anchor) {
      throw new Error(`Missing evidence anchor: ${anchorId}`);
    }

    const evidenceId = evidenceIdsByAnchorId.get(anchorId);

    if (!evidenceId) {
      throw new Error(`Missing evidence id mapping for anchor: ${anchorId}`);
    }

    evidenceIdMap.set(anchorId, evidenceId);
    nodesById.set(
      evidenceId,
      buildEvidenceNode(anchor, evidenceId, anchor.order, input.preparedResourceArtifact, savedAt)
    );
    edgesById.set(edgeId('derived_from', evidenceId, sourceId), buildEdge('derived_from', evidenceId, 'evidence', sourceId, 'source', savedAt));

    const evidenceUsage = evidenceUsageByAnchorId.get(anchorId);

    for (const entityId of evidenceUsage?.entityIds ?? []) {
      nodesById.set(entityId, buildEntityNode(entityId, entitiesById.get(entityId), savedAt));
      edgesById.set(edgeId('mentions', evidenceId, entityId), buildEdge('mentions', evidenceId, 'evidence', entityId, 'entity', savedAt));
    }
  }

  const sourceEntityIds = new Set<string>();

  for (const [assertionId, usage] of assertionUsageById) {
    const assertionCandidate = assertionsById.get(assertionId);
    if (!assertionCandidate) {
      throw new Error(`Missing assertion candidate: ${assertionId}`);
    }
    nodesById.set(assertionId, buildAssertionNode(assertionId, assertionCandidate, savedAt));

    for (const sectionId of [...usage.sectionIds].sort(compareStrings)) {
      edgesById.set(edgeId('about', assertionId, sectionId), buildEdge('about', assertionId, 'assertion', sectionId, 'section', savedAt));
    }

    for (const entityId of [...usage.entityIds].sort(compareStrings)) {
      edgesById.set(edgeId('about', assertionId, entityId), buildEdge('about', assertionId, 'assertion', entityId, 'entity', savedAt));
    }

    for (const topicId of [...usage.topicIds].sort(compareStrings)) {
      edgesById.set(edgeId('about', assertionId, topicId), buildEdge('about', assertionId, 'assertion', topicId, 'topic', savedAt));
    }

    for (const entityId of usage.entityIds) {
      sourceEntityIds.add(entityId);
      nodesById.set(entityId, buildEntityNode(entityId, entitiesById.get(entityId), savedAt));
      edgesById.set(edgeId('mentions', assertionId, entityId), buildEdge('mentions', assertionId, 'assertion', entityId, 'entity', savedAt));
    }

    for (const anchorId of usage.evidenceAnchorIds) {
      const evidenceId = evidenceIdMap.get(anchorId);

      if (!evidenceId) {
        throw new Error(`Missing evidence mapping for assertion anchor: ${anchorId}`);
      }

      edgesById.set(edgeId('supported_by', assertionId, evidenceId), buildEdge('supported_by', assertionId, 'assertion', evidenceId, 'evidence', savedAt));
    }
  }

  for (const topicEntities of topicEntityIds.values()) {
    for (const entityId of topicEntities) {
      sourceEntityIds.add(entityId);
    }
  }

  for (const entityId of sourceEntityIds) {
    nodesById.set(entityId, buildEntityNode(entityId, entitiesById.get(entityId), savedAt));
    edgesById.set(edgeId('mentions', sourceId, entityId), buildEdge('mentions', sourceId, 'source', entityId, 'entity', savedAt));
  }

  return {
    sourceId,
    topicIds: uniqueStrings([...topicTaxonomyTopics.values()].map((entry) => toTopicId(entry.topicSlug))).sort(compareStrings),
    sectionIdMap: Object.fromEntries([...sectionIdMap.entries()].sort(compareTuple)),
    evidenceIdMap: Object.fromEntries([...evidenceIdMap.entries()].sort(compareTuple)),
    nodes: [...nodesById.values()].sort(compareNodes),
    edges: [...edgesById.values()].sort(compareEdges)
  };
}

export function createKnowledgeInsertGraphWriteFromConnectedKnowledge(
  connected: ConnectedKnowledgeArtifact,
  savedAt = new Date().toISOString()
): KnowledgeInsertGraphWrite {
  const sourceId = toSourceId(connected.sourceId);
  const nodesById = new Map<string, GraphNode>();
  const edgesById = new Map<string, GraphEdge>();
  const sectionIdMap = new Map<string, string>();
  const evidenceIdMap = new Map<string, string>();
  const conceptIdMap = new Map<string, string>();
  const topicIds = connected.topics.map((topic) => toTopicId(topic.slug)).sort(compareStrings);
  const topicsByTopicId = new Map(connected.topics.map((topic) => [topic.topicId, topic]));
  const topicSlugByTopicId = new Map(connected.topics.map((topic) => [topic.topicId, topic.slug]));
  const entitiesById = new Map(connected.entities.map((entity) => [entity.entityId, entity]));
  const conceptsById = new Map(connected.concepts.map((concept) => [concept.conceptId, concept]));
  const evidenceById = new Map(connected.evidenceAnchors.map((anchor) => [anchor.anchorId, anchor]));
  const sourceConceptIds = new Set<string>();
  const sourceEntityIds = new Set<string>();
  const topicConceptIds = new Map<string, Set<string>>();
  const topicEntityIds = new Map<string, Set<string>>();

  nodesById.set(sourceId, createGraphNode({
    id: sourceId,
    kind: 'source',
    title: connected.sourceId,
    summary: '',
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    retrieval_text: connected.sourceId,
    attributes: { source_id: connected.sourceId },
    created_at: savedAt,
    updated_at: savedAt
  }));

  for (const topic of connected.topics) {
    const topicId = toTopicId(topic.slug);
    nodesById.set(topicId, createGraphNode({
      id: topicId,
      kind: 'topic',
      title: topic.title,
      summary: topic.scope,
      aliases: [],
      status: 'active',
      confidence: 'asserted',
      provenance: 'agent-synthesized',
      review_state: 'reviewed',
      retrieval_text: `${topic.title}\n${topic.scope}`.trim(),
      attributes: { slug: topic.slug, source_topic_id: topic.topicId, rationale: topic.rationale },
      created_at: savedAt,
      updated_at: savedAt
    }));
    topicConceptIds.set(topicId, new Set<string>());
    topicEntityIds.set(topicId, new Set<string>());
  }

  for (const concept of connected.concepts) {
    const graphConceptId = toConceptId(concept);
    conceptIdMap.set(concept.conceptId, graphConceptId);
    nodesById.set(graphConceptId, buildConceptNode(graphConceptId, concept, savedAt));
  }

  for (const entity of connected.entities) {
    const graphEntityId = normalizeSemanticId('entity', entity.entityId);
    nodesById.set(graphEntityId, createGraphNode({
      id: graphEntityId,
      kind: 'entity',
      title: entity.name,
      summary: entity.summary,
      aliases: entity.aliases,
      status: 'active',
      confidence: 'asserted',
      provenance: 'agent-extracted',
      review_state: 'reviewed',
      retrieval_text: `${entity.name}\n${entity.summary}`.trim(),
      attributes: { source_entity_id: entity.entityId },
      created_at: savedAt,
      updated_at: savedAt
    }));
  }

  for (const [index, evidence] of connected.evidenceAnchors.entries()) {
    const evidenceId = toEvidenceId(connected.sourceId, index + 1);
    evidenceIdMap.set(evidence.anchorId, evidenceId);
    nodesById.set(evidenceId, createGraphNode({
      id: evidenceId,
      kind: 'evidence',
      title: evidence.locator,
      summary: evidence.quote,
      aliases: [],
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      retrieval_text: `${evidence.locator}\n${evidence.quote}`.trim(),
      attributes: {
        locator: evidence.locator,
        excerpt: evidence.quote,
        start_line: evidence.startLine,
        end_line: evidence.endLine,
        source_anchor_id: evidence.anchorId
      },
      created_at: savedAt,
      updated_at: savedAt
    }));
    edgesById.set(edgeId('derived_from', evidenceId, sourceId), buildEdge('derived_from', evidenceId, 'evidence', sourceId, 'source', savedAt));
  }

  const sectionOrderByTopicSlug = new Map<string, number>();
  for (const section of connected.sections) {
    const firstTopicId = section.topicIds[0];
    const firstTopicSlug = firstTopicId ? topicSlugByTopicId.get(firstTopicId) : undefined;
    if (!firstTopicSlug) {
      throw new Error(`Missing topic for section: ${section.sectionId}`);
    }
    const nextOrder = (sectionOrderByTopicSlug.get(firstTopicSlug) ?? 0) + 1;
    sectionOrderByTopicSlug.set(firstTopicSlug, nextOrder);
    const sectionGraphId = `section:${firstTopicSlug}#${nextOrder}`;
    sectionIdMap.set(section.sectionId, sectionGraphId);
    nodesById.set(sectionGraphId, createGraphNode({
      id: sectionGraphId,
      kind: 'section',
      title: section.title,
      summary: section.body,
      aliases: [],
      status: 'active',
      confidence: 'asserted',
      provenance: 'agent-synthesized',
      review_state: 'reviewed',
      retrieval_text: `${section.title}\n${section.body}`.trim(),
      attributes: {
        source_section_id: section.sectionId,
        grounded_evidence_ids: section.evidenceAnchorIds.map((anchorId) => evidenceIdMap.get(anchorId)).filter(Boolean)
      },
      created_at: savedAt,
      updated_at: savedAt
    }));

    for (const topicId of section.topicIds) {
      const topic = topicsByTopicId.get(topicId);
      if (!topic) {
        throw new Error(`Missing topic for section: ${topicId}`);
      }
      const graphTopicId = toTopicId(topic.slug);
      edgesById.set(edgeId('part_of', sectionGraphId, graphTopicId), buildEdge('part_of', sectionGraphId, 'section', graphTopicId, 'topic', savedAt));
      for (const conceptId of section.conceptIds) {
        getOrCreateSet(topicConceptIds, graphTopicId).add(conceptId);
      }
      for (const entityId of section.entityIds) {
        getOrCreateSet(topicEntityIds, graphTopicId).add(entityId);
      }
    }

    for (const entityId of section.entityIds) {
      const graphEntityId = normalizeSemanticId('entity', entityId);
      if (!entitiesById.has(entityId)) {
        throw new Error(`Missing entity for section: ${entityId}`);
      }
      sourceEntityIds.add(entityId);
      edgesById.set(edgeId('mentions', sectionGraphId, graphEntityId), buildEdge('mentions', sectionGraphId, 'section', graphEntityId, 'entity', savedAt));
    }

    for (const conceptId of section.conceptIds) {
      const graphConceptId = conceptIdMap.get(conceptId);
      if (!graphConceptId || !conceptsById.has(conceptId)) {
        throw new Error(`Missing concept for section: ${conceptId}`);
      }
      sourceConceptIds.add(conceptId);
      edgesById.set(edgeId('mentions', sectionGraphId, graphConceptId), buildEdge('mentions', sectionGraphId, 'section', graphConceptId, 'concept', savedAt));
    }

    for (const anchorId of section.evidenceAnchorIds) {
      const evidenceId = evidenceIdMap.get(anchorId);
      if (!evidenceId || !evidenceById.has(anchorId)) {
        throw new Error(`Missing evidence for section: ${anchorId}`);
      }
      edgesById.set(edgeId('grounded_by', sectionGraphId, evidenceId), buildEdge('grounded_by', sectionGraphId, 'section', evidenceId, 'evidence', savedAt));
    }
  }

  for (const [topicId, conceptIds] of topicConceptIds) {
    for (const conceptId of conceptIds) {
      const graphConceptId = conceptIdMap.get(conceptId);
      if (graphConceptId) {
        edgesById.set(edgeId('mentions', topicId, graphConceptId), buildEdge('mentions', topicId, 'topic', graphConceptId, 'concept', savedAt));
      }
    }
  }

  for (const [topicId, entityIds] of topicEntityIds) {
    for (const entityId of entityIds) {
      const graphEntityId = normalizeSemanticId('entity', entityId);
      edgesById.set(edgeId('mentions', topicId, graphEntityId), buildEdge('mentions', topicId, 'topic', graphEntityId, 'entity', savedAt));
    }
  }

  for (const conceptId of sourceConceptIds) {
    const graphConceptId = conceptIdMap.get(conceptId);
    if (graphConceptId) {
      edgesById.set(edgeId('mentions', sourceId, graphConceptId), buildEdge('mentions', sourceId, 'source', graphConceptId, 'concept', savedAt));
    }
  }

  for (const entityId of sourceEntityIds) {
    const graphEntityId = normalizeSemanticId('entity', entityId);
    edgesById.set(edgeId('mentions', sourceId, graphEntityId), buildEdge('mentions', sourceId, 'source', graphEntityId, 'entity', savedAt));
  }

  return {
    sourceId,
    topicIds,
    sectionIdMap: Object.fromEntries([...sectionIdMap.entries()].sort(compareTuple)),
    evidenceIdMap: Object.fromEntries([...evidenceIdMap.entries()].sort(compareTuple)),
    conceptIdMap: Object.fromEntries([...conceptIdMap.entries()].sort(compareTuple)),
    nodes: [...nodesById.values()].sort(compareNodes),
    edges: [...edgesById.values()].sort(compareEdges)
  };
}

function buildTaxonomyNode(taxonomyId: string, savedAt: string): GraphNode {
  const slug = taxonomyId.slice('taxonomy:'.length);

  return createGraphNode({
    id: taxonomyId,
    kind: 'taxonomy',
    title: titleizeSlug(slug),
    summary: '',
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-synthesized',
    review_state: 'reviewed',
    retrieval_text: titleizeSlug(slug),
    attributes: {
      slug
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildTopicNode(topicDraft: KnowledgeInsertTopicDraft, savedAt: string): GraphNode {
  return createGraphNode({
    id: toTopicId(topicDraft.topicSlug),
    kind: 'topic',
    title: topicDraft.upsertArguments.title,
    summary: topicDraft.upsertArguments.summary,
    aliases: [],
    status: topicDraft.upsertArguments.status,
    confidence: 'asserted',
    provenance: 'agent-synthesized',
    review_state: 'reviewed',
    retrieval_text: `${topicDraft.upsertArguments.title}\n${topicDraft.upsertArguments.summary}`.trim(),
    attributes: {
      slug: topicDraft.topicSlug
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildSectionNode(
  draftSection: KnowledgeInsertTopicDraftSection,
  normalizedSection: KnowledgeInsertSection | undefined,
  groundedEvidenceIds: string[],
  sectionGraphId: string,
  savedAt: string
): GraphNode {
  const summary = normalizedSection?.summary ?? summarizeBody(normalizedSection?.body ?? draftSection.body);

  return createGraphNode({
    id: sectionGraphId,
    kind: 'section',
    title: draftSection.title,
    summary,
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-synthesized',
    review_state: 'reviewed',
    retrieval_text: `${draftSection.title}\n${summary}`.trim(),
    attributes: {
      grounded_evidence_ids: groundedEvidenceIds
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildEvidenceNode(
  anchor: KnowledgeInsertEvidenceAnchor,
  evidenceId: string,
  _order: number,
  _preparedResource: KnowledgeInsertPreparedResourceArtifact,
  savedAt: string
): GraphNode {
  const excerpt = readString(anchor.excerpt) ?? anchor.quote.trim();

  return createGraphNode({
    id: evidenceId,
    kind: 'evidence',
    title: anchor.title,
    summary: excerpt,
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    retrieval_text: `${anchor.title}\n${excerpt}`.trim(),
    attributes: {
      locator: anchor.locator,
      excerpt,
      order: anchor.order,
      heading_path: [...anchor.heading_path]
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildSourceNode(preparedResource: KnowledgeInsertPreparedResourceArtifact, savedAt: string): GraphNode {
  return createGraphNode({
    id: toSourceId(preparedResource.manifestId),
    kind: 'source',
    title: path.posix.basename(preparedResource.rawPath),
    summary: '',
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    retrieval_text: preparedResource.rawPath,
    attributes: {
      path: preparedResource.rawPath,
      source_id: preparedResource.manifestId
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildEntityNode(entityId: string, candidate: KnowledgeInsertEntityCandidate | undefined, savedAt: string): GraphNode {
  if (!candidate) {
    throw new Error(`Missing entity candidate: ${entityId}`);
  }

  return createGraphNode({
    id: entityId,
    kind: 'entity',
    title: candidate.name.trim(),
    summary: readString(candidate.summary) ?? '',
    aliases: readStringArray(candidate.aliases),
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-extracted',
    review_state: 'reviewed',
    retrieval_text: [candidate.name, readString(candidate.summary) ?? ''].filter(Boolean).join('\n'),
    attributes: {
      source_entity_id: candidate.entityId,
      ...sanitizeAttributes(candidate, ['entityId', 'name', 'summary', 'aliases'])
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildAssertionNode(
  assertionId: string,
  candidate: KnowledgeInsertAssertionCandidate | undefined,
  savedAt: string
): GraphNode {
  if (!candidate) {
    throw new Error(`Missing assertion candidate: ${assertionId}`);
  }

  const statement = candidate.text.trim();

  return createGraphNode({
    id: assertionId,
    kind: 'assertion',
    title: readString(candidate.title) ?? titleizeSlug(assertionId.slice('assertion:'.length)),
    summary: statement,
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-extracted',
    review_state: 'reviewed',
    retrieval_text: statement,
    attributes: {
      statement,
      source_assertion_id: candidate.assertionId,
      section_candidate_id: candidate.sectionCandidateId ?? null,
      evidence_anchor_ids: [...readStringArray(candidate.evidenceAnchorIds)],
      ...sanitizeAttributes(candidate, ['assertionId', 'text', 'title', 'sectionCandidateId', 'evidenceAnchorIds'])
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildEdge(
  type: GraphEdge['type'],
  fromId: string,
  fromKind: GraphEdge['from_kind'],
  toId: string,
  toKind: GraphEdge['to_kind'],
  savedAt: string
): GraphEdge {
  return createGraphEdge({
    edge_id: edgeId(type, fromId, toId),
    from_id: fromId,
    from_kind: fromKind,
    type,
    to_id: toId,
    to_kind: toKind,
    status: 'active',
    confidence: 'asserted',
    provenance: type === 'grounded_by' || type === 'derived_from' ? 'source-derived' : 'agent-synthesized',
    review_state: 'reviewed',
    qualifiers: {},
    created_at: savedAt,
    updated_at: savedAt
  });
}

function resolveSavedAt(preparedResource: KnowledgeInsertPreparedResourceArtifact): string {
  const preparedAt = preparedResource.metadata.preparedAt?.trim();
  const importedAt = preparedResource.metadata.importedAt?.trim();

  if (preparedAt) {
    return preparedAt;
  }

  if (importedAt) {
    return importedAt;
  }

  throw new Error('Invalid prepared resource artifact');
}

function collectTaxonomyIds(entry: KnowledgeInsertTopicTaxonomyEntry): string[] {
  return uniqueStrings([
    ...(entry.taxonomy.rootTaxonomySlug ? [toTaxonomyId(entry.taxonomy.rootTaxonomySlug)] : []),
    ...(entry.taxonomy.parentTaxonomySlug ? [toTaxonomyId(entry.taxonomy.parentTaxonomySlug)] : []),
    ...(entry.taxonomy.leafTaxonomySlug ? [toTaxonomyId(entry.taxonomy.leafTaxonomySlug)] : []),
    ...(entry.taxonomySlug ? [toTaxonomyId(entry.taxonomySlug)] : [])
  ]);
}

function collectTaxonomyEdges(entry: KnowledgeInsertTopicTaxonomyEntry): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const rootId = entry.taxonomy.rootTaxonomySlug ? toTaxonomyId(entry.taxonomy.rootTaxonomySlug) : null;
  const parentId = entry.taxonomy.parentTaxonomySlug ? toTaxonomyId(entry.taxonomy.parentTaxonomySlug) : null;
  const leafId = entry.taxonomy.leafTaxonomySlug ? toTaxonomyId(entry.taxonomy.leafTaxonomySlug) : null;

  if (rootId && parentId && rootId !== parentId) {
    pairs.push([parentId, rootId]);
  }

  if (leafId && parentId && leafId !== parentId) {
    pairs.push([leafId, parentId]);
  } else if (leafId && rootId && leafId !== rootId && !parentId) {
    pairs.push([leafId, rootId]);
  }

  return uniqueTuples(pairs);
}

function resolveTopicTaxonomyTargetId(entry: KnowledgeInsertTopicTaxonomyEntry): string {
  const targetSlug = entry.taxonomy.leafTaxonomySlug ?? entry.taxonomySlug ?? entry.taxonomy.rootTaxonomySlug;

  if (!targetSlug) {
    throw new Error(`Missing taxonomy target for topic: ${entry.topicSlug}`);
  }

  return toTaxonomyId(targetSlug);
}

function edgeId(type: GraphEdge['type'], fromId: string, toId: string): string {
  return `edge:${type}:${fromId}->${toId}`;
}

function toSourceId(manifestId: string): string {
  return `source:${manifestId}`;
}

function toTopicId(slug: string): string {
  return `topic:${slug}`;
}

function toTaxonomyId(slug: string): string {
  return `taxonomy:${slug}`;
}

function toEvidenceId(manifestId: string, order: number): string {
  return `evidence:${manifestId}#${order}`;
}

function toConceptId(concept: PartExtractionConcept): string {
  const slug = slugifyStableId(concept.conceptId.replace(/^concept[:-]?/u, '') || concept.name);
  return `concept:${slug}`;
}

function buildConceptNode(conceptId: string, concept: PartExtractionConcept, savedAt: string): GraphNode {
  return createGraphNode({
    id: conceptId,
    kind: 'concept',
    title: concept.name,
    summary: concept.summary,
    aliases: concept.aliases,
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-extracted',
    review_state: 'reviewed',
    retrieval_text: `${concept.name}\n${concept.summary}`.trim(),
    attributes: {
      source_concept_id: concept.conceptId
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function normalizeSemanticIds(prefix: 'entity' | 'assertion', values: string[]): string[] {
  return values.map((value) => normalizeSemanticId(prefix, value));
}

function normalizeSemanticId(prefix: 'entity' | 'assertion', value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(`${prefix}:`) ? trimmed : `${prefix}:${trimmed}`;
}

function slugifyStableId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'concept';
}

function titleizeSlug(value: string): string {
  return value
    .split(/[-_]/u)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(' ');
}

function summarizeBody(value: string): string {
  return value.trim().split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function validateEvidenceAnchor(anchor: KnowledgeInsertEvidenceAnchor): KnowledgeInsertEvidenceAnchor {
  const title = readString(anchor.title);

  if (!title) {
    throw new Error(`Evidence anchor ${anchor.anchorId} is missing required field: title`);
  }

  const locator = readString(anchor.locator);

  if (!locator) {
    throw new Error(`Evidence anchor ${anchor.anchorId} is missing required field: locator`);
  }

  if (!Number.isInteger(anchor.order) || anchor.order < 1) {
    throw new Error(`Evidence anchor ${anchor.anchorId} must have a positive integer order`);
  }

  if (!Array.isArray(anchor.heading_path) || anchor.heading_path.length === 0 || anchor.heading_path.some((entry) => readString(entry) === null)) {
    throw new Error(`Evidence anchor ${anchor.anchorId} is missing required field: heading_path`);
  }

  const quote = readString(anchor.quote);
  const excerpt = readString(anchor.excerpt);

  if (!quote && !excerpt) {
    throw new Error(`Evidence anchor ${anchor.anchorId} is missing required field: quote_or_excerpt`);
  }

  return {
    ...anchor,
    title,
    locator,
    quote: quote ?? excerpt!,
    ...(excerpt ? { excerpt } : {})
  };
}

function sanitizeAttributes(value: Record<string, unknown>, excludedKeys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !excludedKeys.includes(key)));
}

function buildUniqueMap<TValue>(
  values: TValue[],
  keyOf: (value: TValue) => string,
  duplicateMessage: (key: string) => string
): Map<string, TValue> {
  const map = new Map<string, TValue>();

  for (const value of values) {
    const key = keyOf(value);

    if (map.has(key)) {
      throw new Error(duplicateMessage(key));
    }

    map.set(key, value);
  }

  return map;
}

function createEvidenceIdsByAnchorId(
  manifestId: string,
  evidenceAnchorsById: Map<string, KnowledgeInsertEvidenceAnchor>
): Map<string, string> {
  const usedOrders = new Set<number>();
  const evidenceIdsByAnchorId = new Map<string, string>();

  for (const anchor of evidenceAnchorsById.values()) {
    if (usedOrders.has(anchor.order)) {
      throw new Error(`Duplicate evidence order: ${anchor.order}`);
    }

    usedOrders.add(anchor.order);
    evidenceIdsByAnchorId.set(anchor.anchorId, toEvidenceId(manifestId, anchor.order));
  }

  return evidenceIdsByAnchorId;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueTuples(values: Array<[string, string]>): Array<[string, string]> {
  const seen = new Set<string>();
  const tuples: Array<[string, string]> = [];

  for (const value of values) {
    const key = value.join('->');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    tuples.push(value);
  }

  return tuples;
}

function compareNodes(left: GraphNode, right: GraphNode): number {
  return left.id.localeCompare(right.id);
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return left.edge_id.localeCompare(right.edge_id);
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareTuple(left: [string, string], right: [string, string]): number {
  return left[0].localeCompare(right[0]);
}

function getOrCreateSet(map: Map<string, Set<string>>, key: string): Set<string> {
  const existing = map.get(key);

  if (existing) {
    return existing;
  }

  const created = new Set<string>();
  map.set(key, created);
  return created;
}

function getOrCreateAssertionUsage(map: Map<string, AssertionUsage>, key: string): AssertionUsage {
  const existing = map.get(key);

  if (existing) {
    return existing;
  }

  const created: AssertionUsage = {
    sectionIds: new Set<string>(),
    topicIds: new Set<string>(),
    entityIds: new Set<string>(),
    evidenceAnchorIds: new Set<string>()
  };
  map.set(key, created);
  return created;
}

function getOrCreateEvidenceUsage(map: Map<string, EvidenceUsage>, key: string): EvidenceUsage {
  const existing = map.get(key);

  if (existing) {
    return existing;
  }

  const created: EvidenceUsage = {
    entityIds: new Set<string>()
  };
  map.set(key, created);
  return created;
}
