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
    expect(packageJson.scripts?.['test:live-llm-wiki-liiy']).toBe('vitest run test/runtime/live-llm-wiki-liiy.test.ts');
    expect(packageJson.devDependencies?.eslint).toBeDefined();
    expect(packageJson.devDependencies?.['@eslint/js']).toBeDefined();
    expect(packageJson.devDependencies?.typescript).toBeDefined();
    expect(packageJson.devDependencies?.['typescript-eslint']).toBeDefined();
    expect(eslintConfig).toContain("files: ['src/**/*.ts', 'test/**/*.ts']");
    expect(eslintConfig).toContain('tseslint.config');
  });
});
