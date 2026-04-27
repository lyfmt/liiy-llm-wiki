import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PIPELINE_ARTIFACT_ROOT = path.join('state', 'artifacts', 'knowledge-insert-pipeline');

export interface KnowledgeInsertPipelineArtifactPath {
  absolutePath: string;
  projectPath: string;
}

export function buildKnowledgeInsertPipelineArtifactPath(
  root: string,
  runId: string,
  artifactPath: string
): KnowledgeInsertPipelineArtifactPath {
  assertSafeSegment(runId, 'pipeline run id');
  assertSafeRelativePath(artifactPath, 'pipeline artifact path');

  const projectPath = path.join(PIPELINE_ARTIFACT_ROOT, runId, artifactPath).replaceAll(path.sep, '/');
  const absolutePath = path.join(root, projectPath);
  return { absolutePath, projectPath };
}

export async function writeKnowledgeInsertPipelineArtifact(
  root: string,
  runId: string,
  artifactPath: string,
  value: unknown
): Promise<KnowledgeInsertPipelineArtifactPath> {
  const target = buildKnowledgeInsertPipelineArtifactPath(root, runId, artifactPath);
  await mkdir(path.dirname(target.absolutePath), { recursive: true });
  await writeFile(target.absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return target;
}

export async function readKnowledgeInsertPipelineArtifact<T = unknown>(
  root: string,
  runId: string,
  artifactPath: string
): Promise<T> {
  const target = buildKnowledgeInsertPipelineArtifactPath(root, runId, artifactPath);
  return JSON.parse(await readFile(target.absolutePath, 'utf8')) as T;
}

function assertSafeSegment(value: string, label: string): void {
  if (value === '' || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function assertSafeRelativePath(value: string, label: string): void {
  if (value === '' || path.isAbsolute(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  const normalized = path.normalize(value);
  if (normalized === '.' || normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}
