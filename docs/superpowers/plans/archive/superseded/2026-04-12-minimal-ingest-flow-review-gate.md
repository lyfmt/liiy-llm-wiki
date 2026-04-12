# Minimal Ingest Flow with Review Gate Implementation Plan

> **Deprecated on 2026-04-12:** This plan was superseded by `docs/superpowers/plans/2026-04-12-local-mvp-flows.md` and is kept only for historical traceability.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic local ingest flow that reads accepted raw markdown, updates wiki pages without oscillating on repeat ingest, and flags high-impact changes through a review gate.

**Architecture:** Keep this slice file-system only and deterministic. Add a small raw-document reader plus a minimal ingest flow that derives a source page and a stable topic page from accepted raw markdown, records a `ChangeSet`, and returns whether the change must enter review. Use lexical hashing of the raw body plus deterministic page rendering so repeated ingest of the same source produces identical wiki output and no unstable rewrites.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Node.js `crypto`, Vitest, existing JSON/YAML storage helpers

---

## File Structure

- Create: `src/flows/ingest/read-raw-document.ts` — load accepted raw markdown and reject non-raw or missing inputs.
- Create: `test/flows/ingest/read-raw-document.test.ts` — verify accepted raw reads and boundary enforcement.
- Create: `src/policies/review-gate.ts` — decide whether a candidate `ChangeSet` requires review based on current spec triggers.
- Create: `test/policies/review-gate.test.ts` — verify high-impact actions trigger review and low-risk actions do not.
- Create: `src/flows/ingest/run-ingest-flow.ts` — build deterministic source/topic updates, create a `ChangeSet`, persist low-risk changes, and surface review-required changes without mutating wiki files.
- Create: `test/flows/ingest/run-ingest-flow.test.ts` — verify repeat-ingest stability, wiki traceability, and review-gate behavior.
- Modify: `src/index.ts` — export the new ingest and policy APIs.
- Create: `test/flows/ingest/index-exports.test.ts` — verify ingest exports.
- Create: `test/policies/index-exports.test.ts` — verify policy exports.
- Modify: `test/storage/index-exports.test.ts` — keep package-entry export coverage aligned.

## Scope Notes

This plan covers only a deterministic local ingest path over accepted raw markdown plus spec-aligned review-gate evaluation. It intentionally does **not** add LLM synthesis, mixed-intent orchestration, CLI wiring, automatic entity extraction, or lint scanning yet.

### Task 1: Add accepted raw document reading

**Files:**
- Create: `src/flows/ingest/read-raw-document.ts`
- Create: `test/flows/ingest/read-raw-document.test.ts`

- [ ] **Step 1: Write the failing test**

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/read-raw-document.test.ts`
Expected: FAIL with a module resolution error for `../../../src/flows/ingest/read-raw-document.js`.

- [ ] **Step 3: Write minimal implementation**

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

  return await readFile(path.join(root, rawPath), 'utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/read-raw-document.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/flows/ingest/read-raw-document.ts test/flows/ingest/read-raw-document.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add accepted raw document reader
EOF
)"
```

### Task 2: Add review-gate decision policy

**Files:**
- Create: `src/policies/review-gate.ts`
- Create: `test/policies/review-gate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';
import { evaluateReviewGate } from '../../src/policies/review-gate.js';

describe('evaluateReviewGate', () => {
  it('does not require review for a single low-risk topic patch', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'refresh summary paragraph',
      rationale: 'new source confirms current wording',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'low'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: false,
      reasons: []
    });
  });

  it('requires review when a changeset spans multiple topic pages', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md', 'wiki/topics/llm-wiki.md'],
      patch_summary: 'realign both topic summaries',
      rationale: 'update shared judgment across topics',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'medium'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: true,
      reasons: ['touches multiple topic pages']
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/policies/review-gate.test.ts`
Expected: FAIL with a module resolution error for `../../src/policies/review-gate.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ChangeSet } from '../domain/change-set.js';

export interface ReviewGateDecision {
  needs_review: boolean;
  reasons: string[];
}

export function evaluateReviewGate(changeSet: ChangeSet): ReviewGateDecision {
  const reasons: string[] = [];
  const topicTargets = changeSet.target_files.filter((file) => file.startsWith('wiki/topics/'));

  if (topicTargets.length > 1) {
    reasons.push('touches multiple topic pages');
  }

  if (changeSet.needs_review) {
    reasons.push('changeset explicitly marked for review');
  }

  if (changeSet.risk_level === 'high') {
    reasons.push('risk level is high');
  }

  return {
    needs_review: reasons.length > 0,
    reasons
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/policies/review-gate.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/policies/review-gate.ts test/policies/review-gate.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add review gate policy
EOF
)"
```

