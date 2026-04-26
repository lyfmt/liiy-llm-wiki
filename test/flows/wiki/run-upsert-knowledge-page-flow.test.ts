import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { runUpsertKnowledgePageFlow } from '../../../src/flows/wiki/run-upsert-knowledge-page-flow.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';
import { loadRequestRunState } from '../../../src/storage/request-run-state-store.js';
import { loadKnowledgeTask } from '../../../src/storage/task-store.js';

describe('runUpsertKnowledgePageFlow', () => {
  it('persists a new governed wiki page and updates navigation artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-upsert-page-'));

    try {
      await bootstrapProject(root);

      const result = await runUpsertKnowledgePageFlow(root, {
        runId: 'run-upsert-001',
        userRequest: 'create a topic page',
        kind: 'topic',
        slug: 'patch-first',
        title: 'Patch First',
        summary: 'Patch-first updates keep page structure stable.',
        tags: ['patch-first'],
        source_refs: ['raw/accepted/design.md'],
        outgoing_links: [],
        status: 'active',
        updated_at: '2026-04-13T00:00:00.000Z',
        body: '# Patch First\n\nPatch-first updates keep page structure stable.\n',
        rationale: 'capture a durable topic page'
      });

      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.page.source_refs).toEqual(['raw/accepted/design.md']);
      expect(result.persisted).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
      expect(await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).toContain('patch-first');
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toContain('upserted topic wiki/topics/patch-first.md');
      const runState = await loadRequestRunState(root, 'run-upsert-001');
      expect(runState.request_run.status).toBe('done');
      expect(runState.draft_markdown).toContain('## Proposed Body');
      expect(runState.draft_markdown).toContain('- Source refs: raw/accepted/design.md');
      expect(runState.draft_markdown).toContain('# Patch First');
      expect(runState.request_run.touched_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('queues review when rewriting a topic page with different source refs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-upsert-page-'));

    try {
      await bootstrapProject(root);
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Older summary.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/older.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nOlder summary.\n'
      );

      const result = await runUpsertKnowledgePageFlow(root, {
        runId: 'run-upsert-002',
        userRequest: 'rewrite the topic page',
        kind: 'topic',
        slug: 'patch-first',
        title: 'Patch First',
        summary: 'Patch-first updates keep page structure stable.',
        tags: ['patch-first'],
        source_refs: ['raw/accepted/design.md'],
        outgoing_links: [],
        status: 'active',
        updated_at: '2026-04-13T00:00:00.000Z',
        body: '# Patch First\n\nPatch-first updates keep page structure stable.\n',
        rationale: 'refresh the topic from a different source'
      });

      expect(result.review).toEqual({ needs_review: true, reasons: ['rewrites a core topic page'] });
      expect(result.persisted).toEqual([]);
      const runState = await loadRequestRunState(root, 'run-upsert-002');
      expect(runState.request_run.status).toBe('needs_review');
      expect(runState.draft_markdown).toContain('## Proposed Body');
      expect(runState.draft_markdown).toContain('- Source refs: raw/accepted/design.md');
      expect(runState.changeset?.target_files).toEqual(['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md']);
      await expect(loadKnowledgeTask(root, 'review-run-upsert-002')).resolves.toMatchObject({
        id: 'review-run-upsert-002',
        status: 'needs_review',
        assignee: 'operator',
        evidence: expect.arrayContaining(['wiki/topics/patch-first.md', 'raw/accepted/design.md'])
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists taxonomy pages into wiki/taxonomy and updates navigation artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-upsert-page-taxonomy-'));

    try {
      await bootstrapProject(root);

      const result = await runUpsertKnowledgePageFlow(root, {
        runId: 'run-upsert-taxonomy-001',
        userRequest: 'create a taxonomy page',
        kind: 'taxonomy',
        slug: 'engineering',
        title: 'Engineering',
        summary: 'Shared engineering taxonomy.',
        tags: ['taxonomy'],
        source_refs: ['raw/accepted/design.md'],
        outgoing_links: [],
        status: 'active',
        updated_at: '2026-04-23T00:00:00.000Z',
        body: '# Engineering\n\nShared engineering taxonomy.\n',
        rationale: 'capture a durable taxonomy page'
      });

      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.persisted).toEqual(['wiki/taxonomy/engineering.md', 'wiki/index.md', 'wiki/log.md']);
      expect(await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).toContain('taxonomy/engineering.md');
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toContain(
        'upserted taxonomy wiki/taxonomy/engineering.md'
      );
      const runState = await loadRequestRunState(root, 'run-upsert-taxonomy-001');
      expect(runState.request_run.touched_files).toEqual(['wiki/taxonomy/engineering.md', 'wiki/index.md', 'wiki/log.md']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
