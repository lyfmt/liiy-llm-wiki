import type { SkillSummary } from './types.js';

export function formatSkillsForPrompt(skills: SkillSummary[]): string {
  if (skills.length === 0) {
    return '(no project skills available)';
  }

  return skills
    .map((skill) => `- ${skill.name}: ${skill.description} (${skill.filePath})`)
    .join('\n');
}
