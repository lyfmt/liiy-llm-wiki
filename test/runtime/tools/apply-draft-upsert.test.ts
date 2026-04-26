import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createApplyDraftUpsertTool } from '../../../src/runtime/tools/apply-draft-upsert.js';
import { loadKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('createApplyDraftUpsertTool', () => {
  it('applies a structured draft payload through governed upsert', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-apply-draft-'));

    try {
      await bootstrapProject(root);
      const tool = createApplyDraftUpsertTool(
        createRuntimeContext({
          root,
          runId: 'runtime-apply-draft-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        targetPath: 'wiki/topics/patch-first.md',
        upsertArguments: {
          kind: 'topic',
          slug: 'patch-first',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z',
          body: '# Patch First\n\nPatch-first updates keep page structure stable.\n',
          rationale: 'capture durable knowledge',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          aliases: [],
          tags: ['patch-first']
        }
      });

      expect(result.details.toolName).toBe('apply_draft_upsert');
      expect(result.details.resultMarkdown).toContain('Draft target: wiki/topics/patch-first.md');
      expect(result.details.touchedFiles).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
      expect((await loadKnowledgePage(root, 'topic', 'patch-first')).page.title).toBe('Patch First');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('applies taxonomy draft payloads into wiki/taxonomy and rebuilds navigation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-apply-draft-taxonomy-'));

    try {
      await bootstrapProject(root);
      const tool = createApplyDraftUpsertTool(
        createRuntimeContext({
          root,
          runId: 'runtime-apply-draft-taxonomy-001'
        })
      );

      const result = await tool.execute('tool-call-taxonomy-1', {
        targetPath: 'wiki/taxonomy/engineering.md',
        upsertArguments: {
          kind: 'taxonomy',
          slug: 'engineering',
          title: 'Engineering',
          summary: 'Shared engineering taxonomy.',
          status: 'active',
          updated_at: '2026-04-23T00:00:00.000Z',
          body: '# Engineering\n\nShared engineering taxonomy.\n',
          rationale: 'capture durable taxonomy',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          aliases: [],
          tags: ['taxonomy']
        }
      });

      expect(result.details.toolName).toBe('apply_draft_upsert');
      expect(result.details.resultMarkdown).toContain('Draft target: wiki/taxonomy/engineering.md');
      expect(result.details.touchedFiles).toEqual(['wiki/taxonomy/engineering.md', 'wiki/index.md', 'wiki/log.md']);
      expect((await loadKnowledgePage(root, 'taxonomy', 'engineering')).page.title).toBe('Engineering');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
