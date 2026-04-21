# Source-grounded Wiki Ingest 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让一份 accepted source 进入系统后，不再只生成一个 `topic`，而是生成一个总览 `topic` 加一组贴源 `section`，并把每个 `section` 通过 `grounded_by -> evidence -> source` 留下可回跳的原文索引。

**架构：** 本计划只做第一条可用切片：围绕单个 accepted source，建立 source-grounded ingest 主线。保留现有 `source manifest/raw source` 与 `topic graph read` 兼容层，在 graph 内新增 `grounded_by`，把 `evidence` 作为 source anchor 使用。`topic` 只生成总览，`section` 才是主知识层。`entity/assertion` 抽取在本计划内只做最小挂点，不追求完整语义提炼。

**技术栈：** TypeScript、Node.js、PostgreSQL、Vitest

---

**前置依赖：** 当前仓库已具备 graph foundation 与 `topic graph read` 基础链路，包括 PG graph store、`buildGraphProjection`、`loadTopicGraphProjectionInput`、`loadTopicGraphPage` 以及相应 API/runtime topic 读取适配。

## 文件结构

- 修改：`src/domain/graph-edge.ts` — 增加 `grounded_by` typed relation 及约束。
- 修改：`test/domain/graph-edge.test.ts` — 锁定 `section -> grounded_by -> evidence` 的合法性。
- 创建：`src/domain/source-grounded-ingest.ts` — 定义 accepted source 经拆分后得到的 `topic / section / evidence anchor` 契约。
- 创建：`test/domain/source-grounded-ingest.test.ts` — 锁定 topic 总览、贴源 section、source anchor 的结构约束。
- 创建：`src/flows/ingest/extract-source-anchors.ts` — 从 raw source 提取有序 source anchors。
- 创建：`test/flows/ingest/extract-source-anchors.test.ts` — 锁定标题路径、顺序号与 locator 生成。
- 创建：`src/storage/save-source-grounded-ingest.ts` — 按契约把 topic、section、evidence、source 与关系写入 graph。
- 创建：`test/storage/save-source-grounded-ingest.test.ts` — 锁定 graph 写入结果与写前一致性校验。
- 创建：`src/flows/ingest/run-source-grounded-ingest-flow.ts` — 受治理地执行 accepted source 到 graph 的 section-first ingest。
- 创建：`test/flows/ingest/run-source-grounded-ingest-flow.test.ts` — 锁定 run state、review gate、coverage 摘要。
- 创建：`src/runtime/tools/ingest-source-to-graph.ts` — 暴露 agent 可调用的 source-grounded ingest 工具。
- 创建：`test/runtime/tools/ingest-source-to-graph.test.ts` — 锁定 runtime tool 行为与结果摘要。
- 修改：`src/runtime/tool-catalog.ts` — 注册新的 graph ingest 工具。
- 修改：`src/storage/load-topic-graph-projection.ts` — 扩展 topic 读取邻域，带出 `section -> grounded_by -> evidence -> source`。
- 修改：`src/storage/graph-projection-store.ts` — 在 projection 中补 section grounding summaries。
- 修改：`test/storage/load-topic-graph-projection.test.ts`
- 修改：`test/storage/graph-projection-store.test.ts`
- 修改：`src/app/api/dto/knowledge-page.ts` — 为 `topic` 阅读响应补 section grounding/source anchor 摘要。
- 修改：`src/app/api/mappers/knowledge-page.ts`
- 修改：`test/app/api/mappers/knowledge-page.test.ts`
- 修改：`test/app/web-server.test.ts`
- 修改：`web/src/lib/types.ts`
- 修改：`web/src/features/reading/components/reading-sidebar.tsx`

## 范围说明

本计划只覆盖一条 source-grounded ingest 主线：

- accepted source -> ordered evidence anchors
- accepted source -> topic overview
- accepted source -> source-grounded sections
- topic read 能看到 section 的贴源索引

本计划固定以下确定性规则：

- `topic.slug = source-<sourceId>`
- `topic.id = topic:<topic.slug>`
- `section.id = section:<topic.slug>#<section-order>`
- `evidence.id = evidence:<sourceId>#<anchor-order>`
- `section.order_key = min(grounded anchors.order)`

本计划固定以下重复 ingest 语义：

- 同一 source 再次 ingest 且结果内容一致时，视为 `idempotent no-op`
- `topic/section` 已存在且核心内容不同，进入 `needs_review`
- 不做静默覆盖

