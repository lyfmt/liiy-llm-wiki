# Graph Agent Write Path（Topic 首写切片）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**状态：** 已被替代（2026-04-20）

**替代计划：** [2026-04-20-source-grounded-wiki-ingest.md](./2026-04-20-source-grounded-wiki-ingest.md)

**目标：** 让 agent 能通过受治理的 runtime 工具，把一个新的 `topic` 及其直接图谱邻域写入 PostgreSQL graph，并立即被现有 `topic graph read` 链路读出来。

**架构：** 本计划只做 `graph-agent-write-path` 的第一条切片：围绕单个 `topic` root，引入结构化写入契约、PG 图谱持久化 helper、受治理的 flow 和 runtime tool。写入范围只覆盖当前 `topic` 读取链路已经消费的直接邻域：`taxonomy`、直接 `section`、直接 `entity`、`assertion -> evidence -> source`。这条切片的自动落库语义是 `create-first-write`：当 root topic 尚不存在时可直接写入；一旦 root topic 已存在，则 flow 只产出 review 结果，不做静默覆盖。现有 markdown page upsert、discovery、`section/entity` root 读取、graph 删除/回撤不在本计划内。

**技术栈：** TypeScript、Node.js、PostgreSQL、Vitest

---

**前置依赖：** 当前仓库已具备现有 `topic graph read` 链路，包括 `loadTopicGraphProjectionInput`、`buildGraphProjection`、`loadTopicGraphPage` 以及对应的 API / runtime topic 读取适配。

## 文件结构

- 创建：`src/domain/topic-graph-write.ts` — 定义 `topic` 首写切片的结构化写入契约与归一化规则。
- 创建：`test/domain/topic-graph-write.test.ts` — 锁定 topic root、taxonomy、section、entity、assertion、evidence、source 的输入约束。
- 修改：`src/index.ts` — 导出新的 graph write domain API。
- 修改：`test/domain/index-exports-new.test.ts` — 扩展 domain 导出覆盖。
- 创建：`src/storage/save-topic-graph-write.ts` — 把合法的 topic graph write set 映射为 graph node / edge 并持久化到 PG。
- 创建：`test/storage/save-topic-graph-write.test.ts` — 用 fake graph client 锁定节点、边的 upsert 序列。
- 创建：`src/flows/graph/run-upsert-topic-graph-flow.ts` — 受治理地执行单 topic graph 写入，并记录 run state / review gate。
- 创建：`test/flows/graph/run-upsert-topic-graph-flow.test.ts` — 锁定 flow 的 review、变更摘要与持久化行为。
- 创建：`src/runtime/tools/upsert-topic-graph.ts` — 暴露 agent 可调用的 graph-native topic 写入工具。
- 创建：`test/runtime/tools/upsert-topic-graph.test.ts` — 锁定 runtime tool 的参数、结果摘要与 evidence 结构。
- 修改：`src/runtime/tool-catalog.ts` — 注册新的 graph topic 写入工具。

## 范围说明

本计划只覆盖 graph-native 的 `topic` 首写路径。

本计划纳入范围：

- 单个 `topic` root 的 graph 写入
- `topic -> taxonomy`
- `section -> part_of -> topic`
- `topic -> mentions -> entity`
- `assertion -> about -> topic`
- `assertion -> supported_by -> evidence -> derived_from -> source`
- graph 写入后的 runtime 可调用入口

本计划固定以下治理规则，避免实现阶段自行发明默认值：

- `topic` root 明确传入 `status / confidence / provenance / review_state`
- 全部非 root node 与全部 edge 继承 root 的这 4 个治理字段
- `created_at / updated_at` 不由 tool 调用方逐项传入；由 flow 在单次运行里生成一个统一时间戳，并传给 storage helper
- `source.attributes.path`、`evidence.locator`、`evidence.excerpt` 必须显式传入，不做隐式推断
- 全部 `edge_id` 使用确定性模板生成，禁止运行时随机值：
  - `edge:belongs_to_taxonomy:<from_id>-><to_id>`
  - `edge:part_of:<from_id>-><to_id>`
  - `edge:mentions:<from_id>-><to_id>`
  - `edge:about:<from_id>-><to_id>`
  - `edge:supported_by:<from_id>-><to_id>`
  - `edge:derived_from:<from_id>-><to_id>`
