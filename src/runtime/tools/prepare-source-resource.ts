import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { readRawDocument } from '../../flows/ingest/read-raw-document.js';
import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import { loadSourceManifest } from '../../storage/source-manifest-store.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  manifestId: Type.String({ description: 'Accepted source manifest id to prepare into a structured resource artifact.' }),
  rawPath: Type.String({ description: 'Accepted raw source path that should match the manifest path.' }),
  outputArtifact: Type.String({
    description: 'Artifact path under state/artifacts/ or a project-relative state/artifacts path for the prepared resource JSON.'
  })
});

export type PrepareSourceResourceParameters = Static<typeof parameters>;

export interface PreparedSourceResourceArtifact {
  manifestId: string;
  rawPath: string;
  structuredMarkdown: string;
  sections: Array<{
    headingPath: string[];
    startLine: number;
    endLine: number;
  }>;
  metadata: {
    title: string;
    type: string;
    status: string;
    hash: string;
    importedAt: string;
    preparedAt: string;
  };
}

export function createPrepareSourceResourceTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'prepare_source_resource',
    label: 'Prepare Source Resource',
    description:
      'Prepare an accepted source manifest and raw markdown file into a structured artifact for knowledge insertion.',
    parameters,
    execute: async (_toolCallId, params) => {
      const manifest = await loadSourceManifest(runtimeContext.root, params.manifestId);

      if (manifest.path !== params.rawPath) {
        throw new Error(`Raw path does not match manifest ${manifest.id}: ${params.rawPath}`);
      }

      if (manifest.status !== 'accepted') {
        throw new Error(`Source manifest must be accepted before preparation: ${manifest.id}`);
      }

      const structuredMarkdown = await readRawDocument(runtimeContext.root, params.rawPath);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const artifact: PreparedSourceResourceArtifact = {
        manifestId: manifest.id,
        rawPath: manifest.path,
        structuredMarkdown,
        sections: [],
        metadata: {
          title: manifest.title,
          type: manifest.type,
          status: manifest.status,
          hash: manifest.hash,
          importedAt: manifest.imported_at,
          preparedAt: new Date().toISOString()
        }
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'prepare_source_resource',
        summary: `prepared source resource ${manifest.id}`,
        evidence: [manifest.path],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          manifestId: manifest.id,
          rawPath: manifest.path,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Prepared source resource: ${manifest.id}`,
          `Raw path: ${manifest.path}`,
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
