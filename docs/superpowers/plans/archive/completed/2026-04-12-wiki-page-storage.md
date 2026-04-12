# Wiki Page Storage Implementation Plan

> **Archived on 2026-04-12:** This completed slice plan is kept for historical traceability and has been removed from the active plans directory.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next MVP slice by persisting `KnowledgePage` records as markdown wiki pages plus loading them back into domain objects.

**Architecture:** Keep this slice local-only and file-system based. Add a focused path helper that maps a `KnowledgePage` to the correct wiki file location by `kind`, then add a storage module that writes markdown files with YAML frontmatter for the spec fields and loads them back into `KnowledgePage` objects. Keep parsing and formatting explicit inside `src/storage/` instead of introducing a generic serialization framework before ingest/query/lint flows need it.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Vitest

---

## File Structure

- Create: `src/storage/knowledge-page-paths.ts` — map `KnowledgePage.kind` plus page slug to the correct file path under `wiki/`.
- Create: `test/storage/knowledge-page-paths.test.ts` — lock the wiki page path contract to the design spec.
- Create: `src/storage/knowledge-page-store.ts` — save and load markdown wiki pages with YAML frontmatter for `KnowledgePage`.
- Create: `test/storage/knowledge-page-store.test.ts` — verify save, overwrite, and load behavior for each supported page kind.
- Modify: `src/index.ts` — export the knowledge-page storage APIs.
- Modify: `test/storage/index-exports.test.ts` — extend package-entry coverage for the new storage APIs.

## Scope Notes

This plan covers only wiki page persistence for the existing `KnowledgePage` domain object. It intentionally does **not** implement wiki link graph scanning, `index.md` synthesis, `log.md` append flows, source ingest orchestration, or lint logic yet.

### Task 1: Add knowledge-page path derivation

**Files:**
- Create: `src/storage/knowledge-page-paths.ts`
- Create: `test/storage/knowledge-page-paths.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildKnowledgePagePath } from '../../src/storage/knowledge-page-paths.js';

describe('buildKnowledgePagePath', () => {
  it.each([
    ['source', 'origin-story', '/tmp/llm-wiki-liiy/wiki/sources/origin-story.md'],
    ['entity', 'anthropic', '/tmp/llm-wiki-liiy/wiki/entities/anthropic.md'],
    ['topic', 'llm-wiki', '/tmp/llm-wiki-liiy/wiki/topics/llm-wiki.md'],
    ['query', 'what-is-patch-first', '/tmp/llm-wiki-liiy/wiki/queries/what-is-patch-first.md']
  ] as const)('maps %s pages into the correct wiki directory', (kind, slug, expectedPath) => {
    expect(buildKnowledgePagePath('/tmp/llm-wiki-liiy', kind, slug)).toBe(expectedPath);
  });

  it.each(['', '../escape', 'nested/page', 'nested\\page', '.', '..'])(
    'rejects an unsafe page slug: %s',
    (slug) => {
      expect(() => buildKnowledgePagePath('/tmp/llm-wiki-liiy', 'topic', slug)).toThrow(
        `Invalid page slug: ${slug}`
      );
    }
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/knowledge-page-paths.test.ts`
Expected: FAIL with a module resolution error for `../../src/storage/knowledge-page-paths.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import path from 'node:path';

import type { KnowledgePageKind } from '../domain/knowledge-page.js';
import { buildProjectPaths } from '../config/project-paths.js';

export function buildKnowledgePagePath(root: string, kind: KnowledgePageKind, slug: string): string {
  assertValidPageSlug(slug);

  const paths = buildProjectPaths(root);
  const directory =
    kind === 'source'
      ? paths.wikiSources
      : kind === 'entity'
        ? paths.wikiEntities
        : kind === 'topic'
          ? paths.wikiTopics
          : paths.wikiQueries;

  return path.join(directory, `${slug}.md`);
}

function assertValidPageSlug(slug: string): void {
  if (
    slug.length === 0 ||
    slug === '.' ||
    slug === '..' ||
    slug !== path.basename(slug) ||
    slug.includes('/') ||
    slug.includes('\\')
  ) {
    throw new Error(`Invalid page slug: ${slug}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/knowledge-page-paths.test.ts`
Expected: PASS with `10 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/knowledge-page-paths.ts test/storage/knowledge-page-paths.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add knowledge page paths
EOF
)"
```

### Task 2: Save knowledge pages as markdown with frontmatter

**Files:**
- Create: `src/storage/knowledge-page-store.ts`
- Create: `test/storage/knowledge-page-store.test.ts`
- Reuse: `src/storage/knowledge-page-paths.ts`
- Reuse: `src/domain/knowledge-page.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import { saveKnowledgePage } from '../../src/storage/knowledge-page-store.js';

