import type { BuiltTopicCatalogEntry, TopicCatalogArtifact } from '../../runtime/tools/build-topic-catalog.js';
import type { TopicInsertionPlanArtifact, TopicInsertionPlanSection, TopicInsertionPlanTopic } from '../../runtime/tools/build-topic-insertion-plan.js';
import type {
  KnowledgeAssertionCandidate,
  KnowledgeEvidenceAnchor,
  MergedExtractedKnowledgeArtifact
} from '../../runtime/tools/merge-extracted-knowledge.js';
import type { MergedSectionCandidatesArtifact, NormalizedKnowledgeSection } from '../../runtime/tools/merge-section-candidates.js';
import type { PreparedSourceResourceArtifact } from '../../runtime/tools/prepare-source-resource.js';

export interface ExistingTopicPageDraftInput {
  topicSlug: string;
  title: string;
  aliases: string[];
  summary: string;
  tags: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  updated_at: string;
  body: string;
}

export interface ExistingTopicPagesArtifact {
  topics: ExistingTopicPageDraftInput[];
}

export interface TopicDraftUpsertArguments {
  kind: 'topic';
  slug: string;
  title: string;
  aliases: string[];
  summary: string;
  tags: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  updated_at: string;
  body: string;
  rationale: string;
}

export interface RenderedTopicDraftSection {
  sectionId: string;
  title: string;
  body: string;
  source_refs: string[];
  evidence_anchor_ids: string[];
  locators: string[];
}

export interface RenderedTopicDraft {
  topicSlug: string;
  targetPath: string;
  sections: RenderedTopicDraftSection[];
  upsertArguments: TopicDraftUpsertArguments;
}

export interface RenderTopicDraftsArtifact {
  topics: RenderedTopicDraft[];
}

export interface RenderTopicDraftsFromPlanInput {
  topicInsertionPlan: TopicInsertionPlanArtifact;
  topicCatalog: TopicCatalogArtifact;
  existingTopicPages?: ExistingTopicPagesArtifact;
  sections: MergedSectionCandidatesArtifact;
  mergedKnowledge: MergedExtractedKnowledgeArtifact;
  preparedResource: PreparedSourceResourceArtifact;
}

interface ResolvedSectionRenderContext {
  renderedSection: RenderedTopicDraftSection;
  evidenceAnchors: KnowledgeEvidenceAnchor[];
  relatedAssertionLines: string[];
}

export function renderTopicDraftsFromPlan(input: RenderTopicDraftsFromPlanInput): RenderTopicDraftsArtifact {
  const stableUpdatedAt = resolveStableUpdatedAt(input.preparedResource);
  const topicCatalogBySlug = new Map(
    input.topicCatalog.topics.map((topic) => [topic.topicSlug, topic] satisfies [string, BuiltTopicCatalogEntry])
  );
  const existingTopicPagesBySlug = new Map(
    (input.existingTopicPages?.topics ?? []).map((topic) => [topic.topicSlug, topic] satisfies [string, ExistingTopicPageDraftInput])
  );
  const sectionsById = new Map(
    input.sections.sections.map((section) => [section.sectionId, section] satisfies [string, NormalizedKnowledgeSection])
  );
  const assertionsById = new Map(
    input.mergedKnowledge.assertions.map((assertion) => [assertion.assertionId, assertion] satisfies [string, KnowledgeAssertionCandidate])
  );
  const evidenceAnchorsById = new Map(
    input.mergedKnowledge.evidenceAnchors.map((anchor) => [anchor.anchorId, anchor] satisfies [string, KnowledgeEvidenceAnchor])
  );

  return {
    topics: input.topicInsertionPlan.topics
      .filter((topic) => topic.action !== 'conflict' && topic.sections.length > 0)
      .map((topic) => {
        const topicCatalogEntry = topicCatalogBySlug.get(topic.topicSlug);
        const existingTopicPage = topic.action === 'revise-topic' ? existingTopicPagesBySlug.get(topic.topicSlug) : undefined;

        if (topic.action === 'revise-topic' && !existingTopicPage) {
          throw new Error(`Missing existing topic baseline for revise-topic: ${topic.topicSlug}`);
        }

        if (existingTopicPage && existingTopicPage.body.trim().length === 0) {
          throw new Error(`Invalid existing topic baseline for revise-topic: ${topic.topicSlug}`);
        }

        const title = topicCatalogEntry?.title ?? topic.topicTitle ?? titleizeSlug(topic.topicSlug);
        const renderedSectionContexts = topic.sections.map((section) =>
          buildRenderedSectionContext({
            section,
            normalizedSection: sectionsById.get(section.sectionId),
            assertionsById,
            evidenceAnchorsById,
            preparedResource: input.preparedResource
          })
        );
        const renderedSections = renderedSectionContexts.map((context) => context.renderedSection);
        const sectionSummaries = topic.sections.map((section) => section.summary.trim()).filter((summary) => summary.length > 0);

        return {
          topicSlug: topic.topicSlug,
          targetPath: `wiki/topics/${topic.topicSlug}.md`,
          sections: renderedSections,
          upsertArguments: {
            kind: 'topic',
            slug: topic.topicSlug,
            title: existingTopicPage?.title ?? title,
            aliases: [...(existingTopicPage?.aliases ?? topicCatalogEntry?.aliases ?? [])],
            summary:
              existingTopicPage?.summary ??
              topicCatalogEntry?.summary ??
              sectionSummaries[0] ??
              `Deterministic topic draft for ${title}.`,
            tags: [...(existingTopicPage?.tags ?? [])],
            source_refs: uniqueStrings([
              input.preparedResource.rawPath,
              ...(existingTopicPage?.source_refs ?? topicCatalogEntry?.source_refs ?? []),
              ...renderedSections.flatMap((section) => section.source_refs)
            ]),
            outgoing_links: [...(existingTopicPage?.outgoing_links ?? [])],
            status: existingTopicPage?.status ?? 'active',
            updated_at: stableUpdatedAt,
            body:
              topic.action === 'revise-topic' && existingTopicPage
                ? renderRevisedBody(existingTopicPage.body, renderedSectionContexts)
                : renderCreatedBody(existingTopicPage?.title ?? title, renderedSectionContexts),
            rationale: buildRationale(topic, input.preparedResource.manifestId)
          }
        };
      })
  };
}

