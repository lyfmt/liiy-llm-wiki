# LLM Wiki Agent 系统设计规格

## 1. 文档状态

- 初始日期：2026-04-11
- 本次更新：2026-04-13
- 文档角色：当前仓库的主规格文档（current main spec）
- 适用范围：产品方向、系统边界、当前最小实现、近中期演进方向

### 1.1 本文档的地位

本文档不再只是“进入实现前的设计提案”，而是当前系统的主规格说明。

它应当：

- 描述系统**现在是什么**；
- 约束系统**不应该被描述成什么**；
- 说明系统**接下来应如何演进**；
- 作为 [CLAUDE.md](../../../CLAUDE.md) 所引用的主要设计依据。

### 1.2 事实优先级

当不同材料出现冲突时，优先级如下：

1. 本文档与 [CLAUDE.md](../../../CLAUDE.md) 中更晚、且更明确的系统方向描述；
2. 当前实现中的真实边界与约束；
3. 历史性报告或阶段性总结。

以下文档可以保留为历史快照，但**不是**当前系统边界的主要事实来源：

- [docs/demo-report.html](../../demo-report.html)
- [docs/implementation-report.html](../../implementation-report.html)

### 1.3 写作原则

本文档中的能力描述必须遵守以下规则：

- 先写现状，再写方向；
- 未落地能力必须明确标注为“规划中”或“长期方向”；
- 不把 helper、fallback、baseline 描述为完整形态；
- 不把 review gate 拦下的动作描述为已经执行。

## 2. 产品身份与核心目标

本项目的目标不是做一个“稍微聪明一点的 deterministic retrieval pipeline”。

它的正确形态是：

- 一个 **local-first knowledge agent system**；
- 以 **wiki 作为长期知识表面（long-lived knowledge surface）**；
- 由 agent 驱动，对知识空间进行观察、导航、综合、维护与治理；
- 让有长期价值的结果沉淀回知识库，而不是停留在一次性回答里。

### 2.1 正确的问题定义

系统要解决的问题不是：

> 如何在一次请求里尽快选出一页并给出一个回答？

而是：

> 如何让 agent 在一个可持续维护的知识空间中导航、判断证据是否足够、给出回答或候选改动，并把长期价值沉淀回 wiki 或相关状态？

### 2.2 正确的长期方向

正确的长期工作流应当接近：

1. 用户发出自然语言请求；
2. agent 先检查 wiki 的现有结构与相关入口；
3. agent 结合页面摘要、链接、标签、别名和来源引用进行导航；
4. agent 判断证据是否充足；
5. agent 给出回答、候选改动，或请求 review；
6. 有长期价值的结果被沉淀为可追溯的知识或运行记录。

换句话说，系统应演进为 **navigation over knowledge space**，而不是 answer-first 的单次查询管线。

## 3. 核心原则

### 3.1 Agentic control flow, deterministic execution

系统必须保持以下分层：

- **Agentic**：判断先看什么、跟随哪些页面、何时证据足够、何时继续、何时写回；
- **Deterministic**：文件 I/O、manifest 解析、页面持久化、run state、review gate、patch 应用和审计状态迁移。

系统不应退化为：

- 一个完全硬编码、不可演进的流水线；
- 一个没有操作边界、可以任意改动知识库的自由 agent。

### 3.2 Wiki-first, not answer-first

wiki 不是输出仓库，也不只是聊天缓存。

它应当是：

- 知识被组织、回看、扩展和治理的主要表面；
- 人和 agent 都能持续使用的知识入口；
- 比当前会话更长寿的知识资产层。

### 3.3 Observe → Synthesize → Mutate → Govern

系统的健康默认顺序应是：

**Observe → Synthesize → Mutate → Govern**

含义如下：

- 先观察现有知识结构与证据；
- 再形成回答、判断或候选改动；
- 只在具有长期价值时写入；
- 对高影响动作应用规则与 review gate。

### 3.4 Keep contracts truthful

系统描述必须真实，不能夸大现有能力。

特别是：

- 当前是受边界约束的知识维护系统，不是已经完成的通用语义引擎；
- 当前 deterministic query flow 只是一个 baseline / helper，不应被描述为最终的 agentic navigation 形态；
- 当前写回能力必须显式受 policy 与 review gate 约束。

### 3.5 Prefer durable knowledge over ephemeral output

系统优先追求在会话结束后仍然有价值的产物，例如：

- 更好的 wiki 页面；
- 更清晰的导航结构；
- 更可追溯的 query 页；
- 更可检查的 findings、changesets 和 run records。

