import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fauxAssistantMessage, registerFauxProvider } from '@mariozechner/pi-ai';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { discoverRuntimeSubagents } from '../../../src/runtime/subagents/discovery.js';
import { buildRuntimeToolCatalog } from '../../../src/runtime/tool-catalog.js';
import { createRunSubagentTool } from '../../../src/runtime/tools/run-subagent.js';

describe('createRunSubagentTool', () => {
  it('launches an isolated subagent with profile-limited tools and returns a receipt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-run-subagent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent',
      provider: 'test-runtime-subagent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for longer-running wiki tasks.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker

Read the provided artifacts and write outputs into the requested artifact directory.
`,
        'utf8'
      );
      await mkdir(path.join(root, 'state', 'artifacts', 'subagents', 'input'), { recursive: true });
      await writeFile(
        path.join(root, 'state', 'artifacts', 'subagents', 'input', 'source.json'),
        '{\n  "topic": "patch-first"\n}\n',
        'utf8'
      );

      faux.setResponses([
        buildSingleToolCallingAssistantMessage('tool-call-subagent-read-1', 'read_artifact', {
          artifactPath: 'state/artifacts/subagents/input/source.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-subagent-write-1', 'write_artifact', {
          artifactPath: 'state/artifacts/subagents/run-001--subagent-1/receipt.json',
          content: '{\n  "status": "done"\n}\n'
        }),
        fauxAssistantMessage(
          JSON.stringify({
            status: 'done',
            summary: 'Read the provided artifact and wrote a receipt.',
            outputArtifacts: ['state/artifacts/subagents/run-001--subagent-1/receipt.json']
          })
        )
      ]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createRunSubagentTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-subagent-001'
        }),
        {
          profiles: (await discoverRuntimeSubagents(root)).profiles,
          toolCatalog: buildRuntimeToolCatalog(
            createRuntimeContext({
              root,
              runId: 'runtime-run-subagent-catalog-001'
            })
          ),
          model,
          getApiKey: () => undefined
        }
      );

      const result = await tool.execute('tool-call-1', {
        profile: 'worker',
        taskPrompt: 'Read the provided artifact and write a receipt.',
        inputArtifacts: ['state/artifacts/subagents/input/source.json'],
        outputDir: 'state/artifacts/subagents/run-001--subagent-1',
        requestedTools: ['read_artifact', 'write_artifact', 'apply_draft_upsert']
      });

      expect(result.details.summary).toBe('ran subagent worker');
      expect(result.details.data?.effectiveTools).toEqual(['read_artifact', 'write_artifact']);
      expect(result.details.data?.receipt).toEqual({
        status: 'done',
        summary: 'Read the provided artifact and wrote a receipt.',
        outputArtifacts: ['state/artifacts/subagents/run-001--subagent-1/receipt.json']
      });
      expect(result.details.resultMarkdown).toContain('Read the provided artifact and wrote a receipt.');
      expect(
        await readFile(path.join(root, 'state', 'artifacts', 'subagents', 'run-001--subagent-1', 'receipt.json'), 'utf8')
      ).toContain('"status": "done"');
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('maps a needs_review receipt into a review-required runtime outcome', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-run-subagent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent',
      provider: 'test-runtime-subagent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'reviewer'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'reviewer', 'SUBAGENT.md'),
        `---
name: reviewer
description: Review-focused subagent.
default-tools: read_artifact
max-tools: read_artifact
receipt-schema: minimal-receipt-v1
---

# Reviewer

Inspect the artifact and return a receipt.
`,
        'utf8'
      );
      await mkdir(path.join(root, 'state', 'artifacts', 'subagents', 'input'), { recursive: true });
      await writeFile(
        path.join(root, 'state', 'artifacts', 'subagents', 'input', 'source.json'),
        '{\n  "topic": "patch-first"\n}\n',
        'utf8'
      );

      faux.setResponses([
        fauxAssistantMessage(
          JSON.stringify({
            status: 'needs_review',
            summary: 'The artifact is ambiguous and needs human review.',
            outputArtifacts: []
          })
        )
      ]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createRunSubagentTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-subagent-review-001'
        }),
        {
          profiles: (await discoverRuntimeSubagents(root)).profiles,
          toolCatalog: buildRuntimeToolCatalog(
            createRuntimeContext({
              root,
              runId: 'runtime-run-subagent-catalog-review-001'
            })
          ),
          model,
          getApiKey: () => undefined
        }
      );

      const result = await tool.execute('tool-call-1', {
        profile: 'reviewer',
        taskPrompt: 'Inspect the artifact and return a receipt.',
        inputArtifacts: ['state/artifacts/subagents/input/source.json'],
        outputDir: 'state/artifacts/subagents/run-001--subagent-review-1'
      });

      expect(result.details.needsReview).toBe(true);
      expect(result.details.reviewReasons).toEqual(['The artifact is ambiguous and needs human review.']);
      expect(result.details.data?.receipt).toEqual({
        status: 'needs_review',
        summary: 'The artifact is ambiguous and needs human review.',
        outputArtifacts: []
      });
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a failed receipt instead of throwing when the subagent model errors', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-run-subagent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent',
      provider: 'test-runtime-subagent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for longer-running wiki tasks.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker

Read the provided artifacts and write outputs into the requested artifact directory.
`,
        'utf8'
      );
      await mkdir(path.join(root, 'state', 'artifacts', 'subagents', 'input'), { recursive: true });
      await writeFile(
        path.join(root, 'state', 'artifacts', 'subagents', 'input', 'source.json'),
        '{\n  "topic": "patch-first"\n}\n',
        'utf8'
      );

      faux.setResponses([
        {
          role: 'assistant',
          content: [],
          api: 'openai-completions',
          provider: 'test-runtime-subagent',
          model: 'gpt-5.4',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
          },
          stopReason: 'error',
          errorMessage: 'synthetic upstream 503',
          timestamp: Date.now()
        }
      ]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createRunSubagentTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-subagent-model-error-001'
        }),
        {
          profiles: (await discoverRuntimeSubagents(root)).profiles,
          toolCatalog: buildRuntimeToolCatalog(
            createRuntimeContext({
              root,
              runId: 'runtime-run-subagent-catalog-model-error-001'
            })
          ),
          model,
          getApiKey: () => undefined
        }
      );

      const result = await tool.execute('tool-call-1', {
        profile: 'worker',
        taskPrompt: 'Read the provided artifact and write a receipt.',
        inputArtifacts: ['state/artifacts/subagents/input/source.json'],
        outputDir: 'state/artifacts/subagents/run-001--subagent-model-error'
      });

      expect(result.details.summary).toBe('ran subagent worker');
      expect(result.details.data?.receipt).toEqual({
        status: 'failed',
        summary: 'synthetic upstream 503',
        outputArtifacts: []
      });
      expect(result.details.resultMarkdown).toContain('synthetic upstream 503');
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows granted input artifacts anywhere under state/artifacts while keeping outputs scoped', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-run-subagent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent',
      provider: 'test-runtime-subagent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for longer-running wiki tasks.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker

