import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import { main } from '../../src/cli.js';
import { saveKnowledgePage } from '../../src/storage/knowledge-page-store.js';

describe('main run success path', () => {
  it('prints runtime output JSON for a query request', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cli-run-success-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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

      await main(
        ['node', 'cli.js', 'run', root, 'what is patch first?'],
        {
          bootstrapProject: async (projectRoot) => ({
            directories: [projectRoot],
            files: []
          }),
          runRuntimeAgent: async ({ root: projectRoot, runId }) => ({
            runId,
            intent: 'query',
            plan: ['inspect the question', 'query the wiki', 'summarize the answer with sources'],
            assistantText: 'Patch-first updates keep page structure stable.',
            toolOutcomes: [{ toolName: 'query_wiki', summary: 'Patch-first updates keep page structure stable.' }],
            savedRunState: path.join(projectRoot, 'state', 'runs', runId)
          })
        }
      );

      expect(logSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
        root: string;
        runId: string;
        intent: string;
        assistant: string;
        toolOutcomes: Array<{ toolName: string }>;
      };
      expect(output.root).toBe(root);
      expect(output.intent).toBe('query');
      expect(output.runId).toMatch(/[0-9a-f-]{36}/i);
      expect(output.assistant).toContain('Patch-first updates keep page structure stable.');
      expect(output.toolOutcomes).toEqual([
        {
          toolName: 'query_wiki',
          summary: 'Patch-first updates keep page structure stable.'
        }
      ]);
    } finally {
      logSpy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
