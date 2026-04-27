import { describe, expect, it } from 'vitest';

import {
  createKnowledgeInsertGraphWrite,
  createKnowledgeInsertGraphWriteFromConnectedKnowledge,
  type CreateKnowledgeInsertGraphWriteInput,
  type KnowledgeInsertEvidenceAnchor
} from '../../src/domain/knowledge-insert-graph-write.js';

describe('createKnowledgeInsertGraphWrite', () => {
  it('builds graph nodes and edges from v3 connected knowledge with concepts', () => {
    const graphWrite = createKnowledgeInsertGraphWriteFromConnectedKnowledge(createSampleConnectedKnowledge());

    expect(graphWrite.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining(['topic', 'section', 'entity', 'concept', 'evidence', 'source']));
    expect(graphWrite.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from_kind: 'section', type: 'mentions', to_kind: 'concept' }),
      expect.objectContaining({ from_kind: 'section', type: 'grounded_by', to_kind: 'evidence' }),
      expect.objectContaining({ from_kind: 'evidence', type: 'derived_from', to_kind: 'source' })
    ]));
  });

  it('normalizes deterministic artifacts into a durable full graph write set', () => {
    const graphWrite = createKnowledgeInsertGraphWrite(createSampleInput());
    const sectionNode = graphWrite.nodes.find((node) => node.id === 'section:design-patterns#1');

    expect(graphWrite.sourceId).toBe('source:src-001');
    expect(graphWrite.topicIds).toEqual(['topic:design-patterns']);
    expect(graphWrite.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'taxonomy:engineering',
        'topic:design-patterns',
        'section:design-patterns#1',
        'entity:patch-first-system',
        'assertion:patch-first-stability',
        'evidence:src-001#1',
        'source:src-001'
      ])
    );
    expect(graphWrite.edges.map((edge) => edge.type)).toEqual(
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
    expect(graphWrite.sectionIdMap).toEqual({
      'section-001': 'section:design-patterns#1'
    });
    expect(graphWrite.evidenceIdMap).toEqual({
      'anchor-001': 'evidence:src-001#1'
    });
    expect(sectionNode).toMatchObject({
      title: 'Pattern Intent',
      summary: 'Patch-first systems keep durable notes.',
      retrieval_text: 'Pattern Intent\nPatch-first systems keep durable notes.',
      attributes: {
        grounded_evidence_ids: ['evidence:src-001#1']
      }
    });
  });

  it('builds nested section part_of edges independent of draft input order', () => {
    const graphWrite = createKnowledgeInsertGraphWrite({
      ...createSampleInput(),
      topicDraftsArtifact: {
        topics: [
          {
            topicSlug: 'design-patterns',
            targetPath: 'wiki/topics/design-patterns.md',
            sections: [
              {
                sectionId: 'section-child',
                parentSectionId: 'section-parent',
                title: 'Child Section',
                body: 'Child section body.',
                source_refs: ['raw/accepted/design-patterns.md'],
                evidence_anchor_ids: ['anchor-002'],
                locators: ['raw/accepted/design-patterns.md#block-002']
              },
              {
                sectionId: 'section-parent',
                title: 'Parent Section',
                body: 'Parent section body.',
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
              body: '# Design Patterns\n\n## Parent Section\n\nParent section body.\n\n### Child Section\n\nChild section body.\n',
              rationale: 'create deterministic topic draft from insertion plan src-001'
            }
          }
        ]
      },
      sectionsArtifact: {
        sections: [
          {
            sectionId: 'section-child',
            title: 'Child Section',
            summary: 'Child section body.',
            body: 'Child section body.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-002'],
            sourceSectionCandidateIds: ['sec-candidate-child'],
            topicHints: ['design-patterns']
          },
          {
            sectionId: 'section-parent',
            title: 'Parent Section',
            summary: 'Parent section body.',
            body: 'Parent section body.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-001'],
            sourceSectionCandidateIds: ['sec-candidate-parent'],
            topicHints: ['design-patterns']
          }
        ]
      },
      mergedKnowledgeArtifact: {
        ...createSampleInput().mergedKnowledgeArtifact,
        evidenceAnchors: [
          {
            anchorId: 'anchor-001',
            blockId: 'block-001',
            quote: 'Parent section evidence.',
            title: 'Parent section anchor',
            locator: 'design-patterns.md#parent:p1',
            order: 1,
            heading_path: ['Parent Section']
          },
          {
            anchorId: 'anchor-002',
            blockId: 'block-002',
            quote: 'Child section evidence.',
            title: 'Child section anchor',
            locator: 'design-patterns.md#child:p1',
            order: 2,
            heading_path: ['Parent Section', 'Child Section']
          }
        ]
      }
    });

    expect(graphWrite.sectionIdMap).toEqual({
      'section-child': 'section:design-patterns#1',
      'section-parent': 'section:design-patterns#2'
    });
    expect(graphWrite.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'part_of',
          from_id: 'section:design-patterns#1',
          to_id: 'section:design-patterns#2',
          to_kind: 'section'
        }),
        expect.objectContaining({
          type: 'part_of',
          from_id: 'section:design-patterns#2',
          to_id: 'topic:design-patterns',
          to_kind: 'topic'
        })
      ])
    );
  });

  it('fails fast when an evidence anchor is missing required legacy-compatible fields', () => {
    expect(() =>
      createKnowledgeInsertGraphWrite({
        ...createSampleInput(),
        mergedKnowledgeArtifact: {
          ...createSampleInput().mergedKnowledgeArtifact,
          evidenceAnchors: [
            {
              anchorId: 'anchor-001',
              blockId: 'block-001',
              quote: 'Patch-first systems keep durable notes.',
              title: 'Patterns intro anchor',
              order: 1,
              heading_path: ['Introduction']
            } as unknown as KnowledgeInsertEvidenceAnchor
          ]
        }
      })
    ).toThrow('Evidence anchor anchor-001 is missing required field: locator');
  });

  it('binds evidence graph ids to artifact anchor.order instead of first reference order', () => {
    const input = createSampleInput();
    const graphWriteA = createKnowledgeInsertGraphWrite({
      ...input,
      topicDraftsArtifact: {
        topics: [
          {
            ...input.topicDraftsArtifact.topics[0]!,
            sections: [
              {
                sectionId: 'section-001',
                title: 'Pattern Intent',
                body: 'First section body.',
                source_refs: ['raw/accepted/design-patterns.md'],
                evidence_anchor_ids: ['anchor-002'],
                locators: ['raw/accepted/design-patterns.md#block-002']
              },
              {
                sectionId: 'section-002',
                title: 'Pattern Intent Two',
                body: 'Second section body.',
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
            summary: 'First section body.',
            body: 'First section body.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-002'],
            sourceSectionCandidateIds: ['sec-candidate-001'],
            topicHints: ['design-patterns']
          },
          {
            sectionId: 'section-002',
            title: 'Pattern Intent Two',
            summary: 'Second section body.',
            body: 'Second section body.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-001'],
            sourceSectionCandidateIds: ['sec-candidate-002'],
            topicHints: ['design-patterns']
          }
        ]
      },
      mergedKnowledgeArtifact: {
        ...input.mergedKnowledgeArtifact,
        evidenceAnchors: [
          {
            anchorId: 'anchor-001',
            blockId: 'block-001',
            quote: 'First evidence.',
            title: 'Anchor One',
            locator: 'design-patterns.md#one',
            order: 7,
            heading_path: ['Introduction']
          },
          {
            anchorId: 'anchor-002',
            blockId: 'block-002',
            quote: 'Second evidence.',
            title: 'Anchor Two',
            locator: 'design-patterns.md#two',
            order: 3,
            heading_path: ['Introduction']
          }
        ]
      }
    });
    const graphWriteB = createKnowledgeInsertGraphWrite({
      ...input,
      topicDraftsArtifact: {
        topics: [
          {
            ...input.topicDraftsArtifact.topics[0]!,
            sections: [
              {
                sectionId: 'section-001',
                title: 'Pattern Intent',
                body: 'First section body.',
                source_refs: ['raw/accepted/design-patterns.md'],
                evidence_anchor_ids: ['anchor-001'],
                locators: ['raw/accepted/design-patterns.md#block-001']
              },
              {
                sectionId: 'section-002',
                title: 'Pattern Intent Two',
                body: 'Second section body.',
                source_refs: ['raw/accepted/design-patterns.md'],
                evidence_anchor_ids: ['anchor-002'],
                locators: ['raw/accepted/design-patterns.md#block-002']
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
            summary: 'First section body.',
            body: 'First section body.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-001'],
            sourceSectionCandidateIds: ['sec-candidate-001'],
            topicHints: ['design-patterns']
          },
          {
            sectionId: 'section-002',
            title: 'Pattern Intent Two',
            summary: 'Second section body.',
            body: 'Second section body.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-002'],
            sourceSectionCandidateIds: ['sec-candidate-002'],
            topicHints: ['design-patterns']
          }
        ]
      },
      mergedKnowledgeArtifact: {
        ...input.mergedKnowledgeArtifact,
        evidenceAnchors: [
          {
            anchorId: 'anchor-001',
            blockId: 'block-001',
            quote: 'First evidence.',
            title: 'Anchor One',
            locator: 'design-patterns.md#one',
            order: 7,
            heading_path: ['Introduction']
          },
          {
            anchorId: 'anchor-002',
            blockId: 'block-002',
            quote: 'Second evidence.',
            title: 'Anchor Two',
            locator: 'design-patterns.md#two',
            order: 3,
            heading_path: ['Introduction']
          }
        ]
      }
    });

    expect(graphWriteA.evidenceIdMap).toEqual({
      'anchor-001': 'evidence:src-001#7',
      'anchor-002': 'evidence:src-001#3'
    });
    expect(graphWriteB.evidenceIdMap).toEqual(graphWriteA.evidenceIdMap);
  });

  it.each([
    {
      name: 'duplicate order',
      evidenceAnchors: [
        {
          anchorId: 'anchor-001',
          blockId: 'block-001',
          quote: 'First evidence.',
          title: 'Anchor One',
          locator: 'design-patterns.md#one',
          order: 1,
          heading_path: ['Introduction']
        },
        {
          anchorId: 'anchor-002',
          blockId: 'block-002',
          quote: 'Second evidence.',
          title: 'Anchor Two',
          locator: 'design-patterns.md#two',
          order: 1,
          heading_path: ['Introduction']
        }
      ],
      message: 'Duplicate evidence order: 1'
    },
    {
      name: 'non-positive order',
      evidenceAnchors: [
        {
          anchorId: 'anchor-001',
          blockId: 'block-001',
          quote: 'First evidence.',
          title: 'Anchor One',
          locator: 'design-patterns.md#one',
          order: 0,
          heading_path: ['Introduction']
        }
      ],
      message: 'Evidence anchor anchor-001 must have a positive integer order'
    }
  ])('fails fast when evidence anchors have invalid order: $name', ({ evidenceAnchors, message }) => {
    expect(() =>
      createKnowledgeInsertGraphWrite({
        ...createSampleInput(),
        mergedKnowledgeArtifact: {
          ...createSampleInput().mergedKnowledgeArtifact,
          evidenceAnchors
        }
      })
    ).toThrow(message);
  });

  it('writes about edges for every section an assertion is about', () => {
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

    expect(
      graphWrite.edges.filter(
        (edge) => edge.type === 'about' && edge.from_id === 'assertion:patch-first-stability' && edge.to_kind === 'section'
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to_id: 'section:design-patterns#1' }),
        expect.objectContaining({ to_id: 'section:design-patterns#2' })
      ])
    );
  });

  it.each([
    {
      name: 'missing entity candidate',
      input: () => ({
        ...createSampleInput(),
        sectionsArtifact: {
          sections: [
            {
              ...createSampleInput().sectionsArtifact.sections[0]!,
              entityIds: ['missing-entity']
            }
          ]
        }
      }),
      message: 'Missing entity candidate: entity:missing-entity'
    },
    {
      name: 'missing assertion candidate',
      input: () => ({
        ...createSampleInput(),
        sectionsArtifact: {
          sections: [
            {
              ...createSampleInput().sectionsArtifact.sections[0]!,
              assertionIds: ['missing-assertion']
            }
          ]
        }
      }),
      message: 'Missing assertion candidate: assertion:missing-assertion'
    }
  ])('fails fast when referenced candidates are missing: $name', ({ input, message }) => {
    expect(() => createKnowledgeInsertGraphWrite(input())).toThrow(message);
  });

  it.each([
    {
      name: 'topic slug',
      input: () => ({
        ...createSampleInput(),
        topicDraftsArtifact: {
          topics: [
            createSampleInput().topicDraftsArtifact.topics[0]!,
            {
              ...createSampleInput().topicDraftsArtifact.topics[0]!,
              upsertArguments: {
                ...createSampleInput().topicDraftsArtifact.topics[0]!.upsertArguments,
                title: 'Different Title'
              }
            }
          ]
        }
      }),
      message: 'Duplicate topic draft slug: design-patterns'
    },
    {
      name: 'section id',
      input: () => ({
        ...createSampleInput(),
        sectionsArtifact: {
          sections: [
            createSampleInput().sectionsArtifact.sections[0]!,
            {
              ...createSampleInput().sectionsArtifact.sections[0]!,
              summary: 'Different summary.'
            }
          ]
        }
      }),
      message: 'Duplicate section id: section-001'
    },
    {
      name: 'entity id',
      input: () => ({
        ...createSampleInput(),
        mergedKnowledgeArtifact: {
          ...createSampleInput().mergedKnowledgeArtifact,
          entities: [
            createSampleInput().mergedKnowledgeArtifact.entities[0]!,
            {
              ...createSampleInput().mergedKnowledgeArtifact.entities[0]!,
              name: 'Different Entity Name'
            }
          ]
        }
      }),
      message: 'Duplicate entity candidate: entity:patch-first-system'
    },
    {
      name: 'assertion id',
      input: () => ({
        ...createSampleInput(),
        mergedKnowledgeArtifact: {
          ...createSampleInput().mergedKnowledgeArtifact,
          assertions: [
            createSampleInput().mergedKnowledgeArtifact.assertions[0]!,
            {
              ...createSampleInput().mergedKnowledgeArtifact.assertions[0]!,
              text: 'Different assertion text.'
            }
          ]
        }
      }),
      message: 'Duplicate assertion candidate: assertion:patch-first-stability'
    },
    {
      name: 'anchor id',
      input: () => ({
        ...createSampleInput(),
        mergedKnowledgeArtifact: {
          ...createSampleInput().mergedKnowledgeArtifact,
          evidenceAnchors: [
            createSampleInput().mergedKnowledgeArtifact.evidenceAnchors[0]!,
            {
              ...createSampleInput().mergedKnowledgeArtifact.evidenceAnchors[0]!,
              locator: 'design-patterns.md#different'
            }
          ]
        }
      }),
      message: 'Duplicate evidence anchor id: anchor-001'
    }
  ])('fails fast on conflicting artifact primary keys: $name', ({ input, message }) => {
    expect(() => createKnowledgeInsertGraphWrite(input())).toThrow(message);
  });

  it('fails fast when topic taxonomy artifact repeats the same topic slug', () => {
    const sampleInput = createSampleInput();

    expect(() =>
      createKnowledgeInsertGraphWrite({
        ...sampleInput,
        topicTaxonomyArtifact: {
          topics: [
            sampleInput.topicTaxonomyArtifact.topics[0]!,
            {
              ...sampleInput.topicTaxonomyArtifact.topics[0]!,
              taxonomySlug: 'platform',
              taxonomy: {
                rootTaxonomySlug: 'engineering',
                parentTaxonomySlug: 'engineering',
                leafTaxonomySlug: 'platform'
              }
            }
          ]
        }
      })
    ).toThrow('Duplicate topic taxonomy topic slug: design-patterns');
  });
});

