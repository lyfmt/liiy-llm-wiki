import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';
import { evaluateReviewGate } from '../../src/policies/review-gate.js';

describe('evaluateReviewGate', () => {
  it('does not require review for a single low-risk topic patch', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'refresh one summary paragraph',
      rationale: 'accepted source confirms the current wording',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'low'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: false,
      reasons: []
    });
  });

  it('requires review for schema changes', () => {
    const changeSet = createChangeSet({
      target_files: ['schema/review-gates.md'],
      patch_summary: 'tighten policy wording',
      rationale: 'align schema with review policy',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'medium'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: true,
      reasons: ['modifies schema rules']
    });
  });

  it('requires review when a changeset spans multiple topic pages', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md', 'wiki/topics/llm-wiki.md'],
      patch_summary: 'realign two topic pages',
      rationale: 'shared judgment changed across topics',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'medium'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: true,
      reasons: ['touches multiple topic pages']
    });
  });

  it('does not require review when duplicate topic paths refer to the same page', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md', 'wiki/topics/patch-first.md'],
      patch_summary: 'deduplicated patch target list',
      rationale: 'the same topic path was added twice upstream',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'low'
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: false,
      reasons: []
    });
  });

  it('requires review for a core topic rewrite', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'rewrite core topic page',
      rationale: 'the current summary would be replaced wholesale',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high'
    });

    expect(evaluateReviewGate(changeSet, { rewritesCoreTopic: true })).toEqual({
      needs_review: true,
      reasons: ['rewrites a core topic page']
    });
  });

  it('requires review for page deletion', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'delete obsolete topic page',
      rationale: 'page no longer belongs in the wiki',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high'
    });

    expect(evaluateReviewGate(changeSet, { deletesPage: true })).toEqual({
      needs_review: true,
      reasons: ['deletes wiki content']
    });
  });

  it('requires review for key-entity merge or split', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/entities/alpha.md', 'wiki/entities/beta.md'],
      patch_summary: 'merge duplicate entity pages',
      rationale: 'both pages represent the same system',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high'
    });

    expect(evaluateReviewGate(changeSet, { mergesOrSplitsEntity: true })).toEqual({
      needs_review: true,
      reasons: ['merges or splits key entities']
    });
  });

  it('requires review for unresolved evidence conflict', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'capture conflicting evidence',
      rationale: 'sources disagree on the current conclusion',
      source_refs: ['raw/accepted/a.md', 'raw/accepted/b.md'],
      risk_level: 'high'
    });

    expect(evaluateReviewGate(changeSet, { unresolvedConflict: true })).toEqual({
      needs_review: true,
      reasons: ['contains unresolved evidence conflict']
    });
  });

  it('requires review when explicitly marked', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/patch-first.md'],
      patch_summary: 'rewrite core topic page',
      rationale: 'manual escalation requested by flow logic',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high',
      needs_review: true
    });

    expect(evaluateReviewGate(changeSet)).toEqual({
      needs_review: true,
      reasons: ['changeset explicitly marked for review']
    });
  });
});
