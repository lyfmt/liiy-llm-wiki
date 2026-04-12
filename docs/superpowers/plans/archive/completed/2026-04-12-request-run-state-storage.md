# Request Run State Storage Implementation Plan

> **Archived on 2026-04-12:** This completed slice plan is kept for historical traceability and has been removed from the active plans directory.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first `src/storage/` slice by persisting each `RequestRun` as a recoverable artifact bundle under `state/runs/<run_id>/`.

**Architecture:** Keep this slice local-only and file-system based. Add a focused path builder for per-run artifact files, then add a storage module that saves and loads the spec-required bundle (`request.json`, `plan.json`, `evidence.json`, `draft.md`, `changeset.json`, `result.md`, `checkpoint.json`) as an explicit storage projection of the existing `RequestRun` and `ChangeSet` domain models. For MVP, choose `plan.json` and `draft.md` from the spec’s allowed formats, reject unsafe `run_id` values that would escape `state/runs/`, remove any existing `checkpoint.json` before rewriting a run, write the rest of the bundle sequentially, and write `checkpoint.json` last so the loader can treat its presence as the completeness marker.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Vitest

---

## File Structure

- Create: `src/storage/request-run-artifact-paths.ts` — derive the exact per-run artifact file paths under `state/runs/<run_id>/` and reject unsafe run ids.
- Create: `test/storage/request-run-artifact-paths.test.ts` — lock the artifact path contract and run-id validation to the design spec.
- Create: `src/storage/request-run-state-store.ts` — save and load the selected run artifact bundle using the existing domain models.
- Create: `test/storage/request-run-state-store.test.ts` — verify save, overwrite, load, and incomplete-bundle behavior against a temporary project root.
- Modify: `src/index.ts` — export the new storage APIs alongside the existing bootstrap and domain exports.
- Create: `test/storage/index-exports.test.ts` — verify the package entry re-exports the storage APIs and public storage types.

## Scope Notes

This plan covers only run-state persistence inside `state/runs/`. It intentionally does **not** implement wiki page frontmatter storage, raw source manifest storage, runtime orchestration, ingest/query/lint flows, or policy enforcement yet.

### Task 1: Add per-run artifact path derivation and run-id validation

**Files:**
- Create: `src/storage/request-run-artifact-paths.ts`
- Create: `test/storage/request-run-artifact-paths.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildRequestRunArtifactPaths } from '../../src/storage/request-run-artifact-paths.js';

describe('buildRequestRunArtifactPaths', () => {
  it('builds the spec-required artifact paths under state/runs/<run_id>', () => {
    const root = '/tmp/llm-wiki-liiy';
    const runId = 'run-001';

    expect(buildRequestRunArtifactPaths(root, runId)).toEqual({
      runDirectory: path.join(root, 'state', 'runs', runId),
      request: path.join(root, 'state', 'runs', runId, 'request.json'),
      plan: path.join(root, 'state', 'runs', runId, 'plan.json'),
      evidence: path.join(root, 'state', 'runs', runId, 'evidence.json'),
      draft: path.join(root, 'state', 'runs', runId, 'draft.md'),
      changeset: path.join(root, 'state', 'runs', runId, 'changeset.json'),
      result: path.join(root, 'state', 'runs', runId, 'result.md'),
      checkpoint: path.join(root, 'state', 'runs', runId, 'checkpoint.json')
    });
  });

  it.each(['', '../other', 'nested/run-001', 'nested\\run-001', '.', '..'])(
    'rejects an unsafe run id: %s',
    (runId) => {
      expect(() => buildRequestRunArtifactPaths('/tmp/llm-wiki-liiy', runId)).toThrow(
        `Invalid run id: ${runId}`
      );
    }
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/request-run-artifact-paths.test.ts`
Expected: FAIL with a module resolution error for `../../src/storage/request-run-artifact-paths.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';

export interface RequestRunArtifactPaths {
  runDirectory: string;
  request: string;
  plan: string;
  evidence: string;
  draft: string;
  changeset: string;
  result: string;
  checkpoint: string;
}

export function buildRequestRunArtifactPaths(root: string, runId: string): RequestRunArtifactPaths {
  assertValidRunId(runId);

  const { stateRuns } = buildProjectPaths(root);
  const runDirectory = path.join(stateRuns, runId);

  return {
    runDirectory,
    request: path.join(runDirectory, 'request.json'),
    plan: path.join(runDirectory, 'plan.json'),
    evidence: path.join(runDirectory, 'evidence.json'),
    draft: path.join(runDirectory, 'draft.md'),
    changeset: path.join(runDirectory, 'changeset.json'),
    result: path.join(runDirectory, 'result.md'),
    checkpoint: path.join(runDirectory, 'checkpoint.json')
  };
}

function assertValidRunId(runId: string): void {
  if (
    runId.length === 0 ||
    runId === '.' ||
    runId === '..' ||
    runId !== path.basename(runId) ||
    runId.includes('/') ||
    runId.includes('\\')
  ) {
    throw new Error(`Invalid run id: ${runId}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/request-run-artifact-paths.test.ts`
Expected: PASS with `7 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/request-run-artifact-paths.ts test/storage/request-run-artifact-paths.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add request run artifact paths
EOF
)"
```

### Task 2: Save the required request-run artifact bundle with checkpoint-last semantics

**Files:**
- Create: `src/storage/request-run-state-store.ts`
- Create: `test/storage/request-run-state-store.test.ts`
- Reuse: `src/storage/request-run-artifact-paths.ts`
- Reuse: `src/domain/request-run.ts`
- Reuse: `src/domain/change-set.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';
import { createRequestRun } from '../../src/domain/request-run.js';
import { saveRequestRunState } from '../../src/storage/request-run-state-store.js';

