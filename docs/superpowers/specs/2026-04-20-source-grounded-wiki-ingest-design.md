# Source-grounded Wiki Ingest 一阶段设计草案

## 1. 文档角色

- 初始日期：2026-04-20
- 文档角色：围绕 A 方案重写后的 source-grounded ingest 规格
- 适用范围：大体量资料上传后的知识入库、section 贴源拆分、topic 总览聚合

## 2. 设计结论

本阶段采用以下结论：

- `topic` 只做总览，不再承担大部分细节知识。
- `section` 是主知识承载层，必须尽量贴近原始 `source`。
- 保留 `evidence` 这个实现名，但其一阶段语义提升为 `source anchor`：它既服务于 `assertion`，也服务于 `section` 的贴源索引。
- 原始资料进入系统后，不应只生成一个 `topic`；至少要生成可回跳原文的 `section`。
- 信息不足时，不让 agent 硬补，而是沿 `section -> evidence -> source` 回源。

## 3. 重新定义后的对象职责

### 3.1 一等对象角色表

| 对象 | 角色 | 本阶段职责 |
| --- | --- | --- |
| `taxonomy` | 主导航树 | 承担分类骨架，不承载原文细节 |
| `topic` | 总览页 | 只总结主题范围、主 section、关键 entity/assertion |
| `section` | 主知识层 | 贴近 source 的局部知识单元，是正文主承载层 |
| `entity` | 独立概念页 | 复用型概念、人物、组织、术语节点 |
| `source` | 原始资料身份层 | 记录来源元信息与原始路径 |
| `evidence` | 源文锚点层 | 表示 source 中可定位、可回跳的片段锚点 |
| `assertion` | 可审查陈述层 | 表达更高层次的归纳、判断或定义 |

### 3.2 `topic` 的新定位

`topic` 只承担以下内容：

- 主题范围摘要
- 所属 taxonomy
- 下属 `section`
- 关键 `entity`
- 关键 `assertion`

`topic` 不再被视为 ingest 的主要正文产物。

### 3.3 `section` 的新定位

`section` 是这套 wiki 的正文主层，必须满足：

- 至少通过一条 `part_of` 归属于某个 `topic`
- 至少通过一条 `grounded_by` 指向一个 `evidence`
- 摘要与内容必须尽量贴近对应 source 片段
- 不足以自洽时，允许回跳原始 source，而不是由 LLM 硬补

### 3.4 `evidence` 的新定位

本阶段继续使用 `evidence` 这个节点名，但一阶段语义改为：

- 它是 `source` 中的可定位锚点
- 既可被 `assertion` 通过 `supported_by` 引用
- 也可被 `section` 通过 `grounded_by` 引用

这意味着 `evidence` 在一阶段兼具两种用途：

- 证据锚点
- 原文回跳锚点

## 4. 数据字段调整

### 4.1 `section` 建议字段

| 字段 | 说明 |
| --- | --- |
| `focus_note` | 该 section 聚焦的原文局部范围 |
| `coverage_note` | 该 section 覆盖原文的说明 |
| `order_key` | 在 topic 下的展示顺序，第一阶段取该 section 覆盖 anchors 的最小 `order` |

### 4.2 `evidence` 建议字段

| 字段 | 说明 |
| --- | --- |
| `locator` | 原文定位信息，例如页码、标题路径、段落范围 |
| `excerpt` | 原文摘录 |
| `order` | 在 source 内的顺序号 |
| `heading_path` | 原文标题路径 |

其中 `locator`、`excerpt` 是必须项；`order` 与 `heading_path` 建议在一阶段纳入。

## 5. 关系模型调整

### 5.1 保留关系

以下关系继续保留：

- `part_of`
- `belongs_to_taxonomy`
- `mentions`
- `about`
- `supported_by`
- `derived_from`

### 5.2 新增关系：`grounded_by`

| 关系 | 起点 | 终点 | 作用 |
| --- | --- | --- | --- |
| `grounded_by` | `section` | `evidence` | 表达 section 直接基于哪些源文锚点整理而成 |

### 5.3 关系职责分工

- `section -> grounded_by -> evidence`
  - 用于表达 section 的贴源来源
- `assertion -> supported_by -> evidence`
  - 用于表达 assertion 的证据支撑

