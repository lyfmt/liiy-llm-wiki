# Knowledge Insert V2（Source -> Topic/Taxonomy -> Graph -> Wiki）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在保留现有 `source` 准备链路的前提下，把 `knowledge-insert` 从“section -> topic -> wiki write”补全为“source overview -> topic resolve -> taxonomy resolve -> graph write -> governed wiki write”的完整链路。

**架构：** 旧计划的前半段已经落地：`create_source_from_attachment`、`prepare_source_resource`、`split_resource_blocks`、`split_block_batches`、`merge_extracted_knowledge`、`audit_extraction_coverage`、`merge_section_candidates` 已可作为 V2 的稳定准备层。V2 不重写这部分，而是在它们之后补一个**语义决策层**：先从 `source` 做 topic 级判断，再把 topic 放到 taxonomy 树中，最后把规范化结果一次写入 graph，并用确定性的 draft renderer 写回 wiki。critical structure 必须由工具和 artifact 决定，不再把 `topic -> sections[]` 这种结构性交给自由发挥的 writer 去猜。

**技术栈：** TypeScript、Node.js、Vitest、PostgreSQL、现有 graph store、runtime tools、governed wiki markdown

---

**基线与替代关系：**

- 本计划以 [2026-04-21-knowledge-insert-skill.md](./2026-04-21-knowledge-insert-skill.md) 的已完成部分为基线，不重复已落地的准备层任务。
- 本计划吸收 [2026-04-20-source-grounded-wiki-ingest.md](./2026-04-20-source-grounded-wiki-ingest.md) 中 `grounded_by -> evidence -> source` 的回源思路。
- 本计划对应的当前仓库现状，见 `docs/superpowers/specs/2026-04-23-knowledge-insert-skill-implementation-status.md`。

## 文件结构

