# Project Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first MVP slice: an idempotent TypeScript bootstrap that creates the `raw/`, `wiki/`, `schema/`, `state/`, and `docs/superpowers/specs/` project skeleton plus starter Markdown files from a single entrypoint.

**Architecture:** Keep this slice local-only and file-system based. Extend the existing path contract to cover the full design-time directory skeleton, add a focused bootstrap module that creates directories and starter Markdown files without overwriting user edits, then expose that bootstrap through both a small CLI entry and the package public API.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Vitest

---

## File Structure

- Modify: `src/config/project-paths.ts` — extend the path contract to include `docs/`, `docs/superpowers/`, and `docs/superpowers/specs/`.
- Modify: `test/config/project-paths.test.ts` — lock the expanded path contract to the design spec.
- Create: `src/app/bootstrap-project.ts` — idempotently create the required directory tree and starter wiki/schema files for a new project root.
- Create: `test/app/bootstrap-project.test.ts` — verify directory creation, starter file creation, and rerun idempotency against a temp directory.
- Create: `src/cli.ts` — provide the minimal executable entry that accepts a target root and runs the bootstrap.
- Create: `test/cli/bootstrap-cli.test.ts` — verify the CLI-facing `main()` entry works and fails clearly when the root argument is missing.
- Modify: `src/index.ts` — export the bootstrap API alongside the existing path builder.
- Create: `test/index.test.ts` — verify the package entry re-exports the bootstrap API.

## Scope Notes

This plan only covers the first implementation target selected by the user: 项目骨架（目录结构、基础 TypeScript 入口、最小运行闭环）。It intentionally does **not** implement domain models, storage abstractions beyond bootstrap, runtime integration, or ingest/query/lint flows yet.

### Task 1: Extend the path contract to cover the full skeleton

**Files:**
- Modify: `src/config/project-paths.ts`
- Modify: `test/config/project-paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildProjectPaths } from '../../src/config/project-paths.js';

describe('buildProjectPaths', () => {
  it('builds the required project paths and expanded skeleton from the root', () => {
    const root = '/tmp/llm-wiki-liiy';

    expect(buildProjectPaths(root)).toEqual(
      expect.objectContaining({
        root,
        rawInbox: path.join(root, 'raw', 'inbox'),
        wikiSources: path.join(root, 'wiki', 'sources'),
        wikiLog: path.join(root, 'wiki', 'log.md'),
        schemaReviewGates: path.join(root, 'schema', 'review-gates.md'),
        stateArtifacts: path.join(root, 'state', 'artifacts'),
        docs: path.join(root, 'docs'),
        docsSuperpowers: path.join(root, 'docs', 'superpowers'),
        docsSuperpowersSpecs: path.join(root, 'docs', 'superpowers', 'specs')
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/config/project-paths.test.ts`
Expected: FAIL because `docs`, `docsSuperpowers`, and `docsSuperpowersSpecs` are missing from `ProjectPaths`.

- [ ] **Step 3: Write minimal implementation**

