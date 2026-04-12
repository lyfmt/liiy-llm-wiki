# Minimal Query Flow Implementation Plan

> **Archived on 2026-04-12:** This completed slice plan is kept for historical traceability and has been removed from the active plans directory.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first user-visible MVP flow by answering a query from persisted wiki pages and optionally saving a reusable query page back into `wiki/queries/`.

**Architecture:** Keep this slice local-only and deterministic. Add a small wiki-page listing helper, then implement a minimal query flow that scans persisted `KnowledgePage` records plus markdown bodies, selects the most relevant pages by simple token overlap, assembles a sourced answer, and optionally writes a `query` page when the result is flagged as reusable. Reuse the existing page and run storage modules instead of introducing runtime/model integration before a basic end-to-end local flow exists.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Vitest, YAML-backed wiki page storage

---

## File Structure

- Create: `src/storage/list-knowledge-pages.ts` — enumerate persisted wiki page slugs by kind from the `wiki/` tree.
- Create: `test/storage/list-knowledge-pages.test.ts` — verify page listing stays inside supported wiki directories.
- Create: `src/flows/query/run-query-flow.ts` — read wiki pages, score candidate matches, compose a sourced answer, and optionally persist a reusable query page.
- Create: `test/flows/query/run-query-flow.test.ts` — verify answer generation, source traceability, and optional query-page writeback.
- Modify: `src/index.ts` — export the query flow and storage listing API.
- Modify: `test/storage/index-exports.test.ts` — extend storage exports for page listing.
- Create: `test/flows/query/index-exports.test.ts` — verify the package entry re-exports the query flow API.

## Scope Notes

This plan covers only a minimal local query path over persisted wiki pages. It intentionally does **not** implement raw-source fallback reads, LLM synthesis, intent classification, CLI interaction, lint/ingest flows, or automatic review-gate prompting yet.

### Task 1: Add wiki page listing by kind

**Files:**
- Create: `src/storage/list-knowledge-pages.ts`
- Create: `test/storage/list-knowledge-pages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { listKnowledgePages } from '../../src/storage/list-knowledge-pages.js';

describe('listKnowledgePages', () => {
  it('lists persisted page slugs within a supported wiki kind directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-list-'));

    try {
      const topicsDir = path.join(root, 'wiki', 'topics');
      await mkdir(topicsDir, { recursive: true });
      await writeFile(path.join(topicsDir, 'llm-wiki.md'), '---\nkind: "topic"\n---\n# LLM Wiki\n', 'utf8');
      await writeFile(path.join(topicsDir, 'patch-first.md'), '---\nkind: "topic"\n---\n# Patch First\n', 'utf8');
      await writeFile(path.join(topicsDir, 'ignore.txt'), 'nope', 'utf8');

      expect(await listKnowledgePages(root, 'topic')).toEqual(['llm-wiki', 'patch-first']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/list-knowledge-pages.test.ts`
Expected: FAIL with a module resolution error for `../../src/storage/list-knowledge-pages.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { readdir } from 'node:fs/promises';

import type { KnowledgePageKind } from '../domain/knowledge-page.js';
import { buildProjectPaths } from '../config/project-paths.js';

export async function listKnowledgePages(root: string, kind: KnowledgePageKind): Promise<string[]> {
  const paths = buildProjectPaths(root);
  const directory =
    kind === 'source'
      ? paths.wikiSources
      : kind === 'entity'
        ? paths.wikiEntities
        : kind === 'topic'
          ? paths.wikiTopics
          : paths.wikiQueries;
  const entries = await readdir(directory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/list-knowledge-pages.test.ts`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/list-knowledge-pages.ts test/storage/list-knowledge-pages.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add knowledge page listing
EOF
)"
```

### Task 2: Answer a query from persisted wiki pages

**Files:**
- Create: `src/flows/query/run-query-flow.ts`
- Create: `test/flows/query/run-query-flow.test.ts`
- Reuse: `src/storage/list-knowledge-pages.ts`
- Reuse: `src/storage/knowledge-page-store.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { runQueryFlow } from '../../../src/flows/query/run-query-flow.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('runQueryFlow', () => {
  it('answers a query using the most relevant wiki pages and cites their paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/llm-wiki.md'],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/llm-wiki.md',
          kind: 'topic',
          title: 'LLM Wiki',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# LLM Wiki\n\nThe wiki is the long-term knowledge layer.\n'
      );

      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: false
      });

      expect(result.answer).toContain('Patch-first updates keep page structure stable.');
      expect(result.sources).toEqual(['wiki/topics/patch-first.md']);
      expect(result.persistedQueryPage).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/query/run-query-flow.test.ts`
Expected: FAIL with a module resolution error for `../../../src/flows/query/run-query-flow.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { KnowledgePageKind } from '../../domain/knowledge-page.js';
import { loadKnowledgePage } from '../../storage/knowledge-page-store.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';

