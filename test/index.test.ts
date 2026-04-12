import { describe, expect, test } from 'vitest';

import { bootstrapProject, buildProjectPaths } from '../src/index.js';

describe('src/index', () => {
  test('re-exports the bootstrap and path builder APIs', () => {
    expect(typeof bootstrapProject).toBe('function');
    expect(buildProjectPaths('/tmp/llm-wiki-liiy').wiki).toBe('/tmp/llm-wiki-liiy/wiki');
  });
});