### Task 3: Add deterministic ingest flow

**Files:**
- Create: `src/flows/ingest/run-ingest-flow.ts`
- Create: `test/flows/ingest/run-ingest-flow.test.ts`
- Reuse: `src/flows/ingest/read-raw-document.ts`
- Reuse: `src/storage/knowledge-page-store.ts`
- Reuse: `src/storage/source-manifest-store.ts`
- Reuse: `src/policies/review-gate.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { runIngestFlow } from '../../../src/flows/ingest/run-ingest-flow.js';
import { loadKnowledgePage } from '../../../src/storage/knowledge-page-store.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('runIngestFlow', () => {
  it('persists deterministic source and topic pages for an accepted source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
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
          hash: 'sha256:seed'
        })
      );

      const result = await runIngestFlow(root, { sourceId: 'src-001' });

      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.changeSet.target_files).toEqual([
        'wiki/sources/src-001.md',
        'wiki/topics/patch-first-design.md'
      ]);
      expect(result.persisted).toEqual([
        'wiki/sources/src-001.md',
        'wiki/topics/patch-first-design.md'
      ]);

      const sourcePage = await loadKnowledgePage(root, 'source', 'src-001');
      const topicPage = await loadKnowledgePage(root, 'topic', 'patch-first-design');

      expect(sourcePage.page.source_refs).toEqual(['raw/accepted/design.md']);
      expect(topicPage.page.source_refs).toEqual(['raw/accepted/design.md']);
      expect(topicPage.body).toContain('Patch-first updates keep page structure stable.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not rewrite wiki output when ingesting the same source twice', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
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
          hash: 'sha256:seed'
        })
      );

      await runIngestFlow(root, { sourceId: 'src-001' });
      const firstSource = await readFile(path.join(root, 'wiki', 'sources', 'src-001.md'), 'utf8');
      const firstTopic = await readFile(path.join(root, 'wiki', 'topics', 'patch-first-design.md'), 'utf8');

      const second = await runIngestFlow(root, { sourceId: 'src-001' });
      const secondSource = await readFile(path.join(root, 'wiki', 'sources', 'src-001.md'), 'utf8');
      const secondTopic = await readFile(path.join(root, 'wiki', 'topics', 'patch-first-design.md'), 'utf8');

      expect(second.persisted).toEqual([]);
      expect(second.changeSet.patch_summary).toBe('no wiki changes required');
      expect(secondSource).toBe(firstSource);
      expect(secondTopic).toBe(firstTopic);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a review-only changeset when the candidate change is high impact', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
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
          hash: 'sha256:seed'
        })
      );

      const result = await runIngestFlow(root, {
        sourceId: 'src-001',
        forceReview: true
      });

      expect(result.review).toEqual({
        needs_review: true,
        reasons: ['changeset explicitly marked for review']
      });
      expect(result.persisted).toEqual([]);
      await expect(loadKnowledgePage(root, 'source', 'src-001')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/run-ingest-flow.test.ts`
