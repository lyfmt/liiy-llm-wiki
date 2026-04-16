import { readFile } from 'node:fs/promises';

import type { WikiIndexResponseDto } from '../dto/wiki-index.js';
import { buildProjectPaths } from '../../../config/project-paths.js';
import { listKnowledgePages } from '../../../storage/list-knowledge-pages.js';

export async function buildWikiIndexResponseDto(root: string): Promise<WikiIndexResponseDto> {
  const paths = buildProjectPaths(root);
  const [indexMarkdown, sources, entities, topics, queries] = await Promise.all([
    readOptionalText(paths.wikiIndex),
    listKnowledgePages(root, 'source'),
    listKnowledgePages(root, 'entity'),
    listKnowledgePages(root, 'topic'),
    listKnowledgePages(root, 'query')
  ]);

  return {
    index_markdown: indexMarkdown,
    sources,
    entities,
    topics,
    queries
  };
}

async function readOptionalText(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}
