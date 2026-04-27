# Knowledge Insert Skill 实现现状说明

## 文档目的

本文档用于说明当前仓库中 `knowledge-insert` skill 的**真实实现状态**，重点回答以下问题：

1. 现在这套 skill 的工作流是什么。
2. 工具链已经落到了哪些层。
3. 真实链路已经打通到哪里。
4. 还缺什么，为什么会缺。
5. 当前 `section` 是否已经是“正文载体”，而不是“摘要壳”。

本文档描述的是**当前代码与已验证行为**，不是理想状态，也不是未来路线图。

## Skill 定位

当前 `knowledge-insert` 的目标是：

- 将新资源持久化为 accepted `source`
- 将 `source` 切成稳定的 `source blocks`
- 用 `worker` subagent 对 blocks 做 extraction
- 将 extraction 归并为 `section`
- 将 `section` 托管到 `topic`
- 生成 `topic insertion plan`
- 在必要时经过 `reviewer`
- 通过 `draft_knowledge_page / apply_draft_upsert` 写回 wiki

当前 skill 文件：

- `.agents/skills/knowledge-insert/SKILL.md`

## 当前工具链

当前 `knowledge-insert` 已接入的主要工具如下：

- `find_source_manifest`
- `read_source_manifest`
- `prepare_source_resource`
- `split_resource_blocks`
- `split_block_batches`
- `merge_extracted_knowledge`
- `audit_extraction_coverage`
- `merge_section_candidates`
- `resolve_topic_hosts`
- `audit_topic_hosting`
- `build_topic_insertion_plan`
- `run_subagent`
- `read_artifact`
- `draft_knowledge_page`
- `apply_draft_upsert`
- `list_wiki_pages`
- `read_wiki_page`
- `lint_wiki`

工具注册位置：

- `src/runtime/tool-catalog.ts`

## 当前主流程

### 1. Source 持久化

上传文件后，运行时会先将附件持久化为 accepted source。

相关工具：

- `src/runtime/tools/create-source-from-attachment.ts`

真实示例产物：

- `state/artifacts/source-manifests/src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8.json`
- `raw/accepted/attachments/src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8.md`
- `raw/accepted/attachments/src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8--original.pdf`

### 2. Source Blocks

accepted source 会被转换成 resource artifact，再切成 `source blocks`。

相关工具：

- `src/runtime/tools/prepare-source-resource.ts`
- `src/runtime/tools/split-resource-blocks.ts`

当前 splitter 已支持：

- 段落
- 列表
- 表格行

真实示例产物：

- `state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/prepared-resource.json`
- `state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/blocks.json`

### 3. 大资源分批

针对长 PDF 或整本书，当前已经不再让单个 worker 直接吞完整份 blocks，而是先做 block batch 切分。

相关工具：

- `src/runtime/tools/split-block-batches.ts`

当前规则：

- 大资源会被切成多个 worker 批次
- 当前默认倾向为每批约 `20-40` 个 blocks

真实示例产物：

- `state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/batch-plan.json`

这份真实 batch plan 已将 719 个 blocks 切成 24 个 worker 批次。

### 4. Worker Extraction

每个 worker subagent 读取单个 batch 的 `blocks.json`，写出 extraction artifact。

当前真实 worker 输出通常包含：

- `entities`
- `assertions`
- `relations`
- `evidenceAnchors`
- `sectionCandidates`
- `topicHints`

真实示例产物：

- `state/artifacts/subagents/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8--worker-batch-05/output/extraction.json`

### 5. Merge Extracted Knowledge

主流程会把多个 worker extraction 归并成统一的 merged artifact。

相关工具：

- `src/runtime/tools/merge-extracted-knowledge.ts`

当前已补的真实兼容包括：

- `id` 兼容到 `entityId / assertionId / relationId / anchorId / sectionCandidateId`
- `sectionId` 兼容到 `sectionCandidateId`
- `statement` 兼容到 `text`
- `topic` 兼容到 `topicSlug`
- 缺 `quote` 但有 `locator` 的 evidence anchor 也会保留

### 6. Coverage Gate

当前覆盖率 gate 只在 block 级生效。

相关工具：

- `src/runtime/tools/audit-extraction-coverage.ts`

当前已补的规则：

- 坏 artifact 不再静默过滤，而是直接失败
- PDF 页码 marker（例如 `-- 2 of 358 --`）不再误判成 unread block

### 7. Section

这是当前最近修的重点。

之前的 `section` 只是：

- `title`
- `summary`
- `assertionIds`
- `evidenceAnchorIds`

