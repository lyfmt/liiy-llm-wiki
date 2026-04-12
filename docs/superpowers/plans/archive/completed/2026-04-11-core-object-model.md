# Core Object Model Implementation Plan

> **Archived on 2026-04-12:** This completed slice plan is kept for historical traceability and has been removed from the active plans directory.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first domain-model slice for the LLM wiki project by defining the five core object types from the design spec and exporting them from a stable package entry.

**Architecture:** Keep this slice purely structural: define focused `src/domain/` modules that use the spec’s exact snake_case field names with no mapping layer. Only model literal unions that the design spec explicitly enumerates (`SourceManifest.status`, `KnowledgePage.kind`, `RequestRun.status`, `Finding.type`); fields whose values are not frozen by the spec stay as plain `string` or `boolean` properties.

**Tech Stack:** TypeScript, Node.js, Vitest

---

## File Structure

- Create: `src/domain/source-manifest.ts` — define `SourceManifest`, its status union, and a minimal `createSourceManifest()` constructor.
- Create: `src/domain/knowledge-page.ts` — define `KnowledgePage`, its kind union, and a minimal `createKnowledgePage()` constructor.
- Create: `src/domain/request-run.ts` — define `RequestRun`, its status union, and a minimal `createRequestRun()` constructor.
- Create: `src/domain/change-set.ts` — define `ChangeSet` and `createChangeSet()`.
- Create: `src/domain/finding.ts` — define `Finding`, its type union, and `createFinding()`.
- Create: `test/domain/source-manifest.test.ts` — verify `SourceManifest` defaults and status handling.
- Create: `test/domain/knowledge-page.test.ts` — verify `KnowledgePage` uses exact spec field names and kind handling.
- Create: `test/domain/request-run.test.ts` — verify `RequestRun` defaults and status handling.
- Create: `test/domain/change-set.test.ts` — verify `ChangeSet` defaults.
- Create: `test/domain/finding.test.ts` — verify `Finding` uses exact spec field names and type handling.
- Modify: `src/index.ts` — re-export the new domain constructors and public types from the package entry.
- Create: `test/domain/index-exports.test.ts` — verify the package entry exposes both the runtime constructors and the public domain types.

## Scope Notes

This plan covers only the core object model named in the design spec: `SourceManifest`, `KnowledgePage`, `RequestRun`, `ChangeSet`, and `Finding`. It does **not** add persistence, filesystem reads/writes, flow orchestration, policy evaluation, or runtime integration.

### Task 1: Add the SourceManifest domain model

**Files:**
- Create: `src/domain/source-manifest.ts`
- Create: `test/domain/source-manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../src/domain/source-manifest.js';

describe('createSourceManifest', () => {
  it('creates a source manifest with spec field names and inbox defaults', () => {
    const manifest = createSourceManifest({
      id: 'src-001',
      path: 'raw/inbox/example.md',
      title: 'Example Source',
      type: 'markdown',
      hash: 'sha256:abc123',
      imported_at: '2026-04-11T00:00:00.000Z'
    });

    expect(manifest).toEqual({
      id: 'src-001',
      path: 'raw/inbox/example.md',
      title: 'Example Source',
      type: 'markdown',
      status: 'inbox',
      hash: 'sha256:abc123',
      imported_at: '2026-04-11T00:00:00.000Z',
      tags: [],
      notes: ''
    });
  });

  it('preserves an explicit processed status with tags and notes', () => {
    const manifest = createSourceManifest({
      id: 'src-002',
      path: 'raw/accepted/example.md',
      title: 'Processed Source',
      type: 'markdown',
      status: 'processed',
      hash: 'sha256:def456',
      imported_at: '2026-04-11T01:00:00.000Z',
      tags: ['llm', 'wiki'],
      notes: 'accepted for synthesis'
    });

    expect(manifest.status).toBe('processed');
    expect(manifest.tags).toEqual(['llm', 'wiki']);
    expect(manifest.notes).toBe('accepted for synthesis');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/source-manifest.test.ts`
Expected: FAIL with a module resolution error for `../../src/domain/source-manifest.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type SourceManifestStatus = 'inbox' | 'accepted' | 'rejected' | 'processed';

export interface SourceManifest {
  id: string;
  path: string;
  title: string;
  type: string;
  status: SourceManifestStatus;
  hash: string;
  imported_at: string;
  tags: string[];
  notes: string;
}

export interface CreateSourceManifestInput {
  id: string;
  path: string;
  title: string;
  type: string;
  status?: SourceManifestStatus;
  hash: string;
  imported_at: string;
  tags?: string[];
  notes?: string;
}

export function createSourceManifest(input: CreateSourceManifestInput): SourceManifest {
  return {
    id: input.id,
    path: input.path,
    title: input.title,
    type: input.type,
    status: input.status ?? 'inbox',
    hash: input.hash,
    imported_at: input.imported_at,
    tags: input.tags ?? [],
    notes: input.notes ?? ''
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/source-manifest.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/domain/source-manifest.ts test/domain/source-manifest.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add source manifest model
EOF
)"
```

