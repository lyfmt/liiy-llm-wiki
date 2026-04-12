# Quality Gates and CI Implementation Plan

> **Archived on 2026-04-12:** This quality-gates plan has been fully executed and is kept for historical traceability. The implemented repository quality gates now live in the main workspace configuration and CI workflow.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal but real pre-submit quality gate by introducing linting and a CI workflow that runs install, lint, test, typecheck, and build on the main branch and pull requests.

**Architecture:** Keep this slice narrow and repository-local. Add ESLint with TypeScript support, wire a deterministic `npm run lint` script, then add a single GitHub Actions workflow that installs dependencies with `npm ci` and runs the existing quality commands in sequence. Reuse the current `vitest.config.ts`, `tsconfig.json`, and `package.json` instead of introducing extra tooling layers.

**Tech Stack:** TypeScript, ESLint 9 flat config, GitHub Actions, Node.js 20, Vitest

---

## File Structure

- Modify: `package.json` — add `lint` script and required lint devDependencies.
- Create: `eslint.config.js` — define a minimal flat ESLint config for Node.js TypeScript source and test files.
- Create: `.github/workflows/ci.yml` — run install, lint, test, typecheck, and build on push/PR.
- Create: `test/tooling/eslint-config.test.ts` — verify the lint script exists and the ESLint config covers `src/**/*.ts` and `test/**/*.ts`.
- Create: `test/tooling/ci-workflow.test.ts` — verify the CI workflow runs the intended commands in the expected order.
- Modify: `vitest.config.ts` — keep Vitest focused on `test/**/*.test.ts` and allow the new tooling tests to run without collecting `.worktrees/`.

## Scope Notes

This plan adds only repository-level quality gates. It does **not** add formatting, release automation, caching optimization beyond basic Action defaults, coverage upload, or pre-commit hooks yet.

### Task 1: Add ESLint configuration and lint script

**Files:**
- Modify: `package.json`
- Create: `eslint.config.js`
- Create: `test/tooling/eslint-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ESLint tooling', () => {
  it('defines a lint script and TypeScript-aware flat config', async () => {
    const root = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const eslintConfig = await readFile(path.join(root, 'eslint.config.js'), 'utf8');

    expect(packageJson.scripts?.lint).toBe('eslint .');
    expect(packageJson.devDependencies?.eslint).toBeDefined();
    expect(packageJson.devDependencies?.['@eslint/js']).toBeDefined();
    expect(packageJson.devDependencies?.typescript).toBeDefined();
    expect(packageJson.devDependencies?.['typescript-eslint']).toBeDefined();
    expect(eslintConfig).toContain("files: ['src/**/*.ts', 'test/**/*.ts']");
    expect(eslintConfig).toContain('tseslint.config');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki" && npx vitest run test/tooling/eslint-config.test.ts`
Expected: FAIL because `test/tooling/eslint-config.test.ts` and `eslint.config.js` do not exist yet and `package.json` has no `lint` script.