### 3.6 Prefer small, composable, observable capabilities

系统应优先采用小而清晰、可组合、可观察的能力，而不是一个“包办所有事”的大工具。

优先方向包括：

- 读取 wiki 入口页；
- 列出与定位页面；
- 跟随链接与引用；
- 读取带来源支撑的知识页；
- 形成有证据路径的回答或候选改动。

## 4. 当前系统边界

### 4.1 当前已经存在的最小实现

当前仓库已经具备一个可运行的最小骨架，而不是停留在纯设计阶段。

| 能力 | 当前状态 | 说明 |
| --- | --- | --- |
| CLI 入口 | 已有 | 支持 bootstrap、run、serve |
| Runtime agent orchestration | 已有 | 能做 intent 分类、工具编排、结果汇总 |
| Deterministic ingest/query/lint flows | 已有 | 作为知识维护的执行核 |
| Review gate | 已有 | 对高影响动作给出 needs_review 判断 |
| Run state persistence | 已有 | 保存 request、draft、result、changeset |
| Wiki 页面持久化 | 已有 | Markdown + YAML frontmatter |
| 最小 HTTP / HTML surface | 已有 | 可浏览与管理 wiki、sources、runs 等 |

### 4.2 当前仍应诚实描述为“部分实现”的能力

以下方向已经明确，但不应被描述为完全实现：

| 方向 | 当前状态 | 正确描述 |
| --- | --- | --- |
| Agentic navigation | 早期骨架 | 方向明确，但当前仍主要通过受限工具序列与 deterministic flow 落地 |
| Rich wiki navigation | 部分实现 | 已有 page kinds、summary、tags、outgoing links、source refs，但仍不完整 |
| Query writeback | 受控例外 | 仅在显式允许且内容具长期价值时才写回 |
| Lint autofix | 极小范围 | 当前只应允许低风险自动修复 |
| Web product surface | 初级形态 | 当前只有最小 HTTP / HTML surface，不是完整 web 产品 |

### 4.3 当前不应被误写成既成事实的方向

以下内容属于长期方向或规划中内容：

- 完整的 web knowledge wiki；
- 更成熟的 management console；
- 更丰富的 task publishing / tracking 层；
- 更强的 agentic navigation over page graph；
- 多 agent 并行协作；
- 多模态 ingest；
- 向量检索基础设施。

## 5. 持久层与目录职责

系统围绕四个持久层组织：

| 目录 | 角色 | 说明 | 是否允许 agent 直接写入 |
| --- | --- | --- | --- |
| `raw/` | 原始输入层 | 作为事实输入，通常只读 | 否 |
| `wiki/` | 长期知识层 | 存放长期知识页面与导航辅助页 | 是 |
| `schema/` | 规则与约束层 | 定义页面类型、更新策略、review 规则等 | 默认谨慎修改 |
| `state/` | 运行态与审计层 | 存放 run state、draft、result、changeset、findings 等 | 是 |

### 5.1 wiki/ 的职责

`wiki/` 是系统的长期知识表面，不只是“输出目录”。

它承载：

- 来源知识页；
- 实体页；
- 主题页；
- 具有长期价值的 query 页；
- 导航与审计辅助页。

### 5.2 raw/ 的职责

`raw/` 是事实输入层，不应被当作随意可写的工作目录。

它的职责是：

- 承接原始资料；
- 为 ingest 提供输入；
- 作为来源引用（source refs）的事实锚点。

### 5.3 schema/ 的职责

`schema/` 用于表达系统维护知识库时必须遵守的规则与约束，例如：

- 页面类型；
- 更新策略；
- review gate 触发条件；
- 维护原则与 agent rules。

### 5.4 state/ 的职责

`state/` 保存一次请求的运行对象，而不是长期知识本身。

它的核心职责包括：

- 记录 plan；
- 保存 draft；
- 保存 changeset；
- 保存 findings；
- 保存 result summary；
- 支持恢复、审计与回顾。

## 6. 核心对象与知识页面模型

### 6.1 SourceManifest

`SourceManifest` 代表一个原始资料对象，是 ingest 的确定性输入单元。

它通常需要表达：

- `id`
- `path`
- `title`
- `type`
- `status`
- `hash`
- `imported_at`
- `tags`
- `notes`

### 6.2 KnowledgePage

`KnowledgePage` 代表 wiki 中的一个持久化知识页。

当前核心元数据应至少支持：

