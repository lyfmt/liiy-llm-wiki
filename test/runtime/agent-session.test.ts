import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAssistantMessageEventStream, getModel, type AssistantMessage, type Context, type ToolCall } from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';
import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import { createSourceManifest } from '../../src/domain/source-manifest.js';
import { runRuntimeAgent } from '../../src/runtime/agent-session.js';
import { saveKnowledgePage } from '../../src/storage/knowledge-page-store.js';
import { loadRequestRunState } from '../../src/storage/request-run-state-store.js';
import { saveSourceManifest } from '../../src/storage/source-manifest-store.js';

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

  it('runs a PI-backed ingest flow from sourcePath and records the ingest outcome', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n',
        'utf8'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'ingest raw/accepted/design.md',
        runId: 'runtime-agent-002',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createIngestByPathStream()
      });

      expect(result.intent).toBe('ingest');
      expect(result.toolOutcomes).toHaveLength(1);
      expect(result.toolOutcomes[0]?.toolName).toBe('ingest_source');
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Resolved raw/accepted/design.md');
      const runState = await loadRequestRunState(root, 'runtime-agent-002');
      expect(runState.request_run.intent).toBe('ingest');
      expect(runState.request_run.result_summary).toContain('Resolved raw/accepted/design.md to src-001.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses discovery before strict ingest for a natural-language source reference', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n',
        'utf8'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-12T00:00:00.000Z',
          tags: ['patch-first']
        })
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'ingest the patch first design doc',
        runId: 'runtime-agent-003',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createDiscoveryThenIngestStream()
      });

      expect(result.intent).toBe('ingest');
      expect(result.toolOutcomes.map((outcome) => outcome.toolName)).toEqual([
        'find_source_manifest',
        'ingest_source'
      ]);
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Selected candidate: src-001');
      expect(result.toolOutcomes[1]?.resultMarkdown).toContain('Persisted:');
      const runState = await loadRequestRunState(root, 'runtime-agent-003');
      expect(runState.request_run.decisions[0]).toContain('find_source_manifest');
      expect(runState.request_run.decisions[1]).toContain('ingest_source');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns discovery ambiguity without ingesting when candidates tie', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-agent-'));

    try {
      await bootstrapProject(root);
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/patch-first-a.md',
          title: 'Patch First',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:a',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-002',
          path: 'raw/accepted/patch-first-b.md',
          title: 'Patch First',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:b',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );

      const result = await runRuntimeAgent({
        root,
        userRequest: 'ingest the patch first doc',
        runId: 'runtime-agent-004',
        model: getModel('anthropic', 'claude-sonnet-4-20250514'),
        streamFn: createDiscoveryOnlyStream()
      });

      expect(result.intent).toBe('ingest');
      expect(result.toolOutcomes).toHaveLength(1);
      expect(result.toolOutcomes[0]?.toolName).toBe('find_source_manifest');
      expect(result.toolOutcomes[0]?.resultMarkdown).toContain('Ambiguous candidates');
      const runState = await loadRequestRunState(root, 'runtime-agent-004');
      expect(runState.request_run.touched_files).toEqual([]);
      expect(runState.request_run.result_summary).toContain('Ambiguous candidates');
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

function createIngestByPathStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1 ? buildIngestToolCallingAssistantMessage() : buildFinalAssistantMessage(context);

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

function createDiscoveryThenIngestStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildFindSourceManifestToolCallingAssistantMessage('patch first design doc')
        : callCount === 2
          ? buildIngestToolCallingAssistantMessageWithSourceId('src-001')
          : buildFinalAssistantMessage(context);

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

function createDiscoveryOnlyStream(): StreamFn {
  let callCount = 0;

  return async (_model, context) => {
    callCount += 1;
    const stream = createAssistantMessageEventStream();
    const assistantMessage =
      callCount === 1
        ? buildFindSourceManifestToolCallingAssistantMessage('patch first doc')
        : buildFinalAssistantMessage(context);

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

function buildIngestToolCallingAssistantMessage(): AssistantMessage {
  return buildIngestToolCallingAssistantMessageWithArgs({
    sourcePath: 'raw/accepted/design.md'
  });
}

function buildIngestToolCallingAssistantMessageWithSourceId(sourceId: string): AssistantMessage {
  return buildIngestToolCallingAssistantMessageWithArgs({ sourceId });
}

function buildIngestToolCallingAssistantMessageWithArgs(argumentsValue: Record<string, string>): AssistantMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'tool-call-ingest-1',
        name: 'ingest_source',
        arguments: argumentsValue
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

function buildFindSourceManifestToolCallingAssistantMessage(query: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'tool-call-find-source-1',
        name: 'find_source_manifest',
        arguments: {
          query
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
