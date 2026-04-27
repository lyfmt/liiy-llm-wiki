import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createAssignSectionsToTopicsTool } from '../../../src/runtime/tools/assign-sections-to-topics.js';

describe('createAssignSectionsToTopicsTool', () => {
  it('expands source topic decisions back onto each hosted section', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-assign-sections-to-topics-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'hosted-sections-v2.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'source-topics.json'),
        `${JSON.stringify(
          {
            sourceTopics: [
              {
                sourceTopicId: 'source-topic-001',
                decision: 'reuse-topic',
                topicSlug: 'design-patterns',
                topicTitle: 'Design Patterns',
                sectionIds: ['section-001', 'section-002']
              },
              {
                sourceTopicId: 'source-topic-002',
                decision: 'create-topic',
                topicSlug: 'pattern-constraints',
                topicTitle: 'Pattern Constraints',
                sectionIds: ['section-003']
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
                body: 'Patch-first systems keep durable notes.',
                topicHints: ['design-patterns']
              },
              {
                sectionId: 'section-002',
                title: 'Review Gates',
                summary: 'High-impact changes require escalation.',
                body: 'High-impact changes require escalation.',
                topicHints: ['design-patterns']
              },
              {
                sectionId: 'section-003',
                title: 'Pattern Constraints',
                summary: 'Some sections need a brand-new host.',
                body: 'Some sections need a brand-new host.',
                topicHints: ['pattern-constraints']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createAssignSectionsToTopicsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-assign-sections-to-topics-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        sourceTopicsArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/hosted-sections-v2.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('assigned 3 sections to 2 source topics');
      expect(parsed.sections[0]).toEqual(
        expect.objectContaining({
          sectionId: 'section-001',
          hostTopicSlug: 'design-patterns',
          hostAction: 'reuse-topic'
        })
      );
      expect(parsed.sections[2]).toEqual(
        expect.objectContaining({
          sectionId: 'section-003',
          suggestedTopicSlug: 'pattern-constraints',
          suggestedTopicTitle: 'Pattern Constraints',
          hostAction: 'create-topic'
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails fast when a source topic decision is invalid', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-assign-sections-invalid-decision-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'source-topics.json'),
        `${JSON.stringify(
          {
            sourceTopics: [
              {
                sourceTopicId: 'source-topic-001',
                decision: 'reuse_topik',
                topicSlug: 'design-patterns',
                topicTitle: 'Design Patterns',
                sectionIds: ['section-001']
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
                body: 'Patch-first systems keep durable notes.',
                topicHints: ['design-patterns']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createAssignSectionsToTopicsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-assign-sections-invalid-decision-001'
        })
      );

      await expect(
        tool.execute('tool-call-2', {
          sourceTopicsArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json',
          sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/hosted-sections-v2.json'
        })
      ).rejects.toThrow('Invalid source topics artifact');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