- [ ] **Step 3: Write minimal implementation**

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@eslint/js": "^9.10.0",
    "@types/node": "^24.3.0",
    "eslint": "^9.10.0",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.10.0",
    "vitest": "^3.2.4"
  }
}
```

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.worktrees/**', '.claude/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: false
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
);
```

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ESLint tooling', () => {
  it('defines a lint script and TypeScript-aware flat config', async () => {
    const root = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const eslintConfig = await readFile(path.join(root, 'eslint.config.js'), 'utf8');

    expect(packageJson.scripts?.lint).toBe('eslint .');
    expect(packageJson.devDependencies?.eslint).toBeDefined();
    expect(packageJson.devDependencies?.['@eslint/js']).toBeDefined();
    expect(packageJson.devDependencies?.typescript).toBeDefined();
    expect(packageJson.devDependencies?.['typescript-eslint']).toBeDefined();
    expect(eslintConfig).toContain("files: ['src/**/*.ts', 'test/**/*.ts']");
    expect(eslintConfig).toContain('tseslint.config');
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki" && npx vitest run test/tooling/eslint-config.test.ts`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki" add package.json eslint.config.js test/tooling/eslint-config.test.ts package-lock.json
git -C "/workspace/liiy-llm-wiki" commit -m "$(cat <<'EOF'
feat: add lint quality gate
EOF
)"
```

### Task 2: Add CI workflow for repository quality gates

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `test/tooling/ci-workflow.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CI workflow', () => {
  it('runs install, lint, test, typecheck, and build on push and pull requests', async () => {
    const root = path.resolve(__dirname, '../..');
    const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const vitestConfig = await readFile(path.join(root, 'vitest.config.ts'), 'utf8');

    expect(workflow).toContain('on:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('uses: actions/checkout@v4');
    expect(workflow).toContain('uses: actions/setup-node@v4');
    expect(workflow).toContain("node-version: '20'");
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm run test');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm run build');
    expect(vitestConfig).toContain("include: ['test/**/*.test.ts']");
    expect(vitestConfig).toContain("exclude: ['node_modules/**', 'dist/**', '.worktrees/**', '.claude/**']");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/workspace/liiy-llm-wiki" && npx vitest run test/tooling/ci-workflow.test.ts`
Expected: FAIL because `.github/workflows/ci.yml` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```yaml
name: CI

on:
  push:
    branches:
      - master
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run typecheck
      - run: npm run build
```

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.worktrees/**', '.claude/**']
  }
});
```

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CI workflow', () => {
  it('runs install, lint, test, typecheck, and build on push and pull requests', async () => {
    const root = path.resolve(__dirname, '../..');
    const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const vitestConfig = await readFile(path.join(root, 'vitest.config.ts'), 'utf8');

    expect(workflow).toContain('on:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('uses: actions/checkout@v4');
    expect(workflow).toContain('uses: actions/setup-node@v4');
    expect(workflow).toContain("node-version: '20'");
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm run test');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm run build');
    expect(vitestConfig).toContain("include: ['test/**/*.test.ts']");
    expect(vitestConfig).toContain("exclude: ['node_modules/**', 'dist/**', '.worktrees/**', '.claude/**']");
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki" && npx vitest run test/tooling/ci-workflow.test.ts`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki" add .github/workflows/ci.yml vitest.config.ts test/tooling/ci-workflow.test.ts
git -C "/workspace/liiy-llm-wiki" commit -m "$(cat <<'EOF'
feat: add CI workflow for quality gates
EOF
)"
```

### Task 3: Verify the new quality gates end-to-end

**Files:**
- Reuse: `package.json`
- Reuse: `eslint.config.js`
- Reuse: `.github/workflows/ci.yml`
- Reuse: `vitest.config.ts`

- [ ] **Step 1: Run the new lint command to verify it fails or passes correctly**

Run: `cd "/workspace/liiy-llm-wiki" && npm run lint`
Expected: Either PASS with `0 problems` or a concrete lint failure that must be fixed before continuing.

- [ ] **Step 2: Fix any lint failures with minimal code changes**

```ts
// Example minimal fix pattern if ESLint flags an unused import:
import { describe, expect, it } from 'vitest';
```

If the first run already passes, make no code changes in this step.

- [ ] **Step 3: Re-run lint to verify it passes**

Run: `cd "/workspace/liiy-llm-wiki" && npm run lint`
Expected: PASS with `0 problems`.

- [ ] **Step 4: Run the full local quality gate sequence**

Run: `cd "/workspace/liiy-llm-wiki" && npm run lint && npm run test && npm run typecheck && npm run build`
Expected: PASS with all commands succeeding.

- [ ] **Step 5: Commit**

```bash
git -C "/workspace/liiy-llm-wiki" add package.json package-lock.json eslint.config.js .github/workflows/ci.yml vitest.config.ts test/tooling/eslint-config.test.ts test/tooling/ci-workflow.test.ts
git -C "/workspace/liiy-llm-wiki" commit -m "$(cat <<'EOF'
feat: add repository quality gates
EOF
)"
```

## Self-Review

- **Spec coverage:** This plan does not extend product behavior; it closes repository-quality gaps by adding a real lint gate plus CI automation for lint, test, typecheck, and build. That directly supports the user’s request for pre-submit CI/CD and lint quality checks.
- **Placeholder scan:** No `TODO`, `TBD`, or vague “add tests later” language remains; each step contains explicit files, commands, and code.
- **Type consistency:** `RunIngestFlow*`, `RunLintFlow*`, and existing runtime/storage types are untouched. The new files introduce no cross-task naming ambiguity.
