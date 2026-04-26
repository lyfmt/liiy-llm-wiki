# Knowledge Insert Skill 当前实现说明

## 文档目的

本文档说明当前仓库里 `knowledge-insert` skill 的真实实现状态，重点回答以下问题：

- 这套 skill 现在到底怎么跑。
- 工具链在哪些层真正落地了。
- 真实链路已经打通到哪里。
- 当前还缺什么，为什么会缺。

本文档描述的是**当前实现**，不是理想目标，也不是未来规划。

## 当前目标

当前这套 `knowledge-insert` skill 的目标是：

1. 将新资源持久化为 `source`。
2. 将 `source` 切成稳定的 `source blocks`。
3. 通过 `worker` subagent 对 blocks 做抽取。
4. 将抽取结果归并为 `section`。
5. 为 `section` 选择或创建 `topic` 宿主。
6. 生成 `topic insertion plan`。
7. 通过 `writer` / `reviewer` 产出可治理的 wiki 写回。

核心约束是：

- `source block` 只是处理单位，不是 wiki 的 `section`。
- `section` 是知识插入单位。
- `topic` 是 section 的托管单位。
- durable write 前必须先过 `coverage gate` 和 `topic host gate`。

当前 skill 文件在：

- [.agents/skills/knowledge-insert/SKILL.md](/home/lyfmt/src/study/llm-wiki-liiy/.agents/skills/knowledge-insert/SKILL.md)

## 当前工具链

当前 `knowledge-insert` 已接入的主要工具如下：

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

- [src/runtime/tool-catalog.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tool-catalog.ts)

## 当前工作流

### 1. Source 持久化

用户上传文件后，运行时先将附件持久化为 accepted source。

相关工具：

- [create-source-from-attachment.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/create-source-from-attachment.ts)

真实产物示例：

- [state/artifacts/source-manifests/src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8.json](/home/lyfmt/src/study/llm-wiki-liiy/state/artifacts/source-manifests/src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8.json)
- [raw/accepted/attachments/src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8.md](/home/lyfmt/src/study/llm-wiki-liiy/raw/accepted/attachments/src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8.md)

### 2. Source Blocks

将 accepted source 转成可审计的 resource artifact，再切成 `source blocks`。

相关工具：

- [prepare-source-resource.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/prepare-source-resource.ts)
- [split-resource-blocks.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/split-resource-blocks.ts)

说明：

- 当前 splitter 已支持段落、列表、表格行。
- 对 PDF 转 markdown 后的大资源，会切出大量 block。

真实产物示例：

- [state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/prepared-resource.json](/home/lyfmt/src/study/llm-wiki-liiy/state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/prepared-resource.json)
- [state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/blocks.json](/home/lyfmt/src/study/llm-wiki-liiy/state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/blocks.json)

### 3. 大资源分批

针对长 PDF 或整本书，当前已经不再要求单个 `worker` 吞完整份 blocks，而是先做批次切分。

相关工具：

- [split-block-batches.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/split-block-batches.ts)

当前规则：

- 大资源会被拆成多个 `worker` batch。
- 当前默认批次大小倾向于每批约 `20-40` 个 blocks。

真实产物示例：

- [state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/batch-plan.json](/home/lyfmt/src/study/llm-wiki-liiy/state/artifacts/knowledge-insert/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8/batch-plan.json)

这份真实 batch plan 已将 719 个 blocks 拆成 24 个 `worker` 批次。

### 4. Worker Extraction

每个 `worker` subagent 读取单个批次的 `blocks.json`，并输出 extraction artifact。

当前 worker 的真实输出一般包含：

- `entities`
- `assertions`
- `relations`
- `evidenceAnchors`
- `sectionCandidates`
- `topicHints`

相关工具：

- [run-subagent.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/run-subagent.ts)

真实产物示例：

- [state/artifacts/subagents/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8--worker-batch-05/output/extraction.json](/home/lyfmt/src/study/llm-wiki-liiy/state/artifacts/subagents/run-src-attachment-880e06df-0fb3-47a3-b932-70a493ff81c8--worker-batch-05/output/extraction.json)

### 5. Merged Extracted Knowledge

主流程会把多个 `worker` extraction artifact 合并成统一的 `merged extracted knowledge`。

相关工具：

- [merge-extracted-knowledge.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/merge-extracted-knowledge.ts)

当前已补的真实兼容包括：

- `id` 到 `entityId / assertionId / relationId / anchorId / sectionCandidateId` 的归一化。
- `statement` 到 `text` 的归一化。
- `topic` 到 `topicSlug` 的归一化。
- 真实 worker 输出里的 `sectionId` 作为 `sectionCandidateId` 别名。
- 没有 `quote` 但有 `locator` 的 evidence anchor 也能保留。

### 6. Coverage Gate

当前覆盖率 gate 只在 block 级生效。

相关工具：

- [audit-extraction-coverage.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/audit-extraction-coverage.ts)

当前已补的规则：

- 坏 artifact 不再静默过滤，而是直接失败。
- PDF 页码 marker（例如 `-- 2 of 358 --`）会被忽略，不再误判成 unread block。

### 7. Section

当前 `section` 已修成**正文载体**，不再只是 `summary` 壳。