function createSampleConnectedKnowledge() {
  return {
    schemaVersion: 'knowledge-insert.connected-knowledge.v3' as const,
    sourceId: 'src-001',
    topics: [
      {
        topicId: 'topic-java-thread-context',
        slug: 'java-thread-context',
        title: 'Java 线程上下文传播',
        scope: 'Java 并发中线程局部上下文的创建、继承和传播边界。',
        rationale: '全文围绕 ThreadLocal/InheritableThreadLocal 的上下文保存与传递展开。'
      }
    ],
    sections: [
      {
        sectionId: 'section-part-001-001',
        title: 'InheritableThreadLocal 用于把父线程上下文传递给子线程',
        body: 'InheritableThreadLocal 是 ThreadLocal 的继承式变体。',
        topicIds: ['topic-java-thread-context'],
        entityIds: ['entity-inheritablethreadlocal'],
        conceptIds: ['concept-thread-local-context-propagation'],
        evidenceAnchorIds: ['evidence-part-001-001']
      }
    ],
    entities: [
      {
        entityId: 'entity-inheritablethreadlocal',
        name: 'InheritableThreadLocal',
        summary: 'Java 中支持父线程向子线程传递线程局部变量初始值的类。',
        aliases: []
      }
    ],
    concepts: [
      {
        conceptId: 'concept-thread-local-context-propagation',
        name: '线程局部上下文传播',
        summary: '在并发执行边界上传递上下文信息的机制。',
        aliases: ['上下文传递']
      }
    ],
    evidenceAnchors: [
      {
        anchorId: 'evidence-part-001-001',
        locator: 'raw/accepted/java-threading.md#L12-L36',
        quote: 'InheritableThreadLocal 可以在创建子线程时继承父线程中的变量副本。',
        startLine: 12,
        endLine: 36
      }
    ]
  };
}

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
      entities: [
        {
          entityId: 'patch-first-system',
          name: 'Patch First System'
        }
      ],
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
        hash: 'sha256:src-001',
        importedAt: '2026-04-21T00:00:00.000Z',
        preparedAt: '2026-04-23T00:00:00.000Z'
      }
    }
  };
}
