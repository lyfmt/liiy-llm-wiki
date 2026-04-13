import { describe, expect, it } from 'vitest';

import { createRuntimeContext } from '../../src/runtime/runtime-context.js';

describe('createRuntimeContext', () => {
  it('allocates nested tool run ids deterministically per tool name', () => {
    const runtimeContext = createRuntimeContext({
      root: '/tmp/llm-wiki-liiy',
      runId: 'runtime-parent-001'
    });

    expect(runtimeContext.allocateToolRunId('query')).toBe('runtime-parent-001--query-1');
    expect(runtimeContext.allocateToolRunId('query')).toBe('runtime-parent-001--query-2');
    expect(runtimeContext.allocateToolRunId('lint')).toBe('runtime-parent-001--lint-1');
  });

  it('disables query writeback and lint auto-fix by default', () => {
    const runtimeContext = createRuntimeContext({
      root: '/tmp/llm-wiki-liiy',
      runId: 'runtime-parent-002'
    });

    expect(runtimeContext.allowQueryWriteback).toBe(false);
    expect(runtimeContext.allowLintAutoFix).toBe(false);
  });
});
