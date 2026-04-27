export interface TopicPlanArtifact {
  schemaVersion: 'knowledge-insert.topic-plan.v3';
  sourceId: string;
  topics: TopicPlanTopic[];
}

export interface TopicPlanTopic {
  topicId: string;
  slug: string;
  title: string;
  scope: string;
  rationale: string;
}

export interface PartitionPlanArtifact {
  schemaVersion: 'knowledge-insert.partition-plan.v3';
  sourceId: string;
  parts: PartitionPlanPart[];
}

export interface PartitionPlanPart {
  partId: string;
  title: string;
  startLine: number;
  endLine: number;
  topicIds: string[];
  rationale: string;
}

export interface PartExtractionArtifact {
  schemaVersion: 'knowledge-insert.part-extraction.v3';
  sourceId: string;
  partId: string;
  sections: PartExtractionSection[];
  entities: PartExtractionEntity[];
  concepts: PartExtractionConcept[];
  evidenceAnchors: PartExtractionEvidenceAnchor[];
}

export interface PartExtractionSection {
  sectionId: string;
  title: string;
  body: string;
  topicIds: string[];
  entityIds: string[];
  conceptIds: string[];
  evidenceAnchorIds: string[];
}

export interface PartExtractionEntity {
  entityId: string;
  name: string;
  summary: string;
  aliases: string[];
}

export interface PartExtractionConcept {
  conceptId: string;
  name: string;
  summary: string;
  aliases: string[];
}

export interface PartExtractionEvidenceAnchor {
  anchorId: string;
  locator: string;
  quote: string;
  startLine: number;
  endLine: number;
}

export interface ConnectedKnowledgeArtifact {
  schemaVersion: 'knowledge-insert.connected-knowledge.v3';
  sourceId: string;
  topics: TopicPlanTopic[];
  sections: PartExtractionSection[];
  entities: PartExtractionEntity[];
  concepts: PartExtractionConcept[];
  evidenceAnchors: PartExtractionEvidenceAnchor[];
}

export function parseTopicPlanArtifact(value: unknown): TopicPlanArtifact {
  const record = requireRecord(value, 'topic plan');
  if (record.schemaVersion !== 'knowledge-insert.topic-plan.v3') {
    throw new Error('Invalid topic plan schemaVersion');
  }
  return {
    schemaVersion: 'knowledge-insert.topic-plan.v3',
    sourceId: requireString(record.sourceId, 'topic plan sourceId'),
    topics: requireArray(record.topics, 'topic plan topics').map(parseTopic)
  };
}

export function parsePartitionPlanArtifact(value: unknown): PartitionPlanArtifact {
  const record = requireRecord(value, 'partition plan');
  if (record.schemaVersion !== 'knowledge-insert.partition-plan.v3') {
    throw new Error('Invalid partition plan schemaVersion');
  }
  return {
    schemaVersion: 'knowledge-insert.partition-plan.v3',
    sourceId: requireString(record.sourceId, 'partition plan sourceId'),
    parts: requireArray(record.parts, 'partition plan parts').map(parsePartitionPart)
  };
}

export function parsePartExtractionArtifact(value: unknown): PartExtractionArtifact {
  const record = requireRecord(value, 'part extraction');
  if (record.schemaVersion !== 'knowledge-insert.part-extraction.v3') {
    throw new Error('Invalid part extraction schemaVersion');
  }
  return {
    schemaVersion: 'knowledge-insert.part-extraction.v3',
    sourceId: requireString(record.sourceId, 'part extraction sourceId'),
    partId: requireString(record.partId, 'part extraction partId'),
    sections: requireArray(record.sections, 'part extraction sections').map(parseSection),
    entities: requireArray(record.entities, 'part extraction entities').map(parseEntity),
    concepts: requireArray(record.concepts, 'part extraction concepts').map(parseConcept),
    evidenceAnchors: requireArray(record.evidenceAnchors, 'part extraction evidenceAnchors').map(parseEvidenceAnchor)
  };
}

