import { describe, expect, it } from 'vitest';

import { buildIntentPlan, classifyIntent } from '../../src/runtime/intent-classifier.js';

describe('classifyIntent', () => {
  it('detects ingest requests', () => {
    expect(classifyIntent('ingest raw/accepted/design.md into the wiki')).toBe('ingest');
  });

  it('detects query requests by question form', () => {
    expect(classifyIntent('what is patch first?')).toBe('query');
  });

  it('detects lint requests', () => {
    expect(classifyIntent('lint the wiki for missing links')).toBe('lint');
  });

  it('detects mixed requests when multiple intents are present', () => {
    expect(classifyIntent('ingest raw/accepted/design.md and then lint the wiki')).toBe('mixed');
  });

  it('defaults to query for empty requests', () => {
    expect(classifyIntent('   ')).toBe('query');
  });
});

describe('buildIntentPlan', () => {
  it('returns a stable three-step plan for each intent', () => {
    expect(buildIntentPlan('ingest')).toHaveLength(3);
    expect(buildIntentPlan('query')).toHaveLength(3);
    expect(buildIntentPlan('lint')).toHaveLength(3);
    expect(buildIntentPlan('mixed')).toHaveLength(3);
  });
});
