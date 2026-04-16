import { access, mkdir, writeFile } from 'node:fs/promises';

import { buildProjectPaths } from '../config/project-paths.js';
import { createChatSettings } from '../domain/chat-settings.js';

export interface BootstrapProjectResult {
  directories: string[];
  files: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function bootstrapProject(root: string): Promise<BootstrapProjectResult> {
  const projectPaths = buildProjectPaths(root);
  const directories = [
    projectPaths.raw,
    projectPaths.rawInbox,
    projectPaths.rawAccepted,
    projectPaths.rawRejected,
    projectPaths.wiki,
    projectPaths.wikiSources,
    projectPaths.wikiEntities,
    projectPaths.wikiTopics,
    projectPaths.wikiQueries,
    projectPaths.schema,
    projectPaths.state,
    projectPaths.stateRuns,
    projectPaths.stateCheckpoints,
    projectPaths.stateDrafts,
    projectPaths.stateArtifacts,
    projectPaths.stateTasks,
    projectPaths.docs,
    projectPaths.docsSuperpowers,
    projectPaths.docsSuperpowersSpecs
  ];
  const scaffoldFiles = {
    [projectPaths.wikiIndex]: `# Wiki Index

- [Sources](sources/)
- [Entities](entities/)
- [Topics](topics/)
- [Queries](queries/)
`,
    [projectPaths.wikiLog]: `# Wiki Log
`,
    [projectPaths.schemaAgentRules]: `# Agent Rules

- Maintain the wiki as the long-lived knowledge surface.
- Treat raw/ as read-only source input.
- Form a plan before mutating knowledge files.
- Escalate high-impact changes for review.
`,
    [projectPaths.schemaPageTypes]: `# Page Types

- sources/: single-source summary pages.
- entities/: durable pages for people, systems, and organizations.
- topics/: synthesized topic pages across sources.
- queries/: reusable query results with long-term value.
`,
    [projectPaths.schemaUpdatePolicy]: `# Update Policy

- Prefer patch-style updates over full rewrites.
- Keep wiki/log.md append-only.
- Maintain wiki/index.md as a structured navigation page.
- Preserve conflicts with their supporting evidence instead of flattening them away.
- Only write back query results with long-term value.
`,
    [projectPaths.schemaReviewGates]: `# Review Gates

High-impact actions require review before applying changes:

- 重写核心 topic 页
- 删除页面
- 合并或拆分关键实体
- 修改 schema 规则
- 涉及多个主题页的基础判断变化
- 存在明显证据冲突但无法自动决断
`,
    [projectPaths.stateChatSettings]: `${JSON.stringify(
      createChatSettings({
        model: 'gpt-5.4',
        provider: 'llm-wiki-liiy',
        api: 'anthropic-messages',
        base_url: 'http://runtime.example.invalid/v1',
        api_key_env: 'RUNTIME_API_KEY',
        reasoning: true,
        allow_query_writeback: false,
        allow_lint_autofix: false
      }),
      null,
      2
    )}
`,
    [projectPaths.projectEnv]: 'RUNTIME_API_KEY=\n'
  } satisfies Record<string, string>;

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  const files: string[] = [];

  for (const [filePath, content] of Object.entries(scaffoldFiles)) {
    if (await exists(filePath)) {
      continue;
    }

    await writeFile(filePath, content, 'utf8');
    files.push(filePath);
  }

  return {
    directories,
    files
  };
}
