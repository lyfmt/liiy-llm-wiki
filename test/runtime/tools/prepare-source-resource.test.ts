import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createPrepareSourceResourceTool } from '../../../src/runtime/tools/prepare-source-resource.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('createPrepareSourceResourceTool', () => {
  it('writes a structured source resource artifact from an accepted raw markdown source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-prepare-source-resource-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Design Patterns\n\nPatch-first systems keep durable notes.\n',
        'utf8'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Design Patterns',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design-patterns',
          imported_at: '2026-04-21T00:00:00.000Z'
        })
      );

      const resourceArtifactPath = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'resource.json');
      const tool = createPrepareSourceResourceTool(
        createRuntimeContext({
          root,
          runId: 'runtime-prepare-source-resource-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        manifestId: 'src-001',
        rawPath: 'raw/accepted/design.md',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json'
      });
      const parsed = JSON.parse(await readFile(resourceArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('prepared source resource src-001');
      expect(parsed.rawPath).toBe('raw/accepted/design.md');
      expect(parsed.structuredMarkdown).toContain('# Design Patterns');
      expect(parsed.sectionHints).toEqual([]);
      expect(parsed.topicHints).toEqual([]);
      expect(parsed.metadata).toEqual(
        expect.objectContaining({
          title: 'Design Patterns',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design-patterns',
          importedAt: '2026-04-21T00:00:00.000Z',
          preparedAt: expect.any(String)
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
