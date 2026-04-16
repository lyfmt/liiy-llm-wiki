import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProjectPaths } from '../../config/project-paths.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';

export async function rewriteWikiIndex(root: string): Promise<boolean> {
  const paths = buildProjectPaths(root);
  const sources = await listKnowledgePages(root, 'source');
  const entities = await listKnowledgePages(root, 'entity');
  const topics = await listKnowledgePages(root, 'topic');
  const queries = await listKnowledgePages(root, 'query');
  const content = `# Wiki Index\n\n## Sources\n${renderSection('sources', sources)}\n## Entities\n${renderSection('entities', entities)}\n## Topics\n${renderSection('topics', topics)}\n## Queries\n${renderSection('queries', queries)}`;

  await mkdir(path.dirname(paths.wikiIndex), { recursive: true });

  try {
    if ((await readFile(paths.wikiIndex, 'utf8')) === content) {
      return false;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await writeFile(paths.wikiIndex, content, 'utf8');
  return true;
}

export async function appendWikiLog(root: string, entry: string): Promise<boolean> {
  const paths = buildProjectPaths(root);

  await mkdir(path.dirname(paths.wikiLog), { recursive: true });

  let current = '';

  try {
    current = await readFile(paths.wikiLog, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (current.endsWith(entry)) {
    return false;
  }

  await writeFile(paths.wikiLog, `${current}${entry}`, 'utf8');
  return true;
}

function renderSection(directory: string, slugs: string[]): string {
  if (slugs.length === 0) {
    return '- _None_\n';
  }

  return `${slugs.map((slug) => `- [${slug}](${directory}/${slug}.md)`).join('\n')}\n`;
}