- 修改：`src/domain/knowledge-page.ts` — 让 `taxonomy` 成为一等 wiki page kind。
- 修改：`src/config/project-paths.ts` — 增加 taxonomy 页面目录路径。
- 修改：`src/storage/knowledge-page-paths.ts`
- 修改：`src/storage/knowledge-page-store.ts`
- 修改：`src/storage/list-knowledge-pages.ts`
- 修改：`src/runtime/tools/list-wiki-pages.ts`
- 修改：`src/runtime/tools/read-wiki-page.ts`
- 修改：`src/runtime/tools/draft-knowledge-page.ts`
- 修改：`src/runtime/tools/apply-draft-upsert.ts`
- 修改：`src/runtime/tools/upsert-knowledge-page.ts`
- 修改：`src/app/api/dto/knowledge-page.ts`
- 修改：`src/app/api/dto/discovery.ts`
- 修改：`src/app/api/mappers/knowledge-page.ts`
- 修改：`src/app/api/mappers/discovery.ts`
- 修改：`web/src/lib/types.ts`
- 创建：`src/runtime/tools/build-topic-catalog.ts` — 从现有 durable topic 页面生成 host catalog。
- 创建：`test/runtime/tools/build-topic-catalog.test.ts`
- 创建：`src/runtime/tools/build-taxonomy-catalog.ts` — 从 taxonomy 页面生成 root/tree catalog。
- 创建：`test/runtime/tools/build-taxonomy-catalog.test.ts`
- 创建：`src/runtime/tools/resolve-source-topics.ts` — 以 `source` 为单位做 topic reuse/create 决策。
- 创建：`test/runtime/tools/resolve-source-topics.test.ts`
- 创建：`src/runtime/tools/assign-sections-to-topics.ts` — 把 normalized sections 挂到 source-level topic decisions 上。
- 创建：`test/runtime/tools/assign-sections-to-topics.test.ts`
- 创建：`src/runtime/tools/resolve-topic-taxonomy.ts` — 让 topic 进入 taxonomy root/tree。
- 创建：`test/runtime/tools/resolve-topic-taxonomy.test.ts`
- 创建：`src/runtime/tools/audit-taxonomy-hosting.ts`
- 创建：`test/runtime/tools/audit-taxonomy-hosting.test.ts`
- 创建：`src/flows/wiki/render-topic-drafts-from-plan.ts` — 用确定性 renderer 生成 `topic -> sections[]` draft。
- 创建：`test/flows/wiki/render-topic-drafts-from-plan.test.ts`
- 创建：`src/runtime/tools/draft-topic-pages-from-plan.ts`
- 创建：`test/runtime/tools/draft-topic-pages-from-plan.test.ts`
- 创建：`src/domain/knowledge-insert-graph-write.ts` — V2 graph write 契约。
- 创建：`test/domain/knowledge-insert-graph-write.test.ts`
- 创建：`src/storage/save-knowledge-insert-graph-write.ts` — V2 graph persistence helper。
- 创建：`test/storage/save-knowledge-insert-graph-write.test.ts`
- 创建：`src/runtime/tools/upsert-knowledge-insert-graph.ts`
- 创建：`test/runtime/tools/upsert-knowledge-insert-graph.test.ts`
- 修改：`src/domain/graph-edge.ts` — 增补 V2 需要的 edge 语义。
- 修改：`test/domain/graph-edge.test.ts`
- 修改：`src/storage/load-topic-graph-projection.ts` — 让新写入内容可读。
- 修改：`src/storage/graph-projection-store.ts`
- 修改：`test/storage/load-topic-graph-projection.test.ts`
- 修改：`test/storage/graph-projection-store.test.ts`
- 修改：`.agents/skills/knowledge-insert/SKILL.md` — 改成 V2 编排顺序。
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`
- 修改：`test/runtime/tools/run-skill.test.ts`
- 修改：`test/runtime/agent-session.test.ts`
- 修改：`test/runtime/skills/discovery.test.ts`

## 范围说明

本计划覆盖：

- taxonomy 作为一等 wiki/write surface
- source-level topic 规划，而不是直接对 section 做自由 host 匹配
- taxonomy root / node / merge / attach 的最小可用实现
- graph durable write：`topic / taxonomy / section / evidence / source / entity / assertion`
- section 正文与 source anchor 的 deterministic writeback
- skill orchestration 改造，降低 agent 自由发挥导致的偏差

本计划明确不覆盖：

- 通用 OCR 平台
- 大规模多 source 自动聚类
- entity root 页面完整阅读体验
- taxonomy 浏览器 UI 大改版
- graph 删除、回撤、差量同步

## 关键原则

- `source` 是入口，不是 `section`
- `section` 是插入单位，但不再单独决定 topic host
- `topic` 决策先在 source scope 完成，再把 sections attach 上去
- `taxonomy` 是独立层，不再继续塞进 `resolve_topic_hosts`
- `graph` 是 durable semantic layer，`wiki` 是 governed reading/output layer
- `topic -> sections[]`、section 正文、source anchors、source refs 必须由确定性工具产物驱动，不能只靠 writer 二次发明

### 任务 1：让 taxonomy 成为一等 wiki page kind

**文件：**

- 修改：`src/domain/knowledge-page.ts`
- 修改：`src/config/project-paths.ts`
- 修改：`src/storage/knowledge-page-paths.ts`
- 修改：`src/storage/knowledge-page-store.ts`
- 修改：`src/storage/list-knowledge-pages.ts`
- 修改：`src/runtime/tools/list-wiki-pages.ts`
- 修改：`src/runtime/tools/read-wiki-page.ts`
- 修改：`src/runtime/tools/draft-knowledge-page.ts`
- 修改：`src/runtime/tools/apply-draft-upsert.ts`
- 修改：`src/runtime/tools/upsert-knowledge-page.ts`
- 修改：`src/app/api/dto/knowledge-page.ts`
- 修改：`src/app/api/dto/discovery.ts`
- 修改：`src/app/api/mappers/knowledge-page.ts`
- 修改：`src/app/api/mappers/discovery.ts`
- 修改：`web/src/lib/types.ts`
- 测试：`test/domain/knowledge-page.test.ts`
- 测试：`test/storage/knowledge-page-paths.test.ts`
- 测试：`test/storage/list-knowledge-pages.test.ts`
- 测试：`test/runtime/tools/list-wiki-pages.test.ts`
- 测试：`test/runtime/tools/read-wiki-page.test.ts`
- 测试：`test/runtime/tools/draft-knowledge-page.test.ts`
- 测试：`test/runtime/tools/apply-draft-upsert.test.ts`
- 测试：`test/app/api/mappers/knowledge-page.test.ts`

- [ ] **步骤 1：编写失败的测试**

在上述测试中新增覆盖，至少断言：

```ts
expect(buildKnowledgePagePath('/tmp/root', 'taxonomy', 'engineering')).toBe(
  '/tmp/root/wiki/taxonomy/engineering.md'
);
expect(createKnowledgePage({
  path: 'wiki/taxonomy/engineering.md',
  kind: 'taxonomy',
  title: 'Engineering',
  source_refs: [],
  status: 'active',
  updated_at: '2026-04-23T00:00:00.000Z'
}).kind).toBe('taxonomy');
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/domain/knowledge-page.test.ts test/storage/knowledge-page-paths.test.ts test/storage/list-knowledge-pages.test.ts test/runtime/tools/list-wiki-pages.test.ts test/runtime/tools/read-wiki-page.test.ts test/runtime/tools/draft-knowledge-page.test.ts test/runtime/tools/apply-draft-upsert.test.ts test/app/api/mappers/knowledge-page.test.ts
```

预期：FAIL，`taxonomy` 不是合法 page kind，taxonomy 路径与列表逻辑缺失。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- `KnowledgePageKind` 增加 `taxonomy`
- project paths 增加 `wikiTaxonomy`
- 所有 page path/list/read/draft/upsert 流程支持 `taxonomy`
- API DTO 与 Web types 暴露 taxonomy 页面

- [ ] **步骤 4：运行测试验证通过**

运行与步骤 2 相同命令。

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/knowledge-page.ts src/config/project-paths.ts src/storage/knowledge-page-paths.ts src/storage/knowledge-page-store.ts src/storage/list-knowledge-pages.ts src/runtime/tools/list-wiki-pages.ts src/runtime/tools/read-wiki-page.ts src/runtime/tools/draft-knowledge-page.ts src/runtime/tools/apply-draft-upsert.ts src/runtime/tools/upsert-knowledge-page.ts src/app/api/dto/knowledge-page.ts src/app/api/dto/discovery.ts src/app/api/mappers/knowledge-page.ts src/app/api/mappers/discovery.ts web/src/lib/types.ts test/domain/knowledge-page.test.ts test/storage/knowledge-page-paths.test.ts test/storage/list-knowledge-pages.test.ts test/runtime/tools/list-wiki-pages.test.ts test/runtime/tools/read-wiki-page.test.ts test/runtime/tools/draft-knowledge-page.test.ts test/runtime/tools/apply-draft-upsert.test.ts test/app/api/mappers/knowledge-page.test.ts
git commit -m "feat: add taxonomy as a first-class wiki page kind"
```

