import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fauxAssistantMessage, registerFauxProvider } from '@mariozechner/pi-ai';

import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import {
  createDraftKnowledgePageTool,
  createModelBackedKnowledgePageDraftSynthesizer,
  type DraftKnowledgePageParameters
} from '../../../src/runtime/tools/draft-knowledge-page.js';

function buildDraftParameters(): DraftKnowledgePageParameters {
  return {
    kind: 'topic',
    slug: 'patch-first',
    title: 'Patch First',
    summary: 'Patch-first updates keep page structure stable.',
    source_refs: ['raw/accepted/design.md'],
    outgoing_links: ['wiki/topics/llm-wiki.md'],
    status: 'active',
    body: '# Patch First\n\nPatch-first updates keep page structure stable.\n',
    rationale: 'prepare a durable topic draft',
    aliases: ['Patch Strategy'],
    tags: ['patch-first']
  };
}

describe('createDraftKnowledgePageTool', () => {
  it('creates a source-backed page draft without mutating the wiki', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-page-'));

    try {
      const tool = createDraftKnowledgePageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-draft-page-001'
        })
      );

      const result = await tool.execute('tool-call-1', buildDraftParameters());

      expect(result.details.summary).toBe('drafted wiki/topics/patch-first.md');
      expect(result.details.evidence).toEqual([
        'wiki/topics/patch-first.md',
        'raw/accepted/design.md',
        'wiki/topics/llm-wiki.md'
      ]);
      expect(result.details.touchedFiles).toEqual([]);
      expect(result.details.data).toEqual({
        synthesisMode: 'deterministic',
        synthesisFallbackReason: null,
        draft: {
          targetPath: 'wiki/topics/patch-first.md',
          upsertArguments: {
            kind: 'topic',
            slug: 'patch-first',
            title: 'Patch First',
            summary: 'Patch-first updates keep page structure stable.',
            status: 'active',
            updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            body: '# Patch First\n\nPatch-first updates keep page structure stable.',
            rationale: 'prepare a durable topic draft',
            source_refs: ['raw/accepted/design.md'],
            outgoing_links: ['wiki/topics/llm-wiki.md'],
            aliases: ['Patch Strategy'],
            tags: ['patch-first']
          }
        }
      });
      expect(result.details.resultMarkdown).toContain('# Knowledge Page Draft');
      expect(result.details.resultMarkdown).toContain('- Target: wiki/topics/patch-first.md');
      expect(result.details.resultMarkdown).toContain('- Source refs: raw/accepted/design.md');
      expect(result.details.resultMarkdown).toContain('- Synthesis mode: deterministic');
      expect(result.details.resultMarkdown).toContain('- Synthesis fallback: _none_');
      expect(result.details.resultMarkdown).toContain('apply_draft_upsert');
      expect(result.details.resultMarkdown).toContain('## Existing Page');
      expect(result.details.resultMarkdown).toContain('## Linked Page Context');
      expect(result.details.resultMarkdown).toContain('## Raw Evidence');
      expect(result.details.resultMarkdown).toContain('_none_');
      expect(result.details.resultMarkdown).toContain('## Proposed Body');
      expect(result.details.resultMarkdown).toContain('## Upsert Arguments');
      expect(result.details.resultMarkdown).toContain('"slug": "patch-first"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads raw evidence into the draft context when accepted source files exist', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-page-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n',
        'utf8'
      );
      const seenInputs: Array<{ rawEvidence: { path: string; excerpt: string }[] }> = [];
      const tool = createDraftKnowledgePageTool(createRuntimeContext({ root, runId: 'runtime-draft-page-raw-001' }), {
        synthesizeDraft: async (input) => {
          seenInputs.push({ rawEvidence: input.rawEvidence });
          return {
            body: '# Patch First\n\nGrounded by raw evidence.\n',
            summary: 'Grounded by raw evidence.',
            mode: 'llm'
          };
        }
      });

      const result = await tool.execute('tool-call-raw-1', buildDraftParameters());

      expect(seenInputs).toEqual([
        {
          rawEvidence: [
            {
              path: 'raw/accepted/design.md',
              excerpt: 'Patch-first updates keep page structure stable in source form.'
            }
          ]
        }
      ]);
      expect(result.details.resultMarkdown).toContain('## Raw Evidence');
      expect(result.details.resultMarkdown).toContain(
        '- raw/accepted/design.md: Patch-first updates keep page structure stable in source form.'
      );
      expect(result.details.resultMarkdown).toContain('Grounded by raw evidence.');
      expect(result.details.data).toEqual({
        synthesisMode: 'llm',
        synthesisFallbackReason: null,
        draft: {
          targetPath: 'wiki/topics/patch-first.md',
          upsertArguments: {
            kind: 'topic',
            slug: 'patch-first',
            title: 'Patch First',
            summary: 'Grounded by raw evidence.',
            status: 'active',
            updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            body: '# Patch First\n\nGrounded by raw evidence.',
            rationale: 'prepare a durable topic draft',
            source_refs: ['raw/accepted/design.md'],
            outgoing_links: ['wiki/topics/llm-wiki.md'],
            aliases: ['Patch Strategy'],
            tags: ['patch-first']
          }
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the model-backed synthesizer and records llm synthesis metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-page-'));
    const faux = registerFauxProvider({
      api: 'test-draft-knowledge-page',
      provider: 'test-draft-knowledge-page',
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
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n',
        'utf8'
      );
      faux.setResponses([
        fauxAssistantMessage(
          JSON.stringify({
            title: 'Patch First',
            summary: 'Synthesized patch-first summary.',
            body: '# Patch First\n\nSynthesized durable patch-first knowledge.\n',
            aliases: ['Patch Strategy', 'Patch-First Workflow'],
            tags: ['patch-first', 'synthesized'],
            outgoing_links: ['wiki/topics/llm-wiki.md'],
            source_refs: ['raw/accepted/design.md'],
            status: 'active',
            rationale: 'synthesize a durable topic draft'
          })
        )
      ]);
      const model = faux.getModel('gpt-5.4');

      if (!model) {
        throw new Error('missing faux model');
      }

      const tool = createDraftKnowledgePageTool(createRuntimeContext({ root, runId: 'runtime-draft-page-002' }), {
        synthesizeDraft: createModelBackedKnowledgePageDraftSynthesizer({
          model,
          sessionId: 'runtime-draft-page-002'
        })
      });

      const result = await tool.execute('tool-call-2', buildDraftParameters());

      expect(result.details.data).toEqual({
        synthesisMode: 'llm',
        synthesisFallbackReason: null,
        draft: {
          targetPath: 'wiki/topics/patch-first.md',
          upsertArguments: {
            kind: 'topic',
            slug: 'patch-first',
            title: 'Patch First',
            summary: 'Synthesized patch-first summary.',
            status: 'active',
            updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            body: '# Patch First\n\nSynthesized durable patch-first knowledge.',
            rationale: 'synthesize a durable topic draft',
            source_refs: ['raw/accepted/design.md'],
            outgoing_links: ['wiki/topics/llm-wiki.md'],
            aliases: ['Patch Strategy', 'Patch-First Workflow'],
            tags: ['patch-first', 'synthesized']
          }
        }
      });
      expect(result.details.resultMarkdown).toContain('- Synthesis mode: llm');
      expect(result.details.resultMarkdown).toContain('- Synthesis fallback: _none_');
      expect(result.details.resultMarkdown).toContain('Synthesized durable patch-first knowledge.');
      expect(result.details.resultMarkdown).toContain('Synthesized patch-first summary.');
      expect(result.details.resultMarkdown).toContain(
        '- raw/accepted/design.md: Patch-first updates keep page structure stable in source form.'
      );
    } finally {
      faux.unregister();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to the deterministic draft when synthesis fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-page-'));

    try {
      const tool = createDraftKnowledgePageTool(createRuntimeContext({ root, runId: 'runtime-draft-page-003' }), {
        synthesizeDraft: async () => {
          throw new Error('synthetic failure');
        }
      });

      const result = await tool.execute('tool-call-3', buildDraftParameters());

      expect(result.details.data).toEqual({
        synthesisMode: 'deterministic',
        synthesisFallbackReason: 'synthetic failure',
        draft: {
          targetPath: 'wiki/topics/patch-first.md',
          upsertArguments: {
            kind: 'topic',
            slug: 'patch-first',
            title: 'Patch First',
            summary: 'Patch-first updates keep page structure stable.',
            status: 'active',
            updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            body: '# Patch First\n\nPatch-first updates keep page structure stable.',
            rationale: 'prepare a durable topic draft',
            source_refs: ['raw/accepted/design.md'],
            outgoing_links: ['wiki/topics/llm-wiki.md'],
            aliases: ['Patch Strategy'],
            tags: ['patch-first']
          }
        }
      });
      expect(result.details.resultMarkdown).toContain('- Synthesis mode: deterministic');
      expect(result.details.resultMarkdown).toContain('- Synthesis fallback: synthetic failure');
      expect(result.details.resultMarkdown).toContain('Patch-first updates keep page structure stable.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('builds taxonomy draft targets under wiki/taxonomy', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-page-taxonomy-'));

    try {
      const tool = createDraftKnowledgePageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-draft-page-taxonomy-001'
        })
      );

      const result = await tool.execute('tool-call-taxonomy-1', {
        ...buildDraftParameters(),
        kind: 'taxonomy',
        slug: 'engineering',
        title: 'Engineering',
        summary: 'Shared engineering taxonomy.',
        body: '# Engineering\n\nShared engineering taxonomy.\n',
        rationale: 'prepare a durable taxonomy draft'
      });

      expect(result.details.summary).toBe('drafted wiki/taxonomy/engineering.md');
      expect(result.details.evidence).toEqual([
        'wiki/taxonomy/engineering.md',
        'raw/accepted/design.md',
        'wiki/topics/llm-wiki.md'
      ]);
      expect(result.details.resultMarkdown).toContain('- Target: wiki/taxonomy/engineering.md');
      expect(result.details.resultMarkdown).toContain('"kind": "taxonomy"');
      expect(result.details.data).toEqual({
        synthesisMode: 'deterministic',
        synthesisFallbackReason: null,
        draft: {
          targetPath: 'wiki/taxonomy/engineering.md',
          upsertArguments: {
            kind: 'taxonomy',
            slug: 'engineering',
            title: 'Engineering',
            summary: 'Shared engineering taxonomy.',
            status: 'active',
            updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            body: '# Engineering\n\nShared engineering taxonomy.',
            rationale: 'prepare a durable taxonomy draft',
            source_refs: ['raw/accepted/design.md'],
            outgoing_links: ['wiki/topics/llm-wiki.md'],
            aliases: ['Patch Strategy'],
            tags: ['patch-first']
          }
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
