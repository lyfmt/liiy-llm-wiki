export type FindingType = 'conflict' | 'orphan' | 'stale' | 'missing-link' | 'gap';

export interface Finding {
  type: FindingType;
  severity: string;
  evidence: string[];
  suggested_action: string;
  resolution_status: string;
}

export interface CreateFindingInput {
  type: FindingType;
  severity: string;
  evidence: string[];
  suggested_action: string;
  resolution_status: string;
}

export function createFinding(input: CreateFindingInput): Finding {
  return {
    type: input.type,
    severity: input.severity,
    evidence: [...input.evidence],
    suggested_action: input.suggested_action,
    resolution_status: input.resolution_status
  };
}
