import { describe, expect, it } from 'vitest';

import {
  parsePartExtractionArtifact,
  parsePartitionPlanArtifact,
  parseTopicPlanArtifact
} from '../../../src/flows/knowledge-insert/pipeline-schema.js';

describe('knowledge insert pipeline schema', () => {
  it('parses valid topic, partition, and part extraction artifacts', () => {
    expect(parseTopicPlanArtifact({
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      sourceId: 'src-001',
      topics: [{ topicId: 'topic-a', slug: 'topic-a', title: 'Topic A', scope: 'Scope', rationale: 'Because' }]
    }).topics).toHaveLength(1);

    expect(parsePartitionPlanArtifact({
      schemaVersion: 'knowledge-insert.partition-plan.v3',
      sourceId: 'src-001',
      parts: [{ partId: 'part-001', title: 'Part', startLine: 1, endLine: 10, topicIds: ['topic-a'], rationale: 'Because' }]
    }).parts[0]?.startLine).toBe(1);

    expect(parsePartExtractionArtifact({
      schemaVersion: 'knowledge-insert.part-extraction.v3',
      sourceId: 'src-001',
      partId: 'part-001',
      sections: [],
      entities: [],
      concepts: [],
      evidenceAnchors: []
    }).partId).toBe('part-001');
  });

  it('rejects invalid line ranges and missing schema versions', () => {
    expect(() => parsePartitionPlanArtifact({
      schemaVersion: 'knowledge-insert.partition-plan.v3',
      sourceId: 'src-001',
      parts: [{ partId: 'part-001', title: 'Part', startLine: 10, endLine: 1, topicIds: [], rationale: 'Invalid' }]
    })).toThrow('Invalid partition part range');

    expect(() => parseTopicPlanArtifact({ sourceId: 'src-001', topics: [] })).toThrow('Invalid topic plan schemaVersion');
  });
});
