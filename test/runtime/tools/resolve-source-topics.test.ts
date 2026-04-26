import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createResolveSourceTopicsTool } from '../../../src/runtime/tools/resolve-source-topics.js';

describe('createResolveSourceTopicsTool', () => {
  it('groups sections into source topics by reused catalog topics or new candidate topics', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-source-topics-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'source-topics.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'prepared-resource.json'),
        `${JSON.stringify(
          {
            manifestId: 'source-001',
            rawPath: 'sources/example.md',
            structuredMarkdown: '# Example',
            sectionHints: [],
            topicHints: [],
            sections: [],
            metadata: {
              title: 'Example Source',
              type: 'note',
              status: 'accepted',
              hash: 'hash-001',
              importedAt: '2026-04-23T00:00:00.000Z',
              preparedAt: '2026-04-23T00:00:00.000Z'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged-knowledge.json'),
        `${JSON.stringify(
          {
            inputArtifacts: [],
            entities: [],
            assertions: [],
            relations: [],
            evidenceAnchors: [],
            sectionCandidates: [],
            topicHints: []
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
                topicHints: ['design-patterns']
              },
              {
                sectionId: 'section-002',
                title: 'Review Gates',
                summary: 'High-impact changes require escalation.',
                topicHints: ['design-patterns']
              },
              {
                sectionId: 'section-003',
                title: 'Pattern Constraints',
                summary: 'Some sections need a brand-new host.',
                topicHints: ['pattern-constraints']
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
                title: 'Design Patterns',
                aliases: ['Pattern Intent', 'Review Gates'],
                summary: 'Reusable problem-solution structures.',
                source_refs: []
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveSourceTopicsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-source-topics-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/prepared-resource.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged-knowledge.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('resolved source topic plan for 3 sections into 2 source topics');
      expect(parsed.sourceTopics).toEqual([
        expect.objectContaining({
          sourceTopicId: 'source-topic-001',
          decision: 'reuse-topic',
          topicSlug: 'design-patterns',
          topicTitle: 'Design Patterns',
          sectionIds: ['section-001', 'section-002']
        }),
        expect.objectContaining({
          sourceTopicId: 'source-topic-002',
          decision: 'create-topic',
          topicSlug: 'pattern-constraints',
          topicTitle: 'Pattern Constraints',
          sectionIds: ['section-003']
        })
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses source-wide topic hints to plan one reused source topic before attaching sections', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-source-topics-source-wide-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'source-topics.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'prepared-resource.json'),
        `${JSON.stringify(
          {
            manifestId: 'source-002',
            rawPath: 'sources/example-2.md',
            structuredMarkdown: '# Example',
            sectionHints: [],
            topicHints: ['design-patterns'],
            sections: [],
            metadata: {
              title: 'Example Source 2',
              type: 'note',
              status: 'accepted',
              hash: 'hash-002',
              importedAt: '2026-04-23T00:00:00.000Z',
              preparedAt: '2026-04-23T00:00:00.000Z'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged-knowledge.json'),
        `${JSON.stringify(
          {
            inputArtifacts: [],
            entities: [],
            assertions: [],
            relations: [],
            evidenceAnchors: [],
            sectionCandidates: [],
            topicHints: [{ topicSlug: 'design-patterns', confidence: 'high' }]
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
                title: 'Intent Overview',
                summary: 'This section explains why the source exists.',
                topicHints: []
              },
              {
                sectionId: 'section-002',
                title: 'Operational Notes',
                summary: 'This section records source-specific observations.',
                topicHints: []
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
                title: 'Design Patterns',
                aliases: ['Architecture Patterns'],
                summary: 'Reusable problem-solution structures.',
                source_refs: []
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveSourceTopicsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-source-topics-source-wide-001'
        })
      );

      await tool.execute('tool-call-2', {
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/prepared-resource.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged-knowledge.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(parsed.sourceTopics).toEqual([
        expect.objectContaining({
          sourceTopicId: 'source-topic-001',
          decision: 'reuse-topic',
          topicSlug: 'design-patterns',
          topicTitle: 'Design Patterns',
          sectionIds: ['section-001', 'section-002']
        })
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('consolidates multiple alias-based reuse decisions into one reused source topic', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-source-topics-alias-merge-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'source-topics.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'prepared-resource.json'),
        `${JSON.stringify(
          {
            manifestId: 'source-003',
            rawPath: 'sources/example-3.md',
            structuredMarkdown: '# Example',
            sectionHints: [],
            topicHints: [],
            sections: [],
            metadata: {
              title: 'Example Source 3',
              type: 'note',
              status: 'accepted',
              hash: 'hash-003',
              importedAt: '2026-04-23T00:00:00.000Z',
              preparedAt: '2026-04-23T00:00:00.000Z'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged-knowledge.json'),
        `${JSON.stringify(
          {
            inputArtifacts: [],
            entities: [],
            assertions: [],
            relations: [],
            evidenceAnchors: [],
            sectionCandidates: [],
            topicHints: []
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
                title: 'Intent Overview',
                summary: 'Alias one matches the existing topic.',
                topicHints: ['pattern-intent']
              },
              {
                sectionId: 'section-002',
                title: 'Review Checkpoints',
                summary: 'Alias two matches the same existing topic.',
                topicHints: ['review-gates']
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
                title: 'Design Patterns',
                aliases: ['Pattern Intent', 'Review Gates'],
                summary: 'Reusable problem-solution structures.',
                source_refs: []
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveSourceTopicsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-source-topics-alias-merge-001'
        })
      );

      await tool.execute('tool-call-3', {
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/prepared-resource.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged-knowledge.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(parsed.sourceTopics).toEqual([
        expect.objectContaining({
          sourceTopicId: 'source-topic-001',
          decision: 'reuse-topic',
          topicSlug: 'design-patterns',
          topicTitle: 'Design Patterns',
          sectionIds: ['section-001', 'section-002']
        })
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('attaches no-hint sections when multiple source-wide hints collapse into one reused topic', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-source-topics-source-wide-collapse-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'source-topics.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'prepared-resource.json'),
        `${JSON.stringify(
          {
            manifestId: 'source-004',
            rawPath: 'sources/example-4.md',
            structuredMarkdown: '# Example',
            sectionHints: [],
            topicHints: ['pattern-intent'],
            sections: [],
            metadata: {
              title: 'Example Source 4',
              type: 'note',
              status: 'accepted',
              hash: 'hash-004',
              importedAt: '2026-04-23T00:00:00.000Z',
              preparedAt: '2026-04-23T00:00:00.000Z'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged-knowledge.json'),
        `${JSON.stringify(
          {
            inputArtifacts: [],
            entities: [],
            assertions: [],
            relations: [],
            evidenceAnchors: [],
            sectionCandidates: [],
            topicHints: [{ topicSlug: 'review-gates', confidence: 'high' }]
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
                title: 'Intent Overview',
                summary: 'First alias-backed section.',
                topicHints: ['pattern-intent']
              },
              {
                sectionId: 'section-002',
                title: 'Review Notes',
                summary: 'Second alias-backed section.',
                topicHints: ['review-gates']
              },
              {
                sectionId: 'section-003',
                title: 'Operational Notes',
                summary: 'This section has no explicit topic hints.',
                topicHints: []
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
                title: 'Design Patterns',
                aliases: ['Pattern Intent', 'Review Gates'],
                summary: 'Reusable problem-solution structures.',
                source_refs: []
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveSourceTopicsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-source-topics-source-wide-collapse-001'
        })
      );

      await tool.execute('tool-call-4', {
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/prepared-resource.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged-knowledge.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(parsed.sourceTopics).toEqual([
        expect.objectContaining({
          sourceTopicId: 'source-topic-001',
          decision: 'reuse-topic',
          topicSlug: 'design-patterns',
          topicTitle: 'Design Patterns',
          sectionIds: ['section-001', 'section-002', 'section-003']
        })
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not split create-topic planning when source-wide and explicit hints differ only by punctuation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-source-topics-punctuation-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'source-topics.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'prepared-resource.json'),
        `${JSON.stringify(
          {
            manifestId: 'source-005',
            rawPath: 'sources/example-5.md',
            structuredMarkdown: '# Example',
            sectionHints: [],
            topicHints: ['Pattern Intent'],
            sections: [],
            metadata: {
              title: 'Example Source 5',
              type: 'note',
              status: 'accepted',
              hash: 'hash-005',
              importedAt: '2026-04-23T00:00:00.000Z',
              preparedAt: '2026-04-23T00:00:00.000Z'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged-knowledge.json'),
        `${JSON.stringify(
          {
            inputArtifacts: [],
            entities: [],
            assertions: [],
            relations: [],
            evidenceAnchors: [],
            sectionCandidates: [],
            topicHints: []
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
                title: 'Intent Overview',
                summary: 'This section has a trailing colon in its explicit hint.',
                topicHints: ['Pattern Intent:']
              },
              {
                sectionId: 'section-002',
                title: 'Operational Notes',
                summary: 'This section has no explicit hint.',
                topicHints: []
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
            topics: []
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveSourceTopicsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-source-topics-punctuation-001'
        })
      );

      await tool.execute('tool-call-5', {
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/prepared-resource.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged-knowledge.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(parsed.sourceTopics).toEqual([
        expect.objectContaining({
          sourceTopicId: 'source-topic-001',
          decision: 'create-topic',
          topicSlug: 'pattern-intent',
          topicTitle: 'Pattern Intent',
          sectionIds: ['section-001', 'section-002']
        })
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not auto-attach no-hint sections when source-wide hints do not all collapse into the same reused topic', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-source-topics-mixed-source-wide-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'source-topics.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'prepared-resource.json'),
        `${JSON.stringify(
          {
            manifestId: 'source-006',
            rawPath: 'sources/example-6.md',
            structuredMarkdown: '# Example',
            sectionHints: [],
            topicHints: ['design-patterns', 'novel-topic'],
            sections: [],
            metadata: {
              title: 'Example Source 6',
              type: 'note',
              status: 'accepted',
              hash: 'hash-006',
              importedAt: '2026-04-23T00:00:00.000Z',
              preparedAt: '2026-04-23T00:00:00.000Z'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged-knowledge.json'),
        `${JSON.stringify(
          {
            inputArtifacts: [],
            entities: [],
            assertions: [],
            relations: [],
            evidenceAnchors: [],
            sectionCandidates: [],
            topicHints: []
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
                summary: 'This section explicitly reuses the existing topic.',
                topicHints: ['design-patterns']
              },
              {
                sectionId: 'section-002',
                title: 'Operational Notes',
                summary: 'This section has no explicit topic hints.',
                topicHints: []
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
                title: 'Design Patterns',
                aliases: ['Pattern Intent'],
                summary: 'Reusable problem-solution structures.',
                source_refs: []
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveSourceTopicsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-source-topics-mixed-source-wide-001'
        })
      );

      await tool.execute('tool-call-6', {
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/prepared-resource.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged-knowledge.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(parsed.sourceTopics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            decision: 'reuse-topic',
            topicSlug: 'design-patterns',
            sectionIds: ['section-001']
          }),
          expect.objectContaining({
            decision: 'create-topic',
            topicSlug: 'novel-topic',
            sectionIds: []
          }),
          expect.objectContaining({
            decision: 'create-topic',
            topicSlug: 'operational-notes',
            sectionIds: ['section-002']
          })
        ])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
