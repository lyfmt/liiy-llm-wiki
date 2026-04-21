# Graph Read API 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**状态：** 已完成（2026-04-20）

**目标：** 让 `topic` 的 graph projection 真正接入读取 API，并在阅读页中把 taxonomy、sections、entities、assertions 直观展示出来。

**架构：** 保持现有 page-centric 路径兼容不动，只对 `topic` 的 GET 读取链路增加 graph-first 分支：如果存在 `topic:<slug>` 图节点，就加载图邻域并生成 projection；否则继续走旧的 markdown 逻辑。前端只在阅读页追加最小展示区块，不改 discovery、chat 或写入流程。

**技术栈：** TypeScript、Node.js、PostgreSQL、Vitest、React

---

## 文件结构

- 创建：`src/storage/load-topic-graph-projection.ts` — 从 graph store 递归加载 `topic` root 及其一跳、二跳邻域，供 projection 使用。
- 创建：`test/storage/load-topic-graph-projection.test.ts` — 用 fake graph client 锁定 `topic -> taxonomy/section/entity/assertion/evidence/source` 的加载路径。
- 修改：`src/app/api/dto/knowledge-page.ts` — 为 `topic` 阅读响应补充 graph navigation 结构。
- 修改：`src/app/api/mappers/knowledge-page.ts` — 在 `topic` GET 路径优先走 graph projection，并保留旧 markdown fallback。
- 修改：`test/app/api/mappers/knowledge-page.test.ts` — 锁定 `topic` graph projection 响应结构。
- 修改：`test/app/web-server.test.ts` — 锁定 `/api/pages/topic/:slug` 的 graph navigation 响应。
- 修改：`web/src/lib/types.ts` — 为前端补充 graph topic navigation 的类型。
- 修改：`web/src/features/reading/components/reading-sidebar.tsx` — 在阅读侧边栏追加 taxonomy、sections、entities、assertions 的展示。

## 范围说明

本计划只覆盖 `topic` 的 graph 读取链路和最小阅读展示。

本计划不覆盖：

- `section` / `entity` root 的 graph 读取
- discovery 页迁移到 graph
- chat/runtime 接入 graph
- PUT 写入流程切到 graph

### 任务 1：加载 topic graph projection 邻域

**文件：**
- 创建：`src/storage/load-topic-graph-projection.ts`
- 创建：`test/storage/load-topic-graph-projection.test.ts`

- [x] **步骤 1：编写失败的测试**

在 `test/storage/load-topic-graph-projection.test.ts` 中编写失败测试，要求新 loader：

- 按 slug 解析 `topic:<slug>` root id
- 加载 root topic node
- 加载 root 的 outgoing edges，用于 taxonomy 与 mentions
- 加载 root 的 incoming edges，用于 `section -> part_of -> topic` 与 `assertion -> about -> topic`
- 为 assertion 继续加载 outgoing edges，用于 `supported_by`
- 为 evidence 继续加载 outgoing edges，用于 `derived_from`
- 最终返回可直接喂给 `buildGraphProjection` 的 `{ rootId, nodes, edges }`

测试至少验证：

```ts
expect(result.rootId).toBe('topic:patch-first');
expect(result.nodes.map((node) => node.id)).toEqual(
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
expect(result.edges.map((edge) => edge.type)).toEqual(
  expect.arrayContaining(['belongs_to_taxonomy', 'part_of', 'mentions', 'about', 'supported_by', 'derived_from'])
);
```

