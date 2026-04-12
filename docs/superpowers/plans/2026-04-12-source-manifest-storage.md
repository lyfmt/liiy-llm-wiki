# Source Manifest Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next MVP slice by persisting raw-source metadata as recoverable source manifest records under `state/` while preserving `raw/` as read-only input.

**Architecture:** Keep this slice local-only and file-system based. Add a focused path helper that maps a source manifest id to a manifest record under `state/artifacts/source-manifests/`, then add a storage module that saves and loads `SourceManifest` JSON records without ever mutating files inside `raw/`. This keeps the raw-input boundary intact while making ingest-capable metadata persistable for later runtime flows.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Vitest

---

## File Structure

- Create: `src/storage/source-manifest-paths.ts` — derive manifest file paths under `state/artifacts/source-manifests/` and reject unsafe ids.
- Create: `test/storage/source-manifest-paths.test.ts` — lock the manifest path contract and id validation.
- Create: `src/storage/source-manifest-store.ts` — save and load `SourceManifest` records as JSON without touching `raw/` contents.
- Create: `test/storage/source-manifest-store.test.ts` — verify save, overwrite, load, and invalid-record handling.
- Modify: `src/index.ts` — export the source-manifest storage APIs.
- Modify: `test/storage/index-exports.test.ts` — extend package-entry coverage for the new storage APIs.

## Scope Notes

This plan covers only persisted metadata about raw sources. It intentionally does **not** ingest source file contents, move files between `raw/` subdirectories, compute hashes, or decide acceptance/rejection policy yet.

### Task 1: Add source-manifest path derivation

**Files:**
- Create: `src/storage/source-manifest-paths.ts`
- Create: `test/storage/source-manifest-paths.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildSourceManifestPath } from '../../src/storage/source-manifest-paths.js';

describe('buildSourceManifestPath', () => {
  it('maps a manifest id into state/artifacts/source-manifests', () => {
    expect(buildSourceManifestPath('/tmp/llm-wiki-liiy', 'src-001')).toBe(
      path.join('/tmp/llm-wiki-liiy', 'state', 'artifacts', 'source-manifests', 'src-001.json')
    );
  });

  it.each(['', '../escape', 'nested/id', 'nested\\id', '.', '..'])('rejects an unsafe id: %s', (id) => {
    expect(() => buildSourceManifestPath('/tmp/llm-wiki-liiy', id)).toThrow(`Invalid source manifest id: ${id}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/source-manifest-paths.test.ts`
Expected: FAIL with a module resolution error for `../../src/storage/source-manifest-paths.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';

export function buildSourceManifestPath(root: string, id: string): string {
  assertValidSourceManifestId(id);

  const { stateArtifacts } = buildProjectPaths(root);
  return path.join(stateArtifacts, 'source-manifests', `${id}.json`);
}

