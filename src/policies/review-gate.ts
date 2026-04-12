import type { ChangeSet } from '../domain/change-set.js';

export interface ReviewGateSignals {
  rewritesCoreTopic?: boolean;
  deletesPage?: boolean;
  mergesOrSplitsEntity?: boolean;
  unresolvedConflict?: boolean;
}

export interface ReviewGateDecision {
  needs_review: boolean;
  reasons: string[];
}

export function evaluateReviewGate(
  changeSet: ChangeSet,
  signals: ReviewGateSignals = {}
): ReviewGateDecision {
  if (signals.rewritesCoreTopic) {
    return {
      needs_review: true,
      reasons: ['rewrites a core topic page']
    };
  }

  if (signals.deletesPage) {
    return {
      needs_review: true,
      reasons: ['deletes wiki content']
    };
  }

  if (signals.mergesOrSplitsEntity) {
    return {
      needs_review: true,
      reasons: ['merges or splits key entities']
    };
  }

  if (signals.unresolvedConflict) {
    return {
      needs_review: true,
      reasons: ['contains unresolved evidence conflict']
    };
  }

  if (changeSet.target_files.some((file) => file.startsWith('schema/'))) {
    return {
      needs_review: true,
      reasons: ['modifies schema rules']
    };
  }

  const distinctTopicTargets = new Set(
    changeSet.target_files.filter((file) => file.startsWith('wiki/topics/'))
  );

  if (distinctTopicTargets.size > 1) {
    return {
      needs_review: true,
      reasons: ['touches multiple topic pages']
    };
  }

  if (changeSet.needs_review) {
    return {
      needs_review: true,
      reasons: ['changeset explicitly marked for review']
    };
  }

  return {
    needs_review: false,
    reasons: []
  };
}
