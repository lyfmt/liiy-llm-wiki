import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createAuditTopicHostingTool } from '../../../src/runtime/tools/audit-topic-hosting.js';

describe('createAuditTopicHostingTool', () => {
  it('fails when sections still lack an explicit topic host decision', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-topic-hosting-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'hosted-sections.json'),
        `${JSON.stringify(
          {
            sections: [
              {
                sectionId: 'section-001',
                title: 'Pattern Intent',
                hostTopicSlug: 'design-patterns',
                hostAction: 'reuse-topic'
              },
              {
                sectionId: 'section-003',
                title: 'Pattern Constraints',
                hostAction: 'hint-only'
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createAuditTopicHostingTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-topic-hosting-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        hostedSectionsArtifact: 'state/artifacts/knowledge-insert/run-001/hosted-sections.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-host-audit.json'
      });
      const hosting = result.details.data?.hosting as
        | {
            unhostedSectionIds: string[];
            canBuildInsertionPlan: boolean;
          }
        | undefined;

      expect(result.details.summary).toBe('topic host audit failed');
      expect(hosting?.unhostedSectionIds).toEqual(['section-003']);
      expect(hosting?.canBuildInsertionPlan).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
