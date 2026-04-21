export interface SubagentFrontmatter {
  name?: string;
  description?: string;
  'default-tools'?: string | string[];
  'max-tools'?: string | string[];
  'receipt-schema'?: string;
  [key: string]: unknown;
}

export interface SubagentProfile {
  name: string;
  description: string;
  systemPrompt: string;
  defaultTools: string[];
  maxTools: string[];
  receiptSchema: string;
  filePath: string;
}

export interface RunSubagentInput {
  profile: string;
  taskPrompt: string;
  inputArtifacts: string[];
  outputDir: string;
  requestedTools?: string[];
  successCriteria?: string[];
}

export interface SubagentReceipt {
  status: 'done' | 'needs_review' | 'failed';
  summary: string;
  outputArtifacts: string[];
  counters?: Record<string, number>;
  warnings?: string[];
}

export interface RuntimeSubagentDiagnostic {
  path: string;
  message: string;
}

export interface DiscoverRuntimeSubagentsResult {
  profiles: SubagentProfile[];
  diagnostics: RuntimeSubagentDiagnostic[];
}