export interface RunQueryFlowInput {
  question: string;
  persistQueryPage: boolean;
}

export interface RunQueryFlowResult {
  answer: string;
  sources: string[];
  persistedQueryPage: string | null;
}

export async function runQueryFlow(root: string, input: RunQueryFlowInput): Promise<RunQueryFlowResult> {
  const candidates = await collectPages(root, ['topic', 'query']);
  const scored = scorePages(input.question, candidates);
  const best = scored[0];

  if (!best) {
    return {
      answer: 'No relevant wiki pages found.',
      sources: [],
      persistedQueryPage: null
    };
  }

  return {
    answer: extractAnswer(best.body),
    sources: [best.page.path],
    persistedQueryPage: null
  };
}

async function collectPages(root: string, kinds: KnowledgePageKind[]) {
  const pages = [] as Array<Awaited<ReturnType<typeof loadKnowledgePage>>>;

  for (const kind of kinds) {
    for (const slug of await listKnowledgePages(root, kind)) {
      pages.push(await loadKnowledgePage(root, kind, slug));
    }
  }

  return pages;
}

function scorePages(question: string, pages: Array<Awaited<ReturnType<typeof loadKnowledgePage>>>) {
  const tokens = tokenize(question);

  return pages
    .map((page) => ({
      ...page,
      score: tokens.filter((token) => tokenize(`${page.page.title} ${page.body}`).includes(token)).length
    }))
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path));
}

function extractAnswer(body: string): string {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .join(' ')
    .trim();
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/query/run-query-flow.test.ts`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/list-knowledge-pages.ts src/flows/query/run-query-flow.ts test/storage/list-knowledge-pages.test.ts test/flows/query/run-query-flow.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add minimal query flow
EOF
)"
```

### Task 3: Persist reusable query answers into wiki/queries/

**Files:**
- Modify: `src/flows/query/run-query-flow.ts`
- Modify: `test/flows/query/run-query-flow.test.ts`
- Reuse: `src/storage/knowledge-page-store.ts`
- Reuse: `src/domain/knowledge-page.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { runQueryFlow } from '../../../src/flows/query/run-query-flow.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('runQueryFlow', () => {
  it('persists a reusable query page when requested', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

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

      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: true
      });

      expect(result.persistedQueryPage).toBe('wiki/queries/what-is-patch-first.md');

      const savedQuery = await loadKnowledgePage(root, 'query', 'what-is-patch-first');
      expect(savedQuery.page.title).toBe('What Is Patch First?');
      expect(savedQuery.body).toContain('Patch-first updates keep page structure stable.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/query/run-query-flow.test.ts`
Expected: FAIL because `persistedQueryPage` is still `null` and no query page is written yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import { createKnowledgePage, type KnowledgePageKind } from '../../domain/knowledge-page.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../storage/knowledge-page-store.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';

export interface RunQueryFlowInput {
  question: string;
  persistQueryPage: boolean;
}

export interface RunQueryFlowResult {
  answer: string;
  sources: string[];
  persistedQueryPage: string | null;
}

export async function runQueryFlow(root: string, input: RunQueryFlowInput): Promise<RunQueryFlowResult> {
  const candidates = await collectPages(root, ['topic', 'query']);
  const scored = scorePages(input.question, candidates);
  const best = scored[0];

  if (!best) {
    return {
      answer: 'No relevant wiki pages found.',
      sources: [],
      persistedQueryPage: null
    };
  }

  const answer = extractAnswer(best.body);
  const sources = [best.page.path];
  let persistedQueryPage: string | null = null;

  if (input.persistQueryPage) {
    const slug = slugifyQuestion(input.question);
    const queryPath = `wiki/queries/${slug}.md`;

    await saveKnowledgePage(
      root,
      createKnowledgePage({
        path: queryPath,
        kind: 'query',
        title: titleizeQuestion(input.question),
        source_refs: sources,
        outgoing_links: [],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      }),
      `# ${titleizeQuestion(input.question)}\n\n${answer}\n`
    );

    persistedQueryPage = queryPath;
  }

  return {
    answer,
    sources,
    persistedQueryPage
  };
}

async function collectPages(root: string, kinds: KnowledgePageKind[]) {
  const pages = [] as Array<Awaited<ReturnType<typeof loadKnowledgePage>>>;

  for (const kind of kinds) {
    for (const slug of await listKnowledgePages(root, kind)) {
      pages.push(await loadKnowledgePage(root, kind, slug));
    }
  }

  return pages;
}

function scorePages(question: string, pages: Array<Awaited<ReturnType<typeof loadKnowledgePage>>>) {
  const tokens = tokenize(question);

  return pages
    .map((page) => ({
      ...page,
      score: tokens.filter((token) => tokenize(`${page.page.title} ${page.body}`).includes(token)).length
    }))
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path));
}