```ts
import path from 'node:path';

export interface ProjectPaths {
  root: string;
  raw: string;
  rawInbox: string;
  rawAccepted: string;
  rawRejected: string;
  wiki: string;
  wikiIndex: string;
  wikiLog: string;
  wikiSources: string;
  wikiEntities: string;
  wikiTopics: string;
  wikiQueries: string;
  schema: string;
  schemaAgentRules: string;
  schemaPageTypes: string;
  schemaUpdatePolicy: string;
  schemaReviewGates: string;
  state: string;
  stateRuns: string;
  stateCheckpoints: string;
  stateDrafts: string;
  stateArtifacts: string;
  docs: string;
  docsSuperpowers: string;
  docsSuperpowersSpecs: string;
}

export function buildProjectPaths(root: string): ProjectPaths {
  const raw = path.join(root, 'raw');
  const wiki = path.join(root, 'wiki');
  const schema = path.join(root, 'schema');
  const state = path.join(root, 'state');
  const docs = path.join(root, 'docs');
  const docsSuperpowers = path.join(docs, 'superpowers');

  return {
    root,
    raw,
    rawInbox: path.join(raw, 'inbox'),
    rawAccepted: path.join(raw, 'accepted'),
    rawRejected: path.join(raw, 'rejected'),
    wiki,
    wikiIndex: path.join(wiki, 'index.md'),
    wikiLog: path.join(wiki, 'log.md'),
    wikiSources: path.join(wiki, 'sources'),
    wikiEntities: path.join(wiki, 'entities'),
    wikiTopics: path.join(wiki, 'topics'),
    wikiQueries: path.join(wiki, 'queries'),
    schema,
    schemaAgentRules: path.join(schema, 'agent-rules.md'),
    schemaPageTypes: path.join(schema, 'page-types.md'),
    schemaUpdatePolicy: path.join(schema, 'update-policy.md'),
    schemaReviewGates: path.join(schema, 'review-gates.md'),
    state,
    stateRuns: path.join(state, 'runs'),
    stateCheckpoints: path.join(state, 'checkpoints'),
    stateDrafts: path.join(state, 'drafts'),
    stateArtifacts: path.join(state, 'artifacts'),
    docs,
    docsSuperpowers,
    docsSuperpowersSpecs: path.join(docsSuperpowers, 'specs')
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/config/project-paths.test.ts`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/config/project-paths.ts test/config/project-paths.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: expand project path skeleton
EOF
)"
```

### Task 2: Add an idempotent bootstrap for the required directory tree

**Files:**
- Create: `src/app/bootstrap-project.ts`
- Create: `test/app/bootstrap-project.test.ts`
- Reuse: `src/config/project-paths.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { access, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';

describe('bootstrapProject', () => {
  it('creates the required raw wiki schema state and docs directories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'llm-wiki-bootstrap-'));

    const result = await bootstrapProject(root);

    expect(result.directories).toEqual(
      expect.arrayContaining([
        path.join(root, 'raw'),
        path.join(root, 'raw', 'inbox'),
        path.join(root, 'raw', 'accepted'),
        path.join(root, 'raw', 'rejected'),
        path.join(root, 'wiki'),
        path.join(root, 'wiki', 'sources'),
        path.join(root, 'wiki', 'entities'),
        path.join(root, 'wiki', 'topics'),
        path.join(root, 'wiki', 'queries'),
        path.join(root, 'schema'),
        path.join(root, 'state'),
        path.join(root, 'state', 'runs'),
        path.join(root, 'state', 'checkpoints'),
        path.join(root, 'state', 'drafts'),
        path.join(root, 'state', 'artifacts'),
        path.join(root, 'docs'),
        path.join(root, 'docs', 'superpowers'),
        path.join(root, 'docs', 'superpowers', 'specs')
      ])
    );

    await access(path.join(root, 'wiki', 'topics'));
    await access(path.join(root, 'state', 'artifacts'));
    await access(path.join(root, 'docs', 'superpowers', 'specs'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/app/bootstrap-project.test.ts`
Expected: FAIL with a module resolution error for `../../src/app/bootstrap-project.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdir } from 'node:fs/promises';

import { buildProjectPaths } from '../config/project-paths.js';

export interface BootstrapProjectResult {
  directories: string[];
  files: string[];
}

export async function bootstrapProject(root: string): Promise<BootstrapProjectResult> {
  const paths = buildProjectPaths(root);
  const directories = [
    paths.raw,
    paths.rawInbox,
    paths.rawAccepted,
    paths.rawRejected,
    paths.wiki,
    paths.wikiSources,
    paths.wikiEntities,
    paths.wikiTopics,
    paths.wikiQueries,
    paths.schema,
    paths.state,
    paths.stateRuns,
    paths.stateCheckpoints,
    paths.stateDrafts,
    paths.stateArtifacts,
    paths.docs,
    paths.docsSuperpowers,
    paths.docsSuperpowersSpecs
  ];

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  return {
    directories,
    files: []
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/app/bootstrap-project.test.ts`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/app/bootstrap-project.ts test/app/bootstrap-project.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add project directory bootstrap
EOF
)"
```

### Task 3: Seed starter wiki/schema files and keep reruns non-destructive

**Files:**
- Modify: `src/app/bootstrap-project.ts`
- Modify: `test/app/bootstrap-project.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';

describe('bootstrapProject', () => {
  it('creates the required raw wiki schema state and docs directories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'llm-wiki-bootstrap-'));

    const result = await bootstrapProject(root);

    expect(result.directories).toEqual(
      expect.arrayContaining([
        path.join(root, 'raw'),
        path.join(root, 'raw', 'inbox'),
        path.join(root, 'raw', 'accepted'),
        path.join(root, 'raw', 'rejected'),
        path.join(root, 'wiki'),
        path.join(root, 'wiki', 'sources'),
        path.join(root, 'wiki', 'entities'),
        path.join(root, 'wiki', 'topics'),
        path.join(root, 'wiki', 'queries'),
        path.join(root, 'schema'),
        path.join(root, 'state'),
        path.join(root, 'state', 'runs'),
        path.join(root, 'state', 'checkpoints'),
        path.join(root, 'state', 'drafts'),
        path.join(root, 'state', 'artifacts'),
        path.join(root, 'docs'),
        path.join(root, 'docs', 'superpowers'),
        path.join(root, 'docs', 'superpowers', 'specs')
      ])
    );

    await access(path.join(root, 'wiki', 'topics'));
    await access(path.join(root, 'state', 'artifacts'));
    await access(path.join(root, 'docs', 'superpowers', 'specs'));
  });

  it('creates starter wiki and schema markdown files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'llm-wiki-bootstrap-'));

    const result = await bootstrapProject(root);

    expect(result.files).toEqual(
      expect.arrayContaining([
        path.join(root, 'wiki', 'index.md'),
        path.join(root, 'wiki', 'log.md'),
        path.join(root, 'schema', 'agent-rules.md'),
        path.join(root, 'schema', 'page-types.md'),
        path.join(root, 'schema', 'update-policy.md'),
        path.join(root, 'schema', 'review-gates.md')
      ])
    );

    const index = await readFile(path.join(root, 'wiki', 'index.md'), 'utf8');
    const reviewGates = await readFile(path.join(root, 'schema', 'review-gates.md'), 'utf8');

    expect(index).toContain('# Wiki Index');
    expect(index).toContain('- [Sources](sources/)');
    expect(reviewGates).toContain('删除页面');
    expect(reviewGates).toContain('修改 schema 规则');
  });

  it('does not overwrite an existing scaffold file on rerun', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'llm-wiki-bootstrap-'));
    const indexPath = path.join(root, 'wiki', 'index.md');

    await bootstrapProject(root);
    await writeFile(indexPath, '# Custom Index\n', 'utf8');

    await bootstrapProject(root);

    expect(await readFile(indexPath, 'utf8')).toBe('# Custom Index\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/app/bootstrap-project.test.ts`
Expected: FAIL because `result.files` is empty and the starter Markdown files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import { constants } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';

import { buildProjectPaths } from '../config/project-paths.js';

export interface BootstrapProjectResult {
  directories: string[];
  files: string[];
}

export async function bootstrapProject(root: string): Promise<BootstrapProjectResult> {
  const paths = buildProjectPaths(root);
  const directories = [
    paths.raw,
    paths.rawInbox,
    paths.rawAccepted,
    paths.rawRejected,
    paths.wiki,
    paths.wikiSources,
    paths.wikiEntities,
    paths.wikiTopics,
    paths.wikiQueries,
    paths.schema,
    paths.state,
    paths.stateRuns,
    paths.stateCheckpoints,
    paths.stateDrafts,
    paths.stateArtifacts,
    paths.docs,
    paths.docsSuperpowers,
    paths.docsSuperpowersSpecs
  ];

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  const files = {
    [paths.wikiIndex]: `# Wiki Index\n\n- [Sources](sources/)\n- [Entities](entities/)\n- [Topics](topics/)\n- [Queries](queries/)\n`,
    [paths.wikiLog]: '# Wiki Log\n\n',
    [paths.schemaAgentRules]: `# Agent Rules\n\n- Maintain the long-lived wiki as the primary system responsibility.\n- Treat raw materials in \`raw/\` as read-only input.\n- Form a plan before mutating wiki content.\n- Escalate high-impact changes through the review gate.\n`,
    [paths.schemaPageTypes]: `# Page Types\n\n- \`sources/\`: single-source summary pages\n- \`entities/\`: people, organizations, concepts, works, or systems\n- \`topics/\`: topic overviews, comparisons, and disputes\n- \`queries/\`: reusable question-and-answer pages\n`,
    [paths.schemaUpdatePolicy]: `# Update Policy\n\n- Prefer patch-style updates over full rewrites.\n- Keep \`log.md\` append-only.\n- Maintain \`wiki/index.md\` as a structured navigation page.\n- Preserve conflicts with their supporting evidence instead of flattening them away.\n- Only write back query results with long-term value.\n`,
    [paths.schemaReviewGates]: `# Review Gates\n\nHigh-impact actions require review before applying changes:\n\n- 重写核心 topic 页\n- 删除页面\n- 合并或拆分关键实体\n- 修改 schema 规则\n- 涉及多个主题页的基础判断变化\n- 存在明显证据冲突但无法自动决断\n`
  } as const;

  const createdFiles: string[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    if (await pathExists(filePath)) {
      continue;
    }

    await writeFile(filePath, content, 'utf8');
    createdFiles.push(filePath);
  }

  return {
    directories,
    files: createdFiles
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/app/bootstrap-project.test.ts`
Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/app/bootstrap-project.ts test/app/bootstrap-project.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: seed wiki bootstrap files
EOF
)"
```

### Task 4: Add the minimal CLI entry and verify the built executable path

**Files:**
- Create: `src/cli.ts`
- Create: `test/cli/bootstrap-cli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli.js';

describe('main', () => {
  it('bootstraps the project scaffold from argv', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'llm-wiki-cli-'));

    await main(['node', 'cli.js', root]);

    const index = await readFile(path.join(root, 'wiki', 'index.md'), 'utf8');
    expect(index).toContain('# Wiki Index');
  });

  it('fails fast when the target root is missing', async () => {
    await expect(main(['node', 'cli.js'])).rejects.toThrow(
      'Usage: node dist/cli.js <project-root>'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/cli/bootstrap-cli.test.ts`
Expected: FAIL with a module resolution error for `../../src/cli.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { pathToFileURL } from 'node:url';

import { bootstrapProject } from './app/bootstrap-project.js';

export async function main(argv = process.argv): Promise<void> {
  const root = argv[2];

  if (!root) {
    throw new Error('Usage: node dist/cli.js <project-root>');
  }

  const result = await bootstrapProject(root);

  console.log(
    JSON.stringify(
      {
        root,
        directories: result.directories.length,
        files: result.files.length
      },
      null,
      2
    )
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run tests and built-CLI verification**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/cli/bootstrap-cli.test.ts && npm run typecheck && npm run build && tmpdir=$(mktemp -d) && output=$(node dist/cli.js "$tmpdir") && printf '%s' "$output" | node -e "const fs = require('node:fs'); const data = JSON.parse(fs.readFileSync(0, 'utf8')); if (data.root !== process.argv[1] || typeof data.directories !== 'number' || data.directories < 1 || typeof data.files !== 'number' || data.files < 1) process.exit(1);" "$tmpdir" && test -f "$tmpdir/wiki/index.md"`
Expected: targeted CLI test passes, TypeScript exits with code 0, the build emits `dist/`, the CLI stdout parses as JSON with the expected `root`, numeric `directories`, and numeric `files` fields, and `wiki/index.md` exists in the temp root.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/cli.ts test/cli/bootstrap-cli.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: add bootstrap cli entrypoint
EOF
)"
```

### Task 5: Export the bootstrap API from the package entry

**Files:**
- Modify: `src/index.ts`
- Create: `test/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { bootstrapProject, buildProjectPaths } from '../src/index.js';

describe('package entry', () => {
  it('re-exports the bootstrap and path builder APIs', () => {
    expect(typeof bootstrapProject).toBe('function');
    expect(buildProjectPaths('/tmp/llm-wiki-liiy').wiki).toBe('/tmp/llm-wiki-liiy/wiki');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/index.test.ts`
Expected: FAIL because `bootstrapProject` is not exported from `src/index.ts` yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export { bootstrapProject } from './app/bootstrap-project.js';
export type { BootstrapProjectResult } from './app/bootstrap-project.js';
export { buildProjectPaths } from './config/project-paths.js';
export type { ProjectPaths } from './config/project-paths.js';
```

- [ ] **Step 4: Run final verification**

Run: `cd "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" && npx vitest run test/index.test.ts && npm run test && npm run typecheck && npm run build`
Expected: export test passes, the full test suite passes, TypeScript exits with code 0, and the build emits `dist/` successfully.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" add src/index.ts test/index.test.ts
git -C "/workspace/liiy-llm-wiki/.worktrees/task-1-bootstrap" commit -m "$(cat <<'EOF'
feat: export bootstrap api
EOF
)"
```

## Spec Coverage Check

- `docs/superpowers/specs/2026-04-11-llm-wiki-design.md` section 6 (目录结构设计) is covered by Task 1, Task 2, and Task 3 through the full path contract plus directory and starter-file bootstrap.
- Section 10 (规则层设计) is covered at starter-file level by Task 3 through `agent-rules.md`, `update-policy.md`, and `review-gates.md` scaffolding.
- Section 12.1 (状态持久化目标) is covered at skeleton level by Task 2 through `state/` directory creation; the concrete per-run artifact files from section 12.2 are intentionally deferred to a later runtime/state plan.
- Section 14 (实现前需要冻结的设计决策) is reflected in the seeded page taxonomy and patch/review defaults from Task 3.
- Runtime integration, object models, and ingest/query/lint flows are intentionally deferred to later plans because they are outside the selected “项目骨架” scope.
