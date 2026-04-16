import { describe, expect, it } from 'vitest';

import { createChatSettings, createKnowledgeTask, createWebServer } from '../../src/index.js';
import type { ChatSettings, KnowledgeTask } from '../../src/index.js';

describe('new package entry exports', () => {
  it('re-exports task, chat settings, and web server APIs', () => {
    expect(typeof createKnowledgeTask).toBe('function');
    expect(typeof createChatSettings).toBe('function');
    expect(typeof createWebServer).toBe('function');

    const task: KnowledgeTask | null = null;
    const settings: ChatSettings | null = null;

    expect(task).toBeNull();
    expect(settings).toBeNull();
  });
});
