# Local MVP Flows Implementation Plan

> **Retained in active plans:** This is the final executed umbrella plan for the current local MVP baseline.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining local MVP gaps by finishing accepted-raw ingest, executable review-gate checks, and a basic lint flow on top of the already-built storage and query slices.

**Architecture:** Keep this cycle file-system only and deterministic. Reuse the existing domain objects plus storage modules, add a small review-gate policy layer, then implement ingest and lint flows that read and write the local wiki without introducing LLM/runtime integration yet. This cycle closes the spec’s current MVP blockers—repeat-stable ingest, sourced query, and high-impact review gating—while also persisting run artifacts through the existing `state/runs/*` storage module.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Vitest, existing JSON/YAML storage helpers

---

## File Structure

- Modify: `src/flows/ingest/read-raw-document.ts` — finish stable accepted-raw error behavior and keep the path boundary strict.
- Modify: `test/flows/ingest/read-raw-document.test.ts` — prove missing-file, traversal, and backslash cases.
- Create: `src/policies/review-gate.ts` — evaluate whether a `ChangeSet` must stop for review based on spec-aligned high-impact signals.
- Create: `test/policies/review-gate.test.ts` — verify schema edits, multi-topic changes, deletion, merge/split, unresolved conflict, and explicit review flags.
- Create: `src/flows/ingest/run-ingest-flow.ts` — build deterministic source/topic patches from accepted raw content, update `wiki/index.md` / `wiki/log.md`, persist request-run state, and stop on high-impact rewrites.
- Create: `test/flows/ingest/run-ingest-flow.test.ts` — verify ingest persistence, repeat stability, raw read-only safety, review-only behavior, and run-state persistence.
- Create: `src/flows/lint/run-lint-flow.ts` — scan the wiki for missing links, orphan pages, unsourced gaps, stale pages, and conflict markers; optionally rebuild `wiki/index.md`; persist lint run state.
- Create: `test/flows/lint/run-lint-flow.test.ts` — verify findings, low-risk auto-fix, high-risk review-candidate output, and run-state persistence.
- Modify: `src/index.ts` — export ingest, lint, and review-gate APIs.
- Create: `test/flows/ingest/index-exports.test.ts` — verify ingest exports.
- Create: `test/flows/lint/index-exports.test.ts` — verify lint exports.
- Create: `test/policies/index-exports.test.ts` — verify review-gate exports.

## Scope Notes

This plan completes the current deterministic local MVP loop for ingest, query, and lint over the local file system. It intentionally does **not** add `pi-ai` / `pi-agent-core` runtime integration, natural-language intent classification, or external model calls yet; if the MVP check still fails after this cycle, those become the next planning loop.

### Task 1: Finish accepted-raw reading and add spec-aligned review-gate policy

