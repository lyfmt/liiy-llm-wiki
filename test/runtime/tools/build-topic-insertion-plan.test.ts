import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createBuildTopicInsertionPlanTool } from '../../../src/runtime/tools/build-topic-insertion-plan.js';

describe('createBuildTopicInsertionPlanTool', () => {
  it('groups hosted sections by topic and builds append or create actions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-build-topic-insertion-plan-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const insertionPlanArtifactPath = path.join(artifactDirectory, 'topic-insertion-plan.json');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'hosted-sections.json'),
        `${JSON.stringify(
          {
            sections: [
              {
                sectionId: 'section-001',
                title: 'Pattern Intent',
                summary: 'Patch-first systems keep durable notes.',
                body: 'Patch-first systems keep durable notes.\n\nThey prefer incremental edits over rewrites.',
                hostTopicSlug: 'design-patterns',
                hostAction: 'reuse-topic'
              },
              {
                sectionId: 'section-002',
                title: 'Review Gates',
                summary: 'High-impact changes require escalation.',
                body: 'High-impact changes require escalation.\n\nKeep evidence attached.',
                hostTopicSlug: 'design-patterns',
                hostAction: 'reuse-topic'
              },
              {
                sectionId: 'section-003',
                title: 'Pattern Constraints',
                summary: 'This section needs a new topic.',
                body: 'This section needs a new topic.',
                suggestedTopicSlug: 'pattern-constraints',
                suggestedTopicTitle: 'Pattern Constraints',
                hostAction: 'create-topic'
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createBuildTopicInsertionPlanTool(
        createRuntimeContext({
          root,
          runId: 'runtime-build-topic-insertion-plan-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        hostedSectionsArtifact: 'state/artifacts/knowledge-insert/run-001/hosted-sections.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-insertion-plan.json'
      });
      const parsed = JSON.parse(await readFile(insertionPlanArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('built topic insertion plan for 2 topics');
      expect(parsed.topics[0]).toEqual(
        expect.objectContaining({
          topicSlug: 'design-patterns',
          action: 'revise-topic',
          sections: expect.arrayContaining([
            expect.objectContaining({
              sectionId: 'section-001',
              action: 'append-section',
              body: expect.stringContaining('Patch-first systems keep durable notes.')
            })
          ])
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