export function parseConnectedKnowledgeArtifact(value: unknown): ConnectedKnowledgeArtifact {
  const record = requireRecord(value, 'connected knowledge');
  if (record.schemaVersion !== 'knowledge-insert.connected-knowledge.v3') {
    throw new Error('Invalid connected knowledge schemaVersion');
  }
  return {
    schemaVersion: 'knowledge-insert.connected-knowledge.v3',
    sourceId: requireString(record.sourceId, 'connected knowledge sourceId'),
    topics: requireArray(record.topics, 'connected knowledge topics').map(parseTopic),
    sections: requireArray(record.sections, 'connected knowledge sections').map(parseSection),
    entities: requireArray(record.entities, 'connected knowledge entities').map(parseEntity),
    concepts: requireArray(record.concepts, 'connected knowledge concepts').map(parseConcept),
    evidenceAnchors: requireArray(record.evidenceAnchors, 'connected knowledge evidenceAnchors').map(parseEvidenceAnchor)
  };
}

function parseTopic(value: unknown): TopicPlanTopic {
  const record = requireRecord(value, 'topic');
  return {
    topicId: requireString(record.topicId, 'topic topicId'),
    slug: requireString(record.slug, 'topic slug'),
    title: requireString(record.title, 'topic title'),
    scope: requireString(record.scope, 'topic scope'),
    rationale: requireString(record.rationale, 'topic rationale')
  };
}

function parsePartitionPart(value: unknown): PartitionPlanPart {
  const record = requireRecord(value, 'partition part');
  const startLine = requirePositiveInteger(record.startLine, 'partition part startLine');
  const endLine = requirePositiveInteger(record.endLine, 'partition part endLine');
  if (startLine > endLine) {
    throw new Error('Invalid partition part range');
  }
  return {
    partId: requireString(record.partId, 'partition part partId'),
    title: requireString(record.title, 'partition part title'),
    startLine,
    endLine,
    topicIds: requireStringArray(record.topicIds, 'partition part topicIds'),
    rationale: requireString(record.rationale, 'partition part rationale')
  };
}

function parseSection(value: unknown): PartExtractionSection {
  const record = requireRecord(value, 'section');
  return {
    sectionId: requireString(record.sectionId, 'section sectionId'),
    title: requireString(record.title, 'section title'),
    body: requireString(record.body, 'section body'),
    topicIds: requireStringArray(record.topicIds, 'section topicIds'),
    entityIds: requireStringArray(record.entityIds, 'section entityIds'),
    conceptIds: requireStringArray(record.conceptIds, 'section conceptIds'),
    evidenceAnchorIds: requireStringArray(record.evidenceAnchorIds, 'section evidenceAnchorIds')
  };
}

function parseEntity(value: unknown): PartExtractionEntity {
  const record = requireRecord(value, 'entity');
  return {
    entityId: requireString(record.entityId, 'entity entityId'),
    name: requireString(record.name, 'entity name'),
    summary: requireString(record.summary, 'entity summary'),
    aliases: requireStringArray(record.aliases, 'entity aliases')
  };
}

function parseConcept(value: unknown): PartExtractionConcept {
  const record = requireRecord(value, 'concept');
  return {
    conceptId: requireString(record.conceptId, 'concept conceptId'),
    name: requireString(record.name, 'concept name'),
    summary: requireString(record.summary, 'concept summary'),
    aliases: requireStringArray(record.aliases, 'concept aliases')
  };
}

function parseEvidenceAnchor(value: unknown): PartExtractionEvidenceAnchor {
  const record = requireRecord(value, 'evidence anchor');
  const startLine = requirePositiveInteger(record.startLine, 'evidence anchor startLine');
  const endLine = requirePositiveInteger(record.endLine, 'evidence anchor endLine');
  if (startLine > endLine) {
    throw new Error('Invalid evidence anchor range');
  }
  return {
    anchorId: requireString(record.anchorId, 'evidence anchor anchorId'),
    locator: requireString(record.locator, 'evidence anchor locator'),
    quote: requireString(record.quote, 'evidence anchor quote'),
    startLine,
    endLine
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid ${label}`);
  }
  return [...value];
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Invalid ${label}`);
  }
  return value as number;
}