- review gate 命中条件在本计划中固定为：目标 `topic:<slug>` root 已存在于 graph 中。命中后只记录 run state / review task，不执行 graph 写入。
- 共享节点一致性规则在本计划中固定为：
  - `taxonomy`、`entity`、`source`、`evidence` 允许复用既有 ID，但写入前必须先读取 graph 中同 ID 节点并比较核心字段；若一致则视为 `idempotent no-op`，跳过该节点与共享边的写入，不覆盖既有治理字段和时间戳；若不一致则直接 reject
  - `section`、`assertion` 在本切片中不允许复用既有 ID；若 graph 中已存在同 ID，直接 reject

本计划明确不覆盖：

- `section` / `entity` / `source` 作为独立 graph root 的写入流
- graph 关系删除、回撤、差量同步
- discovery / taxonomy 浏览页改造
- 自动从 raw source 抽取 assertion/evidence
- markdown page 写回彻底退役

### 任务 1：定义 topic graph write 契约

**文件：**
- 创建：`src/domain/topic-graph-write.ts`
- 创建：`test/domain/topic-graph-write.test.ts`
- 修改：`src/index.ts`
- 修改：`test/domain/index-exports-new.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/domain/topic-graph-write.test.ts` 中新增覆盖：

```ts
import { describe, expect, it } from 'vitest';

import { createTopicGraphWrite } from '../../src/domain/topic-graph-write.js';

describe('createTopicGraphWrite', () => {
  it('normalizes a valid topic graph write payload', () => {
    const write = createTopicGraphWrite({
      slug: 'patch-first',
      topic: {
        title: 'Patch First',
        summary: 'Patch-first summary.',
        aliases: ['Patching First'],
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed'
      },
      taxonomy: [{ id: 'taxonomy:engineering', title: 'Engineering' }],
      sections: [{ id: 'section:patch-first-overview', title: 'Patch First Overview' }],
      entities: [{ id: 'entity:graph-reader', title: 'Graph Reader' }],
      assertions: [
        {
          id: 'assertion:patch-first-stability',
          title: 'Patch First Stability',
          statement: 'Patch-first updates keep the reading path stable.',
          evidence: [
            {
              id: 'evidence:patch-first-spec',
              title: 'Patch First spec excerpt',
              locator: 'patch-first-spec.md#stable',
              excerpt: 'Patch-first updates keep the reading path stable.',
              source: {
                id: 'source:patch-first-spec',
                title: 'Patch First Spec',
                path: 'raw/accepted/patch-first-spec.md'
              }
            }
          ]
        }
      ]
    });

    expect(write.topic.id).toBe('topic:patch-first');
    expect(write.topic.summary).toBe('Patch-first summary.');
    expect(write.topic.aliases).toEqual(['Patching First']);
    expect(write.assertions[0]?.about_id).toBe('topic:patch-first');
    expect(write.assertions[0]?.statement).toBe('Patch-first updates keep the reading path stable.');
    expect(write.assertions[0]?.evidence[0]?.source.path).toBe('raw/accepted/patch-first-spec.md');
    expect(write.governance.provenance).toBe('human-edited');
  });

  it('rejects duplicate direct-neighbor ids', () => {
    expect(() =>
      createTopicGraphWrite({
        slug: 'patch-first',
        topic: {
          title: 'Patch First',
          status: 'active',
          confidence: 'asserted',
          provenance: 'human-edited',
          review_state: 'reviewed'
        },
        taxonomy: [],
        sections: [
          { id: 'section:duplicate', title: 'One' },
          { id: 'section:duplicate', title: 'Two' }
        ],
        entities: [],
        assertions: []
      })
    ).toThrow('Duplicate section id: section:duplicate');
  });

  it('rejects evidence sources without a raw path', () => {
    expect(() =>
      createTopicGraphWrite({
        slug: 'patch-first',
        topic: {
          title: 'Patch First',
          status: 'active',
          confidence: 'asserted',
          provenance: 'human-edited',
          review_state: 'reviewed'
        },
        taxonomy: [],
        sections: [],
        entities: [],
        assertions: [
          {
            id: 'assertion:a',
            title: 'A',
            statement: 'A',
            evidence: [
              {
                id: 'evidence:a',
                title: 'Evidence A',
                locator: 'a#1',
                excerpt: 'A',
                source: {
                  id: 'source:a',
                  title: 'Source A',
                  path: ''
                }
              }
            ]
          }
        ]
      })
    ).toThrow('Evidence sources require a non-empty path');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/domain/topic-graph-write.test.ts test/domain/index-exports-new.test.ts`

