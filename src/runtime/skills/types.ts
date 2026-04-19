export interface SkillFrontmatter {
  name?: string;
  description?: string;
  'allowed-tools'?: string | string[];
  [key: string]: unknown;
}

export interface SkillSummary {
  name: string;
  description: string;
  allowedTools: string[];
  filePath: string;
  baseDir: string;
}

export interface LoadedSkillDocument extends SkillSummary {
  source: string;
  frontmatter: SkillFrontmatter;
}

export interface RuntimeSkillDiagnostic {
  path: string;
  message: string;
}

export interface DiscoverRuntimeSkillsResult {
  skills: SkillSummary[];
  diagnostics: RuntimeSkillDiagnostic[];
}
