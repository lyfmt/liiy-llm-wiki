import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('docker files', () => {
  it('provides Docker build and compose assets for the operator console', async () => {
    const root = path.resolve(__dirname, '../..');
    const dockerfilePath = path.join(root, 'Dockerfile');
    const dockerignorePath = path.join(root, '.dockerignore');
    const composePath = path.join(root, 'docker-compose.yml');
    const gitignorePath = path.join(root, '.gitignore');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    const dockerignore = await readFile(dockerignorePath, 'utf8');
    const compose = await readFile(composePath, 'utf8');
    const gitignore = await readFile(gitignorePath, 'utf8');

    await expect(access(dockerfilePath)).resolves.toBeUndefined();
    await expect(access(dockerignorePath)).resolves.toBeUndefined();
    await expect(access(composePath)).resolves.toBeUndefined();
    expect(dockerfile).toContain('FROM node:20-bookworm-slim AS build');
    expect(dockerfile).toContain('RUN npm ci --ignore-scripts');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts');
    expect(dockerfile).toContain('RUN npm run build');
    expect(dockerfile).toContain('EXPOSE 3000');
    expect(dockerfile).toContain('dist/cli.js');
    expect(dockerfile).toContain('/data/project');
    expect(dockerignore).toContain('node_modules');
    expect(dockerignore).toContain('dist');
    expect(dockerignore).toContain('.git');
    expect(dockerignore).toContain('.llm-wiki-liiy');
    expect(compose).toContain('name: llm-wiki-liiy');
    expect(compose).toContain('services:');
    expect(compose).toContain('llm-wiki-liiy:');
    expect(compose).toContain('postgres:');
    expect(compose).toContain('POSTGRES_DB: llm_wiki_liiy');
    expect(compose).toContain('POSTGRES_PASSWORD: postgres');
    expect(compose).toContain('GRAPH_DATABASE_URL=postgres://postgres:postgres@postgres:5432/llm_wiki_liiy');
    expect(compose).toContain('- "5432:5432"');
    expect(compose).toContain('command: ["node", "dist/cli.js", "serve", "/data/project", "3000"]');
    expect(compose).toContain('- "3000:3000"');
    expect(compose).toContain('- ./.llm-wiki-liiy:/data/project');
    expect(compose).toContain('restart: unless-stopped');
    expect(compose).toContain('healthcheck:');
    expect(compose).toContain("fetch('http://127.0.0.1:3000/health')");
    expect(gitignore).toContain('.llm-wiki-liiy/');
  });
});