### Task 2: Add the KnowledgePage domain model

**Files:**
- Create: `src/domain/knowledge-page.ts`
- Create: `test/domain/knowledge-page.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../src/domain/knowledge-page.js';

describe('createKnowledgePage', () => {
  it('creates a knowledge page with exact spec field names', () => {
    const page = createKnowledgePage({
      path: 'wiki/topics/llm-wiki.md',
      kind: 'topic',
      title: 'LLM Wiki',
      source_refs: ['raw/inbox/example.md'],
      status: 'active',
      updated_at: '2026-04-11T00:00:00.000Z'
    });

    expect(page).toEqual({
      path: 'wiki/topics/llm-wiki.md',
      kind: 'topic',
      title: 'LLM Wiki',
      aliases: [],
      source_refs: ['raw/inbox/example.md'],
      outgoing_links: [],
      status: 'active',
      updated_at: '2026-04-11T00:00:00.000Z'
    });
  });

  it('preserves explicit aliases and outgoing links', () => {
    const page = createKnowledgePage({
      path: 'wiki/entities/example.md',
      kind: 'entity',
      title: 'Example Entity',
      aliases: ['Example'],
      source_refs: ['raw/accepted/example.md'],
      outgoing_links: ['wiki/topics/llm-wiki.md'],
      status: 'archived',
      updated_at: '2026-04-11T01:00:00.000Z'
    });

    expect(page.aliases).toEqual(['Example']);
    expect(page.outgoing_links).toEqual(['wiki/topics/llm-wiki.md']);
    expect(page.kind).toBe('entity');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/knowledge-page.test.ts`
Expected: FAIL with a module resolution error for `../../src/domain/knowledge-page.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type KnowledgePageKind = 'source' | 'entity' | 'topic' | 'query';

export interface KnowledgePage {
  path: string;
  kind: KnowledgePageKind;
  title: string;
  aliases: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  updated_at: string;
}

export interface CreateKnowledgePageInput {
  path: string;
  kind: KnowledgePageKind;
  title: string;
  aliases?: string[];
  source_refs: string[];
  outgoing_links?: string[];
  status: string;
  updated_at: string;
}

export function createKnowledgePage(input: CreateKnowledgePageInput): KnowledgePage {
  return {
    path: input.path,
    kind: input.kind,
    title: input.title,
    aliases: input.aliases ?? [],
    source_refs: input.source_refs,
    outgoing_links: input.outgoing_links ?? [],
    status: input.status,
    updated_at: input.updated_at
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/knowledge-page.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/domain/knowledge-page.ts test/domain/knowledge-page.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add knowledge page model
EOF
)"
```

### Task 3: Add the RequestRun domain model

**Files:**
- Create: `src/domain/request-run.ts`
- Create: `test/domain/request-run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { createRequestRun } from '../../src/domain/request-run.js';

describe('createRequestRun', () => {
  it('creates a request run with default running status and empty collections', () => {
    const run = createRequestRun({
      run_id: 'run-001',
      user_request: 'ingest this source',
      intent: 'ingest',
      plan: ['read raw source', 'update wiki']
    });

    expect(run).toEqual({
      run_id: 'run-001',
      user_request: 'ingest this source',
      intent: 'ingest',
      plan: ['read raw source', 'update wiki'],
      status: 'running',
      evidence: [],
      touched_files: [],
      decisions: [],
      result_summary: ''
    });
  });

  it('preserves explicit review status and populated collections', () => {
    const run = createRequestRun({
      run_id: 'run-002',
      user_request: 'answer this question',
      intent: 'query',
      plan: ['read wiki', 'draft answer'],
      status: 'needs_review',
      evidence: ['wiki/topics/llm-wiki.md'],
      touched_files: ['wiki/queries/example.md'],
      decisions: ['write back high-value result'],
      result_summary: 'needs user review'
    });

    expect(run.status).toBe('needs_review');
    expect(run.evidence).toEqual(['wiki/topics/llm-wiki.md']);
    expect(run.result_summary).toBe('needs user review');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/request-run.test.ts`
