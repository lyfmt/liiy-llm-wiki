import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createResolveTopicHostsTool } from '../../../src/runtime/tools/resolve-topic-hosts.js';

describe('createResolveTopicHostsTool', () => {
  it('reuses existing topics when a matching host exists and suggests a new topic otherwise', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-topic-hosts-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const sectionsArtifactPath = path.join(artifactDirectory, 'sections.json');
      const topicCatalogArtifactPath = path.join(artifactDirectory, 'topic-catalog.json');
      const hostedSectionsArtifactPath = path.join(artifactDirectory, 'hosted-sections.json');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        sectionsArtifactPath,
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
        topicCatalogArtifactPath,
        `${JSON.stringify(
          {
            topics: [
              {
                topicSlug: 'design-patterns',
                title: 'Design Patterns',
                aliases: ['Pattern Intent', 'Review Gates']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveTopicHostsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-topic-hosts-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        topicCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/hosted-sections.json'
      });
      const parsed = JSON.parse(await readFile(hostedSectionsArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('resolved topic hosts for 3 sections');
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
          hostAction: 'create-topic'
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
