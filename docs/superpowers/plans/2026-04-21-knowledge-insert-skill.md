# Knowledge Insert Skill 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为当前项目落地一个 `knowledge-insert` skill，让 agent 能把新资源拆分、抽取、归并成 `section`，再把 `section` 托管到已有或新建的 `topic` 下，最后以受治理的方式更新 wiki，而不是只生成一次性摘要。

**架构：** 本计划建立在 `2026-04-21-subagent-runtime.md` 完成之后。整条插入链明确分成 5 层：`resource -> source blocks -> normalized sections -> topic hosts -> governed wiki write`。其中 `block` 只是原文处理单位，`section` 才是知识插入单位，`topic` 是 section 的托管单位和阅读入口。流程上必须经过两个硬门槛：先过 `block coverage gate`，再过 `topic host gate`，然后才能生成 `topic insertion plan` 并进入写入。大资源的阅读、抽取、写稿、贴源复核交给 `worker / reviewer` subagent，主 agent 只保留 `task_prompt`、artifact 路径和 receipt。最终写入仍以 `wiki markdown` 为主产物，graph 只做支撑读取和校验，不把这次实现拉回 `graph-first` 写入。

**技术栈：** TypeScript、Node.js、Vitest、项目内 `.agents/skills` 机制、subagent runtime

---

## 文件结构

- 创建：`.agents/skills/knowledge-insert/SKILL.md` — `knowledge-insert` 的主方法文档，定义 `block / section / topic` 三层边界、停手条件、review 条件与 subagent 委托方式。
- 创建：`src/storage/knowledge-insert-artifact-paths.ts` — 约定 `state/artifacts/knowledge-insert/<run-id>/` 目录。
- 创建：`test/storage/knowledge-insert-artifact-paths.test.ts` — 锁定知识插入产物路径。
- 创建：`src/runtime/tools/prepare-source-resource.ts` — 将 source / manifest 转成结构化资源 artifact。
- 创建：`test/runtime/tools/prepare-source-resource.test.ts` — 验证资源准备结果与 metadata。
- 创建：`src/runtime/tools/split-resource-blocks.ts` — 按标题、段落、列表、表格等结构切分原文 block。
- 创建：`test/runtime/tools/split-resource-blocks.test.ts` — 锁定 block 清单、locator 和覆盖范围。
- 创建：`src/runtime/tools/merge-extracted-knowledge.ts` — 归并多个 extractor 批次产物，得到统一的 entity / assertion / relation / section candidate 池。
- 创建：`test/runtime/tools/merge-extracted-knowledge.test.ts` — 验证抽取批次去重归并。
- 创建：`src/runtime/tools/merge-section-candidates.ts` — 将多个 block 里的 section candidate 归并成规范化 section。
- 创建：`test/runtime/tools/merge-section-candidates.test.ts` — 验证 section 归并、证据聚合与重复折叠。
- 创建：`src/runtime/tools/resolve-topic-hosts.ts` — 为 section 选择已有 topic 宿主，或产出新建 topic 建议。
- 创建：`test/runtime/tools/resolve-topic-hosts.test.ts` — 验证已有 topic 复用、无宿主时的新建建议、命名不一致下的归并。
- 创建：`src/runtime/tools/audit-topic-hosting.ts` — 审计 section 是否全部拿到 host、host 是否先于写入完成，以及 topic insertion plan 是否仍存在未托管项。
- 创建：`test/runtime/tools/audit-topic-hosting.test.ts` — 验证 `topic host gate` 的阻断与放行行为。
- 创建：`src/runtime/tools/build-topic-insertion-plan.ts` — 生成按 topic 分组的插入计划，明确哪些 section 追加、哪些修订、哪些触发新 topic。
- 创建：`test/runtime/tools/build-topic-insertion-plan.test.ts` — 验证 topic 计划中的 `append / revise / create-topic / conflict` 决策。
- 创建：`src/runtime/tools/audit-extraction-coverage.ts` — 只负责 block 级覆盖率、低产区和漏读检查。
- 创建：`test/runtime/tools/audit-extraction-coverage.test.ts` — 验证 `block coverage gate`。
- 修改：`src/runtime/tool-catalog.ts` — 暴露知识插入所需的新工具。
- 修改：`src/runtime/index.ts` — 导出新的 skill 支撑工具。
- 修改：`src/index.ts` — 对外导出新的 API。
- 修改：`test/runtime/skills/discovery.test.ts` — 覆盖 `knowledge-insert` skill 被发现。
- 修改：`test/runtime/tools/run-skill.test.ts` — 验证 `knowledge-insert` skill 能调用 `run_subagent` 和新的 `section / topic` 工具链。
- 修改：`test/runtime/agent-session.test.ts` — 验证主 agent 在知识插入请求中能走 `read_skill -> run_skill`，并由 skill 再编排 subagent。
- 修改：`test/runtime/live-llm-wiki-liiy.test.ts` — 用 stub 场景锁定 writer / reviewer subagent 的 topic 更新流程。

