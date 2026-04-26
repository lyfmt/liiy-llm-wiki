import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createMergeExtractedKnowledgeTool } from '../../../src/runtime/tools/merge-extracted-knowledge.js';

describe('createMergeExtractedKnowledgeTool', () => {
  it('merges extraction batches into unified knowledge and section candidate pools', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-merge-extracted-knowledge-'));

    try {
      await bootstrapProject(root);
      const batchDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'batches');
      const mergedArtifactPath = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'merged.json');
      await mkdir(batchDirectory, { recursive: true });
      await writeFile(
        path.join(batchDirectory, 'batch-001.json'),
        `${JSON.stringify(
          {
            batchId: 'batch-001',
            entities: [{ entityId: 'ent-001', name: 'Patch-first system' }],
            assertions: [
              {
                assertionId: 'assert-001',
                text: 'Patch-first systems keep durable notes.',
                sectionCandidateId: 'sec-candidate-001'
              }
            ],
            relations: [],
            evidenceAnchors: [{ anchorId: 'anchor-001', blockId: 'block-001', quote: 'Patch-first systems keep durable notes.' }],
            sectionCandidates: [
              {
                sectionCandidateId: 'sec-candidate-001',
                title: 'Pattern Intent',
                summary: 'Patch-first systems keep durable notes.',
                entityIds: ['ent-001'],
                assertionIds: ['assert-001'],
                evidenceAnchorIds: ['anchor-001']
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
        path.join(batchDirectory, 'batch-002.json'),
        `${JSON.stringify(
          {
            batchId: 'batch-002',
            entities: [{ entityId: 'ent-002', name: 'Review gate' }],
            assertions: [
              {
                assertionId: 'assert-002',
                text: 'Review gates slow down destructive changes.',
                sectionCandidateId: 'sec-candidate-001'
              }
            ],
            relations: [{ relationId: 'rel-001', fromEntityId: 'ent-001', toEntityId: 'ent-002', relationType: 'uses' }],
            evidenceAnchors: [{ anchorId: 'anchor-002', blockId: 'block-003', quote: 'High-impact changes require escalation.' }],
            sectionCandidates: [
              {
                sectionCandidateId: 'sec-candidate-001',
                title: 'Pattern Intent',
                summary: 'Review gates shape patch-first practice.',
                entityIds: ['ent-002'],
                assertionIds: ['assert-002'],
                evidenceAnchorIds: ['anchor-002']
              }
            ],
            topicHints: [{ topicSlug: 'design-patterns', confidence: 'medium' }]
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(batchDirectory, 'batch-003.json'),
        `${JSON.stringify(
          {
            batchId: 'batch-003',
            entities: [{ entityId: 'ent-003', name: 'Worker subagent' }],
            assertions: [
              {
                assertionId: 'assert-003',
                text: 'Worker subagents can read artifacts in batches.',
                sectionCandidateId: 'sec-candidate-002'
              }
            ],
            relations: [{ relationId: 'rel-002', fromEntityId: 'ent-003', toEntityId: 'ent-001', relationType: 'supports' }],
            evidenceAnchors: [{ anchorId: 'anchor-003', blockId: 'block-006', quote: 'Worker subagents can read artifacts in batches.' }],
            sectionCandidates: [
              {
                sectionCandidateId: 'sec-candidate-002',
                title: 'Execution Model',
                summary: 'Worker subagents process block batches.'
              }
            ],
            topicHints: [{ topicSlug: 'subagent-runtime', confidence: 'medium' }]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createMergeExtractedKnowledgeTool(
        createRuntimeContext({
          root,
          runId: 'runtime-merge-extracted-knowledge-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        inputArtifacts: [
          'state/artifacts/knowledge-insert/run-001/batches/batch-001.json',
          'state/artifacts/knowledge-insert/run-001/batches/batch-002.json',
          'state/artifacts/knowledge-insert/run-001/batches/batch-003.json'
        ],
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json'
      });
      const parsed = JSON.parse(await readFile(mergedArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('merged 3 extraction batches');
      expect(parsed.sectionCandidates).toHaveLength(2);
      expect(parsed.assertions[0]).toEqual(expect.objectContaining({ sectionCandidateId: 'sec-candidate-001' }));
      expect(parsed.sectionCandidates[0]).toEqual(
        expect.objectContaining({
          sectionCandidateId: 'sec-candidate-001',
          entityIds: ['ent-001', 'ent-002'],
          assertionIds: ['assert-001', 'assert-002'],
          evidenceAnchorIds: ['anchor-001', 'anchor-002']
        })
      );
      expect(parsed.topicHints).toEqual(
        expect.arrayContaining([expect.objectContaining({ topicSlug: 'design-patterns' })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('normalizes real worker extraction schema variants before merging', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-merge-extracted-knowledge-'));

    try {
      await bootstrapProject(root);
      const batchDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-002', 'batches');
      const mergedArtifactPath = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-002', 'merged.json');
      await mkdir(batchDirectory, { recursive: true });
      await writeFile(
        path.join(batchDirectory, 'batch-001.json'),
        `${JSON.stringify(
          {
            entities: [{ id: 'ent-book-1', name: 'Java并发编程之美', type: 'book' }],
            assertions: [
              {
                id: 'as-001',
                subjectEntityId: 'ent-book-1',
                predicate: 'has_title',
                object: 'Java并发编程之美'
              }
            ],
            relations: [
              {
                id: 'rel-001',
                fromEntityId: 'ent-author-1',
                toEntityId: 'ent-book-1',
                relationType: 'author_of'
              }
            ],
            evidenceAnchors: [
              {
                id: 'ea-block-001',
                blockId: 'block-001',
                quote: 'Java并发编程之美'
              }
            ],
            sectionCandidates: [
              {
                id: 'sec-001',
                title: '书目信息',
                category: 'bibliographic_metadata',
                evidenceAnchorIds: ['ea-block-001']
              }
            ],
            topicHints: [
              {
                topic: 'Java并发编程'
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createMergeExtractedKnowledgeTool(
        createRuntimeContext({
          root,
          runId: 'runtime-merge-extracted-knowledge-real-schema-001'
        })
      );

      const result = await tool.execute('tool-call-real-schema-1', {
        inputArtifacts: ['state/artifacts/knowledge-insert/run-002/batches/batch-001.json'],
        outputArtifact: 'state/artifacts/knowledge-insert/run-002/merged.json'
      });
      const parsed = JSON.parse(await readFile(mergedArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('merged 1 extraction batches');
      expect(parsed.entities[0]).toEqual(expect.objectContaining({ entityId: 'ent-book-1', name: 'Java并发编程之美' }));
      expect(parsed.assertions[0]).toEqual(
        expect.objectContaining({
          assertionId: 'as-001',
          text: 'ent-book-1 has_title Java并发编程之美'
        })
      );
      expect(parsed.relations[0]).toEqual(expect.objectContaining({ relationId: 'rel-001' }));
      expect(parsed.evidenceAnchors[0]).toEqual(expect.objectContaining({ anchorId: 'ea-block-001' }));
      expect(parsed.sectionCandidates[0]).toEqual(
        expect.objectContaining({
          sectionCandidateId: 'sec-001',
          title: '书目信息',
          summary: 'bibliographic_metadata'
        })
      );
      expect(parsed.topicHints[0]).toEqual(expect.objectContaining({ topicSlug: 'java并发编程' }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts sectionId as an alias for sectionCandidateId in real worker outputs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-merge-extracted-knowledge-'));

    try {
      await bootstrapProject(root);
      const batchDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-003', 'batches');
      const mergedArtifactPath = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-003', 'merged.json');
      await mkdir(batchDirectory, { recursive: true });
      await writeFile(
        path.join(batchDirectory, 'batch-001.json'),
        `${JSON.stringify(
          {
            sectionCandidates: [
              {
                sectionId: 'sec-threadlocal',
                title: 'ThreadLocal的用途与基本使用',
                summary: 'ThreadLocal的用途与基本使用',
                topicHints: ['ThreadLocal']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createMergeExtractedKnowledgeTool(
        createRuntimeContext({
          root,
          runId: 'runtime-merge-extracted-knowledge-section-id-001'
        })
      );

      await tool.execute('tool-call-section-id-1', {
        inputArtifacts: ['state/artifacts/knowledge-insert/run-003/batches/batch-001.json'],
        outputArtifact: 'state/artifacts/knowledge-insert/run-003/merged.json'
      });
      const parsed = JSON.parse(await readFile(mergedArtifactPath, 'utf8'));

      expect(parsed.sectionCandidates[0]).toEqual(
        expect.objectContaining({
          sectionCandidateId: 'sec-threadlocal',
          title: 'ThreadLocal的用途与基本使用'
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
