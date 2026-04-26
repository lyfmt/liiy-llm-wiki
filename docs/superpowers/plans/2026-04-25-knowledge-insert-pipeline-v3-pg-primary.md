# Knowledge Insert Pipeline V3（PG 主存储）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将知识插入从旧的自由调用式 `knowledge-insert` skill 改造为系统主导的 pipeline；PG graph 继续作为 durable 主存储，wiki/file artifacts 作为可读投影和审计材料。

**架构：** 新增 `knowledge-insert-pipeline` 编排层，负责 source 上传、内容准备、topic 规划、part 规划、part 切分、part 抽取、知识连接、PG graph 写入、wiki 投影写回。pipeline 中的 agent 不加载 skill、不拥有通用 runtime tools，只在指定 stage 根据输入和 example 返回 JSON schema；系统做 schema 校验、artifact 落盘、PG 写入和状态推进。

**技术栈：** TypeScript、Node.js、Vitest、PostgreSQL graph store、现有 runtime Agent/model 适配、governed wiki markdown、state artifacts

---

## 基线与约束

- PG graph 继续是主存储；文件系统不取代 PG，只保存 raw source、pipeline artifacts、wiki reading projection。
- 旧 `.agents/skills/knowledge-insert/SKILL.md` 废弃为触发入口说明，不再允许 skill agent 自由调度工具链。
- pipeline agent 不是 skill agent，不通过 `run_skill` 运行，不读取 `SKILL.md`，不暴露 `read_wiki_page`、`write_artifact`、`upsert_knowledge_insert_graph` 等工具。
- example 优先于抽象提示：每个 agent stage 必须附带一份合格 JSON example，并用同一 schema 校验 example 和真实输出。
- 允许保留旧 V2 工具供兼容测试，但 V3 pipeline 不依赖 `section.topicHints -> resolve_source_topics` 这条自由链路。
- 当前工作区已有大量未提交 V2 改动；执行本计划时不要重置或覆盖用户已有改动。

## 文件结构

- 创建：`src/domain/knowledge-insert-pipeline.ts` — V3 pipeline artifact/domain 类型、schema version、stage name、状态类型。
- 创建：`test/domain/knowledge-insert-pipeline.test.ts`
- 修改：`src/domain/graph-node.ts` — 新增 `concept` 节点类型。
- 修改：`src/domain/graph-edge.ts` — 允许 `mentions/about` 连接 `concept`。
- 修改：`test/domain/graph-node.test.ts`
- 修改：`test/domain/graph-edge.test.ts`
- 修改：`src/domain/knowledge-insert-graph-write.ts` — 支持 V3 `concepts`、V3 section/evidence shape，并继续输出 PG graph write。
- 修改：`test/domain/knowledge-insert-graph-write.test.ts`
- 创建：`src/flows/knowledge-insert/pipeline-artifacts.ts` — pipeline artifact 路径与读写 helper。
- 创建：`src/flows/knowledge-insert/pipeline-schema.ts` — 无副作用 JSON 校验/normalize。
- 创建：`src/flows/knowledge-insert/pipeline-agent-stage.ts` — 受限 agent stage runner。
- 创建：`src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts` — V3 主编排器。
- 创建：`src/flows/knowledge-insert/index.ts`
- 创建：`test/flows/knowledge-insert/pipeline-artifacts.test.ts`
- 创建：`test/flows/knowledge-insert/pipeline-schema.test.ts`
- 创建：`test/flows/knowledge-insert/pipeline-agent-stage.test.ts`
- 创建：`test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts`
- 创建：`docs/superpowers/specs/examples/knowledge-insert-v3-topic-plan.example.json`
- 创建：`docs/superpowers/specs/examples/knowledge-insert-v3-partition-plan.example.json`
- 创建：`docs/superpowers/specs/examples/knowledge-insert-v3-part-extraction.example.json`
- 创建：`docs/superpowers/specs/examples/knowledge-insert-v3-connected-knowledge.example.json`
- 修改：`src/runtime/tool-catalog.ts` — 新增唯一 chat 可触发工具 `start_knowledge_insert_pipeline`，不暴露内部 stage 工具。
- 创建：`src/runtime/tools/start-knowledge-insert-pipeline.ts`
- 创建：`test/runtime/tools/start-knowledge-insert-pipeline.test.ts`
- 修改：`src/app/api/route-context.ts` — 注入 pipeline launcher dependency。
- 修改：`src/app/web-server-dependencies.ts`
- 修改：`src/app/api/routes/chat.ts` — 上传入口可自动触发 pipeline。
- 修改：`src/app/api/dto/chat.ts`
- 修改：`src/app/api/mappers/chat.ts`
- 修改：`src/app/api/services/command.ts`
- 修改：`web/src/lib/api.ts`
- 修改：`web/src/lib/types.ts`
- 修改：`web/src/features/ai-chat/pages/ai-chat-page.tsx`
- 修改：`.agents/skills/knowledge-insert/SKILL.md` — 改为 deprecated shim，只允许调用 `start_knowledge_insert_pipeline`。
- 修改：`test/runtime/tools/run-skill.test.ts`
- 修改：`test/runtime/agent-session.test.ts`
- 修改：`src/storage/load-topic-graph-projection.ts` — 投影支持 concept。
- 修改：`src/storage/graph-projection-store.ts`
- 修改：`src/storage/load-topic-graph-page.ts`
- 修改：`test/storage/load-topic-graph-projection.test.ts`
- 修改：`test/storage/graph-projection-store.test.ts`
- 修改：`test/storage/load-topic-graph-page.test.ts`