**Files:**
- Modify: `src/flows/ingest/read-raw-document.ts`
- Modify: `test/flows/ingest/read-raw-document.test.ts`
- Create: `src/policies/review-gate.ts`
- Create: `test/policies/review-gate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readRawDocument } from '../../../src/flows/ingest/read-raw-document.js';

describe('readRawDocument', () => {
  it('reads markdown from raw/accepted and returns its body', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      const acceptedDir = path.join(root, 'raw', 'accepted');
      await mkdir(acceptedDir, { recursive: true });
      await writeFile(path.join(acceptedDir, 'design.md'), '# Design\n\nPatch first stays stable.\n', 'utf8');

      await expect(readRawDocument(root, 'raw/accepted/design.md')).resolves.toBe(
        '# Design\n\nPatch first stays stable.\n'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects paths outside raw/accepted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await expect(readRawDocument(root, 'wiki/topics/patch-first.md')).rejects.toThrow(
        'Invalid raw document path'
      );
      await expect(readRawDocument(root, 'raw/inbox/design.md')).rejects.toThrow('Invalid raw document path');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['raw/accepted/../design.md', 'raw/accepted/./design.md', 'raw/accepted\\design.md'])(
    'rejects traversal-like accepted path %s',
    async (rawPath) => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

      try {
        await expect(readRawDocument(root, rawPath)).rejects.toThrow('Invalid raw document path');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it('wraps a missing accepted raw file with a stable error', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });

      await expect(readRawDocument(root, 'raw/accepted/missing.md')).rejects.toThrow(
        'Missing raw document: raw/accepted/missing.md'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';
import { evaluateReviewGate } from '../../src/policies/review-gate.js';

describe('evaluateReviewGate', () => {
  it('does not require review for a single low-risk topic patch', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'refresh one summary paragraph',
      rationale: 'accepted source confirms the current wording',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'low'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: false,
      reasons: []
    });
  });

  it('requires review for schema changes', () => {
    const changeSet = createChangeSet({
      target_files: ['schema/review-gates.md'],
      patch_summary: 'tighten policy wording',
      rationale: 'align schema with review policy',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'medium'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: true,
      reasons: ['modifies schema rules']
    });
  });

  it('requires review when a changeset spans multiple topic pages', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md', 'wiki/topics/llm-wiki.md'],
      patch_summary: 'realign two topic pages',
      rationale: 'shared judgment changed across topics',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'medium'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: true,
      reasons: ['touches multiple topic pages']
    });
  });

  it('requires review for a core topic rewrite', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'rewrite core topic page',
      rationale: 'the current summary would be replaced wholesale',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high'
    });

    expect(evaluateReviewGate(changeSet, { rewritesCoreTopic: true })).toEqual({
      needs_review: true,
      reasons: ['rewrites a core topic page']
    });
  });

  it('requires review for page deletion', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'delete obsolete topic page',
      rationale: 'page no longer belongs in the wiki',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high'
    });

    expect(evaluateReviewGate(changeSet, { deletesPage: true })).toEqual({
      needs_review: true,
      reasons: ['deletes wiki content']
    });
  });

  it('requires review for key-entity merge or split', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/entities/alpha.md', 'wiki/entities/beta.md'],
      patch_summary: 'merge duplicate entity pages',
      rationale: 'both pages represent the same system',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high'
    });

    expect(evaluateReviewGate(changeSet, { mergesOrSplitsEntity: true })).toEqual({
      needs_review: true,
      reasons: ['merges or splits key entities']
    });
  });

  it('requires review for unresolved evidence conflict', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'capture conflicting evidence',
      rationale: 'sources disagree on the current conclusion',
      source_refs: ['raw/accepted/a.md', 'raw/accepted/b.md'],
      risk_level: 'high'
    });

    expect(evaluateReviewGate(changeSet, { unresolvedConflict: true })).toEqual({
      needs_review: true,
      reasons: ['contains unresolved evidence conflict']
    });
  });

  it('requires review when explicitly marked', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'rewrite core topic page',
      rationale: 'manual escalation requested by flow logic',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high',
      needs_review: true
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: true,
      reasons: ['changeset explicitly marked for review']
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/read-raw-document.test.ts test/policies/review-gate.test.ts`
Expected: FAIL because `readRawDocument()` does not yet wrap missing-file errors and `../../src/policies/review-gate.js` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function isAcceptedRawPath(value: string): boolean {
  if (!value.startsWith('raw/accepted/')) {
    return false;
  }

  if (value.includes('\\')) {
    return false;
  }

  return !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

export async function readRawDocument(root: string, rawPath: string): Promise<string> {
  if (!isAcceptedRawPath(rawPath)) {
    throw new Error('Invalid raw document path');
  }

  try {
    return await readFile(path.join(root, rawPath), 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Missing raw document: ${rawPath}`);
    }

    throw error;
  }
}
```

```ts
import type { ChangeSet } from '../domain/change-set.js';

export interface ReviewGateSignals {
  rewritesCoreTopic?: boolean;
  deletesPage?: boolean;
  mergesOrSplitsEntity?: boolean;
  unresolvedConflict?: boolean;
}

export interface ReviewGateDecision {
  needs_review: boolean;
  reasons: string[];
}

export function evaluateReviewGate(
  changeSet: ChangeSet,
  signals: ReviewGateSignals = {}
): ReviewGateDecision {
  if (changeSet.needs_review) {
    return {
      needs_review: true,
      reasons: ['changeset explicitly marked for review']
    };
  }

  if (signals.rewritesCoreTopic) {
    return {
      needs_review: true,
      reasons: ['rewrites a core topic page']
    };
  }

  if (signals.deletesPage) {
    return {
      needs_review: true,
      reasons: ['deletes wiki content']
    };
  }

  if (signals.mergesOrSplitsEntity) {
    return {
      needs_review: true,
      reasons: ['merges or splits key entities']
    };
  }

  if (signals.unresolvedConflict) {
    return {
      needs_review: true,
      reasons: ['contains unresolved evidence conflict']
    };
  }

  if (changeSet.target_files.some((file) => file.startsWith('schema/'))) {
    return {
      needs_review: true,
      reasons: ['modifies schema rules']
    };
  }

  if (changeSet.target_files.filter((file) => file.startsWith('wiki/topics/')).length > 1) {
    return {
      needs_review: true,
      reasons: ['touches multiple topic pages']
    };
  }

  return {
    needs_review: false,
    reasons: []
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/read-raw-document.test.ts test/policies/review-gate.test.ts`
Expected: PASS with `11 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/flows/ingest/read-raw-document.ts test/flows/ingest/read-raw-document.test.ts src/policies/review-gate.ts test/policies/review-gate.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add raw ingest boundary checks and review gate policy
EOF
)"
```

### Task 2: Add deterministic ingest flow and persist run state

**Files:**
- Create: `src/flows/ingest/run-ingest-flow.ts`
- Create: `test/flows/ingest/run-ingest-flow.test.ts`
- Reuse: `src/flows/ingest/read-raw-document.ts`
- Reuse: `src/policies/review-gate.ts`
- Reuse: `src/storage/source-manifest-store.ts`
- Reuse: `src/storage/knowledge-page-store.ts`
- Reuse: `src/storage/list-knowledge-pages.ts`
- Reuse: `src/storage/request-run-state-store.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
      expect((await loadRequestRunState(root, 'run-004')).request_run.status).toBe('needs_review');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/run-ingest-flow.test.ts`
Expected: FAIL with a module resolution error for `../../../src/flows/ingest/run-ingest-flow.js`.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProjectPaths } from '../../config/project-paths.js';
import { createChangeSet, type ChangeSet } from '../../domain/change-set.js';
import { createKnowledgePage, type KnowledgePage } from '../../domain/knowledge-page.js';
import { createRequestRun } from '../../domain/request-run.js';
import { evaluateReviewGate, type ReviewGateDecision } from '../../policies/review-gate.js';
import { loadKnowledgePage, saveKnowledgePage, type LoadedKnowledgePage } from '../../storage/knowledge-page-store.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';
import { saveRequestRunState } from '../../storage/request-run-state-store.js';
import { loadSourceManifest } from '../../storage/source-manifest-store.js';
import { readRawDocument } from './read-raw-document.js';

export interface RunIngestFlowInput {
  runId: string;
  userRequest: string;
  sourceId: string;
}

export interface RunIngestFlowResult {
  changeSet: ChangeSet;
  review: ReviewGateDecision;
  persisted: string[];
}

export async function runIngestFlow(root: string, input: RunIngestFlowInput): Promise<RunIngestFlowResult> {
  const manifest = await loadSourceManifest(root, input.sourceId);

  if (manifest.status !== 'accepted') {
    throw new Error(`Invalid ingest source: ${manifest.id} is not accepted`);
  }

  const rawBody = await readRawDocument(root, manifest.path);
  const topicSlug = slugify(manifest.title);
  const sourcePath = `wiki/sources/${manifest.id}.md`;
  const topicPath = `wiki/topics/${topicSlug}.md`;
  const sourcePage = createKnowledgePage({
    path: sourcePath,
    kind: 'source',
    title: manifest.title,
    source_refs: [manifest.path],
    outgoing_links: [topicPath],
    status: 'active',
    updated_at: manifest.imported_at
  });
  const topicPage = createKnowledgePage({
    path: topicPath,
    kind: 'topic',
    title: manifest.title,
    source_refs: [manifest.path],
    outgoing_links: [],
    status: 'active',
    updated_at: manifest.imported_at
  });
  const sourceBody = renderSourceBody(manifest.title, manifest.path, rawBody);
  const topicBody = renderTopicBody(manifest.title, summarize(rawBody));
  const existingSource = await loadPageIfExists(root, 'source', manifest.id);
  const existingTopic = await loadPageIfExists(root, 'topic', topicSlug);
  const sourceChanged = hasPageChanged(existingSource, sourcePage, sourceBody);
  const topicChanged = hasPageChanged(existingTopic, topicPage, topicBody);
  const rewritesCoreTopic =
    existingTopic !== null && topicChanged && !sameStringArray(existingTopic.page.source_refs, [manifest.path]);

  const changedTargets: string[] = [];

  if (sourceChanged) {
    changedTargets.push(sourcePath);
  }

  if (topicChanged) {
    changedTargets.push(topicPath);
  }

  const writesNavigation = changedTargets.length > 0;

  if (writesNavigation) {
    changedTargets.push('wiki/index.md', 'wiki/log.md');
  }

  const changeSet = createChangeSet({
    target_files: changedTargets,
    patch_summary:
      changedTargets.length === 0
        ? 'no wiki changes required'
        : rewritesCoreTopic
          ? 'rewrite existing multi-source topic page'
          : 'apply accepted source patch',
    rationale: `ingest accepted source ${manifest.id}`,
    source_refs: [manifest.path],
    risk_level: rewritesCoreTopic ? 'high' : 'low',
    needs_review: rewritesCoreTopic
  });
  const review = evaluateReviewGate(changeSet, {
    rewritesCoreTopic
  });

  if (review.needs_review || changedTargets.length === 0) {
    await persistRunState(root, input, manifest.path, changeSet, review, []);

    return {
      changeSet,
      review,
      persisted: []
    };
  }

  const persisted: string[] = [];

  if (sourceChanged) {
    await saveKnowledgePage(root, sourcePage, sourceBody);
    persisted.push(sourcePath);
  }

  if (topicChanged) {
    await saveKnowledgePage(root, topicPage, topicBody);
    persisted.push(topicPath);
  }

  if (await rewriteWikiIndex(root)) {
    persisted.push('wiki/index.md');
  }

  if (await appendWikiLog(root, `- ingested ${manifest.id} from ${manifest.path}\n`)) {
    persisted.push('wiki/log.md');
  }

  await persistRunState(root, input, manifest.path, changeSet, review, persisted);

  return {
    changeSet,
    review,
    persisted
  };
}

async function persistRunState(
  root: string,
  input: RunIngestFlowInput,
  sourceRef: string,
  changeSet: ChangeSet,
  review: ReviewGateDecision,
  touchedFiles: string[]
): Promise<void> {
  await saveRequestRunState(root, {
    request_run: createRequestRun({
      run_id: input.runId,
      user_request: input.userRequest,
      intent: 'ingest',
      plan: ['read accepted raw source', 'derive wiki patch', review.needs_review ? 'queue review gate' : 'apply patch'],
      status: review.needs_review ? 'needs_review' : 'done',
      evidence: [sourceRef],
      touched_files: touchedFiles,
      decisions: review.needs_review ? review.reasons.map((reason) => `queue review gate: ${reason}`) : ['apply low-risk patch'],
      result_summary: review.needs_review ? 'ingest requires review' : touchedFiles.length === 0 ? 'no wiki changes required' : 'ingest applied'
    }),
    draft_markdown: `# Ingest Draft\n\n- Source: ${sourceRef}\n- Files: ${changeSet.target_files.join(', ') || '_none_'}\n`,
    result_markdown: review.needs_review
      ? `# Ingest Result\n\nQueued for review: ${review.reasons.join('; ')}\n`
      : `# Ingest Result\n\nTouched files: ${touchedFiles.join(', ') || '_none_'}\n`,
    changeset: changeSet
  });
}

async function loadPageIfExists(
  root: string,
  kind: 'source' | 'topic',
  slug: string
): Promise<LoadedKnowledgePage | null> {
  try {
    return await loadKnowledgePage(root, kind, slug);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function hasPageChanged(existing: LoadedKnowledgePage | null, page: KnowledgePage, body: string): boolean {
  if (!existing) {
    return true;
  }

  return (
    existing.page.title !== page.title ||
    !sameStringArray(existing.page.source_refs, page.source_refs) ||
    !sameStringArray(existing.page.outgoing_links, page.outgoing_links) ||
    existing.page.status !== page.status ||
    existing.page.updated_at !== page.updated_at ||
    existing.body !== body
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function summarize(rawBody: string): string {
  return rawBody
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .join(' ')
    .trim();
}

function renderSourceBody(title: string, rawPath: string, rawBody: string): string {
  return `# ${title}\n\nSource: ${rawPath}\n\n${rawBody.trim()}\n`;
}

function renderTopicBody(title: string, summary: string): string {
  return `# ${title}\n\n${summary}\n`;
}

function slugify(value: string): string {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');
}

async function rewriteWikiIndex(root: string): Promise<boolean> {
  const paths = buildProjectPaths(root);
  const sources = await listKnowledgePages(root, 'source');
  const entities = await listKnowledgePages(root, 'entity');
  const topics = await listKnowledgePages(root, 'topic');
  const queries = await listKnowledgePages(root, 'query');
  const content = `# Wiki Index\n\n## Sources\n${renderSection('sources', sources)}\n## Entities\n${renderSection('entities', entities)}\n## Topics\n${renderSection('topics', topics)}\n## Queries\n${renderSection('queries', queries)}`;

  await mkdir(path.dirname(paths.wikiIndex), { recursive: true });

  try {
    if ((await readFile(paths.wikiIndex, 'utf8')) === content) {
      return false;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await writeFile(paths.wikiIndex, content, 'utf8');
  return true;
}

function renderSection(directory: string, slugs: string[]): string {
  if (slugs.length === 0) {
    return '- _None_\n';
  }

  return `${slugs.map((slug) => `- [${slug}](${directory}/${slug}.md)`).join('\n')}\n`;
}

async function appendWikiLog(root: string, entry: string): Promise<boolean> {
  const paths = buildProjectPaths(root);

  await mkdir(path.dirname(paths.wikiLog), { recursive: true });

  let current = '';

  try {
    current = await readFile(paths.wikiLog, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (current.endsWith(entry)) {
    return false;
  }

  await writeFile(paths.wikiLog, `${current}${entry}`, 'utf8');
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/run-ingest-flow.test.ts`
Expected: PASS with `4 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/flows/ingest/run-ingest-flow.ts test/flows/ingest/run-ingest-flow.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add deterministic ingest flow
EOF
)"
```

### Task 3: Add a basic lint flow, review-candidate output, and lint run persistence

**Files:**
- Create: `src/flows/lint/run-lint-flow.ts`
- Create: `test/flows/lint/run-lint-flow.test.ts`
- Reuse: `src/storage/list-knowledge-pages.ts`
- Reuse: `src/storage/knowledge-page-store.ts`
- Reuse: `src/storage/request-run-state-store.ts`
- Reuse: `src/domain/finding.ts`
- Reuse: `src/domain/change-set.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/lint/run-lint-flow.test.ts`
Expected: FAIL with a module resolution error for `../../../src/flows/lint/run-lint-flow.js`.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProjectPaths } from '../../config/project-paths.js';
import { createChangeSet } from '../../domain/change-set.js';
import { createFinding, type Finding, type FindingType } from '../../domain/finding.js';
import { createRequestRun } from '../../domain/request-run.js';
import { loadKnowledgePage } from '../../storage/knowledge-page-store.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';
import { saveRequestRunState } from '../../storage/request-run-state-store.js';

export interface RunLintFlowInput {
  runId: string;
  userRequest: string;
  autoFix: boolean;
}

export interface RunLintFlowResult {
  findings: Finding[];
  autoFixed: string[];
  reviewCandidates: Finding[];
}

export async function runLintFlow(root: string, input: RunLintFlowInput): Promise<RunLintFlowResult> {
  const pages = await collectPages(root);
  const pagePaths = new Set(pages.map((page) => page.page.path));
  const incomingCounts = new Map<string, number>();
  const findings: Finding[] = [];

  for (const loaded of pages) {
    for (const outgoing of loaded.page.outgoing_links) {
      incomingCounts.set(outgoing, (incomingCounts.get(outgoing) ?? 0) + 1);

      if (!pagePaths.has(outgoing)) {
        findings.push(
          createFinding({
            type: 'missing-link',
            severity: 'medium',
            evidence: [`${loaded.page.path} -> ${outgoing}`],
            suggested_action: 'remove or replace the missing outgoing link',
            resolution_status: 'open'
          })
        );
      }
    }
  }

  for (const loaded of pages) {
    if (loaded.body.includes('Conflict:')) {
      findings.push(
        createFinding({
          type: 'conflict',
          severity: 'high',
          evidence: [loaded.page.path],
          suggested_action: 'review the conflicting evidence before changing the page',
          resolution_status: 'open'
        })
      );
    }

    if (loaded.page.source_refs.length === 0) {
      findings.push(
        createFinding({
          type: 'gap',
          severity: 'high',
          evidence: [loaded.page.path],
          suggested_action: 'add supporting source references or remove the unsupported conclusion',
          resolution_status: 'open'
        })
      );
    }

    if (loaded.page.status === 'stale') {
      findings.push(
        createFinding({
          type: 'stale',
          severity: 'medium',
          evidence: [loaded.page.path],
          suggested_action: 'refresh the page against current evidence',
          resolution_status: 'open'
        })
      );
    }

    if (loaded.page.kind !== 'source' && (incomingCounts.get(loaded.page.path) ?? 0) === 0) {
      findings.push(
        createFinding({
          type: 'orphan',
          severity: 'low',
          evidence: [loaded.page.path],
          suggested_action: 'link the page from another wiki page if it should stay discoverable',
          resolution_status: 'open'
        })
      );
    }
  }

  const sortedFindings = sortFindings(findings);
  const reviewCandidates = sortedFindings.filter((finding) => finding.severity === 'high');
  const autoFixed: string[] = [];

  if (input.autoFix && (await rewriteWikiIndex(root))) {
    autoFixed.push('wiki/index.md');
  }

  await saveRequestRunState(root, {
    request_run: createRequestRun({
      run_id: input.runId,
      user_request: input.userRequest,
      intent: 'lint',
      plan: ['scan wiki pages', input.autoFix ? 'rewrite wiki index' : 'skip auto-fix', 'record findings'],
      status: 'done',
      evidence: sortedFindings.flatMap((finding) => finding.evidence),
      touched_files: autoFixed,
      decisions: reviewCandidates.length === 0 ? ['no review candidates'] : ['record high-risk review candidates'],
      result_summary: `${sortedFindings.length} finding(s), ${reviewCandidates.length} review candidate(s)`
    }),
    draft_markdown: `# Lint Draft\n\n- Findings: ${sortedFindings.length}\n- Auto-fixed: ${autoFixed.join(', ') || '_none_'}\n`,
    result_markdown: `# Lint Result\n\nReview candidates: ${reviewCandidates.length}\n`,
    changeset:
      autoFixed.length === 0
        ? null
        : createChangeSet({
            target_files: autoFixed,
            patch_summary: 'rebuild wiki index from current page set',
            rationale: 'low-risk lint auto-fix to keep navigation structured',
            source_refs: [],
            risk_level: 'low'
          })
  });

  return {
    findings: sortedFindings,
    autoFixed,
    reviewCandidates
  };
}

async function collectPages(root: string) {
  const pages = [] as Array<Awaited<ReturnType<typeof loadKnowledgePage>>>;

  for (const kind of ['source', 'entity', 'topic', 'query'] as const) {
    for (const slug of await listKnowledgePages(root, kind)) {
      pages.push(await loadKnowledgePage(root, kind, slug));
    }
  }

  return pages;
}

async function rewriteWikiIndex(root: string): Promise<boolean> {
  const paths = buildProjectPaths(root);
  const sources = await listKnowledgePages(root, 'source');
  const entities = await listKnowledgePages(root, 'entity');
  const topics = await listKnowledgePages(root, 'topic');
  const queries = await listKnowledgePages(root, 'query');
  const content = `# Wiki Index\n\n## Sources\n${renderSection('sources', sources)}\n## Entities\n${renderSection('entities', entities)}\n## Topics\n${renderSection('topics', topics)}\n## Queries\n${renderSection('queries', queries)}`;

  await mkdir(path.dirname(paths.wikiIndex), { recursive: true });

  try {
    if ((await readFile(paths.wikiIndex, 'utf8')) === content) {
      return false;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await writeFile(paths.wikiIndex, content, 'utf8');
  return true;
}

function renderSection(directory: string, slugs: string[]): string {
  if (slugs.length === 0) {
    return '- _None_\n';
  }

  return `${slugs.map((slug) => `- [${slug}](${directory}/${slug}.md)`).join('\n')}\n`;
}

function sortFindings(findings: Finding[]): Finding[] {
  const severityRank = new Map<string, number>([
    ['high', 0],
    ['medium', 1],
    ['low', 2]
  ]);
  const typeRank = new Map<FindingType, number>([
    ['conflict', 0],
    ['gap', 1],
    ['stale', 2],
    ['missing-link', 3],
    ['orphan', 4]
  ]);

  return [...findings].sort((a, b) => {
    return (
      (severityRank.get(a.severity) ?? 99) - (severityRank.get(b.severity) ?? 99) ||
      (typeRank.get(a.type) ?? 99) - (typeRank.get(b.type) ?? 99) ||
      a.evidence.join('|').localeCompare(b.evidence.join('|'))
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/lint/run-lint-flow.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/flows/lint/run-lint-flow.ts test/flows/lint/run-lint-flow.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add basic wiki lint flow
EOF
)"
```

### Task 4: Export the local MVP flow APIs

**Files:**
- Modify: `src/index.ts`
- Create: `test/flows/ingest/index-exports.test.ts`
- Create: `test/flows/lint/index-exports.test.ts`
- Create: `test/policies/index-exports.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { readRawDocument, runIngestFlow } from '../../../src/index.js';
import type { RunIngestFlowInput, RunIngestFlowResult } from '../../../src/index.js';

describe('package entry ingest exports', () => {
  it('re-exports the ingest APIs and public types', () => {
    expect(typeof readRawDocument).toBe('function');
    expect(typeof runIngestFlow).toBe('function');

    const input: RunIngestFlowInput = {
      runId: 'run-001',
      userRequest: 'ingest raw/accepted/design.md',
      sourceId: 'src-001'
    };
    const result: RunIngestFlowResult | null = null;

    expect(input.sourceId).toBe('src-001');
    expect(result).toBeNull();
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import { runLintFlow } from '../../../src/index.js';
import type { RunLintFlowInput, RunLintFlowResult } from '../../../src/index.js';

describe('package entry lint exports', () => {
  it('re-exports the lint API and public types', () => {
    expect(typeof runLintFlow).toBe('function');

    const input: RunLintFlowInput = {
      runId: 'run-101',
      userRequest: 'lint the wiki',
      autoFix: false
    };
    const result: RunLintFlowResult | null = null;

    expect(input.autoFix).toBe(false);
    expect(result).toBeNull();
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import { evaluateReviewGate } from '../../src/index.js';
import type { ReviewGateDecision, ReviewGateSignals } from '../../src/index.js';

describe('package entry review-gate exports', () => {
  it('re-exports the review-gate API and public types', () => {
    expect(typeof evaluateReviewGate).toBe('function');

    const decision: ReviewGateDecision = {
      needs_review: false,
      reasons: []
    };
    const signals: ReviewGateSignals = {
      deletesPage: false
    };

    expect(decision.reasons).toEqual([]);
    expect(signals.deletesPage).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/index-exports.test.ts test/flows/lint/index-exports.test.ts test/policies/index-exports.test.ts`
Expected: FAIL because `src/index.ts` does not export the new ingest, lint, and review-gate APIs yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export { buildProjectPaths } from './config/project-paths.js';
export type { ProjectPaths } from './config/project-paths.js';
export { bootstrapProject } from './app/bootstrap-project.js';
export type { BootstrapProjectResult } from './app/bootstrap-project.js';
export { createSourceManifest } from './domain/source-manifest.js';
export type { SourceManifest, SourceManifestStatus } from './domain/source-manifest.js';
export { createKnowledgePage } from './domain/knowledge-page.js';
export type { KnowledgePage, KnowledgePageKind } from './domain/knowledge-page.js';
export { createRequestRun } from './domain/request-run.js';
export type { RequestRun, RequestRunStatus } from './domain/request-run.js';
export { createChangeSet } from './domain/change-set.js';
export type { ChangeSet } from './domain/change-set.js';
export { createFinding } from './domain/finding.js';
export type { Finding, FindingType } from './domain/finding.js';
export { buildRequestRunArtifactPaths } from './storage/request-run-artifact-paths.js';
export type { RequestRunArtifactPaths } from './storage/request-run-artifact-paths.js';
export { loadRequestRunState, saveRequestRunState } from './storage/request-run-state-store.js';
export type { RequestRunState } from './storage/request-run-state-store.js';
export { buildKnowledgePagePath } from './storage/knowledge-page-paths.js';
export { listKnowledgePages } from './storage/list-knowledge-pages.js';
export { loadKnowledgePage, saveKnowledgePage } from './storage/knowledge-page-store.js';
export type { LoadedKnowledgePage } from './storage/knowledge-page-store.js';
export { buildSourceManifestPath } from './storage/source-manifest-paths.js';
export { loadSourceManifest, saveSourceManifest } from './storage/source-manifest-store.js';
export { readRawDocument } from './flows/ingest/read-raw-document.js';
export { runIngestFlow } from './flows/ingest/run-ingest-flow.js';
export type { RunIngestFlowInput, RunIngestFlowResult } from './flows/ingest/run-ingest-flow.js';
export { runQueryFlow } from './flows/query/run-query-flow.js';
export type { RunQueryFlowInput, RunQueryFlowResult } from './flows/query/run-query-flow.js';
export { runLintFlow } from './flows/lint/run-lint-flow.js';
export type { RunLintFlowInput, RunLintFlowResult } from './flows/lint/run-lint-flow.js';
export { evaluateReviewGate } from './policies/review-gate.js';
export type { ReviewGateDecision, ReviewGateSignals } from './policies/review-gate.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/index-exports.test.ts test/flows/lint/index-exports.test.ts test/policies/index-exports.test.ts`
Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/index.ts test/flows/ingest/index-exports.test.ts test/flows/lint/index-exports.test.ts test/policies/index-exports.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: export local MVP flow APIs
EOF
)"
```

## Self-Review

- **Spec coverage:** Task 1 covers the raw-read boundary plus executable review-gate policy from sections 10.1–10.3, including deletion, key-entity merge/split, schema writes, multi-topic changes, and unresolved conflict. Task 2 covers the ingest path from section 9.1, updates `wiki/index.md` / `wiki/log.md`, preserves raw read-only safety, and records run artifacts through `state/runs/*`. Task 3 covers a basic lint path from section 9.3 with findings, low-risk auto-fix, and a separate high-risk review-candidate list instead of misusing review gate. Task 4 exposes the new APIs so the package surface matches the implemented local MVP flows. This cycle still defers `pi-ai` / `pi-agent-core` runtime integration and natural-language request routing.
- **Placeholder scan:** No `TODO`, `TBD`, “similar to Task N”, or empty code steps remain.
- **Type consistency:** `ReviewGateSignals`, `ReviewGateDecision`, `RunIngestFlowInput`, `RunIngestFlowResult`, `RunLintFlowInput`, and `RunLintFlowResult` are introduced once and reused consistently in later tasks.