本计划固定以下 coverage 规则：

- 未覆盖 anchor = 提取出的 `evidence` 中，没有被任何 section 通过 `grounded_by` 引用的 anchor
- 第一阶段 coverage 只要求落入 run state summary，不要求单独的数据表

本计划明确不覆盖：

- 完整的 `entity/assertion` 高质量抽取
- `section/entity/source` 独立成熟 graph root 阅读页
- 复杂回撤、删除、差量同步
- coverage 后台治理面板

### 任务 1：扩展图谱关系与 ingest 契约

**文件：**
- 修改：`src/domain/graph-edge.ts`
- 修改：`test/domain/graph-edge.test.ts`
- 创建：`src/domain/source-grounded-ingest.ts`
- 创建：`test/domain/source-grounded-ingest.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/domain/graph-edge.test.ts` 中新增覆盖：

```ts
it('creates a valid grounded_by edge from section to evidence', () => {
  const edge = createGraphEdge({
    edge_id: 'edge:grounded_by:section:patch-first-overview->evidence:patch-first#p1',
    from_id: 'section:patch-first-overview',
    from_kind: 'section',
    type: 'grounded_by',
    to_id: 'evidence:patch-first#p1',
    to_kind: 'evidence',
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    qualifiers: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });

  expect(edge.type).toBe('grounded_by');
});
```

在 `test/domain/source-grounded-ingest.test.ts` 中新增覆盖：

```ts
import { createSourceGroundedIngest } from '../../src/domain/source-grounded-ingest.js';

it('normalizes a source-grounded ingest payload', () => {
  const ingest = createSourceGroundedIngest({
    sourceId: 'src-001',
    sourcePath: 'raw/accepted/patterns.md',
    topic: {
      slug: 'source-src-001',
      title: 'Design Patterns',
      summary: 'Pattern overview.'
    },
    sections: [
      {
        id: 'section:source-src-001#1',
        title: 'Introduction',
        summary: 'Intro section.',
        grounded_evidence_ids: ['evidence:src-001#h1-p1']
      }
    ],
    evidence: [
      {
        id: 'evidence:src-001#h1-p1',
        title: 'Patterns intro anchor',
        locator: 'patterns.md#introduction:p1',
        excerpt: 'Design patterns are reusable solutions.',
        order: 1,
        heading_path: ['Introduction']
      }
    ]
  });

  expect(ingest.topic.id).toBe('topic:source-src-001');
  expect(ingest.sections[0]?.grounded_evidence_ids).toEqual(['evidence:src-001#h1-p1']);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/domain/graph-edge.test.ts test/domain/source-grounded-ingest.test.ts`