## V3 Artifact 契约

所有主流程 artifact 放在：

`state/artifacts/knowledge-insert-pipeline/<run-id>/`

必备 artifacts：

- `source-resource.json` — source manifest + canonical markdown + line index。
- `topic-plan.json` — agent 输出的大范围 topic plan。
- `partition-plan.json` — agent 输出的行范围 part plan。
- `parts.json` — 系统按 `partition-plan` 切出的原文 part。
- `part-extractions/<part-id>.json` — 每个 part 的 agent 抽取结果。
- `connected-knowledge.json` — 系统连接后的 topic/section/entity/concept/evidence/edge 集合。
- `graph-write.json` — 可写入 PG 的 graph nodes/edges。
- `pipeline-state.json` — 当前 stage、状态、错误、重试、产物路径。

## Pipeline 状态

V3 stage 顺序固定：

1. `source.uploaded`
2. `source.prepared`
3. `topics.planned`
4. `parts.planned`
5. `parts.materialized`
6. `parts.extracted`
7. `knowledge.connected`
8. `graph.prepared`
9. `graph.written`
10. `wiki.projected`
11. `lint.completed`

失败策略：

- schema 失败：最多重试 agent stage 2 次，仍失败则 `failed_schema_validation`。
- part 范围非法：不重试抽取，直接 `failed_invalid_partition_plan`。
- PG 冲突：进入 `needs_review`，不得继续 wiki projection。
- wiki projection 失败：PG 已写入则保留 `graph.written`，记录 projection failure，可重试 projection。

## 任务 1：定义 V3 domain 与 example fixtures

**文件：**

- 创建：`src/domain/knowledge-insert-pipeline.ts`
- 创建：`test/domain/knowledge-insert-pipeline.test.ts`
- 创建：`docs/superpowers/specs/examples/knowledge-insert-v3-topic-plan.example.json`
- 创建：`docs/superpowers/specs/examples/knowledge-insert-v3-partition-plan.example.json`
- 创建：`docs/superpowers/specs/examples/knowledge-insert-v3-part-extraction.example.json`
- 创建：`docs/superpowers/specs/examples/knowledge-insert-v3-connected-knowledge.example.json`

- [ ] **步骤 1：编写失败的测试**

在 `test/domain/knowledge-insert-pipeline.test.ts` 添加：

```ts
import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION,
  assertKnowledgeInsertStageName,
  createKnowledgeInsertPipelineState
} from '../../src/domain/knowledge-insert-pipeline.js';

describe('knowledge insert pipeline domain', () => {
  it('creates a durable PG-primary pipeline state', () => {
    const state = createKnowledgeInsertPipelineState({
      runId: 'run-001',
      sourceId: 'src-001',
      storageMode: 'pg-primary',
      currentStage: 'source.uploaded',
      status: 'running',
      artifacts: {}
    });

    expect(state.schemaVersion).toBe(KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION);
    expect(state.storageMode).toBe('pg-primary');
    expect(state.currentStage).toBe('source.uploaded');
  });

  it('rejects unknown pipeline stages', () => {
    expect(() => assertKnowledgeInsertStageName('agent.freeform')).toThrow('Invalid knowledge insert pipeline stage');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/domain/knowledge-insert-pipeline.test.ts
```

预期：FAIL，domain 文件不存在。

- [ ] **步骤 3：编写最少实现代码**

在 `src/domain/knowledge-insert-pipeline.ts` 实现：

```ts
export const KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION = 'knowledge-insert.pipeline.v3';

export const knowledgeInsertStageNames = [
  'source.uploaded',
  'source.prepared',
  'topics.planned',
  'parts.planned',
  'parts.materialized',
  'parts.extracted',
  'knowledge.connected',
  'graph.prepared',
  'graph.written',
  'wiki.projected',
  'lint.completed'
] as const;

export type KnowledgeInsertStageName = (typeof knowledgeInsertStageNames)[number];
export type KnowledgeInsertPipelineStatus = 'running' | 'needs_review' | 'done' | 'failed';
export type KnowledgeInsertPipelineStorageMode = 'pg-primary';

export interface KnowledgeInsertPipelineState {
  schemaVersion: typeof KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION;
  runId: string;
  sourceId: string;
  storageMode: KnowledgeInsertPipelineStorageMode;
  currentStage: KnowledgeInsertStageName;
  status: KnowledgeInsertPipelineStatus;
  artifacts: Record<string, string>;
  errors: string[];
}

export function assertKnowledgeInsertStageName(value: string): asserts value is KnowledgeInsertStageName {
  if (!knowledgeInsertStageNames.includes(value as KnowledgeInsertStageName)) {
    throw new Error(`Invalid knowledge insert pipeline stage: ${value}`);
  }
}

export function createKnowledgeInsertPipelineState(
  input: Omit<KnowledgeInsertPipelineState, 'schemaVersion' | 'errors'> & { errors?: string[] }
): KnowledgeInsertPipelineState {
  assertKnowledgeInsertStageName(input.currentStage);

  return {
    schemaVersion: KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION,
    runId: input.runId,
    sourceId: input.sourceId,
    storageMode: input.storageMode,
    currentStage: input.currentStage,
    status: input.status,
    artifacts: { ...input.artifacts },
    errors: [...(input.errors ?? [])]
  };
}
```

