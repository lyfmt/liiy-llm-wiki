import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  loadProjectEnv,
  loadProjectEnvSync,
  parseProjectEnv,
  saveProjectEnv,
  upsertEnvAssignment,
  upsertProjectEnvValue
} from '../../src/storage/project-env-store.js';

describe('project-env-store', () => {
  it('loads an empty state when the project .env file is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-project-env-'));

    try {
      const state = await loadProjectEnv(root);

      expect(state.contents).toBe('');
      expect(state.values).toEqual({});
      expect(state.keys).toEqual([]);
      expect(state.path).toBe(path.join(root, '.env'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('saves and reloads project env contents', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-project-env-'));

    try {
      const filePath = await saveProjectEnv(root, 'RUNTIME_API_KEY=test-key\nBASE_URL=http://runtime.example.invalid/v1');
      const state = await loadProjectEnv(root);
      const syncState = loadProjectEnvSync(root);

      expect(filePath).toBe(path.join(root, '.env'));
      expect(state.contents).toBe('RUNTIME_API_KEY=test-key\nBASE_URL=http://runtime.example.invalid/v1\n');
      expect(state.values).toEqual({
        RUNTIME_API_KEY: 'test-key',
        BASE_URL: 'http://runtime.example.invalid/v1'
      });
      expect(syncState.values).toEqual(state.values);
      expect(await readFile(filePath, 'utf8')).toBe(state.contents);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('upserts env assignments and quotes values with spaces', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-project-env-'));

    try {
      await saveProjectEnv(root, 'RUNTIME_API_KEY=first\n');
      await upsertProjectEnvValue(root, 'RUNTIME_API_KEY', 'second');
      await upsertProjectEnvValue(root, 'MODEL_NOTES', 'gpt 5.4 ready');
      const state = await loadProjectEnv(root);

      expect(state.values).toEqual({
        RUNTIME_API_KEY: 'second',
        MODEL_NOTES: 'gpt 5.4 ready'
      });
      expect(state.contents).toContain('RUNTIME_API_KEY=second');
      expect(state.contents).toContain('MODEL_NOTES="gpt 5.4 ready"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('parses exported and quoted env lines', () => {
    expect(parseProjectEnv('export RUNTIME_API_KEY="quoted"\nPLAIN=value\n# comment\n')).toEqual({
      RUNTIME_API_KEY: 'quoted',
      PLAIN: 'value'
    });
  });

  it('updates env assignment text without duplicating keys', () => {
    const updated = upsertEnvAssignment('RUNTIME_API_KEY=first\n', 'RUNTIME_API_KEY', 'second');

    expect(updated).toBe('RUNTIME_API_KEY=second\n');
  });
});
