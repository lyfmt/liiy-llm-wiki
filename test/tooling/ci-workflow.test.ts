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
    expect(workflow).toContain('branches:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('uses: actions/checkout@v4');
    expect(workflow).toContain('uses: actions/setup-node@v4');
    expect(workflow).toContain("node-version: '20'");

    const installIndex = workflow.indexOf('npm ci');
    const lintIndex = workflow.indexOf('npm run lint');
    const testIndex = workflow.indexOf('npm run test');
    const typecheckIndex = workflow.indexOf('npm run typecheck');
    const buildIndex = workflow.indexOf('npm run build');

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(lintIndex).toBeGreaterThan(installIndex);
    expect(testIndex).toBeGreaterThan(lintIndex);
    expect(typecheckIndex).toBeGreaterThan(testIndex);
    expect(buildIndex).toBeGreaterThan(typecheckIndex);
    expect(vitestConfig).toContain("include: ['test/**/*.test.ts']");
    expect(vitestConfig).toContain("exclude: ['node_modules/**', 'dist/**', '.worktrees/**', '.claude/**']");
  });
});