## 范围说明

本计划覆盖：

- `knowledge-insert` skill 的项目内落地
- 围绕大资源处理的 artifact 化准备与分块
- 抽取结果归并为 `section`
- `section` 到 `topic` 的托管决策
- 按 `topic` 分组生成插入计划
- skill 对 `worker / reviewer` subagent 的标准化使用方式
- 以 `draft_knowledge_page / apply_draft_upsert` 为出口的受治理写入

本计划明确不覆盖：

- 通用文档解析平台
- 图数据库写入优先的插入流程
- 自动创建 section 独立页面
- 大规模搜索系统
- 多 skill 联合自动化编排

## 关键边界

- `source block` 只是原文处理单位，不等于 wiki `section`
- `section` 是知识插入单位，必须带 evidence anchors
- `topic` 是 `section` 的托管单位；没有合适宿主时，才允许新建 `topic`
- 任何进入 durable write 的 `section`，都必须有明确的 `topic host`
- `sectionHints / topicHints` 只能作为非权威提示，不能直接驱动 host 决策或 insertion plan
- writer draft 必须显式保留 `topic -> sections[]` 结构，不允许先压成整页摘要再写回
- reviewer 必须检查 `section` 是否被抹平、`topic host` 是否被跳过
- 没有通过 `block coverage gate` 和 `topic host gate`，不能进入写入阶段

### 任务 1：建立知识插入 artifact 目录与资源准备工具

**文件：**
- 创建：`src/storage/knowledge-insert-artifact-paths.ts`
- 创建：`test/storage/knowledge-insert-artifact-paths.test.ts`
- 创建：`src/runtime/tools/prepare-source-resource.ts`
- 创建：`test/runtime/tools/prepare-source-resource.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/storage/knowledge-insert-artifact-paths.test.ts` 中新增：

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildKnowledgeInsertArtifactPaths } from '../../src/storage/knowledge-insert-artifact-paths.js';

