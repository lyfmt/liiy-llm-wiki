import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { runIngestFlow } from '../../../src/flows/ingest/run-ingest-flow.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';
import { loadRequestRunState } from '../../../src/storage/request-run-state-store.js';
import { loadKnowledgeTask } from '../../../src/storage/task-store.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('runIngestFlow', () => {
  it('persists source/topic pages, updates navigation, and records the ingest run for a new accepted source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await bootstrapProject(root);
      const rawPath = path.join(root, 'raw', 'accepted', 'design.md');
      const rawBody = '# Patch First\n\nPatch-first updates keep page structure stable.\n';
      await writeFile(rawPath, rawBody, 'utf8');
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

      const result = await runIngestFlow(root, {
        runId: 'run-001',
        userRequest: 'ingest raw/accepted/design.md',
        sourceId: 'src-001'
      });

      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.persisted).toEqual([
        'wiki/sources/src-001.md',
        'wiki/topics/patch-first-design.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(result.changeSet.target_files).toEqual([
        'wiki/sources/src-001.md',
        'wiki/topics/patch-first-design.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);

      const sourcePage = await loadKnowledgePage(root, 'source', 'src-001');
      const topicPage = await loadKnowledgePage(root, 'topic', 'patch-first-design');
      const runState = await loadRequestRunState(root, 'run-001');

      expect(sourcePage.page.source_refs).toEqual(['raw/accepted/design.md']);
      expect(sourcePage.page.outgoing_links).toEqual(['wiki/topics/patch-first-design.md']);
      expect(topicPage.page.source_refs).toEqual(['raw/accepted/design.md']);
      expect(topicPage.body).toContain('Patch-first updates keep page structure stable.');
      expect(await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).toContain(
        '- [patch-first-design](topics/patch-first-design.md)'
      );
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toContain('src-001');
      expect(runState.request_run.intent).toBe('ingest');
      expect(runState.request_run.status).toBe('done');
      expect(runState.request_run.touched_files).toEqual([
        'wiki/sources/src-001.md',
        'wiki/topics/patch-first-design.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(runState.changeset?.target_files).toEqual([
        'wiki/sources/src-001.md',
        'wiki/topics/patch-first-design.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(await readFile(rawPath, 'utf8')).toBe(rawBody);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not rewrite wiki files or append the log when ingesting the same source twice', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

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

      await runIngestFlow(root, {
        runId: 'run-001',
        userRequest: 'ingest raw/accepted/design.md',
        sourceId: 'src-001'
      });
      const firstSource = await readFile(path.join(root, 'wiki', 'sources', 'src-001.md'), 'utf8');
      const firstTopic = await readFile(path.join(root, 'wiki', 'topics', 'patch-first-design.md'), 'utf8');
      const firstIndex = await readFile(path.join(root, 'wiki', 'index.md'), 'utf8');
      const firstLog = await readFile(path.join(root, 'wiki', 'log.md'), 'utf8');

      const second = await runIngestFlow(root, {
        runId: 'run-002',
        userRequest: 'ingest raw/accepted/design.md again',
        sourceId: 'src-001'
      });

      expect(second.persisted).toEqual([]);
      expect(second.changeSet.patch_summary).toBe('no wiki changes required');
      expect(second.changeSet.target_files).toEqual([]);
      expect(await readFile(path.join(root, 'wiki', 'sources', 'src-001.md'), 'utf8')).toBe(firstSource);
      expect(await readFile(path.join(root, 'wiki', 'topics', 'patch-first-design.md'), 'utf8')).toBe(firstTopic);
      expect(await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).toBe(firstIndex);
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toBe(firstLog);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows a low-risk patch when the existing topic already belongs to the same accepted source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

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
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first-design.md',
          kind: 'topic',
          title: 'Patch First Design',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-11T00:00:00.000Z'
        }),
        '# Patch First Design\n\nOlder wording.\n'
      );

      const result = await runIngestFlow(root, {
        runId: 'run-003',
        userRequest: 'refresh patch-first topic',
        sourceId: 'src-001'
      });

      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.persisted).toContain('wiki/topics/patch-first-design.md');
      expect((await loadKnowledgePage(root, 'topic', 'patch-first-design')).body).toContain(
        'Patch-first updates keep page structure stable.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stops before writing when ingest would rewrite an existing multi-source topic page', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

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
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first-design.md',
          kind: 'topic',
          title: 'Patch First Design',
          source_refs: ['raw/accepted/older.md', 'raw/accepted/another.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First Design\n\nOlder conflicting summary.\n'
      );

      const result = await runIngestFlow(root, {
        runId: 'run-004',
        userRequest: 'ingest a conflicting source',
        sourceId: 'src-001'
      });

      expect(result.review).toEqual({
        needs_review: true,
        reasons: ['rewrites a core topic page']
      });
      expect(result.persisted).toEqual([]);
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toBe('# Wiki Log\n');
      const reviewRunState = await loadRequestRunState(root, 'run-004');
      expect(reviewRunState.request_run.status).toBe('needs_review');
      expect(reviewRunState.changeset?.needs_review).toBe(true);
      await expect(loadKnowledgeTask(root, 'review-run-004')).resolves.toMatchObject({
        id: 'review-run-004',
        status: 'needs_review',
        assignee: 'operator',
        evidence: expect.arrayContaining(['raw/accepted/design.md', 'wiki/topics/patch-first-design.md'])
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