Read the provided artifacts and write outputs into the requested artifact directory.
`,
        'utf8'
      );
      await mkdir(path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001'), { recursive: true });
      await writeFile(
        path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'blocks.json'),
        '{\n  "blocks": [{ "id": "block-001" }]\n}\n',
        'utf8'
      );

      faux.setResponses([
        buildSingleToolCallingAssistantMessage('tool-call-subagent-read-1', 'read_artifact', {
          artifactPath: 'state/artifacts/knowledge-insert/run-001/blocks.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-subagent-write-1', 'write_artifact', {
          artifactPath: 'state/artifacts/subagents/run-001--subagent-knowledge/receipt.json',
          content: '{\n  "status": "done"\n}\n'
        }),
        fauxAssistantMessage(
          JSON.stringify({
            status: 'done',
            summary: 'Read a knowledge-insert artifact and wrote a receipt.',
            outputArtifacts: ['state/artifacts/subagents/run-001--subagent-knowledge/receipt.json']
          })
        )
      ]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createRunSubagentTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-subagent-knowledge-001'
        }),
        {
          profiles: (await discoverRuntimeSubagents(root)).profiles,
          toolCatalog: buildRuntimeToolCatalog(
            createRuntimeContext({
              root,
              runId: 'runtime-run-subagent-catalog-knowledge-001'
            })
          ),
          model,
          getApiKey: () => undefined
        }
      );

      const result = await tool.execute('tool-call-1', {
        profile: 'worker',
        taskPrompt: 'Read the provided artifact and write a receipt.',
        inputArtifacts: ['state/artifacts/knowledge-insert/run-001/blocks.json'],
        outputDir: 'state/artifacts/subagents/run-001--subagent-knowledge',
        requestedTools: ['read_artifact', 'write_artifact']
      });

      expect(result.details.data?.receipt).toEqual({
        status: 'done',
        summary: 'Read a knowledge-insert artifact and wrote a receipt.',
        outputArtifacts: ['state/artifacts/subagents/run-001--subagent-knowledge/receipt.json']
      });
      expect(result.details.evidence).toContain(
        path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'blocks.json')
      );
      expect(
        await readFile(
          path.join(root, 'state', 'artifacts', 'subagents', 'run-001--subagent-knowledge', 'receipt.json'),
          'utf8'
        )
      ).toContain('"status": "done"');
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows nested output directories inside a subagent run root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-run-subagent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent',
      provider: 'test-runtime-subagent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for longer-running wiki tasks.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker

Read the provided artifacts and write outputs into the requested artifact directory.
`,
        'utf8'
      );
      await mkdir(path.join(root, 'state', 'artifacts', 'subagents', 'input'), { recursive: true });
      await writeFile(
        path.join(root, 'state', 'artifacts', 'subagents', 'input', 'source.json'),
        '{\n  "topic": "patch-first"\n}\n',
        'utf8'
      );

      faux.setResponses([
        buildSingleToolCallingAssistantMessage('tool-call-subagent-read-1', 'read_artifact', {
          artifactPath: 'state/artifacts/subagents/input/source.json'
        }),
        buildSingleToolCallingAssistantMessage('tool-call-subagent-write-1', 'write_artifact', {
          artifactPath: 'state/artifacts/subagents/run-001--subagent-1/output/receipt.json',
          content: '{\n  "status": "done"\n}\n'
        }),
        fauxAssistantMessage(
          JSON.stringify({
            status: 'done',
            summary: 'Read the provided artifact and wrote a nested receipt.',
            outputArtifacts: ['state/artifacts/subagents/run-001--subagent-1/output/receipt.json']
          })
        )
      ]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createRunSubagentTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-subagent-nested-output-001'
        }),
        {
          profiles: (await discoverRuntimeSubagents(root)).profiles,
          toolCatalog: buildRuntimeToolCatalog(
            createRuntimeContext({
              root,
              runId: 'runtime-run-subagent-catalog-nested-output-001'
            })
          ),
          model,
          getApiKey: () => undefined
        }
      );

      const result = await tool.execute('tool-call-1', {
        profile: 'worker',
        taskPrompt: 'Read the provided artifact and write a receipt.',
        inputArtifacts: ['state/artifacts/subagents/input/source.json'],
        outputDir: 'state/artifacts/subagents/run-001--subagent-1/output',
        requestedTools: ['read_artifact', 'write_artifact']
      });

      expect(result.details.data?.receipt).toEqual({
        status: 'done',
        summary: 'Read the provided artifact and wrote a nested receipt.',
        outputArtifacts: ['state/artifacts/subagents/run-001--subagent-1/output/receipt.json']
      });
      expect(
        await readFile(
          path.join(root, 'state', 'artifacts', 'subagents', 'run-001--subagent-1', 'output', 'receipt.json'),
          'utf8'
        )
      ).toContain('"status": "done"');
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects input artifacts outside state/artifacts and output directories outside state/artifacts/subagents', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-run-subagent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent',
      provider: 'test-runtime-subagent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for longer-running wiki tasks.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker

Read the provided artifacts and write outputs into the requested artifact directory.
`,
        'utf8'
      );
      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createRunSubagentTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-subagent-guard-001'
        }),
        {
          profiles: (await discoverRuntimeSubagents(root)).profiles,
          toolCatalog: buildRuntimeToolCatalog(
            createRuntimeContext({
              root,
              runId: 'runtime-run-subagent-catalog-guard-001'
            })
          ),
          model,
          getApiKey: () => undefined
        }
      );

      await expect(
        tool.execute('tool-call-1', {
          profile: 'worker',
          taskPrompt: 'Read the provided artifact and write a receipt.',
          inputArtifacts: ['../../package.json'],
          outputDir: 'state/artifacts/subagents/run-001--subagent-guard-1'
        })
      ).rejects.toThrow('Artifact path must stay within state/artifacts: ../../package.json');

      await expect(
        tool.execute('tool-call-2', {
          profile: 'worker',
          taskPrompt: 'Read the provided artifact and write a receipt.',
          inputArtifacts: ['state/artifacts/subagents/input/source.json'],
          outputDir: 'state/artifacts/chat-settings.json'
        })
      ).rejects.toThrow('Subagent output directory must be state/artifacts/subagents/<run-id>');
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('blocks artifact access outside the granted subagent scope', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-run-subagent-'));
    const faux = registerFauxProvider({
      api: 'test-runtime-subagent',
      provider: 'test-runtime-subagent',
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
      await mkdir(path.join(root, '.agents', 'subagents', 'worker'), { recursive: true });
      await writeFile(
        path.join(root, '.agents', 'subagents', 'worker', 'SUBAGENT.md'),
        `---