describe('saveKnowledgePage', () => {
  it('writes a topic page as markdown with YAML frontmatter and body content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      const page = createKnowledgePage({
        path: 'wiki/topics/llm-wiki.md',
        kind: 'topic',
        title: 'LLM Wiki',
        aliases: ['Local Wiki Agent'],
        source_refs: ['raw/accepted/design.md'],
        outgoing_links: ['wiki/entities/anthropic.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      });

      const filePath = await saveKnowledgePage(root, page, '# LLM Wiki\n\nPatch-first updates.\n');
      const markdown = await readFile(filePath, 'utf8');

      expect(filePath).toBe(path.join(root, 'wiki', 'topics', 'llm-wiki.md'));
      expect(markdown).toContain('---\nkind: topic\ntitle: LLM Wiki');
      expect(markdown).toContain('aliases:\n  - Local Wiki Agent');
      expect(markdown).toContain('source_refs:\n  - raw/accepted/design.md');
      expect(markdown).toContain('outgoing_links:\n  - wiki/entities/anthropic.md');
      expect(markdown).toContain('status: active');
      expect(markdown).toContain('updated_at: 2026-04-12T00:00:00.000Z');
      expect(markdown).toContain('\n---\n# LLM Wiki\n\nPatch-first updates.\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('overwrites an existing page file when saving the same page again', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      const page = createKnowledgePage({
        path: 'wiki/topics/llm-wiki.md',
        kind: 'topic',
        title: 'LLM Wiki',
        source_refs: ['raw/accepted/design.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      });

      const filePath = await saveKnowledgePage(root, page, '# First\n');
      await saveKnowledgePage(root, page, '# Second\n');

      expect(await readFile(filePath, 'utf8')).toContain('\n---\n# Second\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/knowledge-page-store.test.ts`
Expected: FAIL with a module resolution error for `../../src/storage/knowledge-page-store.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { KnowledgePage } from '../domain/knowledge-page.js';
import { buildKnowledgePagePath } from './knowledge-page-paths.js';

export async function saveKnowledgePage(root: string, page: KnowledgePage, body: string): Promise<string> {
  const slug = path.basename(page.path, '.md');
  const filePath = buildKnowledgePagePath(root, page.kind, slug);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${renderFrontmatter(page)}${body}`, 'utf8');

  return filePath;
}

function renderFrontmatter(page: KnowledgePage): string {
  return [
    '---',
    `kind: ${page.kind}`,
    `title: ${page.title}`,
    'aliases:',
    ...page.aliases.map((alias) => `  - ${alias}`),
    'source_refs:',
    ...page.source_refs.map((sourceRef) => `  - ${sourceRef}`),
    'outgoing_links:',
    ...page.outgoing_links.map((link) => `  - ${link}`),
    `status: ${page.status}`,
    `updated_at: ${page.updated_at}`,
    '---',
    ''
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/knowledge-page-store.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/knowledge-page-paths.ts src/storage/knowledge-page-store.ts test/storage/knowledge-page-store.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: persist knowledge pages as markdown
EOF
)"
```

### Task 3: Load knowledge pages back into domain objects

**Files:**
- Modify: `src/storage/knowledge-page-store.ts`
- Modify: `test/storage/knowledge-page-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import {
  loadKnowledgePage,
  saveKnowledgePage
} from '../../src/storage/knowledge-page-store.js';

describe('knowledge page storage', () => {
  it('loads a saved source page back into a knowledge page and body', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/design-spec.md',
          kind: 'source',
          title: 'Design Spec',
          aliases: ['Spec'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/llm-wiki.md'],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Design Spec\n\nPrimary source summary.\n'
      );

      const loaded = await loadKnowledgePage(root, 'source', 'design-spec');

      expect(loaded).toEqual({
        page: {
          path: 'wiki/sources/design-spec.md',
          kind: 'source',
          title: 'Design Spec',
          aliases: ['Spec'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/llm-wiki.md'],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        },
        body: '# Design Spec\n\nPrimary source summary.\n'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/knowledge-page-store.test.ts`
Expected: FAIL because `loadKnowledgePage` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createKnowledgePage,
  type KnowledgePage,
  type KnowledgePageKind
} from '../domain/knowledge-page.js';
import { buildKnowledgePagePath } from './knowledge-page-paths.js';

export interface LoadedKnowledgePage {
  page: KnowledgePage;
  body: string;
}

export async function saveKnowledgePage(root: string, page: KnowledgePage, body: string): Promise<string> {
  const slug = path.basename(page.path, '.md');
  const filePath = buildKnowledgePagePath(root, page.kind, slug);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${renderFrontmatter(page)}${body}`, 'utf8');

  return filePath;
}

export async function loadKnowledgePage(
  root: string,
  kind: KnowledgePageKind,
  slug: string
): Promise<LoadedKnowledgePage> {
  const filePath = buildKnowledgePagePath(root, kind, slug);
  const markdown = await readFile(filePath, 'utf8');
  const [frontmatter, body] = splitFrontmatter(markdown);
  const record = parseFrontmatter(frontmatter);

  return {
    page: createKnowledgePage({
      path: `wiki/${kind === 'source' ? 'sources' : `${kind}s`}/${slug}.md`,
      kind,
      title: record.title,
      aliases: record.aliases,
      source_refs: record.source_refs,
      outgoing_links: record.outgoing_links,
      status: record.status,
      updated_at: record.updated_at
    }),
    body
  };
}

function splitFrontmatter(markdown: string): [string, string] {
  const parts = markdown.split('\n---\n');
  return [parts[0]!.replace(/^---\n/, ''), parts.slice(1).join('\n---\n')];
}

function parseFrontmatter(frontmatter: string): {
  title: string;
  aliases: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  updated_at: string;
} {
  const lines = frontmatter.split('\n');
  const aliases: string[] = [];
  const source_refs: string[] = [];
  const outgoing_links: string[] = [];
  let currentList: string[] | null = null;
  let title = '';
  let status = '';
  let updated_at = '';

  for (const line of lines) {
    if (line === 'aliases:') {
      currentList = aliases;
      continue;
    }
    if (line === 'source_refs:') {
      currentList = source_refs;
      continue;
    }
    if (line === 'outgoing_links:') {
      currentList = outgoing_links;
      continue;
    }
    if (line.startsWith('title: ')) {
      title = line.slice('title: '.length);
      currentList = null;
      continue;
    }
    if (line.startsWith('status: ')) {
      status = line.slice('status: '.length);
      currentList = null;
      continue;
    }
    if (line.startsWith('updated_at: ')) {
      updated_at = line.slice('updated_at: '.length);
      currentList = null;
      continue;
    }
    if (line.startsWith('  - ') && currentList !== null) {
      currentList.push(line.slice(4));
    }
  }

  return {
    title,
    aliases,
    source_refs,
    outgoing_links,
    status,
    updated_at
  };
}

function renderFrontmatter(page: KnowledgePage): string {
  return [
    '---',
    `kind: ${page.kind}`,
    `title: ${page.title}`,
    'aliases:',
    ...page.aliases.map((alias) => `  - ${alias}`),
    'source_refs:',
    ...page.source_refs.map((sourceRef) => `  - ${sourceRef}`),
    'outgoing_links:',
    ...page.outgoing_links.map((link) => `  - ${link}`),
    `status: ${page.status}`,
    `updated_at: ${page.updated_at}`,
    '---',
    ''
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/knowledge-page-store.test.ts`
Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/knowledge-page-store.ts test/storage/knowledge-page-store.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: load persisted knowledge pages
EOF
)"
```

### Task 4: Export the knowledge-page storage API from the package entry

**Files:**
- Modify: `src/index.ts`
- Modify: `test/storage/index-exports.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  buildKnowledgePagePath,
  loadKnowledgePage,
  saveKnowledgePage
} from '../../src/index.js';
import type { LoadedKnowledgePage } from '../../src/index.js';

describe('package entry storage exports', () => {
  it('re-exports the knowledge-page storage APIs and public types', () => {
    expect(typeof buildKnowledgePagePath).toBe('function');
    expect(typeof saveKnowledgePage).toBe('function');
    expect(typeof loadKnowledgePage).toBe('function');
    expect(buildKnowledgePagePath('/tmp/llm-wiki-liiy', 'topic', 'llm-wiki')).toBe(
      '/tmp/llm-wiki-liiy/wiki/topics/llm-wiki.md'
    );

    const loaded: LoadedKnowledgePage | null = null;
    expect(loaded).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/index-exports.test.ts`
Expected: FAIL because the knowledge-page storage APIs are not exported from `src/index.ts` yet.

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
export { loadKnowledgePage, saveKnowledgePage } from './storage/knowledge-page-store.js';
export type { LoadedKnowledgePage } from './storage/knowledge-page-store.js';
```

- [ ] **Step 4: Run final verification**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/index-exports.test.ts && npm run test && npm run typecheck && npm run build`
Expected: export test passes, the full test suite passes, TypeScript exits with code 0, and the build emits `dist/` successfully.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/knowledge-page-paths.ts src/storage/knowledge-page-store.ts test/storage/knowledge-page-paths.test.ts test/storage/knowledge-page-store.test.ts test/storage/index-exports.test.ts src/index.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: export knowledge page storage APIs
EOF
)"
```

## Spec Coverage Check

- `docs/superpowers/specs/2026-04-11-llm-wiki-design.md` section 7.2 is covered by Task 2 and Task 3 through markdown persistence and reload of the exact `KnowledgePage` fields.
- Section 6.1 and section 6.2 are covered by Task 1 through routing pages into `wiki/sources/`, `wiki/entities/`, `wiki/topics/`, and `wiki/queries/`.
- Section 3.1 is partially advanced by making long-term wiki pages actually persistable, which is required before ingest/query/lint flows can update the wiki layer.
- Index maintenance, log append behavior, and flow orchestration remain intentionally deferred to later MVP slices.