Create example JSON files with valid minimal payloads:

```json
{
  "schemaVersion": "knowledge-insert.topic-plan.v3",
  "sourceId": "src-java-threading",
  "topics": [
    {
      "topicId": "topic-java-thread-context",
      "slug": "java-thread-context",
      "title": "Java 线程上下文传播",
      "scope": "Java 并发中线程局部上下文的创建、继承和传播边界。",
      "rationale": "全文围绕 ThreadLocal/InheritableThreadLocal 的上下文保存与传递展开。"
    }
  ]
}
```

```json
{
  "schemaVersion": "knowledge-insert.partition-plan.v3",
  "sourceId": "src-java-threading",
  "parts": [
    {
      "partId": "part-001",
      "title": "InheritableThreadLocal 的继承式上下文传播",
      "startLine": 12,
      "endLine": 86,
      "topicIds": ["topic-java-thread-context"],
      "rationale": "这一段集中说明父线程到子线程的初始值继承。"
    }
  ]
}
```

```json
{
  "schemaVersion": "knowledge-insert.part-extraction.v3",
  "sourceId": "src-java-threading",
  "partId": "part-001",
  "sections": [
    {
      "sectionId": "section-part-001-001",
      "title": "InheritableThreadLocal 用于把父线程上下文传递给子线程",
      "body": "InheritableThreadLocal 是 ThreadLocal 的继承式变体。它解决的不是线程间任意共享数据，而是在创建子线程时，把父线程中已有的上下文复制到子线程初始上下文中。这个机制适合传递 traceId、租户信息、用户上下文等创建时确定的上下文，但不适合表达运行期持续同步。",
      "topicIds": ["topic-java-thread-context"],
      "entityIds": ["entity-inheritablethreadlocal", "entity-threadlocal"],
      "conceptIds": ["concept-thread-local-context-propagation"],
      "evidenceAnchorIds": ["evidence-part-001-001"]
    }
  ],
  "entities": [
    {
      "entityId": "entity-inheritablethreadlocal",
      "name": "InheritableThreadLocal",
      "summary": "Java 中支持父线程向子线程传递线程局部变量初始值的类。",
      "aliases": []
    }
  ],
  "concepts": [
    {
      "conceptId": "concept-thread-local-context-propagation",
      "name": "线程局部上下文传播",
      "summary": "在并发执行边界上传递上下文信息的机制。",
      "aliases": ["上下文传递", "Thread-local context propagation"]
    }
  ],
  "evidenceAnchors": [
    {
      "anchorId": "evidence-part-001-001",
      "locator": "raw/accepted/java-threading.md#L12-L36",
      "quote": "InheritableThreadLocal 可以在创建子线程时继承父线程中的变量副本。",
      "startLine": 12,
      "endLine": 36
    }
  ]
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/domain/knowledge-insert-pipeline.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/knowledge-insert-pipeline.ts test/domain/knowledge-insert-pipeline.test.ts docs/superpowers/specs/examples/knowledge-insert-v3-*.json
git commit -m "feat: define knowledge insert pipeline v3 contracts"
```

## 任务 2：让 PG graph 支持 concept 一等节点

**文件：**

- 修改：`src/domain/graph-node.ts`
- 修改：`src/domain/graph-edge.ts`
- 修改：`test/domain/graph-node.test.ts`
- 修改：`test/domain/graph-edge.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/domain/graph-node.test.ts` 添加：

```ts
import { createGraphNode } from '../../src/domain/graph-node.js';

it('creates concept nodes as first-class graph nodes', () => {
  const node = createGraphNode({
    id: 'concept:thread-local-context-propagation',
    kind: 'concept',
    title: '线程局部上下文传播',
    summary: '在并发执行边界上传递上下文信息的机制。',
    aliases: ['上下文传递'],
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-extracted',
    review_state: 'reviewed',
    attributes: { source_concept_id: 'concept-thread-local-context-propagation' },
    created_at: '2026-04-25T00:00:00.000Z',
    updated_at: '2026-04-25T00:00:00.000Z'
  });

  expect(node.kind).toBe('concept');
});
```

在 `test/domain/graph-edge.test.ts` 添加：

```ts
import { createGraphEdge } from '../../src/domain/graph-edge.js';

it('allows sections and assertions to connect to concepts', () => {
  expect(() =>
    createGraphEdge({
      edge_id: 'edge:mentions:section-1:concept-1',
      from_id: 'section:java-thread-context#1',
      from_kind: 'section',
      type: 'mentions',
      to_id: 'concept:thread-local-context-propagation',
      to_kind: 'concept',
      status: 'active',
      confidence: 'asserted',
      provenance: 'agent-synthesized',
      review_state: 'reviewed',
      created_at: '2026-04-25T00:00:00.000Z',
      updated_at: '2026-04-25T00:00:00.000Z'
    })
  ).not.toThrow();

  expect(() =>
    createGraphEdge({
      edge_id: 'edge:about:assertion-1:concept-1',
      from_id: 'assertion:context-propagation',
      from_kind: 'assertion',
      type: 'about',
      to_id: 'concept:thread-local-context-propagation',
      to_kind: 'concept',
      status: 'active',
      confidence: 'asserted',
      provenance: 'agent-synthesized',
      review_state: 'reviewed',
      created_at: '2026-04-25T00:00:00.000Z',
      updated_at: '2026-04-25T00:00:00.000Z'
    })
  ).not.toThrow();
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/domain/graph-node.test.ts test/domain/graph-edge.test.ts
```

