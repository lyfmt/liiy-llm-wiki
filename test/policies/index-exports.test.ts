import { describe, expect, it } from 'vitest';

import { evaluateReviewGate } from '../../src/index.js';
import type { ReviewGateDecision, ReviewGateSignals } from '../../src/index.js';

describe('package entry review-gate exports', () => {
  it('re-exports the review-gate API and public types', () => {
    expect(typeof evaluateReviewGate).toBe('function');

    const decision: ReviewGateDecision = {
      needs_review: false,
      reasons: []
    };
    const signals: ReviewGateSignals = {
      deletesPage: false
    };

    expect(decision.reasons).toEqual([]);
    expect(signals.deletesPage).toBe(false);
  });
});
