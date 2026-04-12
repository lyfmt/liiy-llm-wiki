import { describe, expect, it } from 'vitest';

import { runLintFlow } from '../../../src/index.js';
import type { RunLintFlowInput, RunLintFlowResult } from '../../../src/index.js';

describe('package entry lint exports', () => {
  it('re-exports the lint API and public types', () => {
    expect(typeof runLintFlow).toBe('function');

    const input: RunLintFlowInput = {
      runId: 'run-101',
      userRequest: 'lint the wiki',
      autoFix: false
    };
    const result: RunLintFlowResult | null = null;

    expect(input.autoFix).toBe(false);
    expect(result).toBeNull();
  });
});
