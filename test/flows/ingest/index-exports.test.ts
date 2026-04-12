import { describe, expect, it } from 'vitest';

import { readRawDocument, runIngestFlow } from '../../../src/index.js';
import type { RunIngestFlowInput, RunIngestFlowResult } from '../../../src/index.js';

describe('package entry ingest exports', () => {
  it('re-exports the ingest APIs and public types', () => {
    expect(typeof readRawDocument).toBe('function');
    expect(typeof runIngestFlow).toBe('function');

    const input: RunIngestFlowInput = {
      runId: 'run-001',
      userRequest: 'ingest raw/accepted/design.md',
      sourceId: 'src-001'
    };
    const result: RunIngestFlowResult | null = null;

    expect(input.sourceId).toBe('src-001');
    expect(result).toBeNull();
  });
});