- [x] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/load-topic-graph-projection.test.ts`

预期：FAIL，模块缺失。

- [x] **步骤 3：编写最少实现代码**

在 `src/storage/load-topic-graph-projection.ts` 中实现最小 loader：

- `loadTopicGraphProjectionInput(client, slug)`
- 依赖现有 `loadGraphNode`、`listOutgoingGraphEdges`、`listIncomingGraphEdges`
- 返回：

```ts
export interface TopicGraphProjectionInput {
  rootId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

要求：

- 去重 node / edge
- 只加载当前 topic 所需邻域，不扫描全图
- root 不存在时返回 `null`

- [x] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/load-topic-graph-projection.test.ts`

预期：PASS。

- [x] **步骤 5：Commit**

```bash
git add src/storage/load-topic-graph-projection.ts test/storage/load-topic-graph-projection.test.ts
git commit -m "feat(api): load topic graph projection input"
```

### 任务 2：把 topic graph projection 接入读取 API

**文件：**
- 修改：`src/app/api/dto/knowledge-page.ts`
- 修改：`src/app/api/mappers/knowledge-page.ts`
- 修改：`test/app/api/mappers/knowledge-page.test.ts`
- 修改：`test/app/web-server.test.ts`

- [x] **步骤 1：编写失败的测试**

在 `test/app/api/mappers/knowledge-page.test.ts` 中增加 graph topic 响应测试：

- mock 或 fake graph loader 返回一份 topic projection
- 断言响应包含：
  - `navigation.taxonomy`
  - `navigation.sections`
  - `navigation.entities`
  - `navigation.assertions`

在 `test/app/web-server.test.ts` 中扩展 `/api/pages/topic/patch-first` 的断言，要求 graph 响应至少带出：

```ts
expect(readingDto.body.navigation.taxonomy[0]?.title).toBe('Engineering');
expect(readingDto.body.navigation.sections[0]?.title).toBe('Patch First Overview');
expect(readingDto.body.navigation.entities[0]?.title).toBe('Graph Reader');
expect(readingDto.body.navigation.assertions[0]?.statement).toContain('stable');
```

- [x] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/app/api/mappers/knowledge-page.test.ts test/app/web-server.test.ts`

预期：FAIL，因为 DTO / mapper 尚未返回 graph navigation。

- [x] **步骤 3：编写最少实现代码**

修改 `src/app/api/dto/knowledge-page.ts`，给 `navigation` 增加：

- `taxonomy`
- `sections`
- `entities`
- `assertions`

其中 `assertions` 至少包含：

- `id`
- `title`
- `statement`
- `evidence_count`

修改 `src/app/api/mappers/knowledge-page.ts`：

- 仅在 `kind === 'topic'` 时尝试读取 graph projection
- graph root 存在时优先返回 graph navigation
- graph root 不存在时维持当前 markdown 路径

要求：

- 不删除当前 `source_refs / outgoing_links / backlinks / related_by_source`
- 尽量减少对非 topic 响应的影响

- [x] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/app/api/mappers/knowledge-page.test.ts test/app/web-server.test.ts`

预期：PASS。

- [x] **步骤 5：Commit**

```bash
git add src/app/api/dto/knowledge-page.ts src/app/api/mappers/knowledge-page.ts test/app/api/mappers/knowledge-page.test.ts test/app/web-server.test.ts
git commit -m "feat(api): expose topic graph projection navigation"
```

### 任务 3：在阅读页最小展示 graph topic 信息

**文件：**
- 修改：`web/src/lib/types.ts`
- 修改：`web/src/features/reading/components/reading-sidebar.tsx`

- [x] **步骤 1：编写失败的测试或类型约束**

由于当前前端没有现成组件测试，先通过类型约束和构建验证表达缺口：

- 在 `web/src/lib/types.ts` 中补上新 navigation 字段
- 在 `reading-sidebar.tsx` 中引用这些字段时先让 TS 失败

失败验证命令：

```bash
npm run typecheck:web
```

预期：FAIL，前端类型未同步。

- [x] **步骤 2：编写最少实现代码**

修改 `web/src/lib/types.ts`：

- 为 `KnowledgePageResponse.navigation` 增加 `taxonomy / sections / entities / assertions`

修改 `web/src/features/reading/components/reading-sidebar.tsx`：

- 新增 `分类`
- 新增 `章节`
- 新增 `关键实体`
- 新增 `核心陈述`

要求：

- 保持当前视觉风格
- 没有 graph 数据时显示空态文案
- 不重做整体布局

- [x] **步骤 3：运行验证**

运行：

```bash
npm run typecheck:web
npm --prefix web run build
```

预期：PASS。

- [x] **步骤 4：Commit**

```bash
git add web/src/lib/types.ts web/src/features/reading/components/reading-sidebar.tsx
git commit -m "feat(web): render topic graph navigation"
```
