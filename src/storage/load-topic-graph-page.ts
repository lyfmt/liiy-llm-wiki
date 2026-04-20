import { createKnowledgePage } from '../domain/knowledge-page.js';
import type { GraphNode } from '../domain/graph-node.js';

import type { GraphDatabaseClient } from './graph-database.js';
import { createGraphDatabasePool, resolveGraphDatabaseUrl } from './graph-database.js';
import { buildGraphProjection, type GraphProjection } from './graph-projection-store.js';
import { loadKnowledgePage, type LoadedKnowledgePage } from './knowledge-page-store.js';
import { loadTopicGraphProjectionInput } from './load-topic-graph-projection.js';
import { loadProjectEnv } from './project-env-store.js';

const graphClientsByDatabaseUrl = new Map<string, GraphDatabaseClient>();

export type LoadedTopicGraphPage = LoadedKnowledgePage & { projection: GraphProjection };

export async function loadTopicGraphPage(root: string, slug: string): Promise<LoadedTopicGraphPage | null> {
  const client = await getGraphClient(root);
  const graphInput = await loadTopicGraphProjectionInput(client, slug);

  if (!graphInput) {
    return null;
  }

  const projection = buildGraphProjection(graphInput);

  try {
    const loaded = await loadKnowledgePage(root, 'topic', slug);

    return {
      ...loaded,
      projection
    };
  } catch (error) {
    if (!isEnoentError(error)) {
      throw error;
    }
  }

  return {
    ...synthesizeTopicGraphPage(slug, projection, collectGraphOutgoingLinks(graphInput.nodes)),
    projection
  };
}

function synthesizeTopicGraphPage(
  slug: string,
  projection: GraphProjection,
  outgoingLinks: string[]
): LoadedKnowledgePage {
  const root = projection.root;

  return {
    page: createKnowledgePage({
      path: `wiki/topics/${slug}.md`,
      kind: 'topic',
      title: root.title,
      aliases: root.aliases,
      summary: root.summary,
      tags: [],
      source_refs: collectSourceRefs(projection),
      outgoing_links: outgoingLinks,
      status: root.status,
      updated_at: root.updated_at
    }),
    body: renderTopicGraphBody(projection)
  };
}

function collectGraphOutgoingLinks(nodes: GraphNode[]): string[] {
  return [...new Set(
    nodes
      .filter((node) => node.kind === 'source')
      .map((node) => node.id)
      .filter((id) => id.startsWith('source:'))
      .map((id) => `wiki/sources/${id.slice('source:'.length)}.md`)
  )].sort((left, right) => left.localeCompare(right));
}

function collectSourceRefs(projection: GraphProjection): string[] {
  const uniquePaths = new Set<string>();

  for (const entry of projection.evidence) {
    const sourcePath = extractSourcePath(entry.source);

    if (sourcePath) {
      uniquePaths.add(sourcePath);
    }
  }

  for (const section of projection.sections) {
    for (const sourcePath of section.grounding.source_paths) {
      uniquePaths.add(sourcePath);
    }
  }

  return [...uniquePaths];
}

function renderTopicGraphBody(projection: GraphProjection): string {
  const blocks: string[] = [`# ${projection.root.title}`];
  const summary = projection.root.summary.trim();

  if (summary !== '') {
    blocks.push(summary);
  }

  if (projection.sections.length > 0) {
    blocks.push(
      '## Sections',
      ...projection.sections.map((section) => describeSection(section))
    );
  }

  if (projection.entities.length > 0) {
    blocks.push(
      '## Entities',
      ...projection.entities.map((node) => `- ${node.title}${formatSummarySuffix(node.summary)}`)
    );
  }

  if (projection.assertions.length > 0) {
    blocks.push('## Assertions');

    for (const assertion of projection.assertions) {
      blocks.push(`### ${assertion.node.title}`);

      const statement = toAssertionStatement(assertion.node);

      if (statement !== '') {
        blocks.push(statement);
      }

      if (assertion.evidence.length > 0) {
        blocks.push(...assertion.evidence.map((entry) => `- Evidence: ${describeEvidence(entry)}`));
      }
    }
  }

  return `${blocks.join('\n\n')}\n`;
}

function formatSummarySuffix(summary: string): string {
  const trimmed = summary.trim();
  return trimmed === '' ? '' : `: ${trimmed}`;
}

function describeSection(section: GraphProjection['sections'][number]): string {
  const parts = [`- ${section.node.title}${formatSummarySuffix(section.node.summary)}`];

  if (section.grounding.source_paths.length > 0) {
    parts.push(`Grounding: ${section.grounding.source_paths.join(', ')}`);
  }

  if (section.grounding.locators.length > 0) {
    parts.push(`Locators: ${section.grounding.locators.join(', ')}`);
  }

  if (section.grounding.anchor_count > 0) {
    parts.push(`Anchors: ${section.grounding.anchor_count}`);
  }

  return parts.join('. ');
}

function describeEvidence(entry: GraphProjection['evidence'][number]): string {
  const parts = [ensureSentence(entry.node.title)];

  if (entry.node.summary.trim() !== '') {
    parts.push(ensureSentence(entry.node.summary));
  }

  const sourcePath = extractSourcePath(entry.source);

  if (sourcePath) {
    parts.push(ensureSentence(`Source: ${sourcePath}`));
  } else if (entry.source?.title.trim()) {
    parts.push(ensureSentence(`Source: ${entry.source.title.trim()}`));
  }

  return parts.join(' ');
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();

  if (trimmed === '') {
    return '';
  }

  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function extractSourcePath(source: GraphProjection['evidence'][number]['source']): string | null {
  const path = typeof source?.attributes.path === 'string' ? source.attributes.path.trim() : '';
  return path === '' ? null : path;
}

function toAssertionStatement(node: GraphProjection['assertions'][number]['node']): string {
  const statement = typeof node.attributes.statement === 'string' ? node.attributes.statement.trim() : '';

  if (statement !== '') {
    return statement;
  }

  if (node.summary.trim() !== '') {
    return node.summary.trim();
  }

  return node.title.trim();
}

function isEnoentError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function getGraphClient(root: string): Promise<GraphDatabaseClient> {
  const projectEnv = await loadProjectEnv(root);
  const databaseUrl = resolveGraphDatabaseUrl(projectEnv.contents);
  const cachedClient = graphClientsByDatabaseUrl.get(databaseUrl);

  if (cachedClient) {
    return cachedClient;
  }

  const client = createGraphDatabasePool(databaseUrl);
  graphClientsByDatabaseUrl.set(databaseUrl, client);

  return client;
}
