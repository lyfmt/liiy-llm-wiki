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
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('runIngestFlow', () => {
  it('persists only the source page, updates navigation, and records the ingest run for a new accepted source', async () => {
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
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(result.changeSet.target_files).toEqual([
        'wiki/sources/src-001.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);

      const sourcePage = await loadKnowledgePage(root, 'source', 'src-001');
      const runState = await loadRequestRunState(root, 'run-001');

      expect(sourcePage.page.source_refs).toEqual(['raw/accepted/design.md']);
      expect(sourcePage.page.outgoing_links).toEqual([]);
      expect(sourcePage.body).toContain('Patch-first updates keep page structure stable.');
      await expect(loadKnowledgePage(root, 'topic', 'patch-first-design')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).not.toContain(
        '- [patch-first-design](topics/patch-first-design.md)'
      );
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toContain('src-001');
      expect(runState.request_run.intent).toBe('ingest');
      expect(runState.request_run.status).toBe('done');
      expect(runState.request_run.touched_files).toEqual([
        'wiki/sources/src-001.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(runState.changeset?.target_files).toEqual([
        'wiki/sources/src-001.md',
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
      expect(await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).toBe(firstIndex);
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toBe(firstLog);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ignores an existing same-title topic instead of rewriting it during source ingest', async () => {
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
      expect(result.persisted).not.toContain('wiki/topics/patch-first-design.md');
      expect((await loadKnowledgePage(root, 'topic', 'patch-first-design')).body).toContain('Older wording.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows ingest for a newly created inbox source manifest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'buffered-brief.md'),
        '# Uploaded File\n\nAttachment body promoted into source.\n',
        'utf8'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-buffered-001',
          path: 'raw/accepted/buffered-brief.md',
          title: 'Buffered Brief',
          type: 'markdown',
          status: 'inbox',
          hash: 'sha256:buffered',
          imported_at: '2026-04-18T00:00:00.000Z'
        })
      );

      const result = await runIngestFlow(root, {
        runId: 'run-buffered-001',
        userRequest: 'ingest buffered brief',
        sourceId: 'src-buffered-001'
      });

      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.persisted).toEqual([
        'wiki/sources/src-buffered-001.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ingests a source with a Chinese title without producing an empty slug', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design-pattern-beauty.md'),
        '# 设计模式之美\n\n一本关于设计模式的书。\n',
        'utf8'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-cn-001',
          path: 'raw/accepted/design-pattern-beauty.md',
          title: '设计模式之美（王争）',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:cn001',
          imported_at: '2026-04-18T00:00:00.000Z'
        })
      );

      const result = await runIngestFlow(root, {
        runId: 'run-cn-001',
        userRequest: 'ingest chinese titled source',
        sourceId: 'src-cn-001'
      });

      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.persisted).toEqual([
        'wiki/sources/src-cn-001.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(await readFile(path.join(root, 'wiki', 'sources', 'src-cn-001.md'), 'utf8')).toContain('一本关于设计模式的书');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('leaves an existing multi-source topic page untouched while ingesting only the source page', async () => {
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

      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.persisted).toEqual(['wiki/sources/src-001.md', 'wiki/index.md', 'wiki/log.md']);
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toContain('src-001');
      const reviewRunState = await loadRequestRunState(root, 'run-004');
      expect(reviewRunState.request_run.status).toBe('done');
      expect(reviewRunState.changeset?.needs_review).toBe(false);
      expect((await loadKnowledgePage(root, 'topic', 'patch-first-design')).body).toContain('Older conflicting summary.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
