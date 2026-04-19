import { describe, expect, it } from 'vitest';

import { createChatSettings, createGraphEdge, createGraphNode, createKnowledgeTask, createWebServer } from '../../src/index.js';
import type { ChatSettings, GraphEdgeType, GraphNodeKind, KnowledgeTask } from '../../src/index.js';

describe('new package entry exports', () => {
  it('re-exports task, chat settings, graph domain, and web server APIs', () => {
    expect(typeof createKnowledgeTask).toBe('function');
    expect(typeof createChatSettings).toBe('function');
    expect(typeof createGraphNode).toBe('function');
    expect(typeof createGraphEdge).toBe('function');
    expect(typeof createWebServer).toBe('function');

    const task: KnowledgeTask | null = null;
    const settings: ChatSettings | null = null;
    const nodeKind: GraphNodeKind = 'topic';
    const edgeType: GraphEdgeType = 'supported_by';

    expect(task).toBeNull();
    expect(settings).toBeNull();
    expect(nodeKind).toBe('topic');
    expect(edgeType).toBe('supported_by');
  });
});
