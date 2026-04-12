import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';
import { createRequestRun } from '../../src/domain/request-run.js';
import { buildRequestRunArtifactPaths } from '../../src/storage/request-run-artifact-paths.js';
import {
  loadRequestRunState,
  saveRequestRunState
} from '../../src/storage/request-run-state-store.js';

const missingArtifacts = [
  'request.json',
  'plan.json',
  'evidence.json',
  'draft.md',
  'changeset.json',
  'result.md',
  'checkpoint.json'
] as const;

const malformedJsonArtifacts = [
  'request.json',
  'plan.json',
  'evidence.json',
  'changeset.json',
  'checkpoint.json'
] as const;

const semanticallyInvalidArtifacts = [
  {
    fileName: 'request.json',
    content: '{\n  "user_request": "ingest this source",\n  "intent": "ingest"\n}\n',
    expectedMessage: 'Invalid request run state: invalid request.json'
  },
  {
    fileName: 'request.json',
    content: '{\n  "run_id": "run-999",\n  "user_request": "ingest this source",\n  "intent": "ingest"\n}\n',
    expectedMessage: 'Invalid request run state: invalid request.json'
  },
  {
    fileName: 'plan.json',
    content: '"read raw source"\n',
    expectedMessage: 'Invalid request run state: invalid plan.json'
  },
  {
    fileName: 'checkpoint.json',
    content:
      '{\n  "status": "unknown",\n  "touched_files": [],\n  "decisions": [],\n  "result_summary": ""\n}\n',
    expectedMessage: 'Invalid request run state: invalid checkpoint.json'
  },
  {
    fileName: 'changeset.json',
    content: '{\n  "patch_summary": "missing target files"\n}\n',
    expectedMessage: 'Invalid request run state: invalid changeset.json'
  }
] as const;