相关工具：

- [merge-section-candidates.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/merge-section-candidates.ts)

当前 `NormalizedKnowledgeSection` 至少包含：

- `sectionId`
- `title`
- `summary`
- `body`
- `entityIds`
- `assertionIds`
- `evidenceAnchorIds`
- `sourceSectionCandidateIds`
- `topicHints`

当前 `body` 的生成规则：

- 优先使用 section candidate 自带正文。
- 如果只有短 summary，则从相关 assertions 拼出正文段落。
- 最终 `body` 至少应比单句 summary 更接近原始资料表达。

真实验证产物示例：

- [state/artifacts/knowledge-insert/section-body-validation-001/sections.json](/home/lyfmt/src/study/llm-wiki-liiy/state/artifacts/knowledge-insert/section-body-validation-001/sections.json)

### 8. Topic Hosts 与 Topic Insertion Plan

当前实现是：

- `section -> topic host`

不是：

- `section -> taxonomy -> topic`

相关工具：

- [resolve-topic-hosts.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/resolve-topic-hosts.ts)
- [audit-topic-hosting.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/audit-topic-hosting.ts)
- [build-topic-insertion-plan.ts](/home/lyfmt/src/study/llm-wiki-liiy/src/runtime/tools/build-topic-insertion-plan.ts)

当前 `TopicInsertionPlanSection` 也已经保留：

- `sectionId`
- `title`
- `summary`
- `body`
- `action`

真实验证产物示例：

- [state/artifacts/knowledge-insert/section-body-validation-001/topic-plan.json](/home/lyfmt/src/study/llm-wiki-liiy/state/artifacts/knowledge-insert/section-body-validation-001/topic-plan.json)

### 9. Draft / Review / Writeback

当前 writer / reviewer / writeback 已经在真实链路的一个片段上跑通。

真实 reviewer 产物：

- [state/artifacts/subagents/live-pdf-batch05-write-001--reviewer-001/output/review.json](/home/lyfmt/src/study/llm-wiki-liiy/state/artifacts/subagents/live-pdf-batch05-write-001--reviewer-001/output/review.json)

真实写回页面：

- [wiki/topics/inheritablethreadlocal-的继承式线程局部变量传播.md](/home/lyfmt/src/study/llm-wiki-liiy/wiki/topics/inheritablethreadlocal-的继承式线程局部变量传播.md)

说明：

- 这次真实写回页证明了 `PDF -> extraction -> review -> wiki` 可以落地。
- 但这个已写回页面是在 `section` 还没修成正文载体之前生成的，因此正文内容仍偏薄，不代表现在的最新契约。

## 当前已解决的问题

截至当前实现，已经明确修掉的工具层问题包括：

1. `run_subagent` 输出目录校验过于死板。
2. 大 PDF 缺少稳定的 block 批次切分工具。
3. `merge_extracted_knowledge` 与真实 worker 输出 schema 不兼容。
4. coverage gate 将 PDF 页码 marker 误判为 unread block。
5. 中文 topic slug 生成不稳定。
6. `run_subagent` 在模型层 `503 / no channel` 错误时会直接炸链，而不是把失败回灌到上下文。
7. `section` 只保留 summary，不保留正文。

## 当前仍然存在的限制

### 1. 整本书级别的完整自动链路还不稳定

虽然大资源已经能分批，但远端模型通道仍会间歇返回：

- `503 No available channels for this model`

当前 `run_subagent` 已经不会因为这类错误直接炸掉整个 skill，而是会把失败作为 `failed receipt` 返回，但整本书级别的完整自动调度仍然受远端通道稳定性影响。

### 2. taxonomy 尚未实现

当前没有 taxonomy resolve / taxonomy audit / taxonomy write 工具。

所以现在只能做到：

- `section -> topic`

不能做到：

- `section -> taxonomy -> topic`

### 3. 已有真实写回页面未自动重写为新正文版

当前写入到 wiki 的真实页面，是在 `section.body` 修复前生成的。

所以如果要让 wiki 页面真正体现“正文载体 section”，还需要基于新的 `section.body` 再跑一次 writer / reviewer / writeback。

## 当前最准确的结论

当前这套 `knowledge-insert` skill 的真实状态是：

- 前半段工具链已经落地并在真实 PDF 上工作。
- 大资源分批已经落地并在真实 PDF 上工作。
- 真实 worker extraction 已经可以稳定产出结构化抽取结果。
- `section` 已经从 `summary` 壳修成正文载体。
- `topic insertion plan` 已经开始保留 `section.body`。
- reviewer 与 wiki 写回已经在真实片段链路上跑通过。

但还没有做到：

- 整本书范围的一次性完整自动写回。
- taxonomy 挂载。
- 已写回页面自动升级为最新版正文 section 结构。

## 建议的下一步

如果继续开发，优先级建议如下：

1. 让 writer 直接消费 `section.body`，而不是自己从 `summary` 再次压缩。
2. 基于新的 `section.body` 重跑真实 batch 片段写回，替换当前偏薄的 topic 页面。
3. 给整本书级别自动调度增加失败批次重试与断点续跑。
4. 单独补 taxonomy 层，而不是混在 topic host 里。