describe('buildKnowledgeInsertArtifactPaths', () => {
  it('maps a run id into state/artifacts/knowledge-insert', () => {
    expect(buildKnowledgeInsertArtifactPaths('/tmp/llm-wiki-liiy', 'run-001').root).toBe(
      path.join('/tmp/llm-wiki-liiy', 'state', 'artifacts', 'knowledge-insert', 'run-001')
    );
  });
});
```

在 `test/runtime/tools/prepare-source-resource.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('prepared source resource src-001');
expect(JSON.parse(await readFile(resourceArtifactPath, 'utf8')).rawPath).toBe('raw/accepted/design.md');
expect(JSON.parse(await readFile(resourceArtifactPath, 'utf8')).structuredMarkdown).toContain('# Design Patterns');
expect(JSON.parse(await readFile(resourceArtifactPath, 'utf8')).sectionHints).toEqual([]);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/knowledge-insert-artifact-paths.test.ts test/runtime/tools/prepare-source-resource.test.ts`

预期：FAIL，缺少知识插入路径构造和资源准备工具。

- [ ] **步骤 3：编写最少实现代码**

`prepare_source_resource` 至少支持：

```ts
{
  manifestId: 'src-001',
  rawPath: 'raw/accepted/design.md',
  outputArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json'
}
```

产物中至少写入：

```json
{
  "manifestId": "src-001",
  "rawPath": "raw/accepted/design.md",
  "structuredMarkdown": "...",
  "sectionHints": [],
  "topicHints": [],
  "metadata": {
    "preparedAt": "2026-04-22T00:00:00.000Z"
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/knowledge-insert-artifact-paths.test.ts test/runtime/tools/prepare-source-resource.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/storage/knowledge-insert-artifact-paths.ts test/storage/knowledge-insert-artifact-paths.test.ts src/runtime/tools/prepare-source-resource.ts test/runtime/tools/prepare-source-resource.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts
git commit -m "feat: add knowledge insert resource preparation"
```

### 任务 2：增加原文分块、抽取批次归并与 block coverage gate

**文件：**
- 创建：`src/runtime/tools/split-resource-blocks.ts`
- 创建：`test/runtime/tools/split-resource-blocks.test.ts`
- 创建：`src/runtime/tools/merge-extracted-knowledge.ts`
- 创建：`test/runtime/tools/merge-extracted-knowledge.test.ts`
- 创建：`src/runtime/tools/audit-extraction-coverage.ts`
- 创建：`test/runtime/tools/audit-extraction-coverage.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/runtime/tools/split-resource-blocks.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('split resource into 6 source blocks');
expect(parsed.blocks[0]).toEqual(
  expect.objectContaining({
    blockId: 'block-001',
    headingPath: ['Design Patterns'],
    locator: expect.any(String)
  })
);
```

在 `test/runtime/tools/merge-extracted-knowledge.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('merged 3 extraction batches');
expect(parsed.sectionCandidates).toHaveLength(2);
expect(parsed.assertions[0]).toEqual(expect.objectContaining({ sectionCandidateId: 'sec-candidate-001' }));
```

在 `test/runtime/tools/audit-extraction-coverage.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('coverage audit failed');
expect(result.details.data?.coverage.completedBlocks).toBe(4);
expect(result.details.data?.coverage.sparseBlockIds).toEqual(['block-005']);
expect(result.details.data?.coverage.unreadBlockIds).toEqual(['block-006']);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/runtime/tools/split-resource-blocks.test.ts test/runtime/tools/merge-extracted-knowledge.test.ts test/runtime/tools/audit-extraction-coverage.test.ts`

预期：FAIL，缺少分块、抽取批次归并和 `block coverage gate` 工具。

- [ ] **步骤 3：编写最少实现代码**

`split_resource_blocks` 输出至少包含：

```json
{
  "blocks": [
    {
      "blockId": "block-001",
      "headingPath": ["Design Patterns"],
      "locator": "h1:Design Patterns#p1",
      "text": "..."
    }
  ]
}
```

`merge_extracted_knowledge` 输出至少归并：

- `entities`
- `assertions`
- `relations`
- `evidenceAnchors`
- `sectionCandidates`
- `topicHints`

`audit_extraction_coverage` 必须只做 block 级 gate，阻止“只有总结、没有覆盖”的假完成，并输出：

```json
{
  "status": "failed",
  "coverage": {
    "totalBlocks": 6,
    "completedBlocks": 4,
    "sparseBlockIds": ["block-005"],
    "unreadBlockIds": ["block-006"]
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/runtime/tools/split-resource-blocks.test.ts test/runtime/tools/merge-extracted-knowledge.test.ts test/runtime/tools/audit-extraction-coverage.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/runtime/tools/split-resource-blocks.ts test/runtime/tools/split-resource-blocks.test.ts src/runtime/tools/merge-extracted-knowledge.ts test/runtime/tools/merge-extracted-knowledge.test.ts src/runtime/tools/audit-extraction-coverage.ts test/runtime/tools/audit-extraction-coverage.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts
git commit -m "feat: add block extraction merge and coverage gate"
```

### 任务 3：增加 section 归并、topic 托管、topic host gate 与插入计划工具

**文件：**
- 创建：`src/runtime/tools/merge-section-candidates.ts`
- 创建：`test/runtime/tools/merge-section-candidates.test.ts`
- 创建：`src/runtime/tools/resolve-topic-hosts.ts`
- 创建：`test/runtime/tools/resolve-topic-hosts.test.ts`
- 创建：`src/runtime/tools/audit-topic-hosting.ts`
- 创建：`test/runtime/tools/audit-topic-hosting.test.ts`
- 创建：`src/runtime/tools/build-topic-insertion-plan.ts`
- 创建：`test/runtime/tools/build-topic-insertion-plan.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/runtime/tools/merge-section-candidates.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('merged 4 section candidates into 2 normalized sections');
expect(parsed.sections[0]).toEqual(
  expect.objectContaining({
    sectionId: 'section-001',
    title: 'Pattern Intent',
    evidenceAnchorIds: expect.arrayContaining(['anchor-001'])
  })
);
```

在 `test/runtime/tools/resolve-topic-hosts.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('resolved topic hosts for 3 sections');
expect(parsed.sections[0]).toEqual(
  expect.objectContaining({
    sectionId: 'section-001',
    hostTopicSlug: 'design-patterns',
    hostAction: 'reuse-topic'
  })
);
expect(parsed.sections[2]).toEqual(
  expect.objectContaining({
    sectionId: 'section-003',
    hostAction: 'create-topic'
  })
);
```

在 `test/runtime/tools/audit-topic-hosting.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('topic host audit failed');
expect(result.details.data?.hosting.unhostedSectionIds).toEqual(['section-003']);
expect(result.details.data?.hosting.canBuildInsertionPlan).toBe(false);
```

在 `test/runtime/tools/build-topic-insertion-plan.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('built topic insertion plan for 2 topics');
expect(parsed.topics[0]).toEqual(
  expect.objectContaining({
    topicSlug: 'design-patterns',
    action: 'revise-topic',
    sections: expect.arrayContaining([
      expect.objectContaining({ sectionId: 'section-001', action: 'append-section' })
    ])
  })
);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/runtime/tools/merge-section-candidates.test.ts test/runtime/tools/resolve-topic-hosts.test.ts test/runtime/tools/build-topic-insertion-plan.test.ts`

预期：FAIL，缺少 section 归并、topic 托管、`topic host gate` 和插入计划工具。

- [ ] **步骤 3：编写最少实现代码**

`merge_section_candidates` 必须把同一主题但来源于多个 block 的 section candidate 归并为统一 section，并保留：

- `sectionId`
- `title`
- `summary`
- `entityIds`
- `assertionIds`
- `evidenceAnchorIds`

`resolve_topic_hosts` 必须优先复用已有 topic，仅当没有合适宿主时才建议新建 topic，输出至少包含：

```json
{
  "sections": [
    {
      "sectionId": "section-001",
      "hostTopicSlug": "design-patterns",
      "hostAction": "reuse-topic"
    },
    {
      "sectionId": "section-003",
      "suggestedTopicTitle": "Pattern Constraints",
      "hostAction": "create-topic"
    }
  ]
}
```

`audit_topic_hosting` 必须作为 `topic host gate`，单独阻断以下情况：

- 有 `section` 没拿到 host
- host 决策还停留在 hint，而不是显式 `reuse-topic / create-topic`
- 已生成 topic insertion plan，但 plan 中仍存在未托管 section

示例输出：

```json
{
  "status": "failed",
  "hosting": {
    "unhostedSectionIds": ["section-003"],
    "canBuildInsertionPlan": false
  }
}
```

`build_topic_insertion_plan` 必须按 topic 聚合 section，生成：

- `topicSlug`
- `action` (`reuse-topic` / `create-topic` / `revise-topic` / `conflict`)
- `sections[]`
- `conflicts[]`
- 且禁止直接消费 `sectionHints / topicHints` 生成最终 plan，hint 只能作为辅助字段进入 `resolve_topic_hosts`

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/runtime/tools/merge-section-candidates.test.ts test/runtime/tools/resolve-topic-hosts.test.ts test/runtime/tools/build-topic-insertion-plan.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/runtime/tools/merge-section-candidates.ts test/runtime/tools/merge-section-candidates.test.ts src/runtime/tools/resolve-topic-hosts.ts test/runtime/tools/resolve-topic-hosts.test.ts src/runtime/tools/audit-topic-hosting.ts test/runtime/tools/audit-topic-hosting.test.ts src/runtime/tools/build-topic-insertion-plan.ts test/runtime/tools/build-topic-insertion-plan.test.ts src/runtime/tool-catalog.ts src/runtime/index.ts src/index.ts
git commit -m "feat: add section merge topic host gate and planning"
```

### 任务 4：编写 `knowledge-insert` skill 文档与 subagent 编排规则

**文件：**
- 创建：`.agents/skills/knowledge-insert/SKILL.md`
- 修改：`test/runtime/skills/discovery.test.ts`
- 修改：`test/runtime/tools/run-skill.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/runtime/skills/discovery.test.ts` 中新增断言：

```ts
expect(result.skills.map((skill) => skill.name)).toContain('knowledge-insert');
```

在 `test/runtime/tools/run-skill.test.ts` 中新增场景，要求 `knowledge-insert` skill 的 `allowed-tools` 至少包含：

```ts
[
  'find_source_manifest',
  'read_source_manifest',
  'prepare_source_resource',
  'split_resource_blocks',
  'merge_extracted_knowledge',
  'merge_section_candidates',
  'resolve_topic_hosts',
  'audit_topic_hosting',
  'build_topic_insertion_plan',
  'audit_extraction_coverage',
  'run_subagent',
  'read_artifact',
  'draft_knowledge_page',
  'apply_draft_upsert',
  'list_wiki_pages',
  'read_wiki_page',
  'lint_wiki'
]
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/runtime/skills/discovery.test.ts test/runtime/tools/run-skill.test.ts`

预期：FAIL，项目内不存在 `knowledge-insert` skill。

- [ ] **步骤 3：编写最少实现代码**

在 `.agents/skills/knowledge-insert/SKILL.md` 中明确：

- 先准备资源 artifact，再切 `source blocks`
- 对大资源必须分批启动 `worker` subagent 抽取
- block 抽取完成后先归并为 `section`
- 每个 `section` 都必须先找到 `topic host`
- `sectionHints / topicHints` 只能辅助归并与 host resolve，不能直接驱动最终 plan
- 必须先过 `block coverage gate`，再过 `topic host gate`
- 只有 `section` 和 `topic` 两层都通过 gate，才能进入写入
- 对重要写入结果，必须再起 `reviewer` subagent 检查是否贴源

frontmatter 示例：

```md
---
name: knowledge-insert
description: 将新资源拆分、抽取、归并为 section，并托管到 topic 后写回 wiki。
allowed-tools:
  - find_source_manifest
  - read_source_manifest
  - prepare_source_resource
  - split_resource_blocks
  - merge_extracted_knowledge
  - merge_section_candidates
  - resolve_topic_hosts
  - audit_topic_hosting
  - build_topic_insertion_plan
  - audit_extraction_coverage
  - run_subagent
  - read_artifact
  - draft_knowledge_page
  - apply_draft_upsert
  - list_wiki_pages
  - read_wiki_page
  - lint_wiki
---
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/runtime/skills/discovery.test.ts test/runtime/tools/run-skill.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add .agents/skills/knowledge-insert/SKILL.md test/runtime/skills/discovery.test.ts test/runtime/tools/run-skill.test.ts
git commit -m "feat: add knowledge insert skill"
```

### 任务 5：接通 `knowledge-insert` 的主路径与治理出口

**文件：**
- 修改：`test/runtime/agent-session.test.ts`
- 修改：`test/runtime/live-llm-wiki-liiy.test.ts`
- 复用：`src/runtime/tools/draft-knowledge-page.ts`
- 复用：`src/runtime/tools/apply-draft-upsert.ts`
- 复用：`src/runtime/tools/lint-wiki.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/runtime/agent-session.test.ts` 中新增知识插入请求场景，要求主 agent 至少调用：

```ts
['read_skill', 'run_skill']
```

并让 `run_skill` 内部再调用：

```ts
[
  'prepare_source_resource',
  'split_resource_blocks',
  'run_subagent',
  'merge_extracted_knowledge',
  'merge_section_candidates',
  'resolve_topic_hosts',
  'build_topic_insertion_plan',
  'audit_extraction_coverage'
]
```

在 `test/runtime/live-llm-wiki-liiy.test.ts` 中增加一个端到端 stub 场景，要求：

- writer subagent 基于 topic insertion plan 产出 topic draft artifact，且 artifact 中必须显式保留 `topic -> sections[]` 结构
- reviewer subagent 对照原文和 topic draft 输出 pass / fail receipt，并检查是否把 `section` 压成一次性摘要
- 最终只在 pass 时调用 `apply_draft_upsert`
- 写后总是调用 `lint_wiki`

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/runtime/agent-session.test.ts test/runtime/live-llm-wiki-liiy.test.ts`

预期：FAIL，当前 runtime 还没有 `knowledge-insert` 主路径。

- [ ] **步骤 3：编写最少实现代码**

优先保持实现窄而稳：

- 不让主 agent 自己消费大段 block 抽取结果
- `run_skill` 只返回短结果和必要 artifact path
- 由 `knowledge-insert` skill 先形成 `topic insertion plan`
- writer subagent 只按 `topic insertion plan` 写 topic 更新草稿，不允许绕过 plan 直接拼整页摘要
- reviewer subagent 只检查“是否贴源、是否漏 section、是否误建 topic、是否把 section 粒度抹平”
- 最终统一走 `draft_knowledge_page / apply_draft_upsert`

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/runtime/agent-session.test.ts test/runtime/live-llm-wiki-liiy.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add test/runtime/agent-session.test.ts test/runtime/live-llm-wiki-liiy.test.ts
git commit -m "feat: connect knowledge insert skill to topic-centered write path"
```

## 验证清单

- [ ] `npx vitest run test/storage/knowledge-insert-artifact-paths.test.ts test/runtime/tools/prepare-source-resource.test.ts`
- [ ] `npx vitest run test/runtime/tools/split-resource-blocks.test.ts test/runtime/tools/merge-extracted-knowledge.test.ts test/runtime/tools/audit-extraction-coverage.test.ts`
- [ ] `npx vitest run test/runtime/tools/merge-section-candidates.test.ts test/runtime/tools/resolve-topic-hosts.test.ts test/runtime/tools/audit-topic-hosting.test.ts test/runtime/tools/build-topic-insertion-plan.test.ts`
- [ ] `npx vitest run test/runtime/skills/discovery.test.ts test/runtime/tools/run-skill.test.ts`
- [ ] `npx vitest run test/runtime/agent-session.test.ts test/runtime/live-llm-wiki-liiy.test.ts`