describe('saveRequestRunState', () => {
  it('writes the selected request-run artifact bundle and checkpoint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      const requestRun = createRequestRun({
        run_id: 'run-001',
        user_request: 'ingest this source',
        intent: 'ingest',
        plan: ['read raw source', 'update wiki'],
        status: 'needs_review',
        evidence: ['raw/accepted/source.md'],
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['queue review gate'],
        result_summary: 'awaiting review'
      });
      const changeSet = createChangeSet({
        target_files: ['wiki/topics/llm-wiki.md'],
        patch_summary: 'add a synthesis paragraph',
        rationale: 'new source clarifies the storage boundary',
        source_refs: ['raw/accepted/source.md'],
        risk_level: 'medium',
        needs_review: true
      });

      const paths = await saveRequestRunState(root, {
        request_run: requestRun,
        draft_markdown: '# Draft\n\nInterim draft content.\n',
        result_markdown: '# Result\n\nFinal result content.\n',
        changeset: changeSet
      });

      expect(JSON.parse(await readFile(paths.request, 'utf8'))).toEqual({
        run_id: 'run-001',
        user_request: 'ingest this source',
        intent: 'ingest'
      });
      expect(JSON.parse(await readFile(paths.plan, 'utf8'))).toEqual(['read raw source', 'update wiki']);
      expect(JSON.parse(await readFile(paths.evidence, 'utf8'))).toEqual(['raw/accepted/source.md']);
      expect(await readFile(paths.draft, 'utf8')).toBe('# Draft\n\nInterim draft content.\n');
      expect(JSON.parse(await readFile(paths.changeset, 'utf8'))).toEqual({
        target_files: ['wiki/topics/llm-wiki.md'],
        patch_summary: 'add a synthesis paragraph',
        rationale: 'new source clarifies the storage boundary',
        source_refs: ['raw/accepted/source.md'],
        risk_level: 'medium',
        needs_review: true
      });
      expect(await readFile(paths.result, 'utf8')).toBe('# Result\n\nFinal result content.\n');
      expect(JSON.parse(await readFile(paths.checkpoint, 'utf8'))).toEqual({
        status: 'needs_review',
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['queue review gate'],
        result_summary: 'awaiting review'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('overwrites the artifact bundle when the same run is saved again', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        draft_markdown: '# Draft\n\nFirst draft.\n',
        result_markdown: '# Result\n\nFirst result.\n',
        changeset: null
      });

      const paths = await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source', 'update wiki'],
          status: 'done',
          evidence: ['raw/accepted/source.md'],
          touched_files: ['wiki/topics/llm-wiki.md'],
          decisions: ['apply low-risk patch'],
          result_summary: 'ingest complete'
        }),
        draft_markdown: '# Draft\n\nUpdated draft.\n',
        result_markdown: '# Result\n\nUpdated result.\n',
        changeset: null
      });

      expect(JSON.parse(await readFile(paths.plan, 'utf8'))).toEqual(['read raw source', 'update wiki']);
      expect(JSON.parse(await readFile(paths.evidence, 'utf8'))).toEqual(['raw/accepted/source.md']);
      expect(await readFile(paths.result, 'utf8')).toBe('# Result\n\nUpdated result.\n');
      expect(JSON.parse(await readFile(paths.checkpoint, 'utf8'))).toEqual({
        status: 'done',
        touched_files: ['wiki/topics/llm-wiki.md'],
        decisions: ['apply low-risk patch'],
        result_summary: 'ingest complete'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('request run state storage', () => {
  it('loads a saved request-run bundle back into domain objects', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'answer this question',
          intent: 'query',
          plan: ['read wiki', 'draft answer'],
          status: 'done',
          evidence: ['wiki/topics/llm-wiki.md'],
          touched_files: ['wiki/queries/storage.md'],
          decisions: ['write reusable query page'],
          result_summary: 'saved answer'
        }),
        draft_markdown: '# Draft\n\nDraft answer.\n',
        result_markdown: '# Result\n\nFinal answer.\n',
        changeset: createChangeSet({
          target_files: ['wiki/queries/storage.md'],
          patch_summary: 'add a reusable answer page',
          rationale: 'query produced long-term value',
          source_refs: ['wiki/topics/llm-wiki.md'],
          risk_level: 'low'
        })
      });

      const loaded = await loadRequestRunState(root, 'run-001');

      expect(loaded).toEqual({
        request_run: {
          run_id: 'run-001',
          user_request: 'answer this question',
          intent: 'query',
          plan: ['read wiki', 'draft answer'],
          status: 'done',
          evidence: ['wiki/topics/llm-wiki.md'],
          touched_files: ['wiki/queries/storage.md'],
          decisions: ['write reusable query page'],
          result_summary: 'saved answer'
        },
        draft_markdown: '# Draft\n\nDraft answer.\n',
        result_markdown: '# Result\n\nFinal answer.\n',
        changeset: {
          target_files: ['wiki/queries/storage.md'],
          patch_summary: 'add a reusable answer page',
          rationale: 'query produced long-term value',
          source_refs: ['wiki/topics/llm-wiki.md'],
          risk_level: 'low',
          needs_review: false
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(missingArtifacts)('rejects a missing required artifact: %s', async (fileName) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        draft_markdown: '# Draft\n\nDraft content.\n',
        result_markdown: '# Result\n\nResult content.\n',
        changeset: null
      });

      const paths = buildRequestRunArtifactPaths(root, 'run-001');
      await unlink(path.join(paths.runDirectory, fileName));

      await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(
        `Incomplete request run state: missing ${fileName}`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(malformedJsonArtifacts)('rejects malformed JSON in %s', async (fileName) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

    try {
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-001',
          user_request: 'ingest this source',
          intent: 'ingest',
          plan: ['read raw source'],
          status: 'running'
        }),
        draft_markdown: '# Draft\n\nDraft content.\n',
        result_markdown: '# Result\n\nResult content.\n',
        changeset: null
      });

      const paths = buildRequestRunArtifactPaths(root, 'run-001');
      await writeFile(path.join(paths.runDirectory, fileName), '{', 'utf8');

      await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(
        `Invalid request run state: malformed ${fileName}`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(semanticallyInvalidArtifacts)(
    'rejects schema-invalid artifact content in $fileName',
    async ({ fileName, content, expectedMessage }) => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));

      try {
        await saveRequestRunState(root, {
          request_run: createRequestRun({
            run_id: 'run-001',
            user_request: 'ingest this source',
            intent: 'ingest',
            plan: ['read raw source'],
            status: 'running'
          }),
          draft_markdown: '# Draft\n\nDraft content.\n',
          result_markdown: '# Result\n\nResult content.\n',
          changeset: null
        });

        const paths = buildRequestRunArtifactPaths(root, 'run-001');
        await writeFile(path.join(paths.runDirectory, fileName), content, 'utf8');

        await expect(loadRequestRunState(root, 'run-001')).rejects.toThrow(expectedMessage);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );
});