预期：FAIL，`concept` 不是合法 node kind，edge validator 不允许连接 concept。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- `GraphNodeKind` 增加 `'concept'`。
- `about` edge target 允许 `topic/section/entity/concept`。
- `mentions` edge target 允许 `entity/concept`。
- 不改 PG schema；`kind text` 已可承载新类型。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/domain/graph-node.test.ts test/domain/graph-edge.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/graph-node.ts src/domain/graph-edge.ts test/domain/graph-node.test.ts test/domain/graph-edge.test.ts
git commit -m "feat: add concept graph node support"
```

## 任务 3：实现 pipeline schema 校验与 artifact 存储

**文件：**

- 创建：`src/flows/knowledge-insert/pipeline-schema.ts`
- 创建：`src/flows/knowledge-insert/pipeline-artifacts.ts`
- 创建：`src/flows/knowledge-insert/index.ts`
- 创建：`test/flows/knowledge-insert/pipeline-schema.test.ts`
- 创建：`test/flows/knowledge-insert/pipeline-artifacts.test.ts`

- [ ] **步骤 1：编写失败的测试**

`test/flows/knowledge-insert/pipeline-schema.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import {
  parsePartExtractionArtifact,
  parsePartitionPlanArtifact,
  parseTopicPlanArtifact
} from '../../../src/flows/knowledge-insert/pipeline-schema.js';

describe('knowledge insert pipeline schema', () => {
  it('parses valid topic, partition, and part extraction artifacts', () => {
    expect(parseTopicPlanArtifact({
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      sourceId: 'src-001',
      topics: [{ topicId: 'topic-a', slug: 'topic-a', title: 'Topic A', scope: 'Scope', rationale: 'Because' }]
    }).topics).toHaveLength(1);

    expect(parsePartitionPlanArtifact({
      schemaVersion: 'knowledge-insert.partition-plan.v3',
      sourceId: 'src-001',
      parts: [{ partId: 'part-001', title: 'Part', startLine: 1, endLine: 10, topicIds: ['topic-a'], rationale: 'Because' }]
    }).parts[0]?.startLine).toBe(1);

    expect(parsePartExtractionArtifact({
      schemaVersion: 'knowledge-insert.part-extraction.v3',
      sourceId: 'src-001',
      partId: 'part-001',
      sections: [],
      entities: [],
      concepts: [],
      evidenceAnchors: []
    }).partId).toBe('part-001');
  });

  it('rejects invalid line ranges and missing schema versions', () => {
    expect(() => parsePartitionPlanArtifact({
      schemaVersion: 'knowledge-insert.partition-plan.v3',
      sourceId: 'src-001',
      parts: [{ partId: 'part-001', title: 'Part', startLine: 10, endLine: 1, topicIds: [], rationale: 'Invalid' }]
    })).toThrow('Invalid partition part range');

    expect(() => parseTopicPlanArtifact({ sourceId: 'src-001', topics: [] })).toThrow('Invalid topic plan schemaVersion');
  });
});
```

`test/flows/knowledge-insert/pipeline-artifacts.test.ts`：

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildKnowledgeInsertPipelineArtifactPath,
  writeKnowledgeInsertPipelineArtifact
} from '../../../src/flows/knowledge-insert/pipeline-artifacts.js';

describe('knowledge insert pipeline artifacts', () => {
  it('writes artifacts under the pipeline run directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-pipeline-artifacts-'));

    try {
      const artifact = await writeKnowledgeInsertPipelineArtifact(root, 'run-001', 'topic-plan.json', { ok: true });

      expect(artifact.projectPath).toBe('state/artifacts/knowledge-insert-pipeline/run-001/topic-plan.json');
      expect(JSON.parse(await readFile(artifact.absolutePath, 'utf8'))).toEqual({ ok: true });
      expect(buildKnowledgeInsertPipelineArtifactPath(root, 'run-001', 'parts/part-001.json').projectPath)
        .toBe('state/artifacts/knowledge-insert-pipeline/run-001/parts/part-001.json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/flows/knowledge-insert/pipeline-schema.test.ts test/flows/knowledge-insert/pipeline-artifacts.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 校验函数只接受 plain JSON，不调用模型、不读写文件。
- artifact path 必须限制在 `state/artifacts/knowledge-insert-pipeline/<run-id>/` 下。
- 禁止 `..`、绝对路径、空路径。
- 输出格式稳定：`JSON.stringify(value, null, 2) + '\n'`。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/flows/knowledge-insert/pipeline-schema.test.ts test/flows/knowledge-insert/pipeline-artifacts.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/knowledge-insert/pipeline-schema.ts src/flows/knowledge-insert/pipeline-artifacts.ts src/flows/knowledge-insert/index.ts test/flows/knowledge-insert/pipeline-schema.test.ts test/flows/knowledge-insert/pipeline-artifacts.test.ts
git commit -m "feat: add knowledge insert pipeline schemas and artifacts"
```

## 任务 4：实现受限 pipeline agent stage runner

**文件：**

