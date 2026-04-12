import { describe, expect, it } from 'vitest';

import { listKnowledgePages, runQueryFlow } from '../../../src/index.js';
import type { RunQueryFlowResult } from '../../../src/index.js';

describe('package entry query exports', () => {
  it('re-exports the query flow and supporting page listing API', () => {
    expect(typeof listKnowledgePages).toBe('function');
    expect(typeof runQueryFlow).toBe('function');

    const result: RunQueryFlowResult | null = null;
    expect(result).toBeNull();
  });
});
