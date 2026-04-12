import { createKnowledgePage, type KnowledgePageKind } from '../../domain/knowledge-page.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../storage/knowledge-page-store.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';

export interface RunQueryFlowInput {
  question: string;
  persistQueryPage: boolean;
}

export interface RunQueryFlowResult {
  answer: string;
  sources: string[];
  persistedQueryPage: string | null;
}

export async function runQueryFlow(root: string, input: RunQueryFlowInput): Promise<RunQueryFlowResult> {
  const slug = slugifyQuestion(input.question);

  if (input.persistQueryPage && slug === '') {
    throw new Error('Invalid query question: cannot derive query slug');
  }

  const candidates = await collectPages(root, ['topic', 'query']);
  const scored = scorePages(input.question, candidates);
  const best = scored[0];

  if (!best) {
    return {
      answer: 'No relevant wiki pages found.',
      sources: [],
      persistedQueryPage: null
    };
  }

  const answer = extractAnswer(best.body);
  const sources = [best.page.path];
  let persistedQueryPage: string | null = null;

  if (input.persistQueryPage) {
    const title = titleizeQuestion(input.question);
    const queryPath = `wiki/queries/${slug}.md`;

    await saveKnowledgePage(
      root,
      createKnowledgePage({
        path: queryPath,
        kind: 'query',
        title,
        source_refs: best.page.source_refs,
        outgoing_links: sources,
        status: 'active',
        updated_at: new Date().toISOString()
      }),
      `# ${title}\n\n${answer}\n`
    );

    persistedQueryPage = queryPath;
  }

  return {
    answer,
    sources,
    persistedQueryPage
  };
}

async function collectPages(root: string, kinds: KnowledgePageKind[]) {
  const pages = [] as Array<Awaited<ReturnType<typeof loadKnowledgePage>>>;

  for (const kind of kinds) {
    for (const slug of await listKnowledgePages(root, kind)) {
      pages.push(await loadKnowledgePage(root, kind, slug));
    }
  }

  return pages;
}

function scorePages(question: string, pages: Array<Awaited<ReturnType<typeof loadKnowledgePage>>>) {
  const tokens = tokenize(question);

  return pages
    .map((page) => ({
      ...page,
      score: tokens.filter((token) => tokenize(`${page.page.title} ${page.body}`).includes(token)).length
    }))
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path));
}

function extractAnswer(body: string): string {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .join(' ')
    .trim();
}

function slugifyQuestion(question: string): string {
  return tokenize(question).join('-');
}

function titleizeQuestion(question: string): string {
  return question
    .trim()
    .replace(/\?+$/, '')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
