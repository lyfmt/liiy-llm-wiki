import { describe, expect, it } from 'vitest';

import {
  bootstrapProject,
  buildProjectPaths,
  createChangeSet,
  createFinding,
  createKnowledgePage,
  createRequestRun,
  createSourceManifest
} from '../../src/index.js';
import type {
  ChangeSet,
  Finding,
  FindingType,
  KnowledgePage,
  KnowledgePageKind,
  RequestRun,
  RequestRunStatus,
  SourceManifest,
  SourceManifestStatus
} from '../../src/index.js';

describe('package entry domain exports', () => {
  it('re-exports the domain constructors and public types alongside existing bootstrap APIs', () => {
    const sourceStatus: SourceManifestStatus = 'inbox';
    const pageKind: KnowledgePageKind = 'topic';
    const runStatus: RequestRunStatus = 'running';
    const findingType: FindingType = 'gap';

    const sourceManifest: SourceManifest = {
      id: 'src-001',
      path: 'raw/inbox/example.md',
      title: 'Example Source',
      type: 'markdown',
      status: 'inbox',
      hash: 'sha256:abc123',
      imported_at: '2026-04-11T00:00:00.000Z',
      tags: [],
      notes: ''
    };

    const knowledgePage: KnowledgePage = {
      path: 'wiki/topics/llm-wiki.md',
      kind: 'topic',
      title: 'LLM Wiki',
      aliases: [],
      source_refs: [],
      outgoing_links: [],
      status: 'active',
      updated_at: '2026-04-11T00:00:00.000Z'
    };

    const requestRun: RequestRun = {
      run_id: 'run-001',
      user_request: 'ingest this source',
      intent: 'ingest',
      plan: [],
      status: 'running',
      evidence: [],
      touched_files: [],
      decisions: [],
      result_summary: ''
    };

    const changeSet: ChangeSet = {
      target_files: [],
      patch_summary: 'summary',
      rationale: 'reason',
      source_refs: [],
      risk_level: 'low',
      needs_review: false
    };

    const finding: Finding = {
      type: 'gap',
      severity: 'medium',
      evidence: [],
      suggested_action: 'add a missing page',
      resolution_status: 'open'
    };

    expect(typeof bootstrapProject).toBe('function');
    expect(typeof buildProjectPaths).toBe('function');
    expect(typeof createSourceManifest).toBe('function');
    expect(typeof createKnowledgePage).toBe('function');
    expect(typeof createRequestRun).toBe('function');
    expect(typeof createChangeSet).toBe('function');
    expect(typeof createFinding).toBe('function');
    expect(sourceStatus).toBe('inbox');
    expect(pageKind).toBe('topic');
    expect(runStatus).toBe('running');
    expect(findingType).toBe('gap');
    expect(sourceManifest.status).toBe('inbox');
    expect(knowledgePage.kind).toBe('topic');
    expect(requestRun.status).toBe('running');
    expect(changeSet.needs_review).toBe(false);
    expect(finding.type).toBe('gap');
  });
});
