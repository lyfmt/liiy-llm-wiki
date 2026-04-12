export interface ChangeSet {
  target_files: string[];
  patch_summary: string;
  rationale: string;
  source_refs: string[];
  risk_level: string;
  needs_review: boolean;
}

export interface CreateChangeSetInput {
  target_files: string[];
  patch_summary: string;
  rationale: string;
  source_refs: string[];
  risk_level: string;
  needs_review?: boolean;
}

export function createChangeSet(input: CreateChangeSetInput): ChangeSet {
  return {
    target_files: [...input.target_files],
    patch_summary: input.patch_summary,
    rationale: input.rationale,
    source_refs: [...input.source_refs],
    risk_level: input.risk_level,
    needs_review: input.needs_review ?? false
  };
}