- 创建：`src/flows/knowledge-insert/pipeline-agent-stage.ts`
- 创建：`test/flows/knowledge-insert/pipeline-agent-stage.test.ts`

- [ ] **步骤 1：编写失败的测试**

新增测试，使用 fake stage model/synthesizer，不调用真实 LLM：

```ts
import { describe, expect, it } from 'vitest';

import { runPipelineJsonStage } from '../../../src/flows/knowledge-insert/pipeline-agent-stage.js';

describe('runPipelineJsonStage', () => {
  it('passes stage input, schema, and example to a restricted generator', async () => {
    const seenPrompts: string[] = [];
    const output = await runPipelineJsonStage({
      stage: 'topics.planned',
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      inputJson: { sourceId: 'src-001', markdown: '# A' },
      exampleJson: { schemaVersion: 'knowledge-insert.topic-plan.v3', sourceId: 'src-example', topics: [] },
      generate: async (prompt) => {
        seenPrompts.push(prompt);
        return JSON.stringify({
          schemaVersion: 'knowledge-insert.topic-plan.v3',
          sourceId: 'src-001',
          topics: [{ topicId: 'topic-a', slug: 'topic-a', title: 'Topic A', scope: 'Scope', rationale: 'Because' }]
        });
      }
    });

    expect(output.sourceId).toBe('src-001');
    expect(seenPrompts[0]).toContain('Do not call tools');
    expect(seenPrompts[0]).toContain('Example JSON');
  });

  it('rejects non-json stage output', async () => {
    await expect(runPipelineJsonStage({
      stage: 'topics.planned',
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      inputJson: {},
      exampleJson: {},
      generate: async () => 'not json'
    })).rejects.toThrow('Pipeline stage did not return valid JSON');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/flows/knowledge-insert/pipeline-agent-stage.test.ts
```

预期：FAIL，runner 不存在。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- `runPipelineJsonStage` 接收 `generate(prompt): Promise<string>`，便于测试和实际模型适配分离。
- prompt 明确：
  - agent 是 pipeline stage worker，不是 skill agent。
  - 不加载 skill。
  - 不调用工具。
  - 只返回 JSON。
  - example 优先。
