import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { parseDocument } from 'yaml';

import { buildProjectPaths } from '../../config/project-paths.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';
import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { RuntimeContext } from '../runtime-context.js';

const parameters = Type.Object({
  outputArtifact: Type.String({ description: 'Artifact path for taxonomy catalog JSON.' })
});

export type BuildTaxonomyCatalogParameters = Static<typeof parameters>;

export interface BuiltTaxonomyCatalogEntry {
  taxonomySlug: string;
  title: string;
  aliases: string[];
  summary: string;
  parentTaxonomySlug: string | null;
  rootTaxonomySlug: string;
  isRoot: boolean;
}

export interface TaxonomyCatalogArtifact {
  taxonomy: BuiltTaxonomyCatalogEntry[];
}

export function createBuildTaxonomyCatalogTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'build_taxonomy_catalog',
    label: 'Build Taxonomy Catalog',
    description:
      'Build a taxonomy catalog artifact from durable wiki taxonomy pages, including lightweight parent and root metadata.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const taxonomySlugs = await listKnowledgePages(runtimeContext.root, 'taxonomy');
      const explicitTaxonomy = await Promise.all(
        taxonomySlugs.map(async (taxonomySlug) => {
          const page = await loadTaxonomyCatalogSource(runtimeContext.root, taxonomySlug);

          return {
            taxonomySlug,
            title: page.title,
            aliases: page.aliases,
            summary: page.summary,
            parentTaxonomySlug: page.parentTaxonomySlug,
            explicitRootTaxonomySlug: page.explicitRootTaxonomySlug,
            explicitIsRoot: page.explicitIsRoot
          };
        })
      );
      const taxonomyBySlug = new Map(explicitTaxonomy.map((entry) => [entry.taxonomySlug, entry]));
      const taxonomy = explicitTaxonomy.map((entry) => ({
        taxonomySlug: entry.taxonomySlug,
        title: entry.title,
        aliases: entry.aliases,
        summary: entry.summary,
        parentTaxonomySlug: entry.parentTaxonomySlug,
        rootTaxonomySlug: resolveRootTaxonomySlug(entry.taxonomySlug, taxonomyBySlug),
        isRoot: resolveIsRoot(entry, taxonomyBySlug)
      }));
      const artifact: TaxonomyCatalogArtifact = { taxonomy };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'build_taxonomy_catalog',
        summary: `built taxonomy catalog for ${taxonomy.length} taxonomy pages`,
        evidence: taxonomy.map((entry) => `wiki/taxonomy/${entry.taxonomySlug}.md`),
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          taxonomyCount: taxonomy.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Built taxonomy catalog entries: ${taxonomy.length}`,
          `Artifact: ${resolvedOutput.projectPath}`
        ].join('\n')
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}

async function loadTaxonomyCatalogSource(
  root: string,
  taxonomySlug: string
): Promise<{
  title: string;
  aliases: string[];
  summary: string;
  parentTaxonomySlug: string | null;
  explicitRootTaxonomySlug: string | null;
  explicitIsRoot: boolean | null;
}> {
  const filePath = path.join(buildProjectPaths(root).wikiTaxonomy, `${taxonomySlug}.md`);
  const markdown = await readFile(filePath, 'utf8');
  const frontmatter = readFrontmatter(markdown);
  const document = parseDocument(frontmatter);

  if (document.errors.length > 0) {
    throw new Error(`Invalid taxonomy page frontmatter: wiki/taxonomy/${taxonomySlug}.md`);
  }

  const value = document.toJS({ mapAsMap: false });

  if (!isRecord(value)) {
    throw new Error(`Invalid taxonomy page frontmatter: wiki/taxonomy/${taxonomySlug}.md`);
  }

  return {
    title: readRequiredString(value.title, 'title'),
    aliases: readStringArray(value.aliases),
    summary: readOptionalString(value.summary),
    parentTaxonomySlug: readOptionalSlug(value.taxonomy_parent ?? value.parentTaxonomySlug ?? value.taxonomyParent),
    explicitRootTaxonomySlug: readExplicitRootTaxonomySlug(value),
    explicitIsRoot: readExplicitIsRoot(value)
  };
}

function resolveRootTaxonomySlug(
  taxonomySlug: string,
  taxonomyBySlug: ReadonlyMap<
    string,
    Pick<BuiltTaxonomyCatalogEntry, 'taxonomySlug' | 'parentTaxonomySlug'> & {
      explicitRootTaxonomySlug?: string | null;
      explicitIsRoot?: boolean | null;
    }
  >
): string {
  const visited = new Set<string>([taxonomySlug]);
  let currentSlug = taxonomySlug;

  while (true) {
    const current = taxonomyBySlug.get(currentSlug);

    if (current?.explicitRootTaxonomySlug) {
      return current.explicitRootTaxonomySlug;
    }

    if (current?.explicitIsRoot) {
      return currentSlug;
    }

    if (!current?.parentTaxonomySlug) {
      return currentSlug;
    }

    const parentSlug = current.parentTaxonomySlug;

    if (visited.has(parentSlug)) {
      return parentSlug;
    }

    visited.add(parentSlug);

    if (!taxonomyBySlug.has(parentSlug)) {
      return parentSlug;
    }

    currentSlug = parentSlug;
  }
}

function resolveIsRoot(
  entry: Pick<BuiltTaxonomyCatalogEntry, 'taxonomySlug' | 'parentTaxonomySlug'> & {
    explicitRootTaxonomySlug?: string | null;
    explicitIsRoot?: boolean | null;
  },
  taxonomyBySlug: ReadonlyMap<
    string,
    Pick<BuiltTaxonomyCatalogEntry, 'taxonomySlug' | 'parentTaxonomySlug'> & {
      explicitRootTaxonomySlug?: string | null;
      explicitIsRoot?: boolean | null;
    }
  >
): boolean {
  if (entry.explicitIsRoot !== null && entry.explicitIsRoot !== undefined) {
    return entry.explicitIsRoot;
  }

  return resolveRootTaxonomySlug(entry.taxonomySlug, taxonomyBySlug) === entry.taxonomySlug;
}

function readFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/\r\n/gu, '\n');

  if (!normalized.startsWith('---\n')) {
    throw new Error('Invalid taxonomy page frontmatter');
  }

  const endIndex = normalized.indexOf('\n---\n', 4);

  if (endIndex === -1) {
    throw new Error('Invalid taxonomy page frontmatter');
  }

  return normalized.slice(4, endIndex);
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid taxonomy page frontmatter field: ${fieldName}`);
  }

  return value;
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readOptionalSlug(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readExplicitRootTaxonomySlug(value: Record<string, unknown>): string | null {
  const rootValue = value.taxonomy_root ?? value.rootTaxonomySlug ?? value.taxonomyRoot;

  if (typeof rootValue === 'string' && rootValue.trim().length > 0) {
    return rootValue.trim();
  }

  return null;
}

function readExplicitIsRoot(value: Record<string, unknown>): boolean | null {
  const rootValue = value.taxonomy_root ?? value.rootTaxonomySlug ?? value.taxonomyRoot;

  if (rootValue === true) {
    return true;
  }

  if (rootValue === false) {
    return false;
  }

  if (typeof value.isRoot === 'boolean') {
    return value.isRoot;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
