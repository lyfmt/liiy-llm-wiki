# Agentic Graph Wiki 一阶段设计草案

## 1. 文档角色

- 初始日期：2026-04-19
- 文档角色：一阶段架构规格初稿
- 适用范围：图谱主导、taxonomy 主导、agent 驱动的本地知识系统

## 2. 设计结论

本阶段采用以下结论：

- 数据库是唯一事实源。
- 页面不是主数据，只是图谱对象的 projection。
- agent 读写的是对象、关系、陈述、证据，不是直接维护整页正文。
- `taxonomy` 是主分类体系，`tags` 仅允许作为后续补充检索字段，不参与主结构。
- 为未来检索扩展仅预留 `retrieval_text` 字段，不把 RAG 放入当前主设计中心。

## 3. 一阶段对象模型

### 3.1 通用字段

以下字段适用于全部一等对象：

| 字段 | 说明 |
| --- | --- |
| `id` | 全局稳定 ID，不依赖标题，不因改名而变化 |
| `kind` | 对象类型 |
| `title` | 主标题，用于展示与索引 |
| `summary` | 简明摘要，用于导航与 projection |
| `aliases` | 别名数组，用于检索与消歧 |
| `status` | 生命周期状态 |
| `confidence` | 置信度状态 |
| `provenance` | 来源方式，例如原文抽取、agent 综合、人工修订 |
| `review_state` | 审查状态 |
| `retrieval_text` | 面向后续检索的紧凑文本表示 |
| `created_at` | 创建时间 |
| `updated_at` | 最后更新时间 |

### 3.2 对象 schema 表

| 对象 | 角色 | 专有字段 | 关键约束 |
| --- | --- | --- | --- |
| `taxonomy` | 分类树节点，负责导航骨架 | `scope_note`、`sort_key` | 通过 `part_of` 形成分类树；不承载长篇正文 |
| `topic` | 主题总览节点 | `scope_note` | 应作为一个可聚合入口存在，可聚合 `section`、`entity`、`assertion` |
| `section` | 局部知识拆分节点 | `focus_note` | 必须通过 `part_of` 归属于某个 `topic` 或更上层 `section` |
| `entity` | 独立概念、人物、组织、术语节点 | `entity_type` | 不依赖某个单独页面正文存在，可被多个 `topic/section/assertion` 复用 |
| `source` | 来源对象 | `source_type`、`path`、`author`、`published_at`、`imported_at`、`hash` | 只描述来源身份与元数据，不直接承担知识结论 |
| `evidence` | 来源中的具体证据锚点 | `locator`、`excerpt` | 必须通过 `derived_from` 指向唯一 `source`；粒度应至少到章节、页码、段落或锚点 |
| `assertion` | 具体陈述，可被支撑、可被质疑、可被审查 | `statement`、`assertion_type` | 至少应通过 `about` 指向一个主题对象；推荐通过 `supported_by` 绑定证据 |

## 4. 关系模型

### 4.1 关系通用字段

以下字段适用于全部关系边：

| 字段 | 说明 |
| --- | --- |
| `edge_id` | 全局稳定边 ID |
| `from_id` | 起点对象 ID |
| `type` | 关系类型 |
| `to_id` | 终点对象 ID |
| `status` | 关系状态 |
| `confidence` | 关系置信度 |
| `provenance` | 关系来源方式 |
| `review_state` | 关系审查状态 |
| `sort_order` | 同级展示顺序 |
| `qualifiers` | 附加限定信息，例如角色、上下文、时间范围 |
| `created_at` | 创建时间 |
| `updated_at` | 最后更新时间 |

### 4.2 关系 schema 表

| 关系 | 起点 | 终点 | 作用 | 关键约束 |
| --- | --- | --- | --- | --- |
| `part_of` | `taxonomy / section` | `taxonomy / topic / section` | 形成层级或组成关系 | `taxonomy` 只能指向 `taxonomy`；`section` 只能指向 `topic` 或 `section`；一个 `section` 必须至少存在一条 `part_of` |
| `belongs_to_taxonomy` | `topic / section / entity` | `taxonomy` | 表达分类归属 | 一个对象可归属多个分类，但需有主排序规则 |
| `about` | `assertion` | `topic / section / entity` | 表达陈述针对的对象 | `assertion` 至少应存在一条 `about` |
| `mentions` | `topic / section / source / evidence / assertion` | `entity` | 表达提及关系 | 提及不等于定义或支撑 |
| `defines` | `assertion` | `entity` | 表达定义性陈述 | 应只用于高确定性的定义关系 |
| `supported_by` | `assertion` | `evidence` | 表达陈述由证据支撑 | 第一阶段默认只允许 `assertion -> evidence` |
| `derived_from` | `evidence` | `source` | 表达证据来自何处 | 每个 `evidence` 必须且只能指向一个 `source` |
| `related_to` | `topic / section / entity` | `topic / section / entity` | 表达弱关联或相关主题 | 仅作补充导航，不可替代强语义边 |
| `same_as` | 同类对象 | 同类对象 | 表达语义等价或标准化合并 | 应指向 canonical 对象，避免形成环形主链 |

