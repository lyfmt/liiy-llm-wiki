export const KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION = 'knowledge-insert.pipeline.v3';

export const knowledgeInsertStageNames = [
  'source.uploaded',
  'source.prepared',
  'topics.planned',
  'parts.planned',
  'parts.materialized',
  'parts.extracted',
  'knowledge.connected',
  'graph.prepared',
  'graph.written',
  'wiki.projected',
  'lint.completed'
] as const;

export type KnowledgeInsertStageName = (typeof knowledgeInsertStageNames)[number];
export type KnowledgeInsertPipelineStatus = 'running' | 'needs_review' | 'done' | 'failed';
export type KnowledgeInsertPipelineStorageMode = 'pg-primary';

export interface KnowledgeInsertPipelineState {
  schemaVersion: typeof KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION;
  runId: string;
  sourceId: string;
  storageMode: KnowledgeInsertPipelineStorageMode;
  currentStage: KnowledgeInsertStageName;
  status: KnowledgeInsertPipelineStatus;
  artifacts: Record<string, string>;
  errors: string[];
  partProgress?: {
    total: number;
    completed: number;
    running: string[];
    pending: number;
  };
}

export function assertKnowledgeInsertStageName(value: string): asserts value is KnowledgeInsertStageName {
  if (!knowledgeInsertStageNames.includes(value as KnowledgeInsertStageName)) {
    throw new Error(`Invalid knowledge insert pipeline stage: ${value}`);
  }
}

export function createKnowledgeInsertPipelineState(
  input: Omit<KnowledgeInsertPipelineState, 'schemaVersion' | 'errors'> & { errors?: string[] }
): KnowledgeInsertPipelineState {
  assertKnowledgeInsertStageName(input.currentStage);

  return {
    schemaVersion: KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION,
    runId: input.runId,
    sourceId: input.sourceId,
    storageMode: input.storageMode,
    currentStage: input.currentStage,
    status: input.status,
    artifacts: { ...input.artifacts },
    errors: [...(input.errors ?? [])],
    ...(input.partProgress ? { partProgress: { ...input.partProgress, running: [...input.partProgress.running] } } : {})
  };
}
