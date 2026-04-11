# LLM Wiki Agent 系统设计规格

## 1. 文档信息

- 日期：2026-04-11
- 主题：本地优先的 LLM Wiki Agent 系统设计
- 目标：产出一份可进入实现规划阶段的设计规格，明确系统目标、架构边界、核心对象、运行模型与首版范围
- 参考输入：
  - `rag/karpathy-llm-wiki-zh.md`
  - `pi-mono-stu/packages/ai/README.md`
  - `pi-mono-stu/packages/agent/README.md`
  - `pi-mono-stu/packages/coding-agent/README.md`

## 2. 项目目标

该项目是一个本地优先、面向个人知识沉淀的 LLM Wiki Agent 系统。

系统以长期维护 wiki 为核心任务，通过 agent 持续吸收原始资料、更新知识页面、回答问题、执行巡检，并把高价值结果沉淀回知识库。

在这个系统中：

- 用户负责提出任务、补充判断、审核高影响决策；
- agent 负责理解意图、生成计划、调用工具、更新 wiki、维护一致性；
- wiki 作为长期知识层存在于原始资料与后续使用之间，承担知识沉淀、组织与复用的职责。

## 3. 首版产品形态

第一阶段采用本地个人使用形态，重点是跑通完整闭环。

### 3.1 首版范围

首版覆盖以下能力：

- 接收文本 / Markdown 原始资料；
- 执行 ingest 请求；
- 基于现有 wiki 回答 query 请求；
- 对 wiki 执行基础 lint / 巡检；
- 将高价值结果写回 wiki；
- 维护 `index.md` 与 `log.md`；
- 记录运行态状态与候选改动；
- 在高影响动作时请求用户确认。

### 3.2 暂缓能力

首版暂缓以下方向：

- 图片、PDF、音视频等多模态资料处理；
- 向量检索基础设施；
- 多 agent 并行协作框架；
- 团队共享、权限治理、审阅流；
- 服务化部署；
- 复杂 Web UI；
- 大规模批处理与调度系统。

## 4. 设计原则

### 4.1 核心原则

1. **本地优先**：第一阶段围绕本地目录、本地文件系统与本地 Git 工作流设计。
2. **动态计划驱动**：用户发出请求后，agent 先理解意图，再生成本次计划，并在执行中按观察结果修订计划。
3. **知识持续沉淀**：摄入、问答与巡检的结果应优先沉淀进 wiki，形成长期可复用知识。
4. **半自动协作**：常规动作由 agent 自主完成，高影响动作进入 review gate。
5. **边界清晰**：原始资料、知识页面、规则文件、运行态数据各自职责清楚。
6. **状态可恢复**：每次请求都要有运行态记录，支持中断恢复与审计。
7. **Patch 优先**：更新 wiki 时优先增量修改，保持页面结构与链接关系稳定。

### 4.2 用户体验目标

系统应当具备以下体验：

- 用户可以直接发出自然语言请求；
- agent 能根据请求判断当前是 ingest、query、lint，或混合任务；
- agent 能生成本次工作计划并逐步执行；
- 需要确认时只在关键点打断用户；
- 最终结果既能在当前会话中体现，也能沉淀进 wiki。

## 5. 总体架构

### 5.1 一句话架构

采用 **单主 Knowledge Agent + 动态计划 + 能力集驱动 + 本地状态持久化** 的架构。

### 5.2 分层结构

| 层 | 作用 | 说明 |
| --- | --- | --- |
| Entry Layer | 接收用户请求 | 先以本地 chat / CLI 为主 |
| Intent & Plan Layer | 识别意图并生成临时计划 | 每次请求独立生成，可中途修订 |
| Capability Layer | 提供知识操作能力 | 读 source、查 wiki、摘要、改页、补链、巡检 |
| Policy Layer | 约束行为边界 | 原始资料只读、review gate、写入策略 |
| State Layer | 持久化运行态 | 保存 request、plan、证据、draft、changeset |
| Storage Layer | 存储原始资料与 wiki | 以本地文件系统为主 |
| Runtime Layer | 模型与 agent 运行时 | 基于 `pi-ai` 与 `pi-agent-core` |

### 5.3 主循环

系统主循环如下：

```text
理解请求
→ 生成当前计划
→ 调用能力执行
→ 观察结果
→ 修订计划
→ 完成 / 继续 / 请求确认
```

这里的「计划」是本次请求的运行时工作假设，用于指导当前任务的决策与执行。

## 6. 目录结构设计

建议项目目录如下：

```text
llm-wiki-liiy/
  raw/
    inbox/
    accepted/
    rejected/
  wiki/
    index.md
    log.md
    sources/
    entities/
    topics/
    queries/
  schema/
    agent-rules.md
    page-types.md
    update-policy.md
    review-gates.md
  state/
    runs/
    checkpoints/
    drafts/
    artifacts/
  docs/
    superpowers/
      specs/
```