function buildRenderedSectionContext(input: {
  section: TopicInsertionPlanSection;
  normalizedSection: NormalizedKnowledgeSection | undefined;
  assertionsById: Map<string, KnowledgeAssertionCandidate>;
  evidenceAnchorsById: Map<string, KnowledgeEvidenceAnchor>;
  preparedResource: PreparedSourceResourceArtifact;
}): ResolvedSectionRenderContext {
  const title = input.normalizedSection?.title ?? input.section.title;
  const evidenceAnchorIds = input.normalizedSection?.evidenceAnchorIds ?? [];
  const evidenceAnchors = evidenceAnchorIds
    .map((anchorId) => input.evidenceAnchorsById.get(anchorId))
    .filter((anchor): anchor is KnowledgeEvidenceAnchor => anchor !== undefined);
  const relatedAssertionLines = uniqueStrings(
    (input.normalizedSection?.assertionIds ?? [])
      .map((assertionId) => input.assertionsById.get(assertionId)?.text?.trim() ?? '')
      .filter((text) => text.length > 0)
  );

  return {
    renderedSection: {
      sectionId: input.section.sectionId,
      title,
      body: normalizeMarkdownParagraphs(input.normalizedSection?.body ?? input.section.body),
      source_refs: [input.preparedResource.rawPath],
      evidence_anchor_ids: evidenceAnchorIds,
      locators: buildLocators(input.preparedResource, title, evidenceAnchors)
    },
    evidenceAnchors,
    relatedAssertionLines
  };
}

function renderCreatedBody(title: string, sections: ResolvedSectionRenderContext[]): string {
  return [`# ${title}`, '', ...sections.map((section) => renderSectionMarkdown(section))].join('\n\n').trim();
}

function renderRevisedBody(existingBody: string, sections: ResolvedSectionRenderContext[]): string {
  const normalizedExistingBody = existingBody.trim();
  const appendedSections = sections.map((section) => renderSectionMarkdown(section)).join('\n\n').trim();

  if (normalizedExistingBody.length === 0) {
    return appendedSections;
  }

  if (appendedSections.length === 0) {
    return normalizedExistingBody;
  }

  return `${normalizedExistingBody}\n\n${appendedSections}`;
}

function renderSectionMarkdown(section: ResolvedSectionRenderContext): string {
  const evidenceLines =
    section.evidenceAnchors.length > 0
      ? section.evidenceAnchors.map(
          (anchor) => `- ${anchor.anchorId} (${anchor.blockId}): ${JSON.stringify(anchor.quote)}`
        )
      : section.renderedSection.evidence_anchor_ids.length > 0
        ? section.renderedSection.evidence_anchor_ids.map((anchorId) => `- ${anchorId}`)
        : ['- _none_'];

  return [
    `## ${section.renderedSection.title}`,
    '',
    section.renderedSection.body,
    '',
    'Source refs:',
    ...section.renderedSection.source_refs.map((sourceRef) => `- ${sourceRef}`),
    '',
    'Evidence anchors:',
    ...evidenceLines,
    ...(section.relatedAssertionLines.length > 0
      ? ['', 'Evidence summaries:', ...section.relatedAssertionLines.map((line) => `- ${line}`)]
      : []),
    '',
    'Locators:',
    ...(section.renderedSection.locators.length > 0
      ? section.renderedSection.locators.map((locator) => `- ${locator}`)
      : ['- _none_'])
  ].join('\n');
}

function buildLocators(
  preparedResource: PreparedSourceResourceArtifact,
  sectionTitle: string,
  evidenceAnchors: KnowledgeEvidenceAnchor[]
): string[] {
  const matchedResourceSections = preparedResource.sections.filter((section) => {
    const headingTitle = section.headingPath.at(-1) ?? '';
    return normalizeHeading(headingTitle) === normalizeHeading(sectionTitle);
  });
  const lineLocators = matchedResourceSections.map(
    (section) => `${preparedResource.rawPath}#L${section.startLine}-L${section.endLine}`
  );
  const anchorLocators = evidenceAnchors.map((anchor) => `${preparedResource.rawPath}#${anchor.blockId}`);

  if (lineLocators.length > 0) {
    return uniqueStrings(lineLocators);
  }

  if (anchorLocators.length > 0) {
    return uniqueStrings(anchorLocators);
  }

  return [];
}

function buildRationale(topic: TopicInsertionPlanTopic, manifestId: string): string {
  return topic.action === 'create-topic'
    ? `create deterministic topic draft from insertion plan ${manifestId}`
    : `revise deterministic topic draft from insertion plan ${manifestId}`;
}

function normalizeMarkdownParagraphs(value: string): string {
  return value
    .trim()
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
}

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-');
}

function titleizeSlug(value: string): string {
  return value
    .split('-')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(' ');
}

function resolveStableUpdatedAt(preparedResource: PreparedSourceResourceArtifact): string {
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