两者不能互相替代。

## 6. 写入顺序重构

大资料进入系统后，一阶段的正确顺序应为：

1. 注册并刷新兼容层 `source`
2. 从原文切出有序 `evidence/source anchors`
3. 生成 source 自身的结构轮廓
4. 生成一个总览性 `topic`
5. 生成贴源的 `section`
6. 用 `grounded_by` 把 section 绑回 evidence
7. 按需从 section 中抽 `entity/assertion`
8. 记录 source coverage，找出未被 section 覆盖的锚点

### 6.1 第一阶段的确定性 ID 规则

为了保证重复 ingest 可重跑，第一阶段固定：

- `topic.slug = <normalized-source-title>--<sourceId>`
- `topic.id = topic:<topic.slug>`
- `section.id = section:<topic.slug>#<section-order>`
- `evidence.id = evidence:<sourceId>#<anchor-order>`
- `source.id = source:<sourceId>`

### 6.2 第一阶段的重复 ingest 语义

第一阶段不做静默覆盖，固定规则如下：

- 若同一 source 再次 ingest，且生成的 `topic/section/evidence` 内容一致，则视为 `idempotent no-op`
- 若 `topic` 或 `section` 已存在且核心内容不同，则进入 `needs_review`
- 不允许在无人审查的情况下覆盖既有 `topic/section` 内容

## 7. 页面 projection 调整

### 7.1 `topic` 页

固定区块调整为：

- 主题摘要
- taxonomy
- section 列表
- section 的贴源概览
- 关键 entity
- 关键 assertion

### 7.2 `section` 页

一阶段应具备：

- section 摘要
- 所属 topic
- 绑定的 source anchor 列表
- 相关 entity
- 相关 assertion
- 回跳 source 的入口

### 7.3 `source` 页

一阶段应能看到：

- source 元数据
- source anchors / evidence 列表
- 由该 source 派生出的 section 概览
- 尚未被覆盖的 source anchors

## 8. Agent 读写模型调整

### 8.1 读路径

推荐读路径调整为：

1. 从 `taxonomy` 或搜索结果进入 `topic`
2. 从 `topic` 进入相关 `section`
3. 如信息仍不足，沿 `section -> grounded_by -> evidence -> source` 回源
4. 需要抽象判断时，再看 `assertion`

### 8.2 写路径

推荐写路径调整为：

1. ingest `source`
2. 提取 ordered `evidence/source anchors`
3. 生成 `topic`
4. 生成贴源 `section`
5. 建立 `grounded_by`
6. 再做 `entity/assertion` 抽取
7. 做 coverage 检查与 review

## 9. 辅助治理层

本阶段需要新增或强化以下辅助层：

| 辅助层 | 作用 |
| --- | --- |
| `source_coverage` | 记录哪些 evidence 已被 section 覆盖，哪些仍空缺 |
| `operation_log` | 记录 ingest 与结构化拆分过程 |
| `projection_cache` | 缓存 topic / section / source projection |

### 9.1 第一阶段的 `source_coverage` 记录方式

第一阶段不要求独立的 coverage 数据库表。

最小实现固定为：

- flow 在运行结束后把 coverage summary 落入 run state
- 未覆盖 anchor 的判定规则为：提取出的 `evidence` 中，未被任何 `section.grounded_by` 引用的 anchor
- summary 至少包含：
  - `total_anchor_count`
  - `covered_anchor_count`
  - `uncovered_anchor_ids`
  - `coverage_status`

## 10. 一阶段切片边界

本阶段优先做以下第一条切片：

- accepted source 进入系统后
- 至少能生成一个 `topic`
- 至少能生成一组贴源 `section`
- 每个 section 都带 `grounded_by -> evidence`
- 现有读取链路能看到 section 与其 source anchor 索引
- 与现有 `source manifest/raw source/wiki source page/index/log` 兼容层保持同步

本阶段暂不要求：

- 完整的 `entity` / `assertion` 自动抽取质量
- `section` / `entity` / `source` 全部成为独立成熟 graph root
- 大规模 source coverage 治理控制台

## 11. 取代说明

本规格取代“以 `topic` 首写为中心”的 graph write 方向。

后续实现计划应优先服务于：

- `source-grounded ingest`
- `section-first knowledge capture`
- `topic as overview`
