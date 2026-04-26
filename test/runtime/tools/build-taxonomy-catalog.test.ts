import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createBuildTaxonomyCatalogTool } from '../../../src/runtime/tools/build-taxonomy-catalog.js';

describe('createBuildTaxonomyCatalogTool', () => {
  it('reads explicit taxonomy metadata and ignores taxonomy links used only for navigation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-build-taxonomy-catalog-'));

    try {
      await mkdir(path.join(root, 'wiki', 'taxonomy'), { recursive: true });
      await writeFile(
        path.join(root, 'wiki', 'taxonomy', 'engineering.md'),
        `---
kind: "taxonomy"
title: "Engineering"
aliases:
  - "Platform Engineering"
summary: "Top-level taxonomy"
tags:
  - "taxonomy"
source_refs:
  - "raw/accepted/taxonomy.md"
outgoing_links: []
status: "active"
updated_at: "2026-04-23T00:00:00.000Z"
taxonomy_root: true
---
# Engineering

Top-level taxonomy.
`,
        'utf8'
      );
      await writeFile(
        path.join(root, 'wiki', 'taxonomy', 'platform.md'),
        `---
kind: "taxonomy"
title: "Platform"
aliases:
  - "Platform Runtime"
summary: "Platform taxonomy"
tags:
  - "taxonomy"
source_refs:
  - "raw/accepted/taxonomy.md"
outgoing_links:
  - "wiki/taxonomy/engineering.md"
status: "active"
updated_at: "2026-04-23T00:00:00.000Z"
taxonomy_parent: "engineering"
taxonomy_root: "engineering"
---
# Platform

Platform taxonomy.
`,
        'utf8'
      );
      await writeFile(
        path.join(root, 'wiki', 'taxonomy', 'delivery.md'),
        `---
kind: "taxonomy"
title: "Delivery"
aliases: []
summary: "Delivery taxonomy"
tags:
  - "taxonomy"
source_refs:
  - "raw/accepted/taxonomy.md"
outgoing_links:
  - "wiki/taxonomy/engineering.md"
status: "active"
updated_at: "2026-04-23T00:00:00.000Z"
---
# Delivery

Delivery taxonomy.
`,
        'utf8'
      );

      const tool = createBuildTaxonomyCatalogTool(
        createRuntimeContext({
          root,
          runId: 'runtime-build-taxonomy-catalog-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-catalog.json'
      });
      const parsed = JSON.parse(
        await readFile(
          path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'taxonomy-catalog.json'),
          'utf8'
        )
      );

      expect(result.details.summary).toBe('built taxonomy catalog for 3 taxonomy pages');
      expect(parsed.taxonomy[0]).toEqual(
        expect.objectContaining({
          taxonomySlug: 'delivery',
          title: 'Delivery',
          aliases: [],
          summary: 'Delivery taxonomy',
          parentTaxonomySlug: null,
          rootTaxonomySlug: 'delivery',
          isRoot: true
        })
      );
      expect(parsed.taxonomy[1]).toEqual(
        expect.objectContaining({
          taxonomySlug: 'engineering',
          title: 'Engineering',
          aliases: ['Platform Engineering'],
          summary: 'Top-level taxonomy',
          parentTaxonomySlug: null,
          rootTaxonomySlug: 'engineering',
          isRoot: true
        })
      );
      expect(parsed.taxonomy[2]).toEqual(
        expect.objectContaining({
          taxonomySlug: 'platform',
          parentTaxonomySlug: 'engineering',
          rootTaxonomySlug: 'engineering',
          isRoot: false
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
