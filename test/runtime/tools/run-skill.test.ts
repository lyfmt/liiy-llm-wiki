import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fauxAssistantMessage, registerFauxProvider } from '@mariozechner/pi-ai';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { discoverRuntimeSkills } from '../../../src/runtime/skills/discovery.js';
import { discoverRuntimeSubagents } from '../../../src/runtime/subagents/discovery.js';
import { buildRuntimeToolCatalog } from '../../../src/runtime/tool-catalog.js';
import { createRunSubagentTool } from '../../../src/runtime/tools/run-subagent.js';
import { createRunSkillTool } from '../../../src/runtime/tools/run-skill.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('createRunSkillTool', () => {
  it('executes a skill-scoped agent with only the skill-owned tools', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-run-skill-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-skill-agent',
      provider: 'test-runtime-skill-agent',
      models: [
        {
          id: 'gpt-5.4',
          name: 'GPT-5.4',
          reasoning: true,
          contextWindow: 200000,
          maxTokens: 8192
        }
      ]
    });

    try {
      await bootstrapProject(root);
      await mkdir(path.join(root, '.agents', 'skills', 'source-to-wiki'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'skills', 'source-to-wiki', 'SKILL.md'),
        `---
name: source-to-wiki
description: Turn source material into governed wiki drafts.
allowed-tools: read_source_manifest
---

# Source To Wiki
`,
        'utf8'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );

      faux.setResponses([
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'tool-call-skill-1',
              name: 'read_source_manifest',
              arguments: {
                sourceId: 'src-001'
              }
            }
          ],
          api: 'openai-completions',
          provider: 'test-runtime-skill-agent',
          model: 'gpt-5.4',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
          },
          stopReason: 'toolUse',
          timestamp: Date.now()
        },
        fauxAssistantMessage('Skill execution completed for source-to-wiki.')
      ]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createRunSkillTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-skill-001'
        }),
        {
          skills: [
            {
              name: 'source-to-wiki',
              description: 'Turn source material into governed wiki drafts.',
              allowedTools: ['read_source_manifest'],
              filePath: path.join(root, '.agents', 'skills', 'source-to-wiki', 'SKILL.md'),
              baseDir: path.join(root, '.agents', 'skills', 'source-to-wiki')
            }
          ],
          toolCatalog: buildRuntimeToolCatalog(
            createRuntimeContext({
              root,
              runId: 'runtime-run-skill-catalog-001'
            })
          ),
          model,
          getApiKey: () => undefined
        }
      );

      const result = await tool.execute('tool-call-1', {
        name: 'source-to-wiki',
        task: 'Read the source manifest and summarize the next step.'
      });

      expect(result.details.summary).toBe('ran skill source-to-wiki');
      expect(result.details.resultMarkdown).toContain('read_source_manifest');
      expect(result.details.resultMarkdown).toContain('Skill execution completed for source-to-wiki.');
      expect(result.details.evidence).toContain('raw/accepted/design.md');
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads the project knowledge-insert skill with the governed tool contract', async () => {
    const root = process.cwd();
    const faux = registerFauxProvider({
      api: 'test-runtime-knowledge-insert-skill',
      provider: 'test-runtime-knowledge-insert-skill',
      models: [
        {
          id: 'gpt-5.4',
          name: 'GPT-5.4',
          reasoning: true,
          contextWindow: 200000,
          maxTokens: 8192
        }
      ]
    });

    try {
      faux.setResponses([fauxAssistantMessage('Knowledge insert skill is ready.')]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const catalogContext = createRuntimeContext({
        root,
        runId: 'runtime-run-skill-knowledge-insert-catalog-001'
      });
      const toolCatalog = buildRuntimeToolCatalog(catalogContext);
      const runSubagentTool = createRunSubagentTool(catalogContext, {
        profiles: (await discoverRuntimeSubagents(root)).profiles,
        toolCatalog,
        model,
        getApiKey: () => undefined
      });

      const tool = createRunSkillTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-skill-knowledge-insert-001'
        }),
        {
          skills: (await discoverRuntimeSkills(root)).skills,
          toolCatalog: {
            ...toolCatalog,
            run_subagent: runSubagentTool
          },
          model,
          getApiKey: () => undefined
        }
      );

      const result = await tool.execute('tool-call-knowledge-insert-1', {
        name: 'knowledge-insert',
        task: 'Confirm the knowledge-insert tool contract.'
      });

      expect(result.details.summary).toBe('ran skill knowledge-insert');
      expect(result.details.data?.allowedTools).toEqual(['start_knowledge_insert_pipeline']);
    } finally {
      faux.unregister();
    }
  });
});
