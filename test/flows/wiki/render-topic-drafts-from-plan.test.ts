import { describe, expect, it } from 'vitest';

import { renderTopicDraftsFromPlan } from '../../../src/flows/wiki/render-topic-drafts-from-plan.js';
import type {
  ExistingTopicPagesArtifact as RootExistingTopicPagesArtifact,
  RenderedTopicDraftSection as RootRenderedTopicDraftSection
} from '../../../src/index.js';
import type {
  ExistingTopicPagesArtifact as RuntimeExistingTopicPagesArtifact,
  RenderedTopicDraftSection as RuntimeRenderedTopicDraftSection
} from '../../../src/runtime/index.js';
import type { TopicCatalogArtifact } from '../../../src/runtime/tools/build-topic-catalog.js';
import type { TopicInsertionPlanArtifact } from '../../../src/runtime/tools/build-topic-insertion-plan.js';
import type { MergedExtractedKnowledgeArtifact } from '../../../src/runtime/tools/merge-extracted-knowledge.js';
import type { MergedSectionCandidatesArtifact } from '../../../src/runtime/tools/merge-section-candidates.js';
import type { PreparedSourceResourceArtifact } from '../../../src/runtime/tools/prepare-source-resource.js';

function buildTopicInsertionPlan(): TopicInsertionPlanArtifact {
  return {
    topics: [
      {
        topicSlug: 'design-patterns',
        action: 'revise-topic',
        sections: [
          {
            sectionId: 'section-001',
            title: 'Pattern Intent',
            summary: 'Patch-first systems keep durable notes.',
            body: 'Patch-first systems keep durable notes.\n\nThey prefer incremental edits over rewrites.',
            action: 'append-section'
          }
        ],
        conflicts: []
      }
    ]
  };
}

function buildSectionsArtifact(): MergedSectionCandidatesArtifact {
  return {
    sections: [
      {
        sectionId: 'section-001',
        title: 'Pattern Intent',
        summary: 'Patch-first systems keep durable notes.',
        body: 'Patch-first systems keep durable notes.\n\nThey prefer incremental edits over rewrites.',
        entityIds: ['ent-001'],
        assertionIds: ['assert-001'],
        evidenceAnchorIds: ['anchor-001'],
        sourceSectionCandidateIds: ['sec-candidate-001'],
        topicHints: ['design-patterns']
      }
    ]
  };
}

function buildMergedKnowledgeArtifact(): MergedExtractedKnowledgeArtifact {
  return {
    inputArtifacts: ['state/artifacts/knowledge-insert/run-001/batches/batch-001.json'],
    entities: [],
    assertions: [
      {
        assertionId: 'assert-001',
        text: 'Patch-first systems keep durable notes.',
        sectionCandidateId: 'sec-candidate-001'
      }
    ],
    relations: [],
    evidenceAnchors: [
      {
        anchorId: 'anchor-001',
        blockId: 'block-001',
        quote: 'Patch-first systems keep durable notes.'
      }
    ],
    sectionCandidates: [
      {
        sectionCandidateId: 'sec-candidate-001',
        title: 'Pattern Intent',
        summary: 'Patch-first systems keep durable notes.',
        evidenceAnchorIds: ['anchor-001']
      }
    ],
    topicHints: [{ topicSlug: 'design-patterns', confidence: 'high' }]
  };
}

function buildPreparedResourceArtifact(): PreparedSourceResourceArtifact {
  return {
    manifestId: 'src-001',
    rawPath: 'raw/accepted/design.md',
    structuredMarkdown: '# Design Patterns\n\n## Pattern Intent\n\nPatch-first systems keep durable notes.\n',
    sectionHints: [],
    topicHints: [],
    sections: [
      {
        headingPath: ['Design Patterns', 'Pattern Intent'],
        startLine: 3,
        endLine: 5
      }
    ],
    metadata: {
      title: 'Design Patterns',
      type: 'markdown',
      status: 'accepted',
      hash: 'sha256:design-patterns',
      importedAt: '2026-04-21T00:00:00.000Z',
      preparedAt: '2026-04-23T00:00:00.000Z'
    }
  };
}

function buildTopicCatalogArtifact(): TopicCatalogArtifact {
  return {
    topics: [
      {
        topicSlug: 'design-patterns',
        title: 'Catalog Design Patterns',
        aliases: ['Catalog Alias'],
        summary: 'Catalog summary for design patterns.',
        source_refs: ['raw/accepted/catalog-topic.md']
      }
    ]
  };
}

