import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createMergeSectionCandidatesTool } from '../../../src/runtime/tools/merge-section-candidates.js';

describe('createMergeSectionCandidatesTool', () => {
  it('merges repeated section candidates into normalized sections', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-merge-section-candidates-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const mergedArtifactPath = path.join(artifactDirectory, 'merged.json');
      const sectionsArtifactPath = path.join(artifactDirectory, 'sections.json');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        mergedArtifactPath,
        `${JSON.stringify(
          {
            sectionCandidates: [
              {
                sectionCandidateId: 'sec-candidate-001',
                title: 'Pattern Intent',
                summary: 'Patch-first systems keep durable notes.',
                entityIds: ['ent-001'],
                assertionIds: ['assert-001'],
                evidenceAnchorIds: ['anchor-001'],
                body: 'Patch-first systems keep durable notes.'
              },
              {
                sectionCandidateId: 'sec-candidate-002',
                title: 'Pattern Intent',
                summary: 'They prefer incremental edits over rewrites.',
                entityIds: ['ent-002'],
                assertionIds: ['assert-002'],
                evidenceAnchorIds: ['anchor-002'],
                body: 'They prefer incremental edits over rewrites.'
              },
              {
                sectionCandidateId: 'sec-candidate-003',
                title: 'Review Gates',
                summary: 'High-impact changes require escalation.',
                entityIds: ['ent-003'],
                assertionIds: ['assert-003'],
                evidenceAnchorIds: ['anchor-003'],
                body: 'High-impact changes require escalation.'
              },
              {
                sectionCandidateId: 'sec-candidate-004',
                title: 'Review Gates',
                summary: 'Keep evidence attached.',
                entityIds: ['ent-004'],
                assertionIds: ['assert-004'],
                evidenceAnchorIds: ['anchor-004'],
                body: 'Keep evidence attached.'
              }
            ],
            assertions: [
              {
                assertionId: 'assert-001',
                text: 'Patch-first systems keep durable notes.',
                sectionCandidateId: 'sec-candidate-001',
                evidenceAnchorIds: ['anchor-001']
              },
              {
                assertionId: 'assert-002',
                text: 'They prefer incremental edits over rewrites.',
                sectionCandidateId: 'sec-candidate-002',
                evidenceAnchorIds: ['anchor-002']
              },
              {
                assertionId: 'assert-003',
                text: 'High-impact changes require escalation.',
                sectionCandidateId: 'sec-candidate-003',
                evidenceAnchorIds: ['anchor-003']
              },
              {
                assertionId: 'assert-004',
                text: 'Keep evidence attached.',
                sectionCandidateId: 'sec-candidate-004',
                evidenceAnchorIds: ['anchor-004']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createMergeSectionCandidatesTool(
        createRuntimeContext({
          root,
          runId: 'runtime-merge-section-candidates-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json'
      });
      const parsed = JSON.parse(await readFile(sectionsArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('merged 4 section candidates into 2 normalized sections');
      expect(parsed.sections[0]).toEqual(
        expect.objectContaining({
          sectionId: 'section-001',
          title: 'Pattern Intent',
          body: expect.stringContaining('Patch-first systems keep durable notes.'),
          assertionIds: expect.arrayContaining(['assert-001', 'assert-002']),
          evidenceAnchorIds: expect.arrayContaining(['anchor-001'])
        })
      );
      expect(parsed.sections).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('builds section body from related assertions when the candidate only has a short summary', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-merge-section-candidates-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-002');
      const mergedArtifactPath = path.join(artifactDirectory, 'merged.json');
      const sectionsArtifactPath = path.join(artifactDirectory, 'sections.json');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        mergedArtifactPath,
        `${JSON.stringify(
          {
            sectionCandidates: [
              {
                sectionCandidateId: 'sec-001',
                title: 'ThreadLocal的用途与基本使用',
                summary: 'ThreadLocal的用途与基本使用',
                evidenceAnchorIds: ['anchor-001', 'anchor-002']
              }
            ],
            assertions: [
              {
                assertionId: 'assert-001',
                text: 'ThreadLocal 用于为每个线程保存独立变量副本。',
                evidenceAnchorIds: ['anchor-001']
              },
              {
                assertionId: 'assert-002',
                text: '每个线程都可以独立修改自己的副本而不影响其他线程。',
                evidenceAnchorIds: ['anchor-002']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createMergeSectionCandidatesTool(
        createRuntimeContext({
          root,
          runId: 'runtime-merge-section-candidates-002'
        })
      );

      await tool.execute('tool-call-2', {
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-002/merged.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-002/sections.json'
      });
      const parsed = JSON.parse(await readFile(sectionsArtifactPath, 'utf8'));

      expect(parsed.sections[0]).toEqual(
        expect.objectContaining({
          title: 'ThreadLocal的用途与基本使用',
          body: expect.stringContaining('ThreadLocal 用于为每个线程保存独立变量副本。'),
          assertionIds: ['assert-001', 'assert-002']
        })
      );
      expect(parsed.sections[0].body).toContain('每个线程都可以独立修改自己的副本而不影响其他线程。');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
