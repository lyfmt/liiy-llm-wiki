import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { runLintFlow } from '../../../src/flows/lint/run-lint-flow.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';
import { loadRequestRunState } from '../../../src/storage/request-run-state-store.js';

describe('runLintFlow', () => {
  it('finds missing links and orphan pages, rebuilds wiki/index.md, and records the lint run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-lint-'));

    try {
      await bootstrapProject(root);
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/missing.md'],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/what-is-patch-first.md',
          kind: 'query',
          title: 'What Is Patch First',
          summary: 'A reusable answer.',
          tags: ['patch-first', 'query'],
          source_refs: ['wiki/topics/patch-first.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# What Is Patch First\n\nA reusable answer.\n'
      );

      const result = await runLintFlow(root, {
        runId: 'run-101',
        userRequest: 'lint the wiki',
        autoFix: true
      });
      const runState = await loadRequestRunState(root, 'run-101');

      expect(result.autoFixed).toEqual(['wiki/index.md']);
      expect(result.reviewCandidates).toEqual([]);
      expect(result.findings).toEqual([
        {
          type: 'missing-link',
          severity: 'medium',
          evidence: ['wiki/topics/patch-first.md -> wiki/topics/missing.md'],
          suggested_action: 'remove or replace the missing outgoing link',
          resolution_status: 'open'
        },
        {
          type: 'orphan',
          severity: 'low',
          evidence: ['wiki/queries/what-is-patch-first.md'],
          suggested_action: 'link the page from another wiki page if it should stay discoverable',
          resolution_status: 'open'
        },
        {
          type: 'orphan',
          severity: 'low',
          evidence: ['wiki/topics/patch-first.md'],
          suggested_action: 'link the page from another wiki page if it should stay discoverable',
          resolution_status: 'open'
        }
      ]);
      expect(await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).toContain(
        '- [patch-first](topics/patch-first.md)'
      );
      expect(runState.request_run.intent).toBe('lint');
      expect(runState.request_run.status).toBe('done');
      expect(runState.request_run.touched_files).toEqual(['wiki/index.md']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('surfaces high-risk review candidates for conflicts, stale pages, and unsourced gaps without triggering writes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-lint-'));

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

      const result = await runLintFlow(root, {
        runId: 'run-102',
        userRequest: 'lint the wiki again',
        autoFix: false
      });

      expect(result.autoFixed).toEqual([]);
      expect(result.findings).toEqual([
        {
          type: 'conflict',
          severity: 'high',
          evidence: ['wiki/topics/unsourced.md'],
          suggested_action: 'review the conflicting evidence before changing the page',
          resolution_status: 'open'
        },
        {
          type: 'gap',
          severity: 'high',
          evidence: ['wiki/topics/unsourced.md'],
          suggested_action: 'add supporting source references or remove the unsupported conclusion',
          resolution_status: 'open'
        },
        {
          type: 'stale',
          severity: 'medium',
          evidence: ['wiki/topics/unsourced.md'],
          suggested_action: 'refresh the page against current evidence',
          resolution_status: 'open'
        },
        {
          type: 'orphan',
          severity: 'low',
          evidence: ['wiki/topics/unsourced.md'],
          suggested_action: 'link the page from another wiki page if it should stay discoverable',
          resolution_status: 'open'
        }
      ]);
      expect(result.reviewCandidates).toEqual([
        {
          type: 'conflict',
          severity: 'high',
          evidence: ['wiki/topics/unsourced.md'],
          suggested_action: 'review the conflicting evidence before changing the page',
          resolution_status: 'open'
        },
        {
          type: 'gap',
          severity: 'high',
          evidence: ['wiki/topics/unsourced.md'],
          suggested_action: 'add supporting source references or remove the unsupported conclusion',
          resolution_status: 'open'
        }
      ]);
      expect((await loadRequestRunState(root, 'run-102')).request_run.result_summary).toContain('4 finding');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