describe('saveRequestRunState', () => {
  it('writes the selected request-run artifact bundle and checkpoint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      const requestRun = createRequestRun({
        run_id: 'run-001',
        user_request: 'ingest this source',
        intent: 'ingest',
        plan: ['read raw source', 'update wiki'],
        status: 'needs_review',
        evidence: ['raw/accepted/source.md'],
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['queue review gate'],
        result_summary: 'awaiting review'
      });
      const changeSet = createChangeSet({
        target_files: ['wiki/topics/llm-wiki.md'],
        patch_summary: 'add a synthesis paragraph',
        rationale: 'new source clarifies the storage boundary',
        source_refs: ['raw/accepted/source.md'],
        risk_level: 'medium',
        needs_review: true
      });

      const paths = await saveRequestRunState(root, {
        request_run: requestRun,
        draft_markdown: '# Draft\n\nInterim draft content.\n',
        result_markdown: '# Result\n\nFinal result content.\n',
        changeset: changeSet
      });

      expect(JSON.parse(await readFile(paths.request, 'utf8'))).toEqual({
        run_id: 'run-001',
        user_request: 'ingest this source',
        intent: 'ingest'
      });
      expect(JSON.parse(await readFile(paths.plan, 'utf8'))).toEqual(['read raw source', 'update wiki']);
      expect(JSON.parse(await readFile(paths.evidence, 'utf8'))).toEqual(['raw/accepted/source.md']);
      expect(await readFile(paths.draft, 'utf8')).toBe('# Draft\n\nInterim draft content.\n');
      expect(JSON.parse(await readFile(paths.changeset, 'utf8'))).toEqual({
        target_files: ['wiki/topics/llm-wiki.md'],
        patch_summary: 'add a synthesis paragraph',
        rationale: 'new source clarifies the storage boundary',
        source_refs: ['raw/accepted/source.md'],
        risk_level: 'medium',
        needs_review: true
      });
      expect(await readFile(paths.result, 'utf8')).toBe('# Result\n\nFinal result content.\n');
      expect(JSON.parse(await readFile(paths.checkpoint, 'utf8'))).toEqual({
        status: 'needs_review',
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['queue review gate'],
        result_summary: 'awaiting review'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('overwrites the artifact bundle when the same run is saved again', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        draft_markdown: '# Draft\n\nFirst draft.\n',
        result_markdown: '# Result\n\nFirst result.\n',
        changeset: null
      });

      const paths = await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source', 'update wiki'],
          status: 'done',
          evidence: ['raw/accepted/source.md'],
          touched_files: ['wiki/topics/llm-wiki.md'],
          decisions: ['apply low-risk patch'],
          result_summary: 'ingest complete'
        }),
        draft_markdown: '# Draft\n\nUpdated draft.\n',
        result_markdown: '# Result\n\nUpdated result.\n',
        changeset: null
      });

      expect(JSON.parse(await readFile(paths.plan, 'utf8'))).toEqual(['read raw source', 'update wiki']);
      expect(JSON.parse(await readFile(paths.evidence, 'utf8'))).toEqual(['raw/accepted/source.md']);
      expect(await readFile(paths.result, 'utf8')).toBe('# Result\n\nUpdated result.\n');
      expect(JSON.parse(await readFile(paths.checkpoint, 'utf8'))).toEqual({
        status: 'done',
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['apply low-risk patch'],
        result_summary: 'ingest complete'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/request-run-state-store.test.ts`
Expected: FAIL with a module resolution error for `../../src/storage/request-run-state-store.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdir, rm, writeFile } from 'node:fs/promises';

import type { ChangeSet } from '../domain/change-set.js';
import type { RequestRun } from '../domain/request-run.js';
import {
  buildRequestRunArtifactPaths,
  type RequestRunArtifactPaths
} from './request-run-artifact-paths.js';

export interface RequestRunState {
  request_run: RequestRun;
  draft_markdown: string;
  result_markdown: string;
  changeset: ChangeSet | null;
}

export async function saveRequestRunState(
  root: string,
  state: RequestRunState
): Promise<RequestRunArtifactPaths> {
  const paths = buildRequestRunArtifactPaths(root, state.request_run.run_id);

  await mkdir(paths.runDirectory, { recursive: true });
  await rm(paths.checkpoint, { force: true });
  await writeJson(paths.request, {
    run_id: state.request_run.run_id,
    user_request: state.request_run.user_request,
    intent: state.request_run.intent
  });
  await writeJson(paths.plan, state.request_run.plan);
  await writeJson(paths.evidence, state.request_run.evidence);
  await writeFile(paths.draft, state.draft_markdown, 'utf8');
  await writeJson(paths.changeset, state.changeset);
  await writeFile(paths.result, state.result_markdown, 'utf8');
  await writeJson(paths.checkpoint, {
    status: state.request_run.status,
    touched_files: state.request_run.touched_files,
    decisions: state.request_run.decisions,
    result_summary: state.request_run.result_summary
  });

  return paths;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/request-run-state-store.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/request-run-state-store.ts test/storage/request-run-state-store.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: persist request run state bundle
EOF
)"
```

### Task 3: Load complete request-run bundles and reject incomplete or malformed artifacts

`checkpoint.json` is the completeness marker for MVP recovery. If it is absent, the run must be treated as incomplete even if other artifact files still exist. Keep the overwrite test from Task 2 in the same test file; this task adds load and validation coverage on top of those two save tests.

**Files:**
- Modify: `src/storage/request-run-state-store.ts`
- Modify: `test/storage/request-run-state-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests to `test/storage/request-run-state-store.test.ts` below the two save tests from Task 2; do not replace them. Merge only the imports that are new in this task (`unlink`, `writeFile`, `buildRequestRunArtifactPaths`, `loadRequestRunState`) into the existing import block instead of duplicating imports already added in Task 2.

```ts
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';
import { createRequestRun } from '../../src/domain/request-run.js';
import { buildRequestRunArtifactPaths } from '../../src/storage/request-run-artifact-paths.js';
import {
  loadRequestRunState,
  saveRequestRunState
} from '../../src/storage/request-run-state-store.js';

const missingArtifacts = [
  'request.json',
  'plan.json',
  'evidence.json',
  'draft.md',
  'changeset.json',
  'result.md',
  'checkpoint.json'
] as const;

const malformedJsonArtifacts = [
  'request.json',
  'plan.json',
  'evidence.json',
  'changeset.json',
  'checkpoint.json'
] as const;

const semanticallyInvalidArtifacts = [
  {
    fileName: 'request.json',
    content: '{\n  "user_request": "ingest this source",\n  "intent": "ingest"\n}\n',
    expectedMessage: 'Invalid request run state: invalid request.json'
  },
  {
    fileName: 'plan.json',
    content: '"read raw source"\n',
    expectedMessage: 'Invalid request run state: invalid plan.json'
  },
  {
    fileName: 'checkpoint.json',
    content:
      '{\n  "status": "unknown",\n  "touched_files": [],\n  "decisions": [],\n  "result_summary": ""\n}\n',
    expectedMessage: 'Invalid request run state: invalid checkpoint.json'
  },
  {
    fileName: 'changeset.json',
    content: '{\n  "patch_summary": "missing target files"\n}\n',
    expectedMessage: 'Invalid request run state: invalid changeset.json'
  }
] as const;

describe('request run state storage', () => {
  it('loads a saved request-run bundle back into domain objects', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'answer this question',
          intent: 'query',
          plan: ['read wiki', 'draft answer'],
          status: 'done',
          evidence: ['wiki/topics/llm-wiki.md'],
          touched_files: ['wiki/queries/storage.md'],
          decisions: ['write reusable query page'],
          result_summary: 'saved answer'
        }),
        draft_markdown: '# Draft\n\nDraft answer.\n',
        result_markdown: '# Result\n\nFinal answer.\n',
        changeset: createChangeSet({
          target_files: ['wiki/queries/storage.md'],
          patch_summary: 'add a reusable answer page',
          rationale: 'query produced long-term value',
          source_refs: ['wiki/topics/llm-wiki.md'],
          risk_level: 'low'
        })
      });

      const loaded = await loadRequestRunState(root, 'run-001');

      expect(loaded).toEqual({
        request_run: {
          run_id: 'run-001',
          user_request: 'answer this question',
          intent: 'query',
          plan: ['read wiki', 'draft answer'],
          status: 'done',
          evidence: ['wiki/topics/llm-wiki.md'],
          touched_files: ['wiki/queries/storage.md'],
          decisions: ['write reusable query page'],
          result_summary: 'saved answer'
        },
        draft_markdown: '# Draft\n\nDraft answer.\n',
        result_markdown: '# Result\n\nFinal answer.\n',
        changeset: {
          target_files: ['wiki/queries/storage.md'],
          patch_summary: 'add a reusable answer page',
          rationale: 'query produced long-term value',
          source_refs: ['wiki/topics/llm-wiki.md'],
          risk_level: 'low',
          needs_review: false
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(missingArtifacts)('rejects a missing required artifact: %s', async (fileName) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        draft_markdown: '# Draft\n\nDraft content.\n',
        result_markdown: '# Result\n\nResult content.\n',
        changeset: null
      });

      const paths = buildRequestRunArtifactPaths(root, 'run-001');
      await unlink(path.join(paths.runDirectory, fileName));

      await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(
        `Incomplete request run state: missing ${fileName}`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(malformedJsonArtifacts)('rejects malformed JSON in %s', async (fileName) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        draft_markdown: '# Draft\n\nDraft content.\n',
        result_markdown: '# Result\n\nResult content.\n',
        changeset: null
      });

      const paths = buildRequestRunArtifactPaths(root, 'run-001');
      await writeFile(path.join(paths.runDirectory, fileName), '{', 'utf8');

      await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(
        `Invalid request run state: malformed ${fileName}`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(semanticallyInvalidArtifacts)(
    'rejects schema-invalid artifact content in $fileName',
    async ({ fileName, content, expectedMessage }) => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

      try {
        await saveRequestRunState(root, {
          request_run: createRequestRun({
            run_id: 'run-001',
            user_request: 'ingest this source',
            intent: 'ingest',
            plan: ['read raw source'],
            status: 'running'
          }),
          draft_markdown: '# Draft\n\nDraft content.\n',
          result_markdown: '# Result\n\nResult content.\n',
          changeset: null
        });

        const paths = buildRequestRunArtifactPaths(root, 'run-001');
        await writeFile(path.join(paths.runDirectory, fileName), content, 'utf8');

        await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(expectedMessage);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/request-run-state-store.test.ts`
Expected: FAIL because `loadRequestRunState` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { createChangeSet, type ChangeSet } from '../domain/change-set.js';
import { createRequestRun, type RequestRun, type RequestRunStatus } from '../domain/request-run.js';
import {
  buildRequestRunArtifactPaths,
  type RequestRunArtifactPaths
} from './request-run-artifact-paths.js';

export interface RequestRunState {
  request_run: RequestRun;
  draft_markdown: string;
  result_markdown: string;
  changeset: ChangeSet | null;
}

interface StoredRequestRecord {
  run_id: string;
  user_request: string;
  intent: string;
}

interface StoredCheckpointRecord {
  status: RequestRunStatus;
  touched_files: string[];
  decisions: string[];
  result_summary: string;
}

export async function saveRequestRunState(
  root: string,
  state: RequestRunState
): Promise<RequestRunArtifactPaths> {
  const paths = buildRequestRunArtifactPaths(root, state.request_run.run_id);

  await mkdir(paths.runDirectory, { recursive: true });
  await rm(paths.checkpoint, { force: true });
  await writeJson(paths.request, {
    run_id: state.request_run.run_id,
    user_request: state.request_run.user_request,
    intent: state.request_run.intent
  });
  await writeJson(paths.plan, state.request_run.plan);
  await writeJson(paths.evidence, state.request_run.evidence);
  await writeFile(paths.draft, state.draft_markdown, 'utf8');
  await writeJson(paths.changeset, state.changeset);
  await writeFile(paths.result, state.result_markdown, 'utf8');
  await writeJson(paths.checkpoint, {
    status: state.request_run.status,
    touched_files: state.request_run.touched_files,
    decisions: state.request_run.decisions,
    result_summary: state.request_run.result_summary
  });

  return paths;
}

export async function loadRequestRunState(root: string, runId: string): Promise<RequestRunState> {
  const paths = buildRequestRunArtifactPaths(root, runId);
  const checkpoint = assertStoredCheckpointRecord(
    await readRequiredJson<unknown>(paths.checkpoint, 'checkpoint.json'),
    'checkpoint.json'
  );
  const request = assertStoredRequestRecord(
    await readRequiredJson<unknown>(paths.request, 'request.json'),
    'request.json'
  );
  const plan = assertStringArray(await readRequiredJson<unknown>(paths.plan, 'plan.json'), 'plan.json');
  const evidence = assertStringArray(
    await readRequiredJson<unknown>(paths.evidence, 'evidence.json'),
    'evidence.json'
  );
  const draft_markdown = await readRequiredText(paths.draft, 'draft.md');
  const storedChangeSet = assertStoredChangeSet(
    await readRequiredJson<unknown>(paths.changeset, 'changeset.json'),
    'changeset.json'
  );
  const result_markdown = await readRequiredText(paths.result, 'result.md');

  return {
    request_run: createRequestRun({
      run_id: request.run_id,
      user_request: request.user_request,
      intent: request.intent,
      plan,
      status: checkpoint.status,
      evidence,
      touched_files: checkpoint.touched_files,
      decisions: checkpoint.decisions,
      result_summary: checkpoint.result_summary
    }),
    draft_markdown,
    result_markdown,
    changeset: storedChangeSet === null ? null : createChangeSet(storedChangeSet)
  };
}

function assertStoredRequestRecord(value: unknown, fileName: string): StoredRequestRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.run_id !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.user_request !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.intent !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return {
    run_id: value.run_id,
    user_request: value.user_request,
    intent: value.intent
  };
}

