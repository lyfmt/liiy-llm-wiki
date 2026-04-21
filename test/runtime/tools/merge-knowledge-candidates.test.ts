import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createMergeKnowledgeCandidatesTool } from '../../../src/runtime/tools/merge-knowledge-candidates.js';

describe('createMergeKnowledgeCandidatesTool', () => {
  it('deduplicates entities, assertions, relations, and evidence anchors across extractor batches', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-merge-knowledge-candidates-'));

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
            entities: [
              { entityId: 'ent-001', name: 'Patch-first system' },
              { entityId: 'ent-002', name: 'Review gate' }
            ],
            assertions: [
              { assertionId: 'assert-001', text: 'Patch-first systems keep durable notes.' },
              { assertionId: 'assert-002', text: 'Review gates slow down destructive changes.' }
            ],
            relations: [{ relationId: 'rel-001', fromEntityId: 'ent-001', toEntityId: 'ent-002', relationType: 'uses' }],
            evidenceAnchors: [
              { anchorId: 'anchor-001', blockId: 'block-001', quote: 'Patch-first systems keep durable notes.' },
              { anchorId: 'anchor-002', blockId: 'block-003', quote: 'High-impact changes require escalation.' }
            ]
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
            entities: [
              { entityId: 'ent-001', name: 'Patch-first system' },
              { entityId: 'ent-003', name: 'Worker subagent' }
            ],
            assertions: [
              { assertionId: 'assert-002', text: 'Review gates slow down destructive changes.' },
              { assertionId: 'assert-003', text: 'Worker subagents can read artifacts in batches.' }
            ],
            relations: [{ relationId: 'rel-002', fromEntityId: 'ent-003', toEntityId: 'ent-001', relationType: 'supports' }],
            evidenceAnchors: [
              { anchorId: 'anchor-002', blockId: 'block-003', quote: 'High-impact changes require escalation.' },
              { anchorId: 'anchor-003', blockId: 'block-006', quote: 'Worker subagents can read artifacts in batches.' }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createMergeKnowledgeCandidatesTool(
        createRuntimeContext({
          root,
          runId: 'runtime-merge-knowledge-candidates-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        inputArtifacts: [
          'state/artifacts/knowledge-insert/run-001/batches/batch-001.json',
          'state/artifacts/knowledge-insert/run-001/batches/batch-002.json'
        ],
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json'
      });
      const parsed = JSON.parse(await readFile(mergedArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('merged 2 knowledge candidate batches');
      expect(parsed.entities.map((entity: { entityId: string }) => entity.entityId)).toEqual([
        'ent-001',
        'ent-002',
        'ent-003'
      ]);
      expect(parsed.assertions).toHaveLength(3);
      expect(parsed.relations).toHaveLength(2);
      expect(parsed.evidenceAnchors).toHaveLength(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