## 5. 页面 projection 模型

页面不是事实源，而是 root node 的稳定阅读视图。

### 5.1 Projection 表

| Root 对象 | 默认展示形态 | 固定区块 | 主要查询关系 |
| --- | --- | --- | --- |
| `taxonomy` | 分类页 | 摘要、上级分类、下级分类、收录的 `topic`、收录的 `entity` | `part_of`、`belongs_to_taxonomy` |
| `topic` | 主题总览页 | 摘要、所属分类、下属 `section`、关键 `entity`、核心 `assertion`、主要 `evidence` 摘要 | `belongs_to_taxonomy`、`part_of`、`about`、`mentions`，再经由 `assertion -> supported_by` 聚合证据 |
| `section` | 局部知识页 | 所属 `topic`、局部说明、相关 `entity`、相关 `assertion`、支撑证据 | `part_of`、`mentions`、`about`，再经由 `assertion -> supported_by` 聚合证据 |
| `entity` | 概念或人物页 | 定义、别名、实体类型、相关 `topic`、相关 `section`、相关 `assertion`、来源概览 | `defines`、`mentions`、`about`，再经由 `assertion -> supported_by` 回溯证据 |
| `source` | 来源页 | 来源元数据、证据列表、由其支撑的 `assertion`、相关 `topic/entity` 概览 | `derived_from`，再逆向聚合 `supported_by` 与 `mentions` |
| `assertion` | 默认不作为公开主页面 | 在 `topic / section / entity / source` 页面中以内联陈述卡片展示 | `about`、`supported_by`、`defines` |
| `evidence` | 默认不作为公开主页面 | 在 `assertion` 卡片或来源页中以内联证据块展示 | `derived_from` |

### 5.2 Projection 约束

- 页面展示顺序优先依赖强语义边，不依赖正文自由链接。
- `topic` 页面中的证据不直接平铺全部 `evidence`，优先展示被核心 `assertion` 聚合后的证据摘要。
- `entity` 页面中的定义段应优先来自 `defines` 关系指向的高置信 `assertion`。
- `source` 页面必须可以回到原始路径与具体 `locator`。

## 6. Agent 操作模型

### 6.1 读路径

推荐读路径如下：

1. 从 `taxonomy` 或搜索结果进入入口对象。
2. 进入 `topic` 获取主题摘要与结构。
3. 按需展开 `section` 或 `entity`。
4. 读取相关 `assertion`。
5. 仅在需要证据时下钻到 `evidence`。

### 6.2 写路径

推荐写路径如下：

1. 新建或更新对象。
2. 建立 typed relations。
3. 新建或修订 `assertion`。
4. 绑定 `assertion -> evidence`。
5. 设置对象与关系的状态、置信度、来源与审查状态。
6. 由 projection 生成或刷新页面视图。

### 6.3 写入边界

- agent 不直接改写整页正文作为主操作。
- agent 的核心写入单位是对象、关系、陈述、证据绑定。
- 冲突信息优先保留为并存的 `assertion` 或待审状态，不直接覆盖旧知识。

## 7. 辅助索引与治理对象

以下内容不作为一等知识对象，但必须设计：

| 辅助层 | 作用 |
| --- | --- |
| `alias_index` | 维护别名、redirect、消歧入口 |
| `operation_log` | 记录 agent 与人工对图谱的变更历史 |
| `projection_cache` | 缓存页面 projection 结果，避免每次全量重算 |
| `finding` | 记录冲突、孤立、过时、缺证据等治理问题 |

## 8. 状态约束

### 8.1 `status`

- `draft`
- `active`
- `stale`
- `disputed`
- `archived`

### 8.2 `confidence`

- `asserted`
- `inferred`
- `weak`
- `conflicted`

### 8.3 `review_state`

- `unreviewed`
- `reviewed`
- `rejected`

### 8.4 `provenance`

- `source-derived`
- `agent-extracted`
- `agent-synthesized`
- `human-edited`

## 9. 一阶段范围边界

本阶段纳入范围：

- 一等对象建模
- typed relations 建模
- assertion 与 evidence 绑定
- taxonomy 导航
- 页面 projection 规则
- agent 读写路径约束

本阶段暂不纳入范围：

- 富媒体资产系统
- 复杂模板系统
- 高强度自动推理关系
- 专用图数据库产品切换
- 大规模向量检索体系

## 10. 实施前检查清单

- 每个一等对象都有稳定 `id`
- 每种关系都有合法起点与终点约束
- `assertion` 与 `evidence` 的绑定规则明确
- `evidence` 的 `locator` 粒度可回到原文位置
- `taxonomy` 与自由 `tags` 不形成双核心
- 页面 projection 规则已经固定
- agent 的读路径和写路径已经固定
- 冲突知识不会被无痕覆盖
- alias、redirect、消歧已经有辅助索引设计