预期：FAIL，模块不存在或导出缺失。

- [ ] **步骤 3：编写最少实现代码**

在 `src/domain/topic-graph-write.ts` 中实现：

- `createTopicGraphWrite(input)`
- root topic id 固定归一化为 `topic:${slug}`
- assertion 的 `about_id` 固定归一化到 root topic
- direct taxonomy / section / entity / assertion id 唯一性校验
- evidence source 必须包含非空 `path`
- 归一化产出统一的 `governance` 字段，供 storage / flow 复用
- 明确保留 `topic.title / topic.summary / topic.aliases / assertion.statement` 这些现有读取链路已经消费的核心字段

导出建议至少包含：

```ts
export interface TopicGraphWrite { ... }
export function createTopicGraphWrite(input: CreateTopicGraphWriteInput): TopicGraphWrite
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/domain/topic-graph-write.test.ts test/domain/index-exports-new.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/topic-graph-write.ts test/domain/topic-graph-write.test.ts src/index.ts test/domain/index-exports-new.test.ts
git commit -m "feat(graph): define topic graph write contract"
```

### 任务 2：把 topic graph write set 持久化到 PG

**文件：**
- 创建：`src/storage/save-topic-graph-write.ts`
- 创建：`test/storage/save-topic-graph-write.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/storage/save-topic-graph-write.test.ts` 中用 fake `GraphDatabaseClient` 锁定：

- root topic node 会被保存
- taxonomy / section / entity / assertion / evidence / source node 会被保存
- 生成并保存如下 typed edges：
  - `belongs_to_taxonomy`
  - `part_of`
  - `mentions`
  - `about`
  - `supported_by`
  - `derived_from`
- 同一个 source 被多个 evidence 引用时只 upsert 一次 source node
- 同一份写入结果可以立刻被现有 `topic graph read` 邻域加载器读回
- 复用同一 `evidence/source` id 但字段内容不一致时直接 reject，而不是隐式覆盖
- 对 graph 中已存在的 `taxonomy/entity/source/evidence` 节点执行写前一致性校验，不一致则 reject
- 对 graph 中已存在的 `section/assertion` 节点直接 reject
- 对 graph 中已存在且内容一致的共享节点/共享边执行 `idempotent no-op`，不得覆盖既有 `status/confidence/provenance/review_state/updated_at`

至少断言：

```ts
expect(savedNodeIds).toEqual(
  expect.arrayContaining([
    'topic:patch-first',
    'taxonomy:engineering',
    'section:patch-first-overview',
    'entity:graph-reader',
    'assertion:patch-first-stability',
    'evidence:patch-first-spec',
    'source:patch-first-spec'
  ])
);
expect(savedEdgeTypes).toEqual(
  expect.arrayContaining([
    'belongs_to_taxonomy',
    'part_of',
    'mentions',
    'about',
    'supported_by',
    'derived_from'
  ])
);

const graphInput = await loadTopicGraphProjectionInput(client, 'patch-first');
const projection = buildGraphProjection(graphInput!);

expect(projection.taxonomy[0]?.id).toBe('taxonomy:engineering');
expect(projection.sections[0]?.id).toBe('section:patch-first-overview');
expect(projection.entities[0]?.id).toBe('entity:graph-reader');
expect(projection.assertions[0]?.node.id).toBe('assertion:patch-first-stability');
expect(projection.root.summary).toBe('Patch-first summary.');
expect(projection.root.aliases).toEqual(['Patching First']);
expect(projection.assertions[0]?.node.attributes.statement).toBe('Patch-first updates keep the reading path stable.');
expect(projection.evidence[0]?.source?.attributes.path).toBe('raw/accepted/patch-first-spec.md');

await expect(
  saveTopicGraphWrite(client, conflictingWrite, '2026-04-20T00:00:00.000Z')
).rejects.toThrow('Conflicting existing entity node: entity:graph-reader');

const unchangedSharedNode = await loadGraphNode(client, 'entity:graph-reader');
expect(unchangedSharedNode?.updated_at).toBe('2026-04-19T00:00:00.000Z');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/save-topic-graph-write.test.ts`