Expected: FAIL with a module resolution error for `../../src/domain/request-run.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type RequestRunStatus = 'running' | 'needs_review' | 'done' | 'failed';

export interface RequestRun {
  run_id: string;
  user_request: string;
  intent: string;
  plan: string[];
  status: RequestRunStatus;
  evidence: string[];
  touched_files: string[];
  decisions: string[];
  result_summary: string;
}

export interface CreateRequestRunInput {
  run_id: string;
  user_request: string;
  intent: string;
  plan: string[];
  status?: RequestRunStatus;
  evidence?: string[];
  touched_files?: string[];
  decisions?: string[];
  result_summary?: string;
}

export function createRequestRun(input: CreateRequestRunInput): RequestRun {
  return {
    run_id: input.run_id,
    user_request: input.user_request,
    intent: input.intent,
    plan: input.plan,
    status: input.status ?? 'running',
    evidence: input.evidence ?? [],
    touched_files: input.touched_files ?? [],
    decisions: input.decisions ?? [],
    result_summary: input.result_summary ?? ''
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/request-run.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/domain/request-run.ts test/domain/request-run.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add request run model
EOF
)"
```

### Task 4: Add the ChangeSet and Finding domain models

**Files:**
- Create: `src/domain/change-set.ts`
- Create: `src/domain/finding.ts`
- Create: `test/domain/change-set.test.ts`
- Create: `test/domain/finding.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';

describe('createChangeSet', () => {
  it('creates a change set with a default non-review state', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/llm-wiki.md'],
      patch_summary: 'add a new section about storage boundaries',
      rationale: 'new source clarified the architecture',
      source_refs: ['raw/accepted/example.md'],
      risk_level: 'medium'
    });

    expect(changeSet).toEqual({
      target_files: ['wiki/topics/llm-wiki.md'],
      patch_summary: 'add a new section about storage boundaries',
      rationale: 'new source clarified the architecture',
      source_refs: ['raw/accepted/example.md'],
      risk_level: 'medium',
      needs_review: false
    });
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import { createFinding } from '../../src/domain/finding.js';

describe('createFinding', () => {
  it('creates a finding with exact spec field names', () => {
    const finding = createFinding({
      type: 'missing-link',
      severity: 'medium',
      evidence: ['wiki/topics/llm-wiki.md'],
      suggested_action: 'link the topic from wiki/index.md',
      resolution_status: 'open'
    });

    expect(finding).toEqual({
      type: 'missing-link',
      severity: 'medium',
      evidence: ['wiki/topics/llm-wiki.md'],
      suggested_action: 'link the topic from wiki/index.md',
      resolution_status: 'open'
    });
  });

  it('preserves a resolved status', () => {
    const finding = createFinding({
      type: 'conflict',
      severity: 'high',
      evidence: ['wiki/topics/llm-wiki.md', 'raw/accepted/example.md'],
      suggested_action: 'review source conflict',
      resolution_status: 'resolved'
    });

    expect(finding.type).toBe('conflict');
    expect(finding.resolution_status).toBe('resolved');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/change-set.test.ts test/domain/finding.test.ts`
Expected: FAIL with module resolution errors for `../../src/domain/change-set.js` and `../../src/domain/finding.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface ChangeSet {
  target_files: string[];
  patch_summary: string;
  rationale: string;
  source_refs: string[];
  risk_level: string;
  needs_review: boolean;
}

export interface CreateChangeSetInput {
  target_files: string[];
  patch_summary: string;
  rationale: string;
  source_refs: string[];
  risk_level: string;
  needs_review?: boolean;
}

export function createChangeSet(input: CreateChangeSetInput): ChangeSet {
  return {
    target_files: input.target_files,
    patch_summary: input.patch_summary,
    rationale: input.rationale,
    source_refs: input.source_refs,
    risk_level: input.risk_level,
    needs_review: input.needs_review ?? false
  };
}
```

```ts
export type FindingType = 'conflict' | 'orphan' | 'stale' | 'missing-link' | 'gap';

export interface Finding {
  type: FindingType;
  severity: string;
  evidence: string[];
  suggested_action: string;
  resolution_status: string;
}

export interface CreateFindingInput {
  type: FindingType;
  severity: string;
  evidence: string[];
  suggested_action: string;
  resolution_status: string;
}

export function createFinding(input: CreateFindingInput): Finding {
  return {
    type: input.type,
    severity: input.severity,
    evidence: input.evidence,
    suggested_action: input.suggested_action,
    resolution_status: input.resolution_status
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/change-set.test.ts test/domain/finding.test.ts`
Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/domain/change-set.ts src/domain/finding.ts test/domain/change-set.test.ts test/domain/finding.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add change set and finding models
EOF
)"
```

### Task 5: Export the domain model APIs from the package entry

**Files:**
- Modify: `src/index.ts`
- Create: `test/domain/index-exports.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import {
  bootstrapProject,
  buildProjectPaths,
  createChangeSet,
  createFinding,
  createKnowledgePage,
  createRequestRun,
  createSourceManifest
} from '../../src/index.js';
import type {
  ChangeSet,
  Finding,
  FindingType,
  KnowledgePage,
  KnowledgePageKind,
  RequestRun,
  RequestRunStatus,
  SourceManifest,
  SourceManifestStatus
} from '../../src/index.js';

