import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAssistantMessageEventStream, getModel, type AssistantMessage, type Context, type ToolCall } from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';

import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import { runRuntimeAgent } from '../../src/runtime/agent-session.js';
import { saveKnowledgePage } from '../../src/storage/knowledge-page-store.js';
import { loadRequestRunState } from '../../src/storage/request-run-state-store.js';

describe('runRuntimeAgent', () => {
  it('runs a PI-backed query flow and persists a single runtime snapshot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'what is patch first?',
        runId: 'runtime-agent-001',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createQueryOnlyStream()
      });

      expect(result.intent).toBe('query');
      expect(result.toolOutcomes).toHaveLength(1);
      expect(result.toolOutcomes[0]?.toolName).toBe('query_wiki');
      expect(result.assistantText).toContain('Patch-first updates keep page structure stable.');
      const runState = await loadRequestRunState(root, 'runtime-agent-001');
      expect(runState.request_run.intent).toBe('query');
      expect(runState.request_run.touched_files).toEqual([]);
      expect(runState.request_run.result_summary).toContain('Patch-first updates keep page structure stable.');
      await expect(loadRequestRunState(root, 'runtime-agent-001--query-1')).rejects.toThrow(
        'Incomplete request run state: missing checkpoint.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createQueryOnlyStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1 ? buildToolCallingAssistantMessage(context) : buildFinalAssistantMessage(context);

    queueMicrotask(() => {
      stream.push({ type: 'start', partial: assistantMessage });

      if (assistantMessage.stopReason === 'toolUse') {
        stream.push({ type: 'toolcall_start', contentIndex: 0, partial: assistantMessage });
        stream.push({
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: assistantMessage.content[0] as ToolCall,
          partial: assistantMessage
        });
        stream.push({ type: 'done', reason: 'toolUse', message: assistantMessage });
        return;
      }

      stream.push({ type: 'text_start', contentIndex: 0, partial: assistantMessage });
      stream.push({
        type: 'text_delta',
        contentIndex: 0,
        delta: (assistantMessage.content[0] as { type: 'text'; text: string }).text,
        partial: assistantMessage
      });
      stream.push({
        type: 'text_end',
        contentIndex: 0,
        content: (assistantMessage.content[0] as { type: 'text'; text: string }).text,
        partial: assistantMessage
      });
      stream.push({ type: 'done', reason: 'stop', message: assistantMessage });
    });

    return stream;
  };
}

function buildToolCallingAssistantMessage(context: Context): AssistantMessage {
  const question = extractQuestion(context.messages[context.messages.length - 1]);

  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'tool-call-query-1',
        name: 'query_wiki',
        arguments: {
          question,
          persistQueryPage: false
        }
      }
    ],
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
    stopReason: 'toolUse',
    timestamp: Date.now()
  };
}

function buildFinalAssistantMessage(context: Context): AssistantMessage {
  const toolResult = context.messages[context.messages.length - 1];
  const text =
    toolResult && toolResult.role === 'toolResult'
      ? toolResult.content
          .filter((block): block is Extract<(typeof toolResult.content)[number], { type: 'text' }> => block.type === 'text')
          .map((block) => block.text)
          .join(' ')
      : 'No result';

  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
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
    stopReason: 'stop',
    timestamp: Date.now()
  };
}

function extractQuestion(message: Context['messages'][number] | undefined): string {
  if (!message || message.role !== 'user') {
    return 'what is patch first?';
  }

  const content = typeof message.content === 'string'
    ? message.content
    : message.content
        .filter((block): block is Extract<(typeof message.content)[number], { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join(' ');
  const match = content.match(/User request:\s*(.+?)\s+Detected intent:/i);

  return match?.[1] ?? 'what is patch first?';
}