function assertStoredCheckpointRecord(value: unknown, fileName: string): StoredCheckpointRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!['running', 'needs_review', 'done', 'failed'].includes(String(value.status))) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.touched_files) || value.touched_files.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.decisions) || value.decisions.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.result_summary !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return {
    status: value.status as RequestRunStatus,
    touched_files: value.touched_files,
    decisions: value.decisions,
    result_summary: value.result_summary
  };
}

function assertStoredChangeSet(value: unknown, fileName: string): ChangeSet | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.target_files) || value.target_files.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.patch_summary !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.rationale !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.source_refs) || value.source_refs.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.risk_level !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.needs_review !== 'boolean') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return {
    target_files: value.target_files,
    patch_summary: value.patch_summary,
    rationale: value.rationale,
    source_refs: value.source_refs,
    risk_level: value.risk_level,
    needs_review: value.needs_review
  };
}

function assertStringArray(value: unknown, fileName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readRequiredJson<T>(filePath: string, fileName: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Incomplete request run state: missing ${fileName}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid request run state: malformed ${fileName}`);
    }

    throw error;
  }
}

async function readRequiredText(filePath: string, fileName: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Incomplete request run state: missing ${fileName}`);
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/request-run-state-store.test.ts`
Expected: PASS with `19 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/storage/request-run-state-store.ts test/storage/request-run-state-store.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: load request run state bundle
EOF
)"
```

### Task 4: Export the storage API from the package entry

**Files:**
- Modify: `src/index.ts`
- Create: `test/storage/index-exports.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import {
  buildRequestRunArtifactPaths,
  loadRequestRunState,
  saveRequestRunState
} from '../../src/index.js';
import type { RequestRunArtifactPaths, RequestRunState } from '../../src/index.js';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/index-exports.test.ts`
Expected: FAIL because the storage APIs are not exported from `src/index.ts` yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export { bootstrapProject } from './app/bootstrap-project.js';
export type { BootstrapProjectResult } from './app/bootstrap-project.js';
export { buildProjectPaths } from './config/project-paths.js';
export type { ProjectPaths } from './config/project-paths.js';
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
export {
  buildRequestRunArtifactPaths
} from './storage/request-run-artifact-paths.js';
export type { RequestRunArtifactPaths } from './storage/request-run-artifact-paths.js';
export { loadRequestRunState, saveRequestRunState } from './storage/request-run-state-store.js';
export type { RequestRunState } from './storage/request-run-state-store.js';
```