### 6.1 目录职责

| 目录 | 角色 | 是否允许 agent 修改 |
| --- | --- | --- |
| `raw/` | 原始资料层 | 否，只读 |
| `wiki/` | 长期知识层 | 是 |
| `schema/` | 规则与建模层 | 默认谨慎修改 |
| `state/` | 运行态与中间产物 | 是 |
| `docs/` | 设计与规划文档 | 是 |

### 6.2 目录说明

- `raw/` 存放原始资料，作为知识吸收的输入层。
- `wiki/` 存放长期知识页面，是系统的核心产物。
- `schema/` 定义 agent 维护知识库时需要遵守的规则。
- `state/` 保存运行过程与中间结果，支持恢复与审计。
- `docs/` 保存设计文档与后续规划文档。

## 7. 核心对象模型

### 7.1 SourceManifest

代表一个原始资料对象。

建议字段：

- `id`
- `path`
- `title`
- `type`
- `status`（`inbox` / `accepted` / `rejected` / `processed`）
- `hash`
- `imported_at`
- `tags`
- `notes`

作用：将文件系统中的原始资料映射为系统可识别的知识输入单元。

### 7.2 KnowledgePage

代表 wiki 中的一个页面。

建议字段：

- `path`
- `kind`（`source` / `entity` / `topic` / `query`）
- `title`
- `aliases`
- `source_refs`
- `outgoing_links`
- `status`
- `updated_at`

建议页面类型如下：

- `sources/`：单来源摘要页；
- `entities/`：人、组织、概念、作品、系统等实体页；
- `topics/`：主题综述、比较页、争议页；
- `queries/`：具有长期价值的问题与回答。

### 7.3 RequestRun

代表一次用户请求的运行实例。

建议字段：

- `run_id`
- `user_request`
- `intent`
- `plan`
- `status`（`running` / `needs_review` / `done` / `failed`）
- `evidence`
- `touched_files`
- `decisions`
- `result_summary`

作用：把一次聊天式请求沉淀为可恢复、可追踪的工作对象。

### 7.4 ChangeSet

代表一次候选改动集合。

建议字段：

- `target_files`
- `patch_summary`
- `rationale`
- `source_refs`
- `risk_level`
- `needs_review`

作用：把候选写入动作显式化，便于用户审阅与系统恢复。

### 7.5 Finding

代表巡检或推理过程中发现的问题。

建议字段：

- `type`（`conflict` / `orphan` / `stale` / `missing-link` / `gap`）
- `severity`
- `evidence`
- `suggested_action`
- `resolution_status`

作用：把巡检结果变为持续可追踪对象，而不是一次性聊天输出。

## 8. 能力集设计

系统按能力域设计，而不是按固定 worker 切分。

### 8.1 能力域

| 能力域 | 作用 | 典型动作 |
| --- | --- | --- |
| Observe | 观察上下文 | 读 raw、读 wiki、搜索索引、查看链接关系 |
| Synthesize | 形成知识 | 摘要、抽取实体、归纳主题、识别冲突 |
| Mutate | 更新知识库 | 新建页、补丁修改、更新索引、追加日志 |
| Govern | 控制风险 | 评估影响范围、触发 review gate、限制写入边界 |
| Maintain | 维持健康 | 断链检查、孤儿页检测、结论老化检查 |

### 8.2 设计说明

- 能力集是系统的稳定边界；
- 每次请求如何组合这些能力，由 plan 决定；
- 智能性体现在运行时决策与规则遵守上。

## 9. 请求处理模型

### 9.1 Ingest 请求

当用户要求吸收新资料时，agent 可以生成如下计划形态：

1. 读取原始资料；
2. 判断资料价值与处理方式；
3. 查询现有 wiki 相关页面；
4. 生成摘要、候选实体与主题；
5. 形成 ChangeSet；
6. 评估风险；
7. 低风险直接 patch，高风险进入 review；
8. 更新 `index.md` 与 `log.md`。

### 9.2 Query 请求

当用户提出知识问题时，agent 可以生成如下计划形态：

1. 查询 wiki 中的相关页面；
2. 必要时回看 raw 资料补充证据；
3. 组织回答；
4. 判断本次结果是否具有长期价值；
5. 必要时沉淀为 query 页或 topic 页补丁。

### 9.3 Lint 请求

当用户要求巡检知识库时，agent 可以生成如下计划形态：

1. 扫描页面关系；
2. 检查孤儿页、断链、冲突、过期结论与缺失页面；
3. 生成 findings；
4. 自动修复低风险问题；
5. 输出高风险 review 清单。

### 9.4 Mixed 请求

系统支持在一个请求中同时处理多种任务，例如：

- 读一篇新资料；
- 对比现有观点；
- 更新相关页面；
- 给出当前结论变化。

因此，一个 `RequestRun` 内允许出现 ingest、query、compare、update 等混合动作。

## 10. 规则层设计

规则层负责保证系统稳定运行。