function extractAnswer(body: string): string {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .join(' ')
    .trim();
}

function slugifyQuestion(question: string): string {
  return tokenize(question).join('-');
}

function titleizeQuestion(question: string): string {
  return question
    .trim()
    .replace(/\?+$/, '')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/query/run-query-flow.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/flows/query/run-query-flow.ts test/flows/query/run-query-flow.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: persist reusable query answers
EOF
)"
```

### Task 4: Export the query flow from the package entry

**Files:**
- Modify: `src/index.ts`
- Modify: `test/storage/index-exports.test.ts`
- Create: `test/flows/query/index-exports.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { listKnowledgePages, runQueryFlow } from '../../../src/index.js';
import type { RunQueryFlowResult } from '../../../src/index.js';

describe('package entry query exports', () => {
  it('re-exports the query flow and supporting page listing API', () => {
    expect(typeof listKnowledgePages).toBe('function');
    expect(typeof runQueryFlow).toBe('function');

    const result: RunQueryFlowResult | null = null;
    expect(result).toBeNull();
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
import type {
  LoadedKnowledgePage,
  RequestRunArtifactPaths,
  RequestRunState,
  SourceManifest
} from '../../src/index.js';

describe('package entry storage exports', () => {
  it('re-exports the request-run storage APIs and public types', () => {
    const paths: RequestRunArtifactPaths = buildRequestRunArtifactPaths('/tmp/llm-wiki-liiy', 'run-001');

    expect(typeof buildRequestRunArtifactPaths).toBe('function');
    expect(typeof saveRequestRunState).toBe('function');
    expect(typeof loadRequestRunState).toBe('function');
    expect(paths.runDirectory).toBe('/tmp/llm-wiki-liiy/state/runs/run-001');

    const state: RequestRunState | null = null;
    expect(state).toBeNull();
  });

  it('re-exports the knowledge-page storage APIs and public types', () => {
    expect(typeof buildKnowledgePagePath).toBe('function');
    expect(typeof listKnowledgePages).toBe('function');
    expect(typeof saveKnowledgePage).toBe('function');
    expect(typeof loadKnowledgePage).toBe('function');
    expect(buildKnowledgePagePath('/tmp/llm-wiki-liiy', 'topic', 'llm-wiki')).toBe(
      '/tmp/llm-wiki-liiy/wiki/topics/llm-wiki.md'
    );

    const loaded: LoadedKnowledgePage | null = null;
    expect(loaded).toBeNull();
  });

  it('re-exports the source-manifest storage APIs and public types', () => {
    expect(typeof buildSourceManifestPath).toBe('function');
    expect(typeof saveSourceManifest).toBe('function');
    expect(typeof loadSourceManifest).toBe('function');
    expect(buildSourceManifestPath('/tmp/llm-wiki-liiy', 'src-001')).toBe(
      '/tmp/llm-wiki-liiy/state/artifacts/source-manifests/src-001.json'
    );

    const manifest: SourceManifest | null = null;
    expect(manifest).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/query/index-exports.test.ts test/storage/index-exports.test.ts`
Expected: FAIL because `runQueryFlow` and `listKnowledgePages` are not exported from `src/index.ts` yet.

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
```

- [ ] **Step 4: Run final verification**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/flows/query/index-exports.test.ts test/flows/query/run-query-flow.test.ts test/storage/index-exports.test.ts && npm run test && npm run typecheck && npm run build`
Expected: targeted export and flow tests pass, the full test suite passes, TypeScript exits with code 0, and the build emits `dist/` successfully.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/list-knowledge-pages.ts src/flows/query/run-query-flow.ts test/storage/list-knowledge-pages.test.ts test/flows/query/run-query-flow.test.ts test/flows/query/index-exports.test.ts test/storage/index-exports.test.ts src/index.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: export minimal query flow
EOF
)"
```

## Spec Coverage Check

- `docs/superpowers/specs/2026-04-11-llm-wiki-design.md` section 3.1 and section 9.2 are covered by Task 2 and Task 3 through a minimal query path that reads wiki pages, answers from persisted knowledge, and can save a reusable query page.
- Section 4.2 is partially advanced by enabling the user to ask a natural-language question and receive a sourced answer from the wiki layer.
- Section 13.2 item 2 is partially advanced by ensuring the query answer cites wiki-backed source page paths.
- Raw fallback reads, LLM-based synthesis, intent routing, and review-gate prompting remain intentionally deferred to later MVP slices.