预期：FAIL，模块缺失。

- [ ] **步骤 3：编写最少实现代码**

在 `src/storage/save-topic-graph-write.ts` 中实现最小 helper：

- `saveTopicGraphWrite(client, write, timestamp?)`
- 依赖现有 `saveGraphNode`、`saveGraphEdge`
- 把 `TopicGraphWrite` 映射为 `GraphNode` / `GraphEdge`
- 对共享 source / evidence 做最小去重
- 非 root node 和全部 edge 继承 `write.governance`
- 全量复用单个 `timestamp`
- 复用同一 `evidence/source` id 时先比较内容，一旦冲突立即抛错
- 依照本计划固定模板生成稳定 `edge_id`
- 对 graph 中已存在的 `taxonomy/entity/source/evidence` 先调用 `loadGraphNode` 做一致性比对
- 若 `section/assertion` 在 graph 中已存在同 ID，则直接抛错，避免跨 topic 静默重写局部节点
- 对 graph 中已存在且内容一致的共享节点与共享 `derived_from` 边，直接跳过写入，视为 `idempotent no-op`

要求：

- 不扫描全图
- 不做删除或关系回撤
- 仅 upsert 本次 payload 内显式给出的对象与关系
- source node 的 `attributes.path` 必须保留，供后续 topic projection 合成 `source_refs`

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/save-topic-graph-write.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/storage/save-topic-graph-write.ts test/storage/save-topic-graph-write.test.ts
git commit -m "feat(graph): persist topic graph write set"
```

### 任务 3：暴露受治理的 topic graph 写入 flow

**文件：**
- 创建：`src/flows/graph/run-upsert-topic-graph-flow.ts`
- 创建：`test/flows/graph/run-upsert-topic-graph-flow.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/flows/graph/run-upsert-topic-graph-flow.test.ts` 中补以下场景：

- 给定合法 write set，flow 会调用 `saveTopicGraphWrite`
- flow 会产出 `changeSet`
- `changeSet.target_files` 至少包含逻辑 topic 目标：`wiki/topics/patch-first.md`
- `request_run` / `result_summary` 会记录 graph upsert 已完成
- run state 会真实落盘
- review task 同步逻辑会被执行
- 当 graph 中已存在 `topic:patch-first` 时，review gate 必须命中且 flow 不得提前落库
- 当 storage helper 以“业务冲突”拒绝写入时，flow 不直接裸抛异常，而是落成 `needs_review` 的 run state 并同步 review task

至少断言：

```ts
expect(result.changeSet.target_files).toEqual(['wiki/topics/patch-first.md']);
expect(result.review.needs_review).toBe(false);
expect(result.persisted).toEqual(['graph:topic:patch-first']);

const savedRunState = await loadRequestRunState(root, 'graph-upsert-001');
expect(savedRunState.request_run.result_summary).toBe('topic graph upsert applied');
expect(syncReviewTaskSpy).toHaveBeenCalled();

expect(reviewResult.review.needs_review).toBe(true);
expect(reviewResult.review.reasons).toEqual(['rewrites a core topic page']);
expect(reviewResult.persisted).toEqual([]);
expect(saveTopicGraphWriteSpy).not.toHaveBeenCalled();