- `path`
- `kind`
- `title`
- `aliases`
- `summary`
- `tags`
- `source_refs`
- `outgoing_links`
- `status`
- `updated_at`

当前落地形态是：

- Markdown 正文；
- YAML frontmatter 承载结构化元数据。

### 6.3 Page kinds

当前 wiki 的主页面类型如下：

| 类型 | 目录 | 角色 |
| --- | --- | --- |
| `source` | `wiki/sources/` | 单来源映射页或单来源摘要页 |
| `entity` | `wiki/entities/` | 人、组织、概念、系统等稳定实体页 |
| `topic` | `wiki/topics/` | 跨来源的主题综合页 |
| `query` | `wiki/queries/` | 具有长期价值的问题与回答沉淀页 |

### 6.4 导航与审计辅助页

以下页面属于 wiki 中的重要辅助页，但不等同于普通知识页：

| 文件 | 角色 |
| --- | --- |
| `wiki/index.md` | 结构化导航入口 |
| `wiki/log.md` | 追加式知识维护日志 |

它们的职责是辅助导航和审计，而不是替代 `topic` / `entity` / `source` / `query` 页面本身。

### 6.5 RequestRun

`RequestRun` 代表一次请求的运行实例，是操作与审计层对象，而不是知识页。

它通常包含：

- `run_id`
- `user_request`
- `intent`
- `plan`
- `status`
- `evidence`
- `touched_files`
- `decisions`
- `result_summary`

### 6.6 ChangeSet

`ChangeSet` 代表一次候选改动集合，用于把“可能发生的写入”显式化。

它至少应表达：

- `target_files`
- `patch_summary`
- `rationale`
- `source_refs`
- `risk_level`
- `needs_review`

### 6.7 Finding

`Finding` 代表在 lint、巡检或推理过程中发现的问题，例如：

- `conflict`
- `orphan`
- `stale`
- `missing-link`
- `gap`

`Finding` 的职责是把问题变为可追踪对象，而不是一次性的聊天输出。

## 7. 运行架构：Runtime Agent 与 Deterministic Flows

### 7.1 分层结构

当前推荐的系统理解方式如下：

| 层 | 责任 | 说明 |
| --- | --- | --- |
| Entry | 接收请求 | 当前包括 CLI 与最小 HTTP / HTML surface |
| Intent | 请求分类 | 将请求归类为 `ingest` / `query` / `lint` / `mixed` |
| Runtime orchestration | 运行 agent session | 组织消息、工具、plan 和结果汇总 |
| Runtime tools | 暴露给 agent 的能力包装 | 将具体能力以工具形式暴露给 runtime |
| Deterministic flows | 执行知识维护 | 真正承担 ingest/query/lint 副作用与结果计算 |
| Policy | 控制风险 | 判断是否进入 review gate |
| Storage / Domain | 持久化与结构建模 | 管理 page、manifest、run state、changeset、finding |

### 7.2 Runtime orchestration 的职责

runtime 层的职责应当集中在：

- 接收自然语言请求；
- 识别 intent；
- 选择最小安全工具序列；
- 汇总 tool outcomes；
- 形成 assistant summary；
- 保存 run state。

它**不应**承担所有知识维护细节的自由实现。

### 7.3 Deterministic flows 的职责

deterministic flow 层负责：

- 读取与校验输入；
- 形成稳定可测试的知识维护逻辑；
- 生成或应用 changeset；
- 评估 policy；
- 保存知识页和运行态。

系统的文件副作用与审计边界应尽量落在这一层，而不是落在开放式 prompt 推理里。

### 7.4 系统主循环

当前系统主循环可以概括为：

```text
接收用户请求
→ 分类 intent
→ 生成当前 plan 模板
→ 暴露最小安全工具集
→ 调用 deterministic flow
→ 评估 review gate / policy
→ 保存 request run state
→ 输出回答 / 候选改动 / review 请求
```

## 8. 请求模型

### 8.1 请求分类

当前系统把请求分为四类：

- `ingest`
- `query`
- `lint`
- `mixed`

这是一种受约束的执行入口分类，而不是一个无限开放的任务本体系统。

### 8.2 Ingest 请求

当用户要求吸收新资料时，系统应优先把 accepted raw source 转换为 wiki 中的长期知识。

当前 ingest 的正确形态应接近：

1. 解析 accepted source manifest；
2. 读取 raw source；
3. 形成 source / topic 等候选知识页；
4. 构造 changeset；
5. 评估 review gate；
6. 低风险写入，高风险进入 review；
7. 必要时更新 `wiki/index.md` 与 `wiki/log.md`；
8. 保存 run state。