describe('package entry domain exports', () => {
  it('re-exports the domain constructors and public types alongside existing bootstrap APIs', () => {
    const sourceStatus: SourceManifestStatus = 'inbox';
    const pageKind: KnowledgePageKind = 'topic';
    const runStatus: RequestRunStatus = 'running';
    const findingType: FindingType = 'gap';

    const sourceManifest: SourceManifest = {
      id: 'src-001',
      path: 'raw/inbox/example.md',
      title: 'Example Source',
      type: 'markdown',
      status: 'inbox',
      hash: 'sha256:abc123',
      imported_at: '2026-04-11T00:00:00.000Z',
      tags: [],
      notes: ''
    };

    const knowledgePage: KnowledgePage = {
      path: 'wiki/topics/llm-wiki.md',
      kind: 'topic',
      title: 'LLM Wiki',
      aliases: [],
      source_refs: [],
      outgoing_links: [],
      status: 'active',
      updated_at: '2026-04-11T00:00:00.000Z'
    };

    const requestRun: RequestRun = {
      run_id: 'run-001',
      user_request: 'ingest this source',
      intent: 'ingest',
      plan: [],
      status: 'running',
      evidence: [],
      touched_files: [],
      decisions: [],
      result_summary: ''
    };

    const changeSet: ChangeSet = {
      target_files: [],
      patch_summary: 'summary',
      rationale: 'reason',
      source_refs: [],
      risk_level: 'low',
      needs_review: false
    };

    const finding: Finding = {
      type: 'gap',
      severity: 'medium',
      evidence: [],
      suggested_action: 'add a missing page',
      resolution_status: 'open'
    };

    expect(typeof bootstrapProject).toBe('function');
    expect(typeof buildProjectPaths).toBe('function');
    expect(typeof createSourceManifest).toBe('function');
    expect(typeof createKnowledgePage).toBe('function');
    expect(typeof createRequestRun).toBe('function');
    expect(typeof createChangeSet).toBe('function');
    expect(typeof createFinding).toBe('function');
    expect(sourceStatus).toBe('inbox');
    expect(pageKind).toBe('topic');
    expect(runStatus).toBe('running');
    expect(findingType).toBe('gap');
    expect(sourceManifest.status).toBe('inbox');
    expect(knowledgePage.kind).toBe('topic');
    expect(requestRun.status).toBe('running');
    expect(changeSet.needs_review).toBe(false);
    expect(finding.type).toBe('gap');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/index-exports.test.ts`
Expected: FAIL because the new domain constructors and types are not exported from `src/index.ts` yet.

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
```

- [ ] **Step 4: Run final verification**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/domain/index-exports.test.ts && npm run test && npm run typecheck && npm run build`
Expected: export test passes, the full test suite passes, TypeScript exits with code 0, and the build emits `dist/` successfully.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/index.ts src/domain/source-manifest.ts src/domain/knowledge-page.ts src/domain/request-run.ts src/domain/change-set.ts src/domain/finding.ts test/domain/source-manifest.test.ts test/domain/knowledge-page.test.ts test/domain/request-run.test.ts test/domain/change-set.test.ts test/domain/finding.test.ts test/domain/index-exports.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add core domain models
EOF
)"
```

## Spec Coverage Check

- `docs/superpowers/specs/2026-04-11-llm-wiki-design.md` section 7.1 is covered by Task 1 through exact spec field names and the explicitly enumerated `SourceManifest.status` literals.
- Section 7.2 is covered by Task 2 through exact spec field names and the explicitly enumerated `KnowledgePage.kind` literals; `status` remains a plain string because the spec does not freeze page-status values.
- Section 7.3 is covered by Task 3 through exact spec field names and the explicitly enumerated `RequestRun.status` literals; `intent` remains a plain string because the spec does not freeze allowed intent values in section 7.
- Section 7.4 is covered by Task 4 through exact spec field names; `risk_level` remains a plain string because the spec does not enumerate risk levels.
- Section 7.5 is covered by Task 4 through exact spec field names and the explicitly enumerated `Finding.type` literals; `severity` and `resolution_status` remain plain strings because the spec does not enumerate their values.
- The package-entry exposure needed for downstream slices is covered by Task 5 through both runtime export checks and compile-time type imports.
- Persistence, runtime orchestration, and policy enforcement remain intentionally deferred to later slices.
