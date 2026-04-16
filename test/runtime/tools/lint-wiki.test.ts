import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createLintWikiTool } from '../../../src/runtime/tools/lint-wiki.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';
import { loadRequestRunState } from '../../../src/storage/request-run-state-store.js';

describe('createLintWikiTool', () => {
  it('runs lint with a nested tool run id and reports review candidates', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-lint-tool-'));

    try {
      await bootstrapProject(root);
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/unsourced.md',
          kind: 'topic',
          title: 'Unsourced',
          summary: 'Conflicting unsourced page.',
          tags: ['unsourced'],
          source_refs: [],
          outgoing_links: [],
          status: 'stale',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Unsourced\n\nConflict: source A and source B disagree.\n'
      );
      const runtimeContext = createRuntimeContext({
        root,
        runId: 'runtime-parent-002'
      });
      const tool = createLintWikiTool(runtimeContext);

      const result = await tool.execute('tool-call-2', {
        autoFix: false
      });

      expect(result.details.needsReview).toBe(true);
      expect(result.details.reviewReasons).toEqual([
        'conflict: wiki/topics/unsourced.md',
        'gap: wiki/topics/unsourced.md'
      ]);
      const nestedState = await loadRequestRunState(root, 'runtime-parent-002--lint-1');
      expect(nestedState.request_run.intent).toBe('lint');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