- runner 只做 JSON parse；schema 由调用方传入 parser 或由编排器调用 `pipeline-schema`。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/flows/knowledge-insert/pipeline-agent-stage.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/knowledge-insert/pipeline-agent-stage.ts test/flows/knowledge-insert/pipeline-agent-stage.test.ts
git commit -m "feat: add restricted pipeline json stage runner"
```

## 任务 5：实现 source preparation 和 partition materialization

**文件：**

- 创建或修改：`src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts`
- 修改：`src/flows/knowledge-insert/pipeline-schema.ts`
- 创建：`test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts`

- [ ] **步骤 1：编写失败的测试**

新增一个不调用模型的 test，覆盖 source 准备和按行切分：

```ts
it('prepares source and materializes parts from a valid partition plan', async () => {
  const result = await runKnowledgeInsertPipeline(root, {
    runId: 'run-001',
    sourceId: 'src-001',
    stageGenerators: {
      'topics.planned': async () => JSON.stringify({
        schemaVersion: 'knowledge-insert.topic-plan.v3',
        sourceId: 'src-001',
        topics: [{ topicId: 'topic-a', slug: 'topic-a', title: 'Topic A', scope: 'Scope', rationale: 'Because' }]
      }),
      'parts.planned': async () => JSON.stringify({
        schemaVersion: 'knowledge-insert.partition-plan.v3',
        sourceId: 'src-001',
        parts: [{ partId: 'part-001', title: 'Intro', startLine: 1, endLine: 2, topicIds: ['topic-a'], rationale: 'Opening' }]
      }),
      'parts.extracted': async () => JSON.stringify({
        schemaVersion: 'knowledge-insert.part-extraction.v3',
        sourceId: 'src-001',
        partId: 'part-001',
        sections: [],
        entities: [],
        concepts: [],
        evidenceAnchors: []
      })
    },
    stopAfter: 'parts.materialized'
  });

  expect(result.artifacts.parts).toBe('state/artifacts/knowledge-insert-pipeline/run-001/parts.json');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：FAIL，pipeline 主流程不存在。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 读取 accepted source manifest。
- 读取 raw markdown，生成 line index。
- 调用 `topics.planned` generator 并校验 topic plan。
- 调用 `parts.planned` generator 并校验 partition plan。
- 系统按 `startLine/endLine` 切分，不让 agent 复制原文。
- `parts.json` 中每个 part 包含 `text`、`startLine`、`endLine`、`topicIds`。
- `stopAfter` 仅用于测试。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts src/flows/knowledge-insert/pipeline-schema.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
git commit -m "feat: materialize knowledge insert pipeline source parts"
```

## 任务 6：实现 part extraction 合并与 connected knowledge

**文件：**

- 修改：`src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts`
- 修改：`src/flows/knowledge-insert/pipeline-schema.ts`
- 修改：`test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts`

- [ ] **步骤 1：编写失败的测试**

新增测试，两个 part 中重复 entity/concept 应去重，section 保持稳定：

```ts
it('connects extracted sections to topics, entities, concepts, and evidence', async () => {
  const result = await runKnowledgeInsertPipeline(root, {
    runId: 'run-002',
    sourceId: 'src-001',
    stageGenerators: fakeTwoPartGenerators(),
    stopAfter: 'knowledge.connected'
  });

  const connected = JSON.parse(await readFile(path.join(root, result.artifacts.connectedKnowledge), 'utf8'));

  expect(connected.topics).toHaveLength(1);
  expect(connected.sections[0]).toEqual(expect.objectContaining({
    topicIds: ['topic-a'],
    conceptIds: ['concept-thread-local-context-propagation']
  }));
  expect(connected.concepts).toHaveLength(1);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：FAIL，connected knowledge 阶段未实现。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 对 `entities` 按 `entityId` 去重，冲突 title/summary 进入 `needs_review`。
- 对 `concepts` 按 `conceptId` 去重，冲突进入 `needs_review`。
- `sections` 不按 title 合并，按 agent 输出 `sectionId` 保留。
- 校验每个 section 的 `topicIds/entityIds/conceptIds/evidenceAnchorIds` 都能解析到对应对象。
- evidence anchor 必须包含 `locator/quote/startLine/endLine`。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts src/flows/knowledge-insert/pipeline-schema.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
git commit -m "feat: connect extracted knowledge insert pipeline artifacts"
```

## 任务 7：从 connected knowledge 生成 PG graph write

**文件：**

- 修改：`src/domain/knowledge-insert-graph-write.ts`
- 修改：`test/domain/knowledge-insert-graph-write.test.ts`
- 修改：`src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts`
- 修改：`test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 graph write test 中新增 V3 input：

```ts
it('builds graph nodes and edges from v3 connected knowledge with concepts', () => {
  const graphWrite = createKnowledgeInsertGraphWriteFromConnectedKnowledge(createSampleConnectedKnowledge());

  expect(graphWrite.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining(['topic', 'section', 'entity', 'concept', 'evidence', 'source']));
  expect(graphWrite.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ from_kind: 'section', type: 'mentions', to_kind: 'concept' }),
    expect.objectContaining({ from_kind: 'section', type: 'grounded_by', to_kind: 'evidence' }),
    expect.objectContaining({ from_kind: 'evidence', type: 'derived_from', to_kind: 'source' })
  ]));
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/domain/knowledge-insert-graph-write.test.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：FAIL，V3 graph write adapter 不存在。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 保留现有 V2 `createKnowledgeInsertGraphWrite`，新增 V3 adapter，例如 `createKnowledgeInsertGraphWriteFromConnectedKnowledge`。
- V3 topic id：`topic:<slug>`。
- V3 section id：优先使用 `section:<topicSlug>#<order>`，同时保留 `sectionIdMap` 映射 pipeline sectionId。
- V3 concept id：`concept:<slugified conceptId without concept- prefix>` 或直接 normalize 为 `concept:<stable-slug>`。
- `section -> concept` 使用 `mentions`。
- `topic -> concept` 可由 section 聚合补 `mentions`。
- `source -> concept` 可由所有 section 聚合补 `mentions`。
- evidence 继续 `evidence:<sourceId>#<order>`。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/domain/knowledge-insert-graph-write.test.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/knowledge-insert-graph-write.ts test/domain/knowledge-insert-graph-write.test.ts src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
git commit -m "feat: build pg graph writes from v3 connected knowledge"
```

## 任务 8：pipeline 写入 PG 并处理冲突状态

**文件：**

- 修改：`src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts`
- 修改：`src/storage/save-knowledge-insert-graph-write.ts`
- 修改：`test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts`
- 修改：`test/storage/save-knowledge-insert-graph-write.test.ts`

- [ ] **步骤 1：编写失败的测试**

新增测试：

```ts
it('writes graph as pg-primary before wiki projection', async () => {
  const result = await runKnowledgeInsertPipeline(root, {
    runId: 'run-003',
    sourceId: 'src-001',
    graphClient: fakeGraphClient,
    stageGenerators: fakeSuccessfulGenerators(),
    stopAfter: 'graph.written'
  });

  expect(result.state.storageMode).toBe('pg-primary');
  expect(fakeGraphClient.nodeUpserts.map((call) => call.id)).toEqual(expect.arrayContaining(['source:src-001']));
  expect(result.state.currentStage).toBe('graph.written');
});

it('marks needs_review on graph conflicts and does not project wiki', async () => {
  const result = await runKnowledgeInsertPipeline(root, {
    runId: 'run-004',
    sourceId: 'src-001',
    graphClient: conflictingGraphClient,
    stageGenerators: fakeSuccessfulGenerators()
  });

  expect(result.state.status).toBe('needs_review');
  expect(result.state.artifacts).not.toHaveProperty('wikiDrafts');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts test/storage/save-knowledge-insert-graph-write.test.ts
```

预期：FAIL，pipeline 未接入 PG write。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- `runKnowledgeInsertPipeline` 接收可注入 `graphClient`，测试不连真实 PG。
- 默认从 project env `GRAPH_DATABASE_URL` 获取 PG client。
- 调用 `saveKnowledgeInsertGraphWrite`。
- 成功后写 `pipeline-state.json` 为 `graph.written`。
- 捕获 `KnowledgeInsertGraphWriteConflictError`，写状态 `needs_review`，不继续 wiki projection。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts test/storage/save-knowledge-insert-graph-write.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts src/storage/save-knowledge-insert-graph-write.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts test/storage/save-knowledge-insert-graph-write.test.ts
git commit -m "feat: persist knowledge insert pipeline graph writes to pg"
```

## 任务 9：从 PG 主存储生成 wiki projection

**文件：**

- 修改：`src/storage/load-topic-graph-projection.ts`
- 修改：`src/storage/graph-projection-store.ts`
- 修改：`src/storage/load-topic-graph-page.ts`
- 修改：`test/storage/load-topic-graph-projection.test.ts`
- 修改：`test/storage/graph-projection-store.test.ts`
- 修改：`test/storage/load-topic-graph-page.test.ts`
- 修改：`src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts`
- 修改：`test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts`

- [ ] **步骤 1：编写失败的测试**

新增 projection 测试：

```ts
it('renders topic page projection from pg graph with concepts', async () => {
  const page = await loadTopicGraphPage(root, 'java-thread-context', fakeGraphClient);

  expect(page?.body).toContain('## Sections');
  expect(page?.body).toContain('InheritableThreadLocal 用于把父线程上下文传递给子线程');
  expect(page?.body).toContain('线程局部上下文传播');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts test/storage/load-topic-graph-page.test.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：FAIL，projection 未包含 concept 或 pipeline 未调用 projection。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- PG 仍是事实来源；wiki markdown 是 projection。
- topic projection 读取 graph 中 topic 的 sections、entities、concepts、evidence。
- 若 projection 成功，写 `wiki/topics/<slug>.md`。
- 不为 evidence 生成 markdown 页面。
- 是否为 concept 生成 `wiki/concepts` 暂不做；concept 先通过 topic projection 展示。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts test/storage/load-topic-graph-page.test.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/storage/load-topic-graph-projection.ts src/storage/graph-projection-store.ts src/storage/load-topic-graph-page.ts test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts test/storage/load-topic-graph-page.test.ts src/flows/knowledge-insert/run-knowledge-insert-pipeline.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
git commit -m "feat: project pipeline graph content into topic wiki pages"
```

## 任务 10：上传入口自动触发 pipeline

**文件：**

- 修改：`src/app/api/route-context.ts`
- 修改：`src/app/web-server-dependencies.ts`
- 修改：`src/app/api/routes/chat.ts`
- 修改：`src/app/api/dto/chat.ts`
- 修改：`src/app/api/mappers/chat.ts`
- 修改：`src/app/api/services/command.ts`
- 修改：`web/src/lib/api.ts`
- 修改：`web/src/lib/types.ts`
- 修改：`web/src/features/ai-chat/pages/ai-chat-page.tsx`
- 修改：`test/app/web-server.test.ts`
- 修改：`test/app/api-services.test.ts`

- [ ] **步骤 1：编写失败的测试**

新增 API 测试：

```ts
it('starts knowledge insert pipeline when upload requests auto processing', async () => {
  const calls: Array<{ attachmentId: string; sessionId: string }> = [];
  const server = createTestServer({
    runKnowledgeInsertPipelineFromAttachment: async (input) => {
      calls.push({ attachmentId: input.attachmentId, sessionId: input.sessionId });
      return { runId: 'pipeline-run-001', status: 'running' };
    }
  });

  const response = await postJson(server, '/api/chat/uploads', {
    fileName: 'note.md',
    mimeType: 'text/markdown',
    dataBase64: Buffer.from('# Note').toString('base64'),
    autoKnowledgeInsert: true
  });

  expect(response.pipeline_run_id).toBe('pipeline-run-001');
  expect(calls).toHaveLength(1);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/app/web-server.test.ts test/app/api-services.test.ts
```

预期：FAIL，上传 DTO 不支持 `autoKnowledgeInsert`，dependency 不存在。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 上传 payload 增加 `autoKnowledgeInsert?: boolean`。
- UI 初期可以默认 `false`，但文件上传功能入口设置为 `true`。
- 后端保存 buffered attachment 后，如果 `autoKnowledgeInsert` 为 true：
  - 创建 source manifest/raw source。
  - 调用 V3 pipeline launcher。
  - response 返回 `pipeline_run_id`、`pipeline_status`。
- 不阻塞 HTTP 等待完整 pipeline；只返回 accepted/running。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/app/web-server.test.ts test/app/api-services.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/app/api/route-context.ts src/app/web-server-dependencies.ts src/app/api/routes/chat.ts src/app/api/dto/chat.ts src/app/api/mappers/chat.ts src/app/api/services/command.ts web/src/lib/api.ts web/src/lib/types.ts web/src/features/ai-chat/pages/ai-chat-page.tsx test/app/web-server.test.ts test/app/api-services.test.ts
git commit -m "feat: start knowledge insert pipeline from uploads"
```

## 任务 11：chat agent 只触发 pipeline，不监管流程

**文件：**

- 创建：`src/runtime/tools/start-knowledge-insert-pipeline.ts`
- 创建：`test/runtime/tools/start-knowledge-insert-pipeline.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`
- 修改：`.agents/skills/knowledge-insert/SKILL.md`
- 修改：`test/runtime/tools/run-skill.test.ts`
- 修改：`test/runtime/agent-session.test.ts`

- [ ] **步骤 1：编写失败的测试**

新增 tool 测试：

```ts
it('starts the pg-primary pipeline for a chat attachment and returns run info only', async () => {
  const tool = createStartKnowledgeInsertPipelineTool(runtimeContext, {
    startFromAttachment: async (input) => ({
      runId: 'pipeline-run-001',
      sourceId: 'src-attachment-a',
      status: 'running',
      artifactsRoot: 'state/artifacts/knowledge-insert-pipeline/pipeline-run-001'
    })
  });

  const result = await tool.execute('tool-call-1', {
    attachmentId: 'attachment-a'
  });

  expect(result.details.toolName).toBe('start_knowledge_insert_pipeline');
  expect(result.details.summary).toContain('pipeline-run-001');
});
```

新增 skill 测试，断言 deprecated skill allowed tools 只含 `start_knowledge_insert_pipeline`。

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/runtime/tools/start-knowledge-insert-pipeline.test.ts test/runtime/tools/run-skill.test.ts test/runtime/agent-session.test.ts
```

预期：FAIL，tool 不存在，skill 仍暴露旧工具链。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- `start_knowledge_insert_pipeline` 是 chat agent 唯一触发入口。
- tool 只能接收 `attachmentId` 或 `sourceId`。
- tool 不接收 topic/section/entity/concept 内容，避免 agent 监管 pipeline。
- tool 返回 run id、source id、状态、artifact root。
- `.agents/skills/knowledge-insert/SKILL.md` 改为：
  - 标记 deprecated。
  - 说明旧自由流程已废弃。
  - `allowed-tools` 只保留 `start_knowledge_insert_pipeline`。
  - 指示 skill agent 不做审查、不读 artifact、不写 wiki。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/runtime/tools/start-knowledge-insert-pipeline.test.ts test/runtime/tools/run-skill.test.ts test/runtime/agent-session.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/runtime/tools/start-knowledge-insert-pipeline.ts test/runtime/tools/start-knowledge-insert-pipeline.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts .agents/skills/knowledge-insert/SKILL.md test/runtime/tools/run-skill.test.ts test/runtime/agent-session.test.ts
git commit -m "feat: route chat knowledge insert through pipeline launcher"
```

## 任务 12：端到端验证和旧链路隔离

**文件：**

- 修改：`test/runtime/live-llm-wiki-liiy.test.ts`
- 修改：`test/runtime/skills/discovery.test.ts`
- 修改：`test/runtime/tools/resolve-source-topics.test.ts`
- 修改：`test/runtime/tools/merge-section-candidates.test.ts`
- 修改：`src/runtime/tool-catalog.ts`

- [ ] **步骤 1：编写失败的测试**

新增 regression：

```ts
it('does not expose legacy knowledge insert internals to the main chat agent through the deprecated skill', async () => {
  const tools = buildRuntimeToolNamesForTest();

  expect(tools).toContain('start_knowledge_insert_pipeline');
  expect(skillAllowedTools('knowledge-insert')).toEqual(['start_knowledge_insert_pipeline']);
});
```

新增 pipeline e2e fake model test：

```ts
it('runs v3 pipeline from source to pg graph with fake json stage generators', async () => {
  const result = await runKnowledgeInsertPipeline(root, {
    runId: 'e2e-run-001',
    sourceId: 'src-001',
    graphClient: fakeGraphClient,
    stageGenerators: fakeSuccessfulGenerators()
  });

  expect(result.state.status).toBe('done');
  expect(result.state.currentStage).toBe('lint.completed');
  expect(fakeGraphClient.nodeUpserts.some((node) => node.kind === 'concept')).toBe(true);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/runtime/live-llm-wiki-liiy.test.ts test/runtime/skills/discovery.test.ts test/runtime/tools/resolve-source-topics.test.ts test/runtime/tools/merge-section-candidates.test.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：FAIL，旧链路仍可能暴露或 pipeline e2e 未完成。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 旧 V2 tools 可留在 catalog 供兼容，但不得由 `knowledge-insert` skill 暴露。
- 文档和测试明确 V3 pipeline 是新入口。
- `resolve_source_topics` 和 `merge_section_candidates` 只保留兼容测试，不参与 V3。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/runtime/live-llm-wiki-liiy.test.ts test/runtime/skills/discovery.test.ts test/runtime/tools/resolve-source-topics.test.ts test/runtime/tools/merge-section-candidates.test.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts
```

预期：PASS。

- [ ] **步骤 5：运行全量验证**

运行：

```bash
npm run typecheck
npm test
```

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add test/runtime/live-llm-wiki-liiy.test.ts test/runtime/skills/discovery.test.ts test/runtime/tools/resolve-source-topics.test.ts test/runtime/tools/merge-section-candidates.test.ts src/runtime/tool-catalog.ts
git commit -m "test: verify knowledge insert pipeline v3 isolation"
```

## 实施顺序建议

1. 先完成任务 1-4，建立 schema、example 和受限 agent stage 基础。
2. 再完成任务 5-8，让 pipeline 能在 fake generator 下从 source 写入 PG。
3. 再完成任务 9，让 wiki 成为 PG projection。
4. 最后完成任务 10-12，把上传入口和 chat skill 接入新 pipeline，并隔离旧自由链路。

## 不做事项

- 不把 PG 降级为缓存。
- 不让 pipeline agent 访问 wiki、PG、文件系统或旧 skill tools。
- 不让 topic 由 section hint 自动创建。
- 不在 V3 初期为每个 section/concept 强制创建 wiki markdown 页面。
- 不在本计划中实现人工 review UI 的大改版。