name: worker
description: Execution-focused subagent for longer-running wiki tasks.
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact
receipt-schema: minimal-receipt-v1
---

# Worker

Read the provided artifacts and write outputs into the requested artifact directory.
`,
        'utf8'
      );
      await mkdir(path.join(root, 'state', 'artifacts', 'subagents', 'input'), { recursive: true });
      await writeFile(
        path.join(root, 'state', 'artifacts', 'subagents', 'input', 'source.json'),
        '{\n  "topic": "patch-first"\n}\n',
        'utf8'
      );

      faux.setResponses([
        buildSingleToolCallingAssistantMessage('tool-call-subagent-read-1', 'read_artifact', {
          artifactPath: 'state/artifacts/chat-settings.json'
        }),
        fauxAssistantMessage(
          JSON.stringify({
            status: 'failed',
            summary: 'Unauthorized artifact access was blocked.',
            outputArtifacts: []
          })
        )
      ]);

      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createRunSubagentTool(
        createRuntimeContext({
          root,
          runId: 'runtime-run-subagent-scope-001'
        }),
        {
          profiles: (await discoverRuntimeSubagents(root)).profiles,
          toolCatalog: buildRuntimeToolCatalog(
            createRuntimeContext({
              root,
              runId: 'runtime-run-subagent-catalog-scope-001'
            })
          ),
          model,
          getApiKey: () => undefined
        }
      );

      const result = await tool.execute('tool-call-1', {
        profile: 'worker',
        taskPrompt: 'Read the provided artifact and write a receipt.',
        inputArtifacts: ['state/artifacts/subagents/input/source.json'],
        outputDir: 'state/artifacts/subagents/run-001--subagent-scope-1',
        requestedTools: ['read_artifact']
      });

      expect(result.details.data?.receipt).toEqual({
        status: 'failed',
        summary: 'Unauthorized artifact access was blocked.',
        outputArtifacts: []
      });
      expect(result.details.resultMarkdown).toContain('read_artifact: Subagent artifact access denied');
      expect(result.details.evidence).not.toContain(path.join(root, 'state', 'artifacts', 'chat-settings.json'));
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });
});

function buildSingleToolCallingAssistantMessage(
  id: string,
  name: string,
  argumentsValue: Record<string, string | boolean | number | string[] | Record<string, unknown>>
) {
  return {
    role: 'assistant' as const,
    content: [
      {
        type: 'toolCall' as const,
        id,
        name,
        arguments: argumentsValue
      }
    ],
    api: 'openai-completions' as const,
    provider: 'test-runtime-subagent',
    model: 'gpt-5.4',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: 'toolUse' as const,
    timestamp: Date.now()
  };
}
