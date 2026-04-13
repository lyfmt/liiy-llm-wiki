import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAssistantMessageEventStream, getModel, type AssistantMessage } from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';

import { runRuntimeAgent } from '../../src/runtime/agent-session.js';
import { loadRequestRunState } from '../../src/storage/request-run-state-store.js';

describe('runRuntimeAgent failure handling', () => {
  it('persists a failed top-level runtime run when the model stream rejects', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-failure-'));

    try {
      await expect(
        runRuntimeAgent({
          root,
          userRequest: 'what is patch first?',
          runId: 'runtime-agent-failed-001',
          model: getModel('anthropic', 'claude-sonnet-4-20250514'),
          streamFn: createFailingStream()
        })
      ).rejects.toThrow('synthetic runtime failure');

      const runState = await loadRequestRunState(root, 'runtime-agent-failed-001');
      expect(runState.request_run.status).toBe('failed');
      expect(runState.result_markdown).toContain('synthetic runtime failure');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createFailingStream(): StreamFn {
  return async () => {
    const stream = createAssistantMessageEventStream();
    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: [],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0
        }
      },
      stopReason: 'error',
      errorMessage: 'synthetic runtime failure',
      timestamp: Date.now()
    };

    queueMicrotask(() => {
      stream.push({ type: 'start', partial: assistantMessage });
      stream.push({ type: 'error', reason: 'error', error: assistantMessage });
    });

    return stream;
  };
}