### 8.3 Query 请求

当用户提出知识问题时，系统应优先从 wiki 导航和综合，而不是把 query 当作独立产品中心。

当前 query 的正确边界是：

- 默认从 wiki 读取、组织并回答；
- 可以结合已有页面的 summary、tags、aliases、outgoing links 和 source refs；
- 当前 deterministic query flow 只是 baseline / helper，不应被描述为最终 agentic navigation 形态；
- query writeback 只应作为受控例外，而不是默认行为。

### 8.4 Lint 请求

当用户要求巡检知识库时，系统应把 lint 视为知识质量维护能力，而不是普通代码 lint。

当前 lint 的正确形态是：

1. 扫描页面关系与元数据；
2. 检查 orphan、missing-link、conflict、stale、gap 等问题；
3. 生成 findings；
4. 只允许低风险 autofix；
5. 输出 review candidates 与运行结果。

### 8.5 Mixed 请求

系统支持混合请求，但混合请求不意味着允许无边界自由规划。

当前 mixed 请求的正确边界是：

- runtime 根据请求暴露最小安全工具组合；
- 运行时选择 minimum safe tool sequence；
- 写入动作仍受 deterministic flow 与 review gate 控制；
- 不允许把 mixed 当作逃逸规则边界的手段。

## 9. 能力轴：Observe / Synthesize / Mutate / Govern

这四类能力是系统的稳定抽象，不应被具体 flow 命名所取代。

| 能力轴 | 作用 | 当前典型表现 |
| --- | --- | --- |
| Observe | 观察知识结构与证据 | 读取 wiki 页面、查看 source refs、列出页面、扫描链接 |
| Synthesize | 形成判断与回答 | 总结页面、组合证据、组织 query 回答 |
| Mutate | 进行低风险或受控写入 | 新建/更新知识页、更新 index、追加 log、保存 query 页 |
| Govern | 控制风险与边界 | review gate、policy、truthful contracts、审计状态 |

### 9.1 ingest / query / lint 与能力轴的关系

| 工作流 | 主要能力组合 |
| --- | --- |
| ingest | Observe → Synthesize → Mutate → Govern |
| query | Observe → Synthesize → Govern（必要时受控 Mutate） |
| lint | Observe → Govern（必要时低风险 Mutate） |

## 10. 规则、治理与诚实边界

### 10.1 基础规则

| 规则 | 默认要求 |
| --- | --- |
| `raw/` 是否可写 | 不可写 |
| wiki 更新策略 | Patch-first，优先增量修改 |
| 冲突处理 | 保留冲突与证据，不强行抹平 |
| `wiki/log.md` | 只追加 |
| `wiki/index.md` | 结构化维护 |
| query 是否默认写回 | 否 |
| 高影响动作是否 review | 是 |
| 是否允许夸大能力 | 否 |

### 10.2 Review gate 触发条件

以下情况默认应进入 review gate：

- rewrites a core topic page；
- deletes wiki content；
- merges or splits key entities；
- contains unresolved evidence conflict；
- modifies schema rules；
- touches multiple topic pages；
- changeset explicitly marked for review。

### 10.3 受控写入原则

系统的写入必须遵守：

- 优先通过 deterministic flow 进行；
- 先形成 changeset，再决定是否应用；
- 写入必须带有来源、理由和 touched files；
- 如 review gate 阻断，则结果必须明确说明“需要 review”，而不是伪装为已写入。

### 10.4 受控例外原则

当前系统中以下能力属于受控例外，而不是默认行为：

- query writeback；
- lint autofix；
- 对 schema 的修改；
- 高影响、多页联动的知识改动。

### 10.5 遇到歧义时的默认行为

当前系统在遇到关键歧义时，应倾向于 **fail closed**，而不是自动猜测继续执行。

例如：

- source 解析不唯一时，应先停在 discovery / resolution 阶段；
- 冲突无法自动决断时，应进入 review；
- 不应因为 mixed 请求而绕过 policy 边界。

## 11. 产品表面与演进方向

### 11.1 当前已有的产品表面

当前系统已经有以下表面：

| 表面 | 当前状态 | 角色 |
| --- | --- | --- |
| CLI | 已有 | bootstrap、run、serve |
| Runtime tool surface | 已有 | 供 agent session 调用的能力接口 |
| 最小 HTTP / JSON surface | 已有 | 暴露 wiki、sources、runs、tasks、changesets 等 |
| 最小 HTML surface | 已有 | 浏览 dashboard、wiki index、wiki page、sources、runs 等 |