### 任务 2：补齐 topic/taxonomy catalog，消除手工 topic-catalog artifact

**文件：**

- 创建：`src/runtime/tools/build-topic-catalog.ts`
- 创建：`test/runtime/tools/build-topic-catalog.test.ts`
- 创建：`src/runtime/tools/build-taxonomy-catalog.ts`
- 创建：`test/runtime/tools/build-taxonomy-catalog.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

新增两个 tool 测试，至少断言：

```ts
expect(parsed.topics[0]).toEqual(
  expect.objectContaining({
    topicSlug: 'design-patterns',
    title: 'Design Patterns',
    aliases: ['Pattern Intent']
  })
);
expect(parsed.taxonomy[0]).toEqual(
  expect.objectContaining({
    taxonomySlug: 'engineering',
    title: 'Engineering',
    parentTaxonomySlug: null
  })
);
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/runtime/tools/build-topic-catalog.test.ts test/runtime/tools/build-taxonomy-catalog.test.ts
```

预期：FAIL，catalog builder tools 缺失。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- `build_topic_catalog` 从 `wiki/topics/*.md` 读取 slug/title/aliases/summary/source_refs
- `build_taxonomy_catalog` 从 `wiki/taxonomy/*.md` 读取 slug/title/aliases/parentTaxonomySlug/rootFlag
- 统一输出到 `state/artifacts/.../*.json`

- [ ] **步骤 4：运行测试验证通过**

运行与步骤 2 相同命令。

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/runtime/tools/build-topic-catalog.ts test/runtime/tools/build-topic-catalog.test.ts src/runtime/tools/build-taxonomy-catalog.ts test/runtime/tools/build-taxonomy-catalog.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts
git commit -m "feat: add topic and taxonomy catalog builders"
```

### 任务 3：把 host 决策改为 source-level topic planning，再 attach sections

**文件：**

- 创建：`src/runtime/tools/resolve-source-topics.ts`
- 创建：`test/runtime/tools/resolve-source-topics.test.ts`
- 创建：`src/runtime/tools/assign-sections-to-topics.ts`
- 创建：`test/runtime/tools/assign-sections-to-topics.test.ts`
- 保留：`src/runtime/tools/resolve-topic-hosts.ts` 作为兼容旧链路，不在本任务删除
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

新增覆盖，锁定以下行为：

```ts
expect(parsed.sourceTopics).toEqual([
  expect.objectContaining({
    sourceTopicId: 'source-topic-001',
    decision: 'reuse-topic',
    topicSlug: 'design-patterns',
    sectionIds: ['section-001', 'section-002']
  }),
  expect.objectContaining({
    sourceTopicId: 'source-topic-002',
    decision: 'create-topic',
    topicSlug: 'pattern-constraints'
  })
]);
```

以及：

```ts
expect(attached.sections[0]).toEqual(
  expect.objectContaining({
    sectionId: 'section-001',
    hostTopicSlug: 'design-patterns',
    hostAction: 'reuse-topic'
  })
);
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/runtime/tools/resolve-source-topics.test.ts test/runtime/tools/assign-sections-to-topics.test.ts
```

预期：FAIL，V2 source-level planning tools 缺失。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- `resolve_source_topics` 输入必须至少包含：
  - `preparedResourceArtifact`
  - `mergedKnowledgeArtifact`
  - `sectionsArtifact`
  - `topicCatalogArtifact`
- 决策单位是 `sourceTopics[]`，不是单个 section
- `assign_sections_to_topics` 只负责 attach，不再自由匹配外部 topic catalog

- [ ] **步骤 4：运行测试验证通过**

运行与步骤 2 相同命令。

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/runtime/tools/resolve-source-topics.ts test/runtime/tools/resolve-source-topics.test.ts src/runtime/tools/assign-sections-to-topics.ts test/runtime/tools/assign-sections-to-topics.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts
git commit -m "feat: add source-level topic planning for knowledge insert"
```

### 任务 4：增加 taxonomy resolve/gate，让 topic 真正进入 root/tree

**文件：**

- 创建：`src/runtime/tools/resolve-topic-taxonomy.ts`
- 创建：`test/runtime/tools/resolve-topic-taxonomy.test.ts`
- 创建：`src/runtime/tools/audit-taxonomy-hosting.ts`
- 创建：`test/runtime/tools/audit-taxonomy-hosting.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

至少锁定以下两类行为：

```ts
expect(parsed.topics[0]).toEqual(
  expect.objectContaining({
    topicSlug: 'design-patterns',
    taxonomyAction: 'attach-existing',
    taxonomySlug: 'engineering'
  })
);
expect(parsed.topics[1]).toEqual(
  expect.objectContaining({
    topicSlug: 'pattern-constraints',
    taxonomyAction: 'create-taxonomy-node',
    taxonomySlug: 'patterns'
  })
);
```

以及 audit：

```ts
expect(result.details.summary).toBe('taxonomy host audit failed');
expect(result.details.data?.taxonomy.unhostedTopicSlugs).toEqual(['pattern-constraints']);
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/runtime/tools/resolve-topic-taxonomy.test.ts test/runtime/tools/audit-taxonomy-hosting.test.ts
```

预期：FAIL，taxonomy resolve/gate 缺失。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- `resolve_topic_taxonomy` 必须支持：
  - `attach-existing`
  - `create-taxonomy-node`
  - `merge-into-existing`
  - `conflict`
- 必须保留 root/parent/leaf 信息，不能只输出一个 taxonomy slug
- `audit_taxonomy_hosting` 必须在 graph write 和 wiki write 前阻断未入树的 topic

- [ ] **步骤 4：运行测试验证通过**

运行与步骤 2 相同命令。

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/runtime/tools/resolve-topic-taxonomy.ts test/runtime/tools/resolve-topic-taxonomy.test.ts src/runtime/tools/audit-taxonomy-hosting.ts test/runtime/tools/audit-taxonomy-hosting.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts
git commit -m "feat: add taxonomy resolution for knowledge insert"
```

### 任务 5：增加确定性 topic draft renderer，收回 writer 的结构自由度

**文件：**

- 创建：`src/flows/wiki/render-topic-drafts-from-plan.ts`
- 创建：`test/flows/wiki/render-topic-drafts-from-plan.test.ts`
- 创建：`src/runtime/tools/draft-topic-pages-from-plan.ts`
- 创建：`test/runtime/tools/draft-topic-pages-from-plan.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

新增覆盖，至少断言：

```ts
expect(drafts.topics[0]).toEqual(
  expect.objectContaining({
    targetPath: 'wiki/topics/design-patterns.md',
    upsertArguments: expect.objectContaining({
      kind: 'topic',
      slug: 'design-patterns',
      body: expect.stringContaining('## Pattern Intent')
    })
  })
);
expect(drafts.topics[0]?.upsertArguments.body).toContain('Patch-first systems keep durable notes.');
expect(drafts.topics[0]?.upsertArguments.body).toContain('Source refs:');
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/flows/wiki/render-topic-drafts-from-plan.test.ts test/runtime/tools/draft-topic-pages-from-plan.test.ts
```

预期：FAIL，renderer/tool 缺失。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- 输入是确定性的 insertion plan artifacts，不是自然语言 prompt
- 输出是 `topic -> draft[]`
- renderer 必须保留：
  - `topic title`
  - `section title`
  - `section body`
  - `source refs`
  - `evidence anchors or locators`
- LLM writer 只允许作为后续 polish，可选，不是结构生成器

- [ ] **步骤 4：运行测试验证通过**

运行与步骤 2 相同命令。

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/flows/wiki/render-topic-drafts-from-plan.ts test/flows/wiki/render-topic-drafts-from-plan.test.ts src/runtime/tools/draft-topic-pages-from-plan.ts test/runtime/tools/draft-topic-pages-from-plan.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts
git commit -m "feat: add deterministic topic draft rendering for insertion plans"
```

### 任务 6：补 full graph write，把 topic/taxonomy/section/evidence/source/entity/assertion 写成 durable layer

**文件：**

- 修改：`src/domain/graph-edge.ts`
- 修改：`test/domain/graph-edge.test.ts`
- 创建：`src/domain/knowledge-insert-graph-write.ts`
- 创建：`test/domain/knowledge-insert-graph-write.test.ts`
- 创建：`src/storage/save-knowledge-insert-graph-write.ts`
- 创建：`test/storage/save-knowledge-insert-graph-write.test.ts`
- 创建：`src/runtime/tools/upsert-knowledge-insert-graph.ts`
- 创建：`test/runtime/tools/upsert-knowledge-insert-graph.test.ts`
- 修改：`src/storage/load-topic-graph-projection.ts`
- 修改：`src/storage/graph-projection-store.ts`
- 修改：`test/storage/load-topic-graph-projection.test.ts`
- 修改：`test/storage/graph-projection-store.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

新增 domain/storage/runtime 覆盖，至少锁定以下结果：

```ts
expect(savedNodeIds).toEqual(
  expect.arrayContaining([
    'taxonomy:engineering',
    'topic:design-patterns',
    'section:design-patterns#1',
    'entity:patch-first-system',
    'assertion:patch-first-stability',
    'evidence:src-001#1',
    'source:src-001'
  ])
);
expect(savedEdgeTypes).toEqual(
  expect.arrayContaining([
    'belongs_to_taxonomy',
    'part_of',
    'grounded_by',
    'derived_from',
    'mentions',
    'about',
    'supported_by'
  ])
);
```

如果决定纳入 extracted `relations`，再补：

```ts
expect(savedEdgeTypes).toContain('related_to');
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/domain/graph-edge.test.ts test/domain/knowledge-insert-graph-write.test.ts test/storage/save-knowledge-insert-graph-write.test.ts test/runtime/tools/upsert-knowledge-insert-graph.test.ts test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts
```

预期：FAIL，full graph write contract/storage/tool 不存在。

- [ ] **步骤 3：编写最少实现代码**

实现要求：

- V2 graph write 一次接收完整 artifact，而不是边写边猜
- 持久化以下节点：
  - taxonomy
  - topic
  - section
  - evidence
  - source
  - entity
  - assertion
- 持久化以下关系：
  - `topic -> belongs_to_taxonomy -> taxonomy`
  - `taxonomy -> part_of -> taxonomy`
  - `section -> part_of -> topic|section`
  - `section -> grounded_by -> evidence`
  - `evidence -> derived_from -> source`
  - `topic|section|source|evidence|assertion -> mentions -> entity`
  - `assertion -> about -> topic|section|entity`
  - `assertion -> supported_by -> evidence`
- 必须保留现有 `saveSourceGroundedIngest` 的冲突与 idempotency 规则，不得静默覆盖

- [ ] **步骤 4：运行测试验证通过**

运行与步骤 2 相同命令。

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/graph-edge.ts test/domain/graph-edge.test.ts src/domain/knowledge-insert-graph-write.ts test/domain/knowledge-insert-graph-write.test.ts src/storage/save-knowledge-insert-graph-write.ts test/storage/save-knowledge-insert-graph-write.test.ts src/runtime/tools/upsert-knowledge-insert-graph.ts test/runtime/tools/upsert-knowledge-insert-graph.test.ts src/storage/load-topic-graph-projection.ts src/storage/graph-projection-store.ts test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts
git commit -m "feat: persist full knowledge-insert graph writes"
```

### 任务 7：改造 skill 编排并补 end-to-end 回归

**文件：**

- 修改：`.agents/skills/knowledge-insert/SKILL.md`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`
- 修改：`test/runtime/tools/run-skill.test.ts`
- 修改：`test/runtime/agent-session.test.ts`
- 修改：`test/runtime/skills/discovery.test.ts`

- [ ] **步骤 1：编写失败的测试**

把 skill 顺序改成 V2，并锁定以下工具序列：

```ts
expect(result.toolOutcomes[1]?.resultMarkdown).toContain('build_topic_catalog');
expect(result.toolOutcomes[1]?.resultMarkdown).toContain('build_taxonomy_catalog');
expect(result.toolOutcomes[1]?.resultMarkdown).toContain('resolve_source_topics');
expect(result.toolOutcomes[1]?.resultMarkdown).toContain('assign_sections_to_topics');
expect(result.toolOutcomes[1]?.resultMarkdown).toContain('resolve_topic_taxonomy');
expect(result.toolOutcomes[1]?.resultMarkdown).toContain('audit_taxonomy_hosting');
expect(result.toolOutcomes[1]?.resultMarkdown).toContain('draft_topic_pages_from_plan');
expect(result.toolOutcomes[1]?.resultMarkdown).toContain('upsert_knowledge_insert_graph');
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npx vitest run test/runtime/skills/discovery.test.ts test/runtime/tools/run-skill.test.ts test/runtime/agent-session.test.ts
```

预期：FAIL，skill 定义和 orchestration 还是旧顺序。

- [ ] **步骤 3：编写最少实现代码**

更新 `knowledge-insert` 的推荐顺序为：

1. `create_source_from_attachment` / `find_source_manifest`
2. `prepare_source_resource`
3. `split_resource_blocks`
4. `split_block_batches`
5. `run_subagent`
6. `merge_extracted_knowledge`
7. `audit_extraction_coverage`
8. `merge_section_candidates`
9. `build_topic_catalog`
10. `build_taxonomy_catalog`
11. `resolve_source_topics`
12. `assign_sections_to_topics`
13. `resolve_topic_taxonomy`
14. `audit_topic_hosting`
15. `audit_taxonomy_hosting`
16. `draft_topic_pages_from_plan`
17. `upsert_knowledge_insert_graph`
18. `apply_draft_upsert`
19. `lint_wiki`

- [ ] **步骤 4：运行测试验证通过**

运行与步骤 2 相同命令。

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add .agents/skills/knowledge-insert/SKILL.md src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts test/runtime/skills/discovery.test.ts test/runtime/tools/run-skill.test.ts test/runtime/agent-session.test.ts
git commit -m "feat: upgrade knowledge-insert skill orchestration to v2"
```

## 验收顺序

实现完任务 1-7 后，按以下顺序做总验证：

- [ ] 运行 taxonomy/page kind 相关测试
- [ ] 运行 catalog/source-topic/taxonomy resolve 相关测试
- [ ] 运行 deterministic renderer 相关测试
- [ ] 运行 graph write / projection 相关测试
- [ ] 运行 skill orchestration 回归测试
- [ ] 手工验证现有示例 source 至少能产出：
  - source-level topic decision
  - taxonomy host decision
  - graph write artifact
  - deterministic topic page draft

总验证命令：

```bash
npx vitest run test/domain/knowledge-page.test.ts test/storage/knowledge-page-paths.test.ts test/storage/list-knowledge-pages.test.ts test/runtime/tools/build-topic-catalog.test.ts test/runtime/tools/build-taxonomy-catalog.test.ts test/runtime/tools/resolve-source-topics.test.ts test/runtime/tools/assign-sections-to-topics.test.ts test/runtime/tools/resolve-topic-taxonomy.test.ts test/runtime/tools/audit-taxonomy-hosting.test.ts test/flows/wiki/render-topic-drafts-from-plan.test.ts test/runtime/tools/draft-topic-pages-from-plan.test.ts test/domain/knowledge-insert-graph-write.test.ts test/storage/save-knowledge-insert-graph-write.test.ts test/runtime/tools/upsert-knowledge-insert-graph.test.ts test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts test/runtime/skills/discovery.test.ts test/runtime/tools/run-skill.test.ts test/runtime/agent-session.test.ts
```

预期：PASS。

## 迁移说明

- `resolve_topic_hosts` 不立即删除，先退为兼容旧链路的工具。
- `build_topic_insertion_plan` 仍可保留，但 V2 的 page draft 应优先来自 `draft_topic_pages_from_plan`。
- `saveSourceGroundedIngest` 保留，作为单 source grounding baseline；V2 full graph write 不应直接覆盖它，而应复用其 idempotency/conflict 规则。

## 执行建议

- 推荐先落任务 1-4，完成 source/topic/taxonomy 决策层。
- 再落任务 5-6，收回 writer 自由度并补 durable graph。
- 最后做任务 7，把 skill 真正切到 V2。