Expected: FAIL with a module resolution error for `../../../src/flows/ingest/run-ingest-flow.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';

import { createChangeSet, type ChangeSet } from '../../domain/change-set.js';
import { createKnowledgePage } from '../../domain/knowledge-page.js';
import { evaluateReviewGate, type ReviewGateDecision } from '../../policies/review-gate.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../storage/knowledge-page-store.js';
import { loadSourceManifest } from '../../storage/source-manifest-store.js';
import { readRawDocument } from './read-raw-document.js';

export interface RunIngestFlowInput {
  sourceId: string;
  forceReview?: boolean;
}

export interface RunIngestFlowResult {
  changeSet: ChangeSet;
  review: ReviewGateDecision;
  persisted: string[];
}

export async function runIngestFlow(root: string, input: RunIngestFlowInput): Promise<RunIngestFlowResult> {
  const manifest = await loadSourceManifest(root, input.sourceId);
  const rawBody = await readRawDocument(root, manifest.path);
  const summary = summarize(rawBody);
  const sourcePath = `wiki/sources/${manifest.id}.md`;
  const topicSlug = slugify(manifest.title);
  const topicPath = `wiki/topics/${topicSlug}.md`;
  const desiredSource = renderSourceBody(manifest.title, manifest.path, rawBody);
  const desiredTopic = renderTopicBody(summary, manifest.path);
  const existingSource = await loadBodyIfExists(root, 'source', manifest.id);
  const existingTopic = await loadBodyIfExists(root, 'topic', topicSlug);
  const target_files = [sourcePath, topicPath];
  const changedTargets = target_files.filter((filePath) => {
    if (filePath === sourcePath) {
      return existingSource !== desiredSource;
    }

    return existingTopic !== desiredTopic;
  });
  const changeSet = createChangeSet({
    target_files,
    patch_summary: changedTargets.length === 0 ? 'no wiki changes required' : `update ${changedTargets.length} wiki page(s) from accepted source`,
    rationale: `ingest ${manifest.id} from accepted raw input`,
    source_refs: [manifest.path],
    risk_level: input.forceReview ? 'high' : 'low',
    needs_review: input.forceReview ?? false
  });
  const review = evaluateReviewGate(changeSet);

  if (review.needs_review || changedTargets.length === 0) {
    return {
      changeSet,
      review,
      persisted: []
    };
  }

  const timestamp = buildStableTimestamp(rawBody);
  await saveKnowledgePage(
    root,
    createKnowledgePage({
      path: sourcePath,
      kind: 'source',
      title: manifest.title,
      source_refs: [manifest.path],
      outgoing_links: [topicPath],
      status: 'active',
      updated_at: timestamp
    }),
    desiredSource
  );
  await saveKnowledgePage(
    root,
    createKnowledgePage({
      path: topicPath,
      kind: 'topic',
      title: manifest.title,
      source_refs: [manifest.path],
      outgoing_links: [],
      status: 'active',
      updated_at: timestamp
    }),
    desiredTopic
  );

  return {
    changeSet,
    review,
    persisted: changedTargets
  };
}

async function loadBodyIfExists(root: string, kind: 'source' | 'topic', slug: string): Promise<string | null> {
  try {
    return (await loadKnowledgePage(root, kind, slug)).body;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
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

function renderTopicBody(summary: string, rawPath: string): string {
  return `# Summary\n\n${summary}\n\nSource refs: ${rawPath}\n`;
}

function slugify(value: string): string {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');
}

function buildStableTimestamp(rawBody: string): string {
  const digest = createHash('sha256').update(rawBody).digest('hex').slice(0, 8);

  return `2026-04-12T00:00:00.000Z#${digest}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/run-ingest-flow.test.ts`
Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/flows/ingest/run-ingest-flow.ts test/flows/ingest/run-ingest-flow.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add deterministic ingest flow
EOF
)"
```

### Task 4: Export the ingest and policy APIs

**Files:**
- Modify: `src/index.ts`
- Modify: `test/storage/index-exports.test.ts`
- Create: `test/flows/ingest/index-exports.test.ts`
- Create: `test/policies/index-exports.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { readRawDocument, runIngestFlow } from '../../../src/index.js';
import type { RunIngestFlowInput, RunIngestFlowResult } from '../../../src/index.js';

