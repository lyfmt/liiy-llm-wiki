import path from 'node:path';

import type { KnowledgePageKind } from '../domain/knowledge-page.js';
import { buildProjectPaths } from '../config/project-paths.js';

export function buildKnowledgePagePath(root: string, kind: KnowledgePageKind, slug: string): string {
  assertValidPageSlug(slug);

  const paths = buildProjectPaths(root);
  const directory =
    kind === 'source'
      ? paths.wikiSources
      : kind === 'entity'
        ? paths.wikiEntities
        : kind === 'taxonomy'
          ? paths.wikiTaxonomy
        : kind === 'topic'
          ? paths.wikiTopics
          : paths.wikiQueries;

  return path.join(directory, `${slug}.md`);
}

function assertValidPageSlug(slug: string): void {
  if (
    slug.length === 0 ||
    slug === '.' ||
    slug === '..' ||
    slug !== path.basename(slug) ||
    slug.includes('/') ||
    slug.includes('\\')
  ) {
    throw new Error(`Invalid page slug: ${slug}`);
  }
}