- [ ] **Step 4: Run final verification**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/storage/index-exports.test.ts && npm run test && npm run typecheck && npm run build`
Expected: export test passes, the full test suite passes, TypeScript exits with code 0, and the build emits `dist/` successfully.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/index.ts src/storage/request-run-artifact-paths.ts src/storage/request-run-state-store.ts test/storage/request-run-artifact-paths.test.ts test/storage/request-run-state-store.test.ts test/storage/index-exports.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: export request run storage APIs
EOF
)"
```

## Spec Coverage Check

- `docs/superpowers/specs/2026-04-11-llm-wiki-design.md` section 12.1 is covered by Task 2 and Task 3 through explicit save/load behavior for recoverable run-state artifacts.
- Section 12.2 is covered by Task 1, Task 2, and Task 3 through the selected `request.json`, `plan.json`, `evidence.json`, `draft.md`, `changeset.json`, `result.md`, and `checkpoint.json` artifact bundle under `state/runs/<run_id>/`.
- The design requirement for recoverability is addressed for MVP by rejecting unsafe run ids, removing any stale checkpoint before rewrite, writing the bundle sequentially, and refusing to load when any required artifact is missing or when any required JSON artifact is malformed or schema-invalid.
- This slice validates stored artifact shapes and the known `RequestRunStatus` values needed for checkpoint recovery, but intentionally does not introduce broader enum validation for unconstrained domain fields such as `intent` or `risk_level`.
- Section 6.1 and section 14 are respected by keeping all new persistence inside `state/` and reusing the existing `state/runs/` directory contract.
- Runtime orchestration, wiki page persistence, and raw source storage remain intentionally deferred to later slices.