function assertValidSourceManifestId(id: string): void {
  if (
    id.length === 0 ||
    id === '.' ||
    id === '..' ||
    id !== path.basename(id) ||
    id.includes('/') ||
    id.includes('\\')
  ) {
    throw new Error(`Invalid source manifest id: ${id}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/source-manifest-paths.test.ts`
Expected: PASS with `7 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/source-manifest-paths.ts test/storage/source-manifest-paths.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add source manifest paths
EOF
)"
```

### Task 2: Save source manifests as JSON records under state/

**Files:**
- Create: `src/storage/source-manifest-store.ts`
- Create: `test/storage/source-manifest-store.test.ts`
- Reuse: `src/storage/source-manifest-paths.ts`
- Reuse: `src/domain/source-manifest.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../src/domain/source-manifest.js';
import { saveSourceManifest } from '../../src/storage/source-manifest-store.js';

describe('saveSourceManifest', () => {
  it('writes a source manifest JSON record under state/artifacts/source-manifests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      const manifest = createSourceManifest({
        id: 'src-001',
        path: 'raw/inbox/design.md',
        title: 'Design Spec',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:abc123',
        imported_at: '2026-04-12T00:00:00.000Z',
        tags: ['design', 'wiki'],
        notes: 'accepted for synthesis'
      });

      const filePath = await saveSourceManifest(root, manifest);
      expect(filePath).toBe(path.join(root, 'state', 'artifacts', 'source-manifests', 'src-001.json'));
      expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
        id: 'src-001',
        path: 'raw/inbox/design.md',
        title: 'Design Spec',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:abc123',
        imported_at: '2026-04-12T00:00:00.000Z',
        tags: ['design', 'wiki'],
        notes: 'accepted for synthesis'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('overwrites an existing source manifest record when saving the same id again', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Draft Title',
          type: 'markdown',
          hash: 'sha256:abc123',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );

      const filePath = await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Final Title',
          type: 'markdown',
          status: 'processed',
          hash: 'sha256:def456',
          imported_at: '2026-04-12T00:00:00.000Z',
          notes: 'finalized'
        })
      );

      expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
        title: 'Final Title',
        status: 'processed',
        hash: 'sha256:def456',
        notes: 'finalized'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/source-manifest-store.test.ts`
Expected: FAIL with a module resolution error for `../../src/storage/source-manifest-store.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { SourceManifest } from '../domain/source-manifest.js';
import { buildSourceManifestPath } from './source-manifest-paths.js';

export async function saveSourceManifest(root: string, manifest: SourceManifest): Promise<string> {
  const filePath = buildSourceManifestPath(root, manifest.id);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return filePath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/source-manifest-store.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/source-manifest-paths.ts src/storage/source-manifest-store.ts test/storage/source-manifest-store.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: persist source manifest records
EOF
)"
```

### Task 3: Load source manifests and reject invalid records

**Files:**
- Modify: `src/storage/source-manifest-store.ts`
- Modify: `test/storage/source-manifest-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../src/domain/source-manifest.js';
import { buildSourceManifestPath } from '../../src/storage/source-manifest-paths.js';
import {
  loadSourceManifest,
  saveSourceManifest
} from '../../src/storage/source-manifest-store.js';

describe('source manifest storage', () => {
  it('loads a saved source manifest back into the domain shape', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Design Spec',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:abc123',
          imported_at: '2026-04-12T00:00:00.000Z',
          tags: ['design', 'wiki'],
          notes: 'accepted for synthesis'
        })
      );

      expect(await loadSourceManifest(root, 'src-001')).toEqual({
        id: 'src-001',
        path: 'raw/inbox/design.md',
        title: 'Design Spec',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:abc123',
        imported_at: '2026-04-12T00:00:00.000Z',
        tags: ['design', 'wiki'],
        notes: 'accepted for synthesis'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a missing manifest record', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await expect(loadSourceManifest(root, 'src-001')).rejects.toThrow(
        'Incomplete source manifest state: missing src-001.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a malformed manifest record', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      const filePath = buildSourceManifestPath(root, 'src-001');
      await writeFile(filePath, '{', 'utf8');

      await expect(loadSourceManifest(root, 'src-001')).rejects.toThrow(
        'Invalid source manifest: malformed src-001.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an invalid manifest shape', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      const filePath = buildSourceManifestPath(root, 'src-001');
      await writeFile(filePath, '{\n  "title": "Missing id"\n}\n', 'utf8');

      await expect(loadSourceManifest(root, 'src-001')).rejects.toThrow(
        'Invalid source manifest: invalid src-001.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/source-manifest-store.test.ts`
Expected: FAIL because `loadSourceManifest` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createSourceManifest, type SourceManifest, type SourceManifestStatus } from '../domain/source-manifest.js';
import { buildSourceManifestPath } from './source-manifest-paths.js';

export async function saveSourceManifest(root: string, manifest: SourceManifest): Promise<string> {
  const filePath = buildSourceManifestPath(root, manifest.id);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return filePath;
}

export async function loadSourceManifest(root: string, id: string): Promise<SourceManifest> {
  const filePath = buildSourceManifestPath(root, id);
  const record = assertSourceManifestRecord(await readRequiredJson(filePath, `${id}.json`), `${id}.json`);

  return createSourceManifest(record);
}

function assertSourceManifestRecord(
  value: unknown,
  fileName: string
): {
  id: string;
  path: string;
  title: string;
  type: string;
  status: SourceManifestStatus;
  hash: string;
  imported_at: string;
  tags: string[];
  notes: string;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }

  if (typeof value.id !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.path !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.title !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.type !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (value.status !== 'inbox' && value.status !== 'accepted' && value.status !== 'rejected' && value.status !== 'processed') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.hash !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.imported_at !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (!Array.isArray(value.tags) || value.tags.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.notes !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }

  return {
    id: value.id,
    path: value.path,
    title: value.title,
    type: value.type,
    status: value.status,
    hash: value.hash,
    imported_at: value.imported_at,
    tags: value.tags,
    notes: value.notes
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readRequiredJson(filePath: string, fileName: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Incomplete source manifest state: missing ${fileName}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid source manifest: malformed ${fileName}`);
    }

    throw error;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/source-manifest-store.test.ts`
Expected: PASS with `6 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/source-manifest-store.ts test/storage/source-manifest-store.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: load source manifest records
EOF
)"
```

### Task 4: Export the source-manifest storage API from the package entry

**Files:**
- Modify: `src/index.ts`
- Modify: `test/storage/index-exports.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  buildSourceManifestPath,
  loadSourceManifest,
  saveSourceManifest
} from '../../src/index.js';
import type { SourceManifest } from '../../src/index.js';

describe('package entry storage exports', () => {
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

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/index-exports.test.ts`
Expected: FAIL because the source-manifest storage APIs are not exported from `src/index.ts` yet.

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
export { buildSourceManifestPath } from './storage/source-manifest-paths.js';
export { loadSourceManifest, saveSourceManifest } from './storage/source-manifest-store.js';
```

- [ ] **Step 4: Run final verification**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/index-exports.test.ts && npm run test && npm run typecheck && npm run build`
Expected: export test passes, the full test suite passes, TypeScript exits with code 0, and the build emits `dist/` successfully.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/source-manifest-paths.ts src/storage/source-manifest-store.ts test/storage/source-manifest-paths.test.ts test/storage/source-manifest-store.test.ts test/storage/index-exports.test.ts src/index.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: export source manifest storage APIs
EOF
)"
```

## Spec Coverage Check

- `docs/superpowers/specs/2026-04-11-llm-wiki-design.md` section 7.1 is covered by Task 2 and Task 3 through persisted save/load support for the exact `SourceManifest` fields.
- Section 6.1 and section 10.1 are respected by storing manifest metadata under `state/` rather than writing into `raw/`, keeping the raw source layer read-only.
- Section 3.1 is advanced by making raw source metadata persistable, which is a necessary step before a usable ingest flow can classify and track source inputs.
- Runtime ingest orchestration, hash generation, file movement inside `raw/`, and acceptance/rejection decisions remain intentionally deferred to later MVP slices.
