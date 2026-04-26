import { readdir } from 'node:fs/promises';

import type { KnowledgePageKind } from '../domain/knowledge-page.js';
import { buildProjectPaths } from '../config/project-paths.js';

export async function listKnowledgePages(root: string, kind: KnowledgePageKind): Promise<string[]> {
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

  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}