function buildExistingTopicPagesArtifact() {
  return {
    topics: [
      {
        topicSlug: 'design-patterns',
        title: 'Baseline Design Patterns',
        aliases: ['Baseline Alias'],
        summary: 'Baseline summary for design patterns.',
        tags: ['baseline'],
        source_refs: ['wiki/sources/baseline-topic.md'],
        outgoing_links: ['wiki/topics/pattern-language.md'],
        status: 'active',
        updated_at: '2026-04-20T00:00:00.000Z',
        body: '# Baseline Design Patterns\n\nBaseline durable notes that must stay.\n'
      }
    ]
  };
}

const exportTypeSmokeCheck: {
  runtimeSection?: RuntimeRenderedTopicDraftSection;
  rootSection?: RootRenderedTopicDraftSection;
  runtimeExisting?: RuntimeExistingTopicPagesArtifact;
  rootExisting?: RootExistingTopicPagesArtifact;
} = {};

void exportTypeSmokeCheck;

describe('renderTopicDraftsFromPlan', () => {
  it('renders deterministic topic sections and markdown from insertion plan artifacts', () => {
    const drafts = renderTopicDraftsFromPlan({
      topicInsertionPlan: buildTopicInsertionPlan(),
      sections: buildSectionsArtifact(),
      mergedKnowledge: buildMergedKnowledgeArtifact(),
      preparedResource: buildPreparedResourceArtifact(),
      topicCatalog: buildTopicCatalogArtifact(),
      existingTopicPages: buildExistingTopicPagesArtifact()
    });

    expect(drafts.topics[0]).toEqual(
      expect.objectContaining({
        targetPath: 'wiki/topics/design-patterns.md',
        sections: [
          expect.objectContaining({
            sectionId: 'section-001',
            title: 'Pattern Intent',
            body: 'Patch-first systems keep durable notes.\n\nThey prefer incremental edits over rewrites.',
            source_refs: ['raw/accepted/design.md'],
            evidence_anchor_ids: ['anchor-001'],
            locators: ['raw/accepted/design.md#L3-L5']
          })
        ],
        upsertArguments: expect.objectContaining({
          kind: 'topic',
          slug: 'design-patterns',
          body: expect.stringContaining('## Pattern Intent')
        })
      })
    );
    expect(drafts.topics[0]?.upsertArguments.title).toBe('Baseline Design Patterns');
    expect(drafts.topics[0]?.upsertArguments.summary).toBe('Baseline summary for design patterns.');
    expect(drafts.topics[0]?.upsertArguments.source_refs).toEqual([
      'raw/accepted/design.md',
      'wiki/sources/baseline-topic.md'
    ]);
    expect(drafts.topics[0]?.upsertArguments.body).toContain('Baseline durable notes that must stay.');
    expect(drafts.topics[0]?.upsertArguments.body).toContain('Patch-first systems keep durable notes.');
    expect(drafts.topics[0]?.upsertArguments.body).toContain('Source refs:');
    expect(drafts.topics[0]?.upsertArguments.body).toContain('Evidence anchors:');
    expect(drafts.topics[0]?.upsertArguments.body).toContain('Locators:');
    expect(drafts.topics[0]?.upsertArguments.updated_at).toBe('2026-04-23T00:00:00.000Z');
  });

  it('uses stable artifact timestamps instead of wall-clock time for updated_at', () => {
    const input = {
      topicInsertionPlan: buildTopicInsertionPlan(),
      sections: buildSectionsArtifact(),
      mergedKnowledge: buildMergedKnowledgeArtifact(),
      preparedResource: buildPreparedResourceArtifact(),
      topicCatalog: buildTopicCatalogArtifact(),
      existingTopicPages: buildExistingTopicPagesArtifact()
    };

    const firstDrafts = renderTopicDraftsFromPlan(input);
    const secondDrafts = renderTopicDraftsFromPlan(input);

    expect(firstDrafts.topics[0]?.upsertArguments.updated_at).toBe('2026-04-23T00:00:00.000Z');
    expect(secondDrafts.topics[0]?.upsertArguments.updated_at).toBe('2026-04-23T00:00:00.000Z');
    expect(secondDrafts).toEqual(firstDrafts);
  });

  it('preserves existing baseline body for revise-topic and only keeps planned sections in sections[]', () => {
    const drafts = renderTopicDraftsFromPlan({
      topicInsertionPlan: {
        topics: [
          {
            topicSlug: 'design-patterns',
            action: 'revise-topic',
            sections: [
              {
                sectionId: 'section-002',
                title: 'Review Gates',
                summary: 'High-impact changes require escalation.',
                body: 'High-impact changes require escalation.\n\nKeep evidence attached.',
                action: 'append-section'
              }
            ],
            conflicts: []
          }
        ]
      },
      sections: {
        sections: [
          {
            sectionId: 'section-002',
            title: 'Review Gates',
            summary: 'High-impact changes require escalation.',
            body: 'High-impact changes require escalation.\n\nKeep evidence attached.',
            entityIds: [],
            assertionIds: ['assert-002'],
            evidenceAnchorIds: ['anchor-002'],
            sourceSectionCandidateIds: ['sec-candidate-002'],
            topicHints: ['design-patterns']
          }
        ]
      },
      mergedKnowledge: {
        ...buildMergedKnowledgeArtifact(),
        assertions: [
          {
            assertionId: 'assert-002',
            text: 'High-impact changes require escalation.',
            sectionCandidateId: 'sec-candidate-002'
          }
        ],
        evidenceAnchors: [
          {
            anchorId: 'anchor-002',
            blockId: 'block-002',
            quote: 'High-impact changes require escalation.'
          }
        ],
        sectionCandidates: [
          {
            sectionCandidateId: 'sec-candidate-002',
            title: 'Review Gates',
            summary: 'High-impact changes require escalation.',
            evidenceAnchorIds: ['anchor-002']
          }
        ]
      },
      preparedResource: {
        ...buildPreparedResourceArtifact(),
        sections: [
          {
            headingPath: ['Design Patterns', 'Review Gates'],
            startLine: 7,
            endLine: 10
          }
        ]
      },
      topicCatalog: buildTopicCatalogArtifact(),
      existingTopicPages: buildExistingTopicPagesArtifact()
    });

    expect(drafts.topics[0]?.upsertArguments.title).toBe('Baseline Design Patterns');
    expect(drafts.topics[0]?.upsertArguments.summary).toBe('Baseline summary for design patterns.');
    expect(drafts.topics[0]?.upsertArguments.body).toContain('Baseline durable notes that must stay.');
    expect(drafts.topics[0]?.upsertArguments.body).toContain('## Review Gates');
    expect(drafts.topics[0]?.sections).toEqual([
      expect.objectContaining({
        sectionId: 'section-002',
        title: 'Review Gates'
      })
    ]);
    expect(drafts.topics[0]?.upsertArguments.source_refs).toEqual([
      'raw/accepted/design.md',
      'wiki/sources/baseline-topic.md'
    ]);
  });

  it('throws when revise-topic does not provide an existing baseline artifact entry', () => {
    expect(() =>
      renderTopicDraftsFromPlan({
        topicInsertionPlan: buildTopicInsertionPlan(),
        sections: buildSectionsArtifact(),
        mergedKnowledge: buildMergedKnowledgeArtifact(),
        preparedResource: buildPreparedResourceArtifact(),
        topicCatalog: buildTopicCatalogArtifact()
      })
    ).toThrowError('Missing existing topic baseline for revise-topic: design-patterns');
  });

  it('does not invent locators when neither heading lines nor evidence anchors exist', () => {
    const drafts = renderTopicDraftsFromPlan({
      topicInsertionPlan: {
        topics: [
          {
            topicSlug: 'design-patterns',
            action: 'create-topic',
            topicTitle: 'Design Patterns',
            sections: [
              {
                sectionId: 'section-003',
                title: 'Open Questions',
                summary: 'Unknown provenance should stay explicit.',
                body: 'Unknown provenance should stay explicit.',
                action: 'append-section'
              }
            ],
            conflicts: []
          }
        ]
      },
      sections: {
        sections: [
          {
            sectionId: 'section-003',
            title: 'Open Questions',
            summary: 'Unknown provenance should stay explicit.',
            body: 'Unknown provenance should stay explicit.',
            entityIds: [],
            assertionIds: [],
            evidenceAnchorIds: [],
            sourceSectionCandidateIds: ['sec-candidate-003'],
            topicHints: ['design-patterns']
          }
        ]
      },
      mergedKnowledge: {
        ...buildMergedKnowledgeArtifact(),
        assertions: [],
        evidenceAnchors: [],
        sectionCandidates: [
          {
            sectionCandidateId: 'sec-candidate-003',
            title: 'Open Questions',
            summary: 'Unknown provenance should stay explicit.',
            evidenceAnchorIds: []
          }
        ]
      },
      preparedResource: {
        ...buildPreparedResourceArtifact(),
        sections: []
      },
      topicCatalog: { topics: [] }
    });

    expect(drafts.topics[0]?.upsertArguments.body).toContain('Locators:\n- _none_');
    expect(drafts.topics[0]?.upsertArguments.body).not.toContain('raw/accepted/design.md#design-patterns-open-questions');
    expect(drafts.topics[0]?.sections[0]?.locators).toEqual([]);
  });

  it('falls back to evidence anchor locators when headings do not match but anchors exist', () => {
    const drafts = renderTopicDraftsFromPlan({
      topicInsertionPlan: {
        topics: [
          {
            topicSlug: 'design-patterns',
            action: 'create-topic',
            topicTitle: 'Design Patterns',
            sections: [
              {
                sectionId: 'section-004',
                title: 'Anchor Only',
                summary: 'Anchor-only grounding stays explicit.',
                body: 'Anchor-only grounding stays explicit.',
                action: 'append-section'
              }
            ],
            conflicts: []
          }
        ]
      },
      sections: {
        sections: [
          {
            sectionId: 'section-004',
            title: 'Anchor Only',
            summary: 'Anchor-only grounding stays explicit.',
            body: 'Anchor-only grounding stays explicit.',
            entityIds: [],
            assertionIds: ['assert-004'],
            evidenceAnchorIds: ['anchor-004'],
            sourceSectionCandidateIds: ['sec-candidate-004'],
            topicHints: ['design-patterns']
          }
        ]
      },
      mergedKnowledge: {
        ...buildMergedKnowledgeArtifact(),
        assertions: [
          {
            assertionId: 'assert-004',
            text: 'Anchor-only grounding stays explicit.',
            sectionCandidateId: 'sec-candidate-004'
          }
        ],
        evidenceAnchors: [
          {
            anchorId: 'anchor-004',
            blockId: 'block-anchor-only',
            quote: 'Anchor-only grounding stays explicit.'
          }
        ],
        sectionCandidates: [
          {
            sectionCandidateId: 'sec-candidate-004',
            title: 'Anchor Only',
            summary: 'Anchor-only grounding stays explicit.',
            evidenceAnchorIds: ['anchor-004']
          }
        ]
      },
      preparedResource: {
        ...buildPreparedResourceArtifact(),
        sections: [
          {
            headingPath: ['Design Patterns', 'Different Heading'],
            startLine: 11,
            endLine: 13
          }
        ]
      },
      topicCatalog: { topics: [] }
    });

    expect(drafts.topics[0]?.sections[0]?.locators).toEqual(['raw/accepted/design.md#block-anchor-only']);
    expect(drafts.topics[0]?.upsertArguments.body).toContain('raw/accepted/design.md#block-anchor-only');
  });

  it('renders every planned section for a topic and preserves them in structured sections[]', () => {
    const drafts = renderTopicDraftsFromPlan({
      topicInsertionPlan: {
        topics: [
          {
            topicSlug: 'design-patterns',
            action: 'create-topic',
            topicTitle: 'Design Patterns',
            sections: [
              {
                sectionId: 'section-001',
                title: 'Pattern Intent',
                summary: 'Patch-first systems keep durable notes.',
                body: 'Patch-first systems keep durable notes.\n\nThey prefer incremental edits over rewrites.',
                action: 'append-section'
              },
              {
                sectionId: 'section-002',
                title: 'Review Gates',
                summary: 'High-impact changes require escalation.',
                body: 'High-impact changes require escalation.\n\nKeep evidence attached.',
                action: 'append-section'
              }
            ],
            conflicts: []
          }
        ]
      },
      sections: {
        sections: [
          ...buildSectionsArtifact().sections,
          {
            sectionId: 'section-002',
            title: 'Review Gates',
            summary: 'High-impact changes require escalation.',
            body: 'High-impact changes require escalation.\n\nKeep evidence attached.',
            entityIds: [],
            assertionIds: ['assert-002'],
            evidenceAnchorIds: ['anchor-002'],
            sourceSectionCandidateIds: ['sec-candidate-002'],
            topicHints: ['design-patterns']
          }
        ]
      },
      mergedKnowledge: {
        ...buildMergedKnowledgeArtifact(),
        assertions: [
          ...buildMergedKnowledgeArtifact().assertions,
          {
            assertionId: 'assert-002',
            text: 'High-impact changes require escalation.',
            sectionCandidateId: 'sec-candidate-002'
          }
        ],
        evidenceAnchors: [
          ...buildMergedKnowledgeArtifact().evidenceAnchors,
          {
            anchorId: 'anchor-002',
            blockId: 'block-002',
            quote: 'High-impact changes require escalation.'
          }
        ]
      },
      preparedResource: {
        ...buildPreparedResourceArtifact(),
        sections: [
          ...buildPreparedResourceArtifact().sections,
          {
            headingPath: ['Design Patterns', 'Review Gates'],
            startLine: 7,
            endLine: 10
          }
        ]
      },
      topicCatalog: buildTopicCatalogArtifact()
    });

    expect(drafts.topics[0]?.sections).toEqual([
      expect.objectContaining({
        sectionId: 'section-001',
        title: 'Pattern Intent'
      }),
      expect.objectContaining({
        sectionId: 'section-002',
        title: 'Review Gates'
      })
    ]);
    expect(drafts.topics[0]?.upsertArguments.body).toContain('## Pattern Intent');
    expect(drafts.topics[0]?.upsertArguments.body).toContain('## Review Gates');
    expect(drafts.topics[0]?.upsertArguments.body).toContain('Keep evidence attached.');
  });
});