describe('package entry ingest exports', () => {
  it('re-exports the ingest flow APIs and public types', () => {
    expect(typeof readRawDocument).toBe('function');
    expect(typeof runIngestFlow).toBe('function');

    const input: RunIngestFlowInput = {
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

import { evaluateReviewGate } from '../../src/index.js';
import type { ReviewGateDecision } from '../../src/index.js';

describe('package entry policy exports', () => {
  it('re-exports the review gate policy API and public types', () => {
    expect(typeof evaluateReviewGate).toBe('function');

    const decision: ReviewGateDecision = {
      needs_review: false,
      reasons: []
    };

    expect(decision.reasons).toEqual([]);
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import {
  buildKnowledgePagePath,
  buildRequestRunArtifactPaths,
  buildSourceManifestPath,
  listKnowledgePages,
  loadKnowledgePage,
  loadRequestRunState,
  loadSourceManifest,
  saveKnowledgePage,
  saveRequestRunState,
  saveSourceManifest
} from '../../src/index.js';

describe('package entry storage exports', () => {
  it('re-exports the request-run storage APIs and public types', () => {
    expect(typeof buildRequestRunArtifactPaths).toBe('function');
    expect(typeof saveRequestRunState).toBe('function');
    expect(typeof loadRequestRunState).toBe('function');
  });

  it('re-exports the knowledge-page storage APIs and public types', () => {
    expect(typeof buildKnowledgePagePath).toBe('function');
    expect(typeof listKnowledgePages).toBe('function');
    expect(typeof saveKnowledgePage).toBe('function');
    expect(typeof loadKnowledgePage).toBe('function');
  });

  it('re-exports the source-manifest storage APIs and public types', () => {
    expect(typeof buildSourceManifestPath).toBe('function');
    expect(typeof saveSourceManifest).toBe('function');
    expect(typeof loadSourceManifest).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/index-exports.test.ts test/policies/index-exports.test.ts`
Expected: FAIL because `src/index.ts` does not export the ingest and policy APIs yet.

- [ ] **Step 3: Write minimal implementation**

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
export { runQueryFlow } from './flows/query/run-query-flow.js';
export type { RunQueryFlowInput, RunQueryFlowResult } from './flows/query/run-query-flow.js';
export { readRawDocument } from './flows/ingest/read-raw-document.js';
export { runIngestFlow } from './flows/ingest/run-ingest-flow.js';
export type { RunIngestFlowInput, RunIngestFlowResult } from './flows/ingest/run-ingest-flow.js';
export { evaluateReviewGate } from './policies/review-gate.js';
export type { ReviewGateDecision } from './policies/review-gate.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/ingest/index-exports.test.ts test/policies/index-exports.test.ts test/storage/index-exports.test.ts`
Expected: PASS with `5 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/index.ts test/storage/index-exports.test.ts test/flows/ingest/index-exports.test.ts test/policies/index-exports.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: export ingest and review policy APIs
EOF
)"
```

## Self-Review

- **Spec coverage:** This plan advances spec section 9.1 by reading accepted raw material, synthesizing deterministic wiki updates, creating a `ChangeSet`, evaluating risk, and persisting low-risk source/topic patches. It also advances sections 10.1 and 10.2 by making review-gate behavior executable for high-impact changes. It does **not** yet cover lint flow, runtime agent orchestration, or raw-to-inbox/accepted workflow management.
- **Placeholder scan:** No `TODO`, `TBD`, or “similar to task N” placeholders remain; each task includes concrete files, code, commands, and expected results.
- **Type consistency:** `RunIngestFlowInput`, `RunIngestFlowResult`, `ReviewGateDecision`, and `evaluateReviewGate()` are introduced once and reused consistently across later tasks.
