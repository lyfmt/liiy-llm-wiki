import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('git hook tooling', () => {
  it('defines install scripts and tracked hook files for commit-time quality gates', async () => {
    const root = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const preCommit = await readFile(path.join(root, '.githooks', 'pre-commit'), 'utf8');
    const prePush = await readFile(path.join(root, '.githooks', 'pre-push'), 'utf8');
    const installer = await readFile(path.join(root, 'scripts', 'install-git-hooks.mjs'), 'utf8');

    expect(packageJson.scripts?.['install-hooks']).toBe('node scripts/install-git-hooks.mjs');
    expect(packageJson.scripts?.prepare).toBe('npm run install-hooks');
    expect(preCommit).toContain('npm run lint');
    expect(prePush).toContain('npm run test && npm run typecheck && npm run build');
    expect(installer).toContain("'git'");
    expect(installer).toContain("'rev-parse'");
    expect(installer).toContain("'--git-path'");
    expect(installer).toContain("'hooks'");
  });
});
