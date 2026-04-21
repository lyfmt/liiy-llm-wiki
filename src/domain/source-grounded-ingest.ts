export interface SourceGroundedIngestTopicInput {
  slug: string;
  title: string;
  summary: string;
}

export interface SourceGroundedIngestSectionInput {
  id: string;
  title: string;
  summary: string;
  grounded_evidence_ids: string[];
}

export interface SourceGroundedIngestEvidenceInput {
  id: string;
  title: string;
  locator: string;
  excerpt: string;
  order: number;
  heading_path: string[];
}

export interface CreateSourceGroundedIngestInput {
  sourceId: string;
  sourcePath: string;
  topic: SourceGroundedIngestTopicInput;
  sections: SourceGroundedIngestSectionInput[];
  evidence: SourceGroundedIngestEvidenceInput[];
}

export interface SourceGroundedIngestTopic extends SourceGroundedIngestTopicInput {
  id: string;
}

export interface SourceGroundedIngestSection {
  id: string;
  title: string;
  summary: string;
  grounded_evidence_ids: string[];
}

export interface SourceGroundedIngestEvidence {
  id: string;
  title: string;
  locator: string;
  excerpt: string;
  order: number;
  heading_path: string[];
}

export interface SourceGroundedIngest {
  sourceId: string;
  sourcePath: string;
  topic: SourceGroundedIngestTopic;
  sections: SourceGroundedIngestSection[];
  evidence: SourceGroundedIngestEvidence[];
}

export function createSourceGroundedIngest(input: CreateSourceGroundedIngestInput): SourceGroundedIngest {
  const sourceId = requireNonEmptyString(input.sourceId, 'sourceId');
  const sourcePath = requireNonEmptyString(input.sourcePath, 'sourcePath');
  const slug = requireNonEmptyString(input.topic?.slug, 'topic.slug');
  const sections = requireNonEmptyArray(input.sections, 'sections', 'Source-grounded ingest requires at least one section');
  const evidence = requireNonEmptyArray(input.evidence, 'evidence', 'Source-grounded ingest requires at least one evidence entry');
  const normalizedEvidence = evidence.map((evidence) => ({
    id: requireNonEmptyString(evidence?.id, 'evidence[].id'),
    title: requireNonEmptyString(evidence?.title, 'evidence[].title'),
    locator: requireEvidenceField(evidence?.locator),
    excerpt: requireEvidenceField(evidence?.excerpt),
    order: requirePositiveInteger(evidence?.order, 'evidence[].order'),
    heading_path: normalizeHeadingPath(evidence?.heading_path)
  }));
  const evidenceIds = new Set(normalizedEvidence.map((entry) => entry.id));
  const normalizedSections = sections.map((section) => ({
    id: requireNonEmptyString(section?.id, 'sections[].id'),
    title: requireNonEmptyString(section?.title, 'sections[].title'),
    summary: requireNonEmptyString(section?.summary, 'sections[].summary'),
    grounded_evidence_ids: normalizeGroundedEvidenceIds(section?.grounded_evidence_ids, evidenceIds)
  }));

  return {
    sourceId,
    sourcePath,
    topic: {
      id: `topic:${slug}`,
      slug,
      title: requireNonEmptyString(input.topic?.title, 'topic.title'),
      summary: requireNonEmptyString(input.topic?.summary, 'topic.summary')
    },
    sections: normalizedSections,
    evidence: normalizedEvidence
  };
}

function normalizeGroundedEvidenceIds(groundedEvidenceIds: string[] | undefined, evidenceIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(groundedEvidenceIds) || groundedEvidenceIds.length === 0) {
    throw new Error('Sections require at least one grounded evidence id');
  }

  const normalized = groundedEvidenceIds.map((evidenceId) => requireNonEmptyString(evidenceId, 'sections[].grounded_evidence_ids[]'));
  for (const evidenceId of normalized) {
    if (!evidenceIds.has(evidenceId)) {
      throw new Error('sections[].grounded_evidence_ids[] must reference an evidence id in evidence[]');
    }
  }

  return [...new Set(normalized)];
}

function normalizeHeadingPath(headingPath: string[] | undefined): string[] {
  if (!Array.isArray(headingPath)) {
    throw new Error('evidence[].heading_path is required');
  }

  return headingPath.map((segment) => requireNonEmptyString(segment, 'evidence[].heading_path[]'));
}

function requireEvidenceField(value: string | undefined): string {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (normalized === '') {
    throw new Error('Evidence entries require locator and excerpt');
  }

  return normalized;
}

function requireNonEmptyString(value: string | undefined, fieldName: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (normalized === '') {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function requirePositiveInteger(value: number | undefined, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return value;
}

function requireNonEmptyArray<T>(value: T[] | undefined, fieldName: string, emptyMessage: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} is required`);
  }

  if (value.length === 0) {
    throw new Error(emptyMessage);
  }

  return value;
}