预期：FAIL，`grounded_by` 与 ingest 契约尚不存在。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 在 `graph-edge.ts` 中增加 `grounded_by`
- 约束 `grounded_by` 只能连接 `section -> evidence`
- 在 `source-grounded-ingest.ts` 中定义：
  - `topic` 只保留总览字段
  - `section` 必须声明 `grounded_evidence_ids`
  - `evidence` 必须有 `locator/excerpt/order/heading_path`

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/domain/graph-edge.test.ts test/domain/source-grounded-ingest.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/graph-edge.ts test/domain/graph-edge.test.ts src/domain/source-grounded-ingest.ts test/domain/source-grounded-ingest.test.ts
git commit -m "feat(graph): define source-grounded ingest contract"
```

### 任务 2：从 raw source 提取有序 source anchors

**文件：**
- 创建：`src/flows/ingest/extract-source-anchors.ts`
- 创建：`test/flows/ingest/extract-source-anchors.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/flows/ingest/extract-source-anchors.test.ts` 中编写失败测试，要求：

- 给定 markdown raw source
- 可以按标题与段落提取 ordered anchors
- 每个 anchor 含：
  - `id`
  - `title`
  - `locator`
  - `excerpt`
  - `order`
  - `heading_path`

至少断言：

```ts
expect(result[0]).toMatchObject({
  id: 'evidence:src-001#1',
  locator: 'patterns.md#introduction:p1',
  order: 1,
  heading_path: ['Introduction']
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/flows/ingest/extract-source-anchors.test.ts`

预期：FAIL，模块缺失。

- [ ] **步骤 3：编写最少实现代码**

实现一个最小 extractor：

- 输入：`sourceId`、`sourcePath`、raw markdown
- 输出：ordered evidence anchors
- 第一条切片只需支持 markdown 标题和普通段落
- `locator` 规则固定为：`<basename>#<full-heading-path-slug>:p<paragraph-index>`

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/flows/ingest/extract-source-anchors.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/ingest/extract-source-anchors.ts test/flows/ingest/extract-source-anchors.test.ts
git commit -m "feat(ingest): extract ordered source anchors"
```

### 任务 3：把 source-grounded ingest 写入 graph

**文件：**
- 创建：`src/storage/save-source-grounded-ingest.ts`
- 创建：`test/storage/save-source-grounded-ingest.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/storage/save-source-grounded-ingest.test.ts` 中新增覆盖：

- 保存 `topic`
- 保存 `section`
- 保存 `evidence`
- 保存 `source`
- 保存以下关系：
  - `section -> part_of -> topic`
  - `section -> grounded_by -> evidence`
  - `evidence -> derived_from -> source`
- 对重复 ingest 时已存在且内容一致的 `topic/section/evidence/source` 执行 `idempotent no-op`
- 对已存在且内容冲突的 `topic/section` 返回业务冲突，交由 flow 转成 `needs_review`

至少断言：

```ts
expect(savedNodeIds).toEqual(
  expect.arrayContaining([
    'topic:source-src-001',
    'section:source-src-001#1',
    'evidence:src-001#1',
    'source:src-001'
  ])
);
expect(savedEdgeTypes).toEqual(
  expect.arrayContaining(['part_of', 'grounded_by', 'derived_from'])
);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/save-source-grounded-ingest.test.ts`

预期：FAIL，模块缺失。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 将 `source-grounded-ingest` 契约映射到 graph nodes/edges
- `evidence` 继续使用现有 `GraphNode(kind='evidence')`
- `source` 继续使用现有 `GraphNode(kind='source')`
- 生成稳定 `edge_id`
- 对 graph 中已存在且内容一致的 `source/evidence` 做 `idempotent no-op`
- 对 graph 中已存在且内容一致的 `topic/section` 也执行 `idempotent no-op`
- 对 `topic/section` 不一致冲突返回明确业务错误，不静默覆盖

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/save-source-grounded-ingest.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/storage/save-source-grounded-ingest.ts test/storage/save-source-grounded-ingest.test.ts
git commit -m "feat(storage): persist source-grounded ingest graph"
```

### 任务 4：增加受治理的 source-grounded ingest flow 与 runtime tool

**文件：**
- 创建：`src/flows/ingest/run-source-grounded-ingest-flow.ts`
- 创建：`test/flows/ingest/run-source-grounded-ingest-flow.test.ts`
- 创建：`src/runtime/tools/ingest-source-to-graph.ts`
- 创建：`test/runtime/tools/ingest-source-to-graph.test.ts`
- 修改：`src/runtime/tool-catalog.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/flows/ingest/run-source-grounded-ingest-flow.test.ts` 中新增覆盖：

- accepted source 可被读取并拆 anchors
- flow 先复用现有 `runIngestFlow` 或等价逻辑，刷新 `wiki/sources/<id>.md`、`wiki/index.md`、`wiki/log.md`
- flow 可产出 topic + sections 的 graph 写入
- flow 会记录 run state
- 当 source-grounded ingest 发生业务冲突时，结果转为 `needs_review`
- flow 会把 coverage summary 落入 run state

在 `test/runtime/tools/ingest-source-to-graph.test.ts` 中新增覆盖：

- runtime tool 会调用 flow
- 成功时 summary 明确说明生成了 topic 与 sections
- `resultMarkdown` 含 topic path、section 数量、source path

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/flows/ingest/run-source-grounded-ingest-flow.test.ts test/runtime/tools/ingest-source-to-graph.test.ts`

预期：FAIL，flow/tool 不存在。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 输入只接受 accepted source manifest id 或 raw path
- flow 先执行现有 source ingest 兼容副作用，再读取 raw source、抽 anchors、生成一个 topic 和一组 sections
- 一阶段允许先用保守的 section 切分：按 heading group 或相邻 anchors 聚合
- topic/topic slug 与 section ids 必须使用本计划固定规则
- 冲突时保留 governed run state，不直接无痕失败
- run state 中补充 `sourceCoverage` summary：
  - `total_anchor_count`
  - `covered_anchor_count`
  - `uncovered_anchor_ids`
  - `coverage_status`
- 在 `tool-catalog.ts` 注册新工具

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/flows/ingest/run-source-grounded-ingest-flow.test.ts test/runtime/tools/ingest-source-to-graph.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/ingest/run-source-grounded-ingest-flow.ts test/flows/ingest/run-source-grounded-ingest-flow.test.ts src/runtime/tools/ingest-source-to-graph.ts test/runtime/tools/ingest-source-to-graph.test.ts src/runtime/tool-catalog.ts
git commit -m "feat(runtime): add source-grounded wiki ingest tool"
```

### 任务 5：让 topic 读取链路暴露 section 的贴源索引

**文件：**
- 修改：`src/storage/load-topic-graph-projection.ts`
- 修改：`src/storage/graph-projection-store.ts`
- 修改：`test/storage/load-topic-graph-projection.test.ts`
- 修改：`test/storage/graph-projection-store.test.ts`
- 修改：`src/app/api/dto/knowledge-page.ts`
- 修改：`src/app/api/mappers/knowledge-page.ts`
- 修改：`test/app/api/mappers/knowledge-page.test.ts`
- 修改：`test/app/web-server.test.ts`
- 修改：`src/storage/load-topic-graph-page.ts`
- 修改：`test/storage/load-topic-graph-page.test.ts`
- 修改：`src/runtime/tools/read-wiki-page.ts`
- 修改：`test/runtime/tools/read-wiki-page.test.ts`
- 修改：`web/src/lib/types.ts`
- 修改：`web/src/features/reading/components/reading-sidebar.tsx`

- [ ] **步骤 1：编写失败的测试**

要求 `topic` 读取结果中的每个 section 至少带出：

- `id`
- `title`
- `summary`
- `grounding`
  - `source_paths`
  - `locators`
  - `anchor_count`

在 API 与 web 测试中至少断言：

```ts
expect(response.navigation.sections[0]?.grounding.anchor_count).toBeGreaterThan(0);
expect(response.navigation.sections[0]?.grounding.source_paths[0]).toBe('raw/accepted/patterns.md');
expect(resultMarkdown).toContain('Grounding: raw/accepted/patterns.md');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts test/app/api/mappers/knowledge-page.test.ts test/app/web-server.test.ts test/storage/load-topic-graph-page.test.ts test/runtime/tools/read-wiki-page.test.ts`

预期：FAIL，topic read 尚未暴露 grounded sections。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- topic graph projection 在加载 section 时继续追 `grounded_by -> evidence -> source`
- `navigation.sections` 暴露最小 grounding 摘要
- `loadTopicGraphPage()` 合成 topic body 时，在 section 摘要里带出 source grounding 的最小可读信息
- `read_wiki_page` 的 `Topic graph summary` 或正文摘要中带出 section grounding
- 前端阅读侧栏在“章节”区块中显示 section 的 source anchor 概览
- 保持现有视觉风格，不重做整体阅读页

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npx vitest run test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts test/app/api/mappers/knowledge-page.test.ts test/app/web-server.test.ts test/storage/load-topic-graph-page.test.ts test/runtime/tools/read-wiki-page.test.ts
npm run typecheck
npm run lint
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/storage/load-topic-graph-projection.ts src/storage/graph-projection-store.ts test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts src/app/api/dto/knowledge-page.ts src/app/api/mappers/knowledge-page.ts test/app/api/mappers/knowledge-page.test.ts test/app/web-server.test.ts src/storage/load-topic-graph-page.ts test/storage/load-topic-graph-page.test.ts src/runtime/tools/read-wiki-page.ts test/runtime/tools/read-wiki-page.test.ts web/src/lib/types.ts web/src/features/reading/components/reading-sidebar.tsx
git commit -m "feat(read): expose source-grounded sections in topic graph view"
```

## 完成定义

满足以下条件时，本计划算完成：

- accepted source 不再只生成一个 topic
- ingest 后至少能得到一个 topic 和一组贴源 sections
- 每个 section 都带 `grounded_by -> evidence -> source`
- 现有 topic 读取链路能看见 section 的 source grounding 摘要
- 信息不足时，agent 或前端可以从 section 继续回到原始 source path / locator

## 取代说明

本计划取代 [2026-04-20-graph-agent-write-path.md](/home/lyfmt/src/study/llm-wiki-liiy/.worktrees/graph-read-api/docs/superpowers/plans/2026-04-20-graph-agent-write-path.md) 作为当前优先执行的新计划。
