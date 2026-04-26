import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createDraftTopicPagesFromPlanTool } from '../../../src/runtime/tools/draft-topic-pages-from-plan.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('createDraftTopicPagesFromPlanTool', () => {
  it('writes structured deterministic topic page drafts driven only by artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-topic-pages-from-plan-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const firstOutputArtifactPath = path.join(artifactDirectory, 'topic-drafts-a.json');
      const secondOutputArtifactPath = path.join(artifactDirectory, 'topic-drafts-b.json');
      await mkdir(artifactDirectory, { recursive: true });

      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/design-patterns.md',
          kind: 'topic',
          title: 'Workspace Title A',
          aliases: ['Workspace Alias A'],
          summary: 'Workspace summary A.',
          tags: ['workspace-a'],
          source_refs: ['wiki/sources/workspace-a.md'],
          outgoing_links: ['wiki/topics/workspace-a.md'],
          status: 'active',
          updated_at: '2026-04-22T00:00:00.000Z'
        }),
        '# Design Patterns\n\nWorkspace body A that should be ignored.\n'
      );

      await writeFile(
        path.join(artifactDirectory, 'topic-insertion-plan.json'),
        `${JSON.stringify(
          {
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
          null,
          2
        )}\n`,
        'utf8'
      );

      await writeFile(
        path.join(artifactDirectory, 'topic-catalog.json'),
        `${JSON.stringify(
          {
            topics: [
              {
                topicSlug: 'design-patterns',
                title: 'Catalog Design Patterns',
                aliases: ['Catalog Alias'],
                summary: 'Catalog summary for design patterns.',
                source_refs: ['raw/accepted/catalog-topic.md']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      await writeFile(
        path.join(artifactDirectory, 'existing-topic-pages.json'),
        `${JSON.stringify(
          {
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
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      await writeFile(
        path.join(artifactDirectory, 'sections.json'),
        `${JSON.stringify(
          {
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
              },
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
          null,
          2
        )}\n`,
        'utf8'
      );

      await writeFile(
        path.join(artifactDirectory, 'merged.json'),
        `${JSON.stringify(
          {
            inputArtifacts: ['state/artifacts/knowledge-insert/run-001/batches/batch-001.json'],
            entities: [],
            assertions: [
              {
                assertionId: 'assert-001',
                text: 'Patch-first systems keep durable notes.',
                sectionCandidateId: 'sec-candidate-001'
              },
              {
                assertionId: 'assert-002',
                text: 'High-impact changes require escalation.',
                sectionCandidateId: 'sec-candidate-002'
              }
            ],
            relations: [],
            evidenceAnchors: [
              {
                anchorId: 'anchor-001',
                blockId: 'block-001',
                quote: 'Patch-first systems keep durable notes.'
              },
              {
                anchorId: 'anchor-002',
                blockId: 'block-002',
                quote: 'High-impact changes require escalation.'
              }
            ],
            sectionCandidates: [
              {
                sectionCandidateId: 'sec-candidate-001',
                title: 'Pattern Intent',
                summary: 'Patch-first systems keep durable notes.',
                evidenceAnchorIds: ['anchor-001']
              },
              {
                sectionCandidateId: 'sec-candidate-002',
                title: 'Review Gates',
                summary: 'High-impact changes require escalation.',
                evidenceAnchorIds: ['anchor-002']
              }
            ],
            topicHints: [{ topicSlug: 'design-patterns', confidence: 'high' }]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      await writeFile(
        path.join(artifactDirectory, 'resource.json'),
        `${JSON.stringify(
          {
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
              },
              {
                headingPath: ['Design Patterns', 'Review Gates'],
                startLine: 7,
                endLine: 10
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
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createDraftTopicPagesFromPlanTool(
        createRuntimeContext({
          root,
          runId: 'runtime-draft-topic-pages-from-plan-001'
        })
      );

      const firstResult = await tool.execute('tool-call-1', {
        topicInsertionPlanArtifact: 'state/artifacts/knowledge-insert/run-001/topic-insertion-plan.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        existingTopicPagesArtifact: 'state/artifacts/knowledge-insert/run-001/existing-topic-pages.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-drafts-a.json'
      });
      const firstParsed = JSON.parse(await readFile(firstOutputArtifactPath, 'utf8'));

      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/design-patterns.md',
          kind: 'topic',
          title: 'Workspace Title B',
          aliases: ['Workspace Alias B'],
          summary: 'Workspace summary B.',
          tags: ['workspace-b'],
          source_refs: ['wiki/sources/workspace-b.md'],
          outgoing_links: ['wiki/topics/workspace-b.md'],
          status: 'active',
          updated_at: '2026-04-24T00:00:00.000Z'
        }),
        '# Design Patterns\n\nWorkspace body B that should also be ignored.\n'
      );

      const secondResult = await tool.execute('tool-call-2', {
        topicInsertionPlanArtifact: 'state/artifacts/knowledge-insert/run-001/topic-insertion-plan.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        existingTopicPagesArtifact: 'state/artifacts/knowledge-insert/run-001/existing-topic-pages.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-drafts-b.json'
      });
      const secondParsed = JSON.parse(await readFile(secondOutputArtifactPath, 'utf8'));

      expect(firstResult.details.summary).toBe('drafted 1 topic page from insertion plan');
      expect(secondResult.details.summary).toBe('drafted 1 topic page from insertion plan');
      expect(firstParsed).toEqual(secondParsed);
      expect(firstParsed.topics[0]).toEqual(
        expect.objectContaining({
          topicSlug: 'design-patterns',
          targetPath: 'wiki/topics/design-patterns.md',
          sections: [
            expect.objectContaining({
              sectionId: 'section-001',
              title: 'Pattern Intent',
              source_refs: ['raw/accepted/design.md'],
              evidence_anchor_ids: ['anchor-001'],
              locators: ['raw/accepted/design.md#L3-L5']
            }),
            expect.objectContaining({
              sectionId: 'section-002',
              title: 'Review Gates',
              source_refs: ['raw/accepted/design.md'],
              evidence_anchor_ids: ['anchor-002'],
              locators: ['raw/accepted/design.md#L7-L10']
            })
          ],
          upsertArguments: expect.objectContaining({
            kind: 'topic',
            slug: 'design-patterns',
            title: 'Baseline Design Patterns',
            summary: 'Baseline summary for design patterns.',
            updated_at: '2026-04-23T00:00:00.000Z',
            body: expect.stringContaining('## Pattern Intent')
          })
        })
      );
      expect(firstParsed.topics[0].upsertArguments.source_refs).toEqual([
        'raw/accepted/design.md',
        'wiki/sources/baseline-topic.md'
      ]);
      expect(firstParsed.topics[0].upsertArguments.body).toContain('Baseline durable notes that must stay.');
      expect(firstParsed.topics[0].upsertArguments.body).toContain('## Review Gates');
      expect(firstParsed.topics[0].upsertArguments.body).not.toContain('Workspace body A that should be ignored.');
      expect(firstParsed.topics[0].upsertArguments.body).not.toContain('Workspace body B that should also be ignored.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails fast when the prepared resource artifact does not provide a stable timestamp', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-topic-pages-from-plan-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-002');
      await mkdir(artifactDirectory, { recursive: true });
      await writeMinimalArtifacts(artifactDirectory, {
        resource: {
          manifestId: 'src-002',
          rawPath: 'raw/accepted/design.md',
          structuredMarkdown: '# Design Patterns\n',
          sectionHints: [],
          topicHints: [],
          sections: [],
          metadata: {
            title: 'Design Patterns',
            type: 'markdown',
            status: 'accepted',
            hash: 'sha256:design-patterns',
            importedAt: '',
            preparedAt: ''
          }
        }
      });

      const tool = createDraftTopicPagesFromPlanTool(createRuntimeContext({ root, runId: 'runtime-draft-topic-pages-from-plan-002' }));

      await expect(
        tool.execute('tool-call-invalid-resource', {
          topicInsertionPlanArtifact: 'state/artifacts/knowledge-insert/run-002/topic-insertion-plan.json',
          topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-002/topic-catalog.json',
          existingTopicPagesArtifact: 'state/artifacts/knowledge-insert/run-002/existing-topic-pages.json',
          sectionsArtifact: 'state/artifacts/knowledge-insert/run-002/sections.json',
          mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-002/merged.json',
          preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-002/resource.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-002/topic-drafts.json'
        })
      ).rejects.toThrowError('Invalid prepared resource artifact');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails fast when a topic insertion plan topic is missing sections[]', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-topic-pages-from-plan-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-003');
      await mkdir(artifactDirectory, { recursive: true });
      await writeMinimalArtifacts(artifactDirectory, {
        topicInsertionPlan: {
          topics: [
            {
              topicSlug: 'design-patterns',
              action: 'revise-topic'
            }
          ]
        }
      });

      const tool = createDraftTopicPagesFromPlanTool(createRuntimeContext({ root, runId: 'runtime-draft-topic-pages-from-plan-003' }));

      await expect(
        tool.execute('tool-call-invalid-plan', {
          topicInsertionPlanArtifact: 'state/artifacts/knowledge-insert/run-003/topic-insertion-plan.json',
          topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-003/topic-catalog.json',
          existingTopicPagesArtifact: 'state/artifacts/knowledge-insert/run-003/existing-topic-pages.json',
          sectionsArtifact: 'state/artifacts/knowledge-insert/run-003/sections.json',
          mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-003/merged.json',
          preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-003/resource.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-003/topic-drafts.json'
        })
      ).rejects.toThrowError('Invalid topic insertion plan artifact');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails fast when an existing topic baseline artifact entry is malformed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-topic-pages-from-plan-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-004');
      await mkdir(artifactDirectory, { recursive: true });
      await writeMinimalArtifacts(artifactDirectory, {
        existingTopicPages: {
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
              body: ''
            }
          ]
        }
      });

      const tool = createDraftTopicPagesFromPlanTool(createRuntimeContext({ root, runId: 'runtime-draft-topic-pages-from-plan-004' }));

      await expect(
        tool.execute('tool-call-invalid-existing', {
          topicInsertionPlanArtifact: 'state/artifacts/knowledge-insert/run-004/topic-insertion-plan.json',
          topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-004/topic-catalog.json',
          existingTopicPagesArtifact: 'state/artifacts/knowledge-insert/run-004/existing-topic-pages.json',
          sectionsArtifact: 'state/artifacts/knowledge-insert/run-004/sections.json',
          mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-004/merged.json',
          preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-004/resource.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-004/topic-drafts.json'
        })
      ).rejects.toThrowError('Invalid existing topic pages artifact');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writeMinimalArtifacts(
  artifactDirectory: string,
  overrides: {
    topicInsertionPlan?: Record<string, unknown>;
    topicCatalog?: Record<string, unknown>;
    existingTopicPages?: Record<string, unknown>;
    sections?: Record<string, unknown>;
    mergedKnowledge?: Record<string, unknown>;
    resource?: Record<string, unknown>;
  } = {}
): Promise<void> {
  const defaults = {
    topicInsertionPlan: {
      topics: [
        {
          topicSlug: 'design-patterns',
          action: 'revise-topic',
          sections: [
            {
              sectionId: 'section-001',
              title: 'Pattern Intent',
              summary: 'Patch-first systems keep durable notes.',
              body: 'Patch-first systems keep durable notes.',
              action: 'append-section'
            }
          ],
          conflicts: []
        }
      ]
    },
    topicCatalog: {
      topics: [
        {
          topicSlug: 'design-patterns',
          title: 'Catalog Design Patterns',
          aliases: ['Catalog Alias'],
          summary: 'Catalog summary for design patterns.',
          source_refs: ['raw/accepted/catalog-topic.md']
        }
      ]
    },
    existingTopicPages: {
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
    },
    sections: {
      sections: [
        {
          sectionId: 'section-001',
          title: 'Pattern Intent',
          summary: 'Patch-first systems keep durable notes.',
          body: 'Patch-first systems keep durable notes.',
          entityIds: [],
          assertionIds: ['assert-001'],
          evidenceAnchorIds: ['anchor-001'],
          sourceSectionCandidateIds: ['sec-candidate-001'],
          topicHints: ['design-patterns']
        }
      ]
    },
    mergedKnowledge: {
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
    },
    resource: {
      manifestId: 'src-001',
      rawPath: 'raw/accepted/design.md',
      structuredMarkdown: '# Design Patterns\n',
      sectionHints: [],
      topicHints: [],
      sections: [],
      metadata: {
        title: 'Design Patterns',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:design-patterns',
        importedAt: '2026-04-21T00:00:00.000Z',
        preparedAt: '2026-04-23T00:00:00.000Z'
      }
    }
  };

  await writeFile(
    path.join(artifactDirectory, 'topic-insertion-plan.json'),
    `${JSON.stringify(overrides.topicInsertionPlan ?? defaults.topicInsertionPlan, null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    path.join(artifactDirectory, 'topic-catalog.json'),
    `${JSON.stringify(overrides.topicCatalog ?? defaults.topicCatalog, null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    path.join(artifactDirectory, 'existing-topic-pages.json'),
    `${JSON.stringify(overrides.existingTopicPages ?? defaults.existingTopicPages, null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    path.join(artifactDirectory, 'sections.json'),
    `${JSON.stringify(overrides.sections ?? defaults.sections, null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    path.join(artifactDirectory, 'merged.json'),
    `${JSON.stringify(overrides.mergedKnowledge ?? defaults.mergedKnowledge, null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    path.join(artifactDirectory, 'resource.json'),
    `${JSON.stringify(overrides.resource ?? defaults.resource, null, 2)}\n`,
    'utf8'
  );
}