expect(conflictResult.review.needs_review).toBe(true);
expect(conflictResult.review.reasons).toEqual(['conflicts with existing shared graph object']);
expect(conflictResult.persisted).toEqual([]);
const conflictRunState = await loadRequestRunState(root, 'graph-upsert-conflict-001');
expect(conflictRunState.request_run.status).toBe('needs_review');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/flows/graph/run-upsert-topic-graph-flow.test.ts`

预期：FAIL，flow 尚不存在。

- [ ] **步骤 3：编写最少实现代码**

在 `src/flows/graph/run-upsert-topic-graph-flow.ts` 中实现：

- 解析 `GRAPH_DATABASE_URL`
- 创建 graph pool
- 产出受治理的 `changeSet` / `review`
- 先用 `loadGraphNode(client, topicId)` 检查 root topic 是否已存在
- 若 root 已存在，则设置 `signals.rewritesCoreTopic = true`
- 先计算 `changeSet` / `review`
- 只有 `review.needs_review === false` 时才调用 `saveTopicGraphWrite`
- 若 `saveTopicGraphWrite` 返回明确的业务冲突错误，则把它转换为 `changeSet.needs_review = true`，理由固定为 `conflicts with existing shared graph object`
- 记录 run state
- 调用 `syncReviewTask`

要求：

- 本计划的逻辑 target 只允许单 topic
- `persisted` 用逻辑标识表示 graph 已写入，例如 `graph:topic:<slug>`
- 不改现有 markdown page flow

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/flows/graph/run-upsert-topic-graph-flow.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/graph/run-upsert-topic-graph-flow.ts test/flows/graph/run-upsert-topic-graph-flow.test.ts
git commit -m "feat(flow): add governed topic graph upsert flow"
```

### 任务 4：给 agent 暴露 topic graph 写入工具

**文件：**
- 创建：`src/runtime/tools/upsert-topic-graph.ts`
- 创建：`test/runtime/tools/upsert-topic-graph.test.ts`
- 修改：`src/runtime/tool-catalog.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/runtime/tools/upsert-topic-graph.test.ts` 中新增覆盖：

- tool 会把结构化 payload 传给 `runUpsertTopicGraphFlow`
- tool summary 为 graph upsert 结果
- tool evidence 至少包含逻辑 topic 路径和 raw source path
- 当 flow 成功后，结果 markdown 可让 agent 清楚知道写入了哪个 topic
- 当 flow 返回业务冲突的 `needs_review` 结果时，tool 要把冲突原因稳定暴露给 agent

至少断言：

```ts
expect(result.details.summary).toBe('topic graph upsert completed');
expect(result.details.evidence).toContain('wiki/topics/patch-first.md');
expect(result.details.evidence).toContain('raw/accepted/patch-first-spec.md');
expect(result.details.resultMarkdown).toContain('Target topic: wiki/topics/patch-first.md');

expect(conflictResult.details.summary).toBe('topic graph upsert requires review');
expect(conflictResult.details.resultMarkdown).toContain('Queued for review: conflicts with existing shared graph object');
```

同时在 `src/runtime/tool-catalog.ts` 对应测试或静态断言中锁定新工具已注册。

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/runtime/tools/upsert-topic-graph.test.ts`

预期：FAIL，tool 尚不存在或未注册。

- [ ] **步骤 3：编写最少实现代码**

在 `src/runtime/tools/upsert-topic-graph.ts` 中实现：

- 结构化参数直接复用 `TopicGraphWrite` 输入形状
- 调用 `runUpsertTopicGraphFlow`
- 输出简洁稳定的 result markdown

在 `src/runtime/tool-catalog.ts` 中注册：

```ts
upsert_topic_graph: createUpsertTopicGraphTool(runtimeContext)
```

要求：

- 这是 graph-native 写入入口，不回写 markdown page
- 这是 `create-first-write` 入口；目标 topic 已存在时返回 review 结果，不做静默覆盖
- 结果里明确提示：现有 `topic graph read` 链路应可立即读取这批 graph 数据

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/runtime/tools/upsert-topic-graph.test.ts`

预期：PASS。

- [ ] **步骤 5：运行本计划的整体验证**

运行：

```bash
npx vitest run test/domain/topic-graph-write.test.ts test/storage/save-topic-graph-write.test.ts test/flows/graph/run-upsert-topic-graph-flow.test.ts test/runtime/tools/upsert-topic-graph.test.ts
npm run typecheck
npm run lint
```

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add src/runtime/tools/upsert-topic-graph.ts test/runtime/tools/upsert-topic-graph.test.ts src/runtime/tool-catalog.ts
git commit -m "feat(runtime): expose topic graph upsert tool"
```

## 完成定义

满足以下条件时，本计划算完成：

- agent 可以通过 runtime tool 把单个 `topic` 及其直接邻域写入 graph
- 写入后无需新增 markdown page，即可被现有 `topic graph read` 邻域加载器 / projection 读到
- 写入流程有 run state、changeSet 与 review gate 记录
- 本计划范围内不引入 graph 删除或多 root 批量同步语义