### 11.2 长期产品方向

长期来看，系统应大于 CLI runtime，并逐步演进到以下产品面：

1. **Web knowledge wiki**：为人和 agent 提供可浏览的知识入口；
2. **Management console**：管理 source、wiki、schema、run state、changeset 和 review 决策；
3. **Task publishing and tracking**：把知识工作作为一等对象发布和跟踪；
4. **Chat operations backend**：把请求、plan、tool traces、evidence、touched files、draft changes、result summaries 暴露为执行界面。

### 11.3 当前与长期方向的区分

必须明确区分：

- 当前已存在的是**最小表面**；
- 长期方向是**更完整的知识与操作系统**；
- 文档不能把长期方向写成当前已经完成的产品形态。

## 12. 规格到当前实现的映射

为减少设计与实现漂移，核心概念应能映射到当前代码锚点。

| 规格概念 | 当前实现锚点 |
| --- | --- |
| Runtime session | [src/runtime/agent-session.ts](../../../src/runtime/agent-session.ts) |
| Runtime system prompt | [src/runtime/system-prompt.ts](../../../src/runtime/system-prompt.ts) |
| Intent classification | [src/runtime/intent-classifier.ts](../../../src/runtime/intent-classifier.ts) |
| Runtime run state aggregation | [src/runtime/request-run-state.ts](../../../src/runtime/request-run-state.ts) |
| Runtime tools | [src/runtime/tools/](../../../src/runtime/tools/) |
| Ingest flow | [src/flows/ingest/run-ingest-flow.ts](../../../src/flows/ingest/run-ingest-flow.ts) |
| Query flow | [src/flows/query/run-query-flow.ts](../../../src/flows/query/run-query-flow.ts) |
| Lint flow | [src/flows/lint/run-lint-flow.ts](../../../src/flows/lint/run-lint-flow.ts) |
| Review gate | [src/policies/review-gate.ts](../../../src/policies/review-gate.ts) |
| Project scaffold | [src/app/bootstrap-project.ts](../../../src/app/bootstrap-project.ts) |
| Minimal HTTP / HTML surface | [src/app/web-server.ts](../../../src/app/web-server.ts) |
| Top-level product guidance | [CLAUDE.md](../../../CLAUDE.md) |

## 13. 验证与文档维护

### 13.1 规格验证要求

每次更新本文档后，都应至少检查：

- 文中“当前已有能力”是否能映射到对应代码路径；
- 是否残留明显的 pre-implementation 表述；
- 是否把未来方向误写成既成事实；
- 是否保持了 truthful contracts。

### 13.2 如果涉及实现同步

如果后续更新本文档时同时修改了行为或示例命令，则应按改动范围做验证，例如：

- `npm run build`
- `npm run typecheck`
- `npm test`
- `node dist/cli.js bootstrap <tmp-root>`
- `node dist/cli.js serve <tmp-root> 0`

### 13.3 维护原则

本文档应被视为 living spec，而不是一次性提案。

如果实现已经出现明确的新决策，应当：

- 及时更新本文档；或
- 回调实现，使其重新对齐本文档与 [CLAUDE.md](../../../CLAUDE.md) 的方向。

不应长期容忍“设计、代码、报告三套说法并存且互相冲突”的状态。

## 14. 非目标与暂缓方向

以下内容不应作为当前系统的默认承诺：

- 多模态 ingest；
- 向量检索基础设施；
- 多 agent 并行协作框架；
- 团队共享与复杂权限治理；
- 大规模批处理与调度系统；
- 把 query flow 描述成最终完成的 agentic knowledge navigation。

它们可以作为后续方向，但不应污染当前系统边界的描述。

## 15. 结论

本项目当前应被准确描述为：

**一个 local-first knowledge agent system，以 wiki 作为长期知识表面，以 runtime orchestration 负责受控 agentic 决策，以 deterministic flows / policy / storage 负责可测试、可审计、可恢复的知识维护执行。**

后续演进应继续遵守以下主线：

1. 强化 wiki-first 的知识导航；
2. 保持 agentic control flow 与 deterministic execution 的分层；
3. 优先沉淀 durable knowledge，而不是优化一次性回答；
4. 通过 review gate、changeset 与 run state 保持写入真实、可审计、可回顾；
5. 在扩展 web 与任务系统时，不牺牲现有边界的诚实性与清晰度。