这会把 section 压扁成“摘要壳”。

现在的 `section` 已经改成**正文载体**，最少包含：

- `sectionId`
- `title`
- `summary`
- `body`
- `entityIds`
- `assertionIds`
- `evidenceAnchorIds`
- `sourceSectionCandidateIds`
- `topicHints`

相关工具：

- `src/runtime/tools/merge-section-candidates.ts`

当前 `body` 的生成策略：

1. 优先使用 section candidate 自带正文
2. 如果只有短 summary，则从相关 assertions 拼成正文段落
3. 最终 `body` 至少比单句 summary 更贴近原始资料内容

真实验证产物：

- `state/artifacts/knowledge-insert/section-body-validation-001/sections.json`

这份验证产物已经能看到：

- `summary`
- `body`
- `assertionIds`
- `evidenceAnchorIds`

其中 `body` 不再只是单句 summary，而是由多条 assertion 拼接而成。

### 8. Topic Host 与 Topic Insertion Plan

当前实现是：

- `section -> topic host`

不是：

- `section -> taxonomy -> topic`

相关工具：

- `src/runtime/tools/resolve-topic-hosts.ts`
- `src/runtime/tools/audit-topic-hosting.ts`
- `src/runtime/tools/build-topic-insertion-plan.ts`

当前 `TopicInsertionPlanSection` 也已经保留：

- `sectionId`
- `title`
- `summary`
- `body`
- `action`

真实验证产物：

- `state/artifacts/knowledge-insert/section-body-validation-001/topic-plan.json`

### 9. Draft / Review / Writeback

当前 writer / reviewer / writeback 已经在真实链路片段上跑通过。

真实 reviewer 产物：

- `state/artifacts/subagents/live-pdf-batch05-write-001--reviewer-001/output/review.json`

真实写回页面：

- `wiki/topics/inheritablethreadlocal-的继承式线程局部变量传播.md`

需要特别说明：

- 这份真实写回页面是在 `section.body` 修复前生成的
- 它证明了 `PDF -> extraction -> reviewer -> wiki` 这条链能落地
- 但不代表页面正文已经是最新 section 正文契约

## 当前真实验证到的程度

截至目前，已经真实验证过的部分包括：

1. PDF 上传并持久化为 accepted source
2. accepted source 切分为 blocks
3. 大资源 blocks 切成多个 worker batch
4. 至少部分真实 worker batch 已写出 extraction artifact
5. merged extraction 已能兼容真实 worker schema
6. block coverage gate 已能处理 PDF 页码 marker
7. `section.body` 已能由 assertions 构造成正文载荷
8. `topic insertion plan` 已保留 `section.body`
9. reviewer 与 wiki 写回已经在真实片段链路上通过

## 当前未完成的部分

### 1. 整本书级别的一次性完整自动写回还不稳定

虽然现在已经能：

- 切 batch
- 跑部分真实 extraction
- 用真实 extraction 继续往后推进

但整本书范围的全自动调度仍会受远端通道波动影响，典型错误是：

- `503 No available channels for this model`

### 2. taxonomy 尚未实现

当前没有：

- taxonomy resolve
- taxonomy audit
- taxonomy write

所以现在只能做到：

- `section -> topic`

不能做到：

- `section -> taxonomy -> topic`

### 3. 已写回页面尚未自动升级为新版 section 正文

目前已经写回的真实页面，是在 `section` 仍偏薄时生成的。

如果要让 wiki 页面真正体现“section 是正文载体”，还需要基于新的 `section.body` 再跑一次 writer / reviewer / writeback。

## 当前最准确的结论

当前这套 `knowledge-insert` skill 的真实状态是：

- 前半段工具链已经落地并在真实 PDF 上工作
- 大资源分批已经落地并在真实 PDF 上工作
- 真实 worker extraction 已经能产出结构化抽取结果
- `section` 已经从摘要壳修成正文载体
- `topic insertion plan` 已开始保留 `section.body`
- reviewer 与 wiki 写回已经在真实片段链路上跑通过

但还没有做到：

- 整本书范围的一次性完整自动写回
- taxonomy 挂载
- 已写回页面自动升级为最新版正文 section 结构

## 建议的下一步

如果继续开发，建议优先按下面顺序推进：

1. 让 writer 直接消费 `section.body`，不再只看 `summary`
2. 基于新的 `section.body` 重跑真实 batch 片段写回，替换当前偏薄的 topic 页面
3. 给整本书级别自动调度增加失败批次重试与断点续跑
4. 单独补 taxonomy 层，而不是继续把 taxonomy 逻辑挤进 topic host
