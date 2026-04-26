import type { KnowledgeInsertStageName } from '../../domain/knowledge-insert-pipeline.js';

export interface RunPipelineJsonStageInput {
  stage: KnowledgeInsertStageName;
  schemaVersion: string;
  inputJson: unknown;
  exampleJson: unknown;
  generate: (prompt: string) => Promise<string>;
}

export async function runPipelineJsonStage(input: RunPipelineJsonStageInput): Promise<Record<string, unknown>> {
  const prompt = [
    'You are a restricted knowledge insert pipeline stage worker, not a skill agent.',
    `Stage: ${input.stage}`,
    `Required schemaVersion: ${input.schemaVersion}`,
    'Do not load skills. Do not call tools. Do not read files. Do not write artifacts. Do not write PG. Do not write wiki.',
    'Return only one valid JSON object. Example JSON takes priority over abstract prose.',
    '',
    'Example JSON:',
    JSON.stringify(input.exampleJson, null, 2),
    '',
    'Input JSON:',
    JSON.stringify(input.inputJson, null, 2)
  ].join('\n');

  const rawOutput = await input.generate(prompt);

  try {
    const parsed = JSON.parse(extractJsonObject(rawOutput)) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('Pipeline stage did not return valid JSON');
  }
}

function extractJsonObject(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
  if (fenced?.[1]?.trim().startsWith('{')) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}