### 10.1 基础规则

| 规则 | 默认值 |
| --- | --- |
| `raw/` 是否可写 | 不可写 |
| wiki 更新策略 | Patch 优先 |
| 冲突处理 | 标注冲突与证据 |
| `log.md` | 只追加 |
| `index.md` | 结构化维护 |
| query 是否自动写回 | 仅高价值结果写回 |
| 高影响动作是否 review | 是 |

### 10.2 Review Gate 触发条件

以下情况默认进入 review gate：

- 重写核心 topic 页；
- 删除页面；
- 合并或拆分关键实体；
- 修改 schema 规则；
- 涉及多个主题页的基础判断变化；
- 存在明显证据冲突但无法自动决断。

### 10.3 Prompt / Schema 约束方向

system prompt 与 schema 文件应重点约束以下内容：

- 以维护长期 wiki 为主要职责；
- 优先复用现有 wiki；
- 写入时保留理由与来源；
- 先形成 plan，再开始执行；
- 高影响改动进入 review gate；
- 发现冲突、断链与知识空洞时主动记录。

## 11. 运行时与框架选型

### 11.1 推荐选型

- `pi-ai`：模型与 provider 统一抽象、tool schema、tool calling、流式输出；
- `pi-agent-core`：agent loop、消息状态、tool execution、hook、上下文变换；
- `pi-coding-agent`：作为产品形态和扩展机制的参考实现。

### 11.2 选型理由

| 组件 | 角色 | 作用 |
| --- | --- | --- |
| `pi-ai` | 模型层 | 提供多 provider、tool calling 与类型化 schema 能力 |
| `pi-agent-core` | Agent 运行时 | 提供状态管理、事件流、hook 与执行循环 |
| `pi-coding-agent` | 参考实现 | 提供 CLI、技能与扩展机制的实现参考 |

### 11.3 Hook 使用建议

`beforeToolCall` 与 `afterToolCall` 可用于强化边界：

- 阻止对 `raw/` 的写入；
- 拦截高风险 wiki 改动；
- 自动记录 artifacts 与审计信息；
- 把候选变更写入 `state/`。

## 12. 状态持久化与恢复

### 12.1 持久化目标

系统需要通过运行态持久化支持以下能力：

- 中断恢复；
- 改动追溯；
- 审阅待办；
- 历史运行回顾；
- 结果再次利用。

### 12.2 每次运行建议保存的 artifacts

每个 `run` 至少保存：

- `request.json`
- `plan.json` 或 `plan.md`
- `evidence.json`
- `draft.md` 或 `draft.json`
- `changeset.json`
- `result.md`
- `checkpoint.json`

### 12.3 Git 策略建议

| 内容 | 是否建议纳入 Git |
| --- | --- |
| `wiki/` | 是 |
| `schema/` | 是 |
| `raw/` | 视资料规模而定 |
| `state/` | 默认否 |

## 13. 验证设计

### 13.1 建议验证层次

| 层次 | 验证内容 |
| --- | --- |
| Schema test | frontmatter、plan、changeset 结构是否合法 |
| Prompt contract test | 是否附带来源、是否遵守 review gate |
| Golden dataset test | 使用固定 Markdown 数据集验证 ingest / query / lint |
| Diff review test | 页面改动是否稳定 |
| Recovery test | 中断后能否恢复运行 |
| Safety test | `raw/` 是否始终保持只读 |

### 13.2 MVP 阶段的关键验证点

1. 同一 source 重复 ingest 不应导致页面震荡；
2. query 回答必须能追溯到 wiki 或 raw 来源；
3. 高影响改动必须触发 review gate。

## 14. 实现前需要冻结的设计决策

在进入实现计划前，建议先冻结以下内容：

| 决策项 | 建议 |
| --- | --- |
| 页面分类 | `sources` / `entities` / `topics` / `queries` |
| 页面元数据 | 至少包含 `kind`、`title`、`source_refs`、`updated_at`、`status` |
| 运行态 plan 格式 | 每次 run 明确保存 |
| 改写策略 | Patch 优先 |
| review gate | 仅拦高影响动作 |
| query 写回规则 | 仅长期价值内容写回 |
| 状态落盘策略 | 使用 `state/runs/*` 保存 |
| 模型策略 | MVP 阶段优先单强模型 |
| Git 策略 | `wiki/` 与 `schema/` 入库，`state/` 默认不入库 |

## 15. 结论

本项目的首版形态应当是：

**一个本地优先的 Knowledge Agent 系统，以动态 plan 和能力集驱动工作，以 wiki 作为长期知识层，以 schema / policy 作为强约束边界。**

后续实现规划应围绕以下主线展开：

1. 建立目录与状态骨架；
2. 定义 page、run、changeset 等核心对象；
3. 落地基础能力集；
4. 编写 schema 与 review gate；
5. 基于 `pi-ai` 与 `pi-agent-core` 实现主 agent 运行模型。
