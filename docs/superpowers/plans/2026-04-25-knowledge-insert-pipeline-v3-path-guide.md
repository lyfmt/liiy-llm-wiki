# Knowledge Insert Pipeline V3 路径指导

## 目标

把知识插入从「agent 自由调用工具」改为「系统主导的固定 pipeline」。PG graph 保持主存储地位，文件系统只承担 source 原文、pipeline artifact、wiki 阅读投影和审计材料。

这份文档是路径指导，不包含实现代码。它用于统一方向、边界和推进顺序。

## 总体原则

- PG 是知识图谱的事实来源，topic、section、entity、concept、evidence、source 关系最终都写入 PG。
- wiki markdown 是阅读投影，不是主存储。
- pipeline artifact 是过程审计材料，不是长期知识主库。
- agent 不再监管流程，只在指定阶段返回结构化 JSON。
- pipeline 内 agent 不加载 skill，不读取 `SKILL.md`，不使用旧 runtime tool catalog。
- example 优先于抽象指令。每个 agent 阶段都必须有一份合格示例，系统用 schema 校验真实输出。

## 入口路径

### 路径一：上传入口自动触发

用户通过上传入口提交文件后，系统完成以下动作：

- 保存上传文件和 markdown 转换结果。
- 创建或复用 source manifest。
- 创建 pipeline run。
- 返回用户一个 pipeline run 状态。
- pipeline 在后台继续推进。

这个路径是主入口。它适合普通用户上传资料后自动进入知识库。

### 路径二：Chat 入口触发

用户在 chat 中要求「把这个文件加入知识库」时，agent 不再执行知识插入流程。

agent 只做一件事：

- 调用 pipeline launcher，把 attachment 或 source 交给上传入口同一套 pipeline。

agent 返回给用户的信息只包括：

- pipeline 已启动。
- run id。
- source id。
- 当前状态。
- 可查看的位置。

agent 不读取 pipeline artifact，不审查结果，不写 wiki，不写 PG。

## Pipeline 主路径

### 第一段：Source 进入系统

系统负责把上传文件转成可追踪 source：

- 原始文件进入 `raw/accepted`。
- source manifest 记录 source id、标题、路径、hash、导入时间和状态。
- source 页面可以作为阅读投影存在，但 source 的身份以 manifest 和 PG source node 为准。

这一段不需要 agent。

### 第二段：Source 内容准备

系统读取 source 原文，生成 canonical resource：

- 保留全文 markdown。
- 生成行号索引。
- 保留 source 元信息。
- 为后续 agent 阶段提供只读输入。

这一段不需要 agent。

### 第三段：Topic 规划

系统把全文、标题、目录和必要上下文交给 pipeline agent。

agent 只返回 topic plan：

- 一个或多个大范围 topic。
- 每个 topic 有稳定 id、slug、标题、范围说明和规划理由。
- topic 表达资料的大范围承载单元，不允许退化成单个 section 的别名。

系统校验 topic plan 后落盘为 artifact。

这一段的目标是先确定「资料应该挂到哪些大主题下」，而不是从 section hint 反推 topic。

### 第四段：Part 规划

系统把全文和 topic plan 交给 pipeline agent。

agent 只返回 partition plan：

- 每个 part 的 id。
- 标题。
- 起止行号。
- 所属 topic id。
- 切分理由。

agent 不复制原文，不生成 section，不抽 entity，也不创建 concept。

系统校验行号范围，确保：

- 起始行小于等于结束行。
- 行号在 source 范围内。
- part 之间没有非法重叠。
- 所有 part 能覆盖需要处理的内容。

### 第五段：Part 实体化

系统按照 partition plan 切分原文。

产物是 parts artifact：

- 每个 part 保留原文文本。
- 每个 part 保留 source id。
- 每个 part 保留起止行号。
- 每个 part 保留关联 topic id。

这一段不需要 agent。

### 第六段：Part 抽取

系统逐个 part 调用 pipeline agent。

agent 只返回 part extraction：

- sections。
- entities。
- concepts。
- evidence anchors。

section 在 V3 中是「知识凝练」，不是原文复写。它必须有 source 引用和 evidence anchor。

entity 表示可指称对象，例如类、框架、项目、人、书、API。

concept 表示抽象知识单元，例如机制、模式、原则、问题、方法。

evidence anchor 表示可回源证据，必须包含 locator、quote、起止行号。

系统校验每个 part extraction 后落盘。

### 第七段：知识连接

系统汇总所有 part extraction，生成 connected knowledge。

连接顺序固定：

- 先连接 topic。
- 再把 section 挂到 topic。
- 再把 entity 和 concept 挂到 section。
- 再把 evidence anchor 挂到 section。
- 最后补充 source、topic、section、entity、concept、evidence 之间的图关系。

这一段由系统完成，不由 agent 决策。

系统需要检查：

- 每个 section 至少挂到一个 topic。
- 每个 section 至少有一个 evidence anchor。
- 每个 section 引用的 entity、concept、evidence 都存在。
- 重复 entity 和 concept 可以合并。
- 冲突 entity 和 concept 进入 review，不静默覆盖。

### 第八段：Graph 写入准备

系统把 connected knowledge 转成 PG graph write。

PG graph write 包含：

- source node。
- topic node。
- section node。
- entity node。
- concept node。
- evidence node。
- graph edges。

这一段要保留稳定 id 映射：

- pipeline section id 映射到 graph section id。
- pipeline evidence anchor id 映射到 graph evidence id。
- pipeline concept id 映射到 graph concept id。

### 第九段：PG 写入

系统将 graph write 写入 PG。

写入策略：

- PG 是主存储。
- 写入必须具备幂等性。
- 相同内容重复写入应视为成功。
- 已存在但内容冲突的节点或边必须进入 review。
- PG 冲突时不得继续生成 wiki projection。

### 第十段：Wiki 投影

PG 写入成功后，系统从 PG graph 生成 wiki topic 页面。

wiki 页面用于阅读，不作为事实来源。

topic 页面应展示：

- topic 标题和摘要。
- section 列表。
- 每个 section 的凝练正文。
- 关联 entity。
- 关联 concept。
- source 引用和 evidence 摘录。

初期不强制为每个 section、concept、evidence 创建独立 markdown 页面。

### 第十一段：Lint 和完成

系统对 wiki projection 做 lint。

lint 通过后 pipeline 标记完成。

如果 PG 已写入但 wiki projection 失败，pipeline 不回滚 PG，而是记录 projection failure，允许之后重试 projection。

## Agent 边界

pipeline agent 只能出现在以下阶段：

- Topic 规划。
- Part 规划。
- Part 抽取。

pipeline agent 不能做以下事情：

- 不能加载 skill。
- 不能读取 wiki。
- 不能读取文件系统。
- 不能写 artifact。
- 不能写 PG。
- 不能写 wiki。
- 不能调用 `run_skill`。
- 不能调用旧 knowledge insert 工具链。
- 不能决定 pipeline 是否继续。

pipeline agent 的唯一职责是根据系统提供的输入和 example 输出 JSON。

## Example 策略

每个 agent 阶段都配一份 example。

example 的作用高于文字指导：

- agent 根据 example 模仿结构。
- schema 根据 example 和真实输出共同演进。
- 测试用 example 防止格式漂移。

建议维护这些示例：

- topic plan example。
- partition plan example。
- part extraction example。
- connected knowledge example。

示例存放在：

- `docs/superpowers/specs/examples/knowledge-insert-v3-topic-plan.example.json`
- `docs/superpowers/specs/examples/knowledge-insert-v3-partition-plan.example.json`
- `docs/superpowers/specs/examples/knowledge-insert-v3-part-extraction.example.json`
- `docs/superpowers/specs/examples/knowledge-insert-v3-connected-knowledge.example.json`

## PG 存储路径

PG graph 继续使用统一节点表和统一边表。

节点层：

- source 是资料身份。
- topic 是阅读入口和 section 宿主。
- section 是知识凝练单元。
- entity 是可指称对象。
- concept 是抽象知识单元，需要成为一等节点。
- evidence 是回源证据。
- taxonomy 是 topic 的分类位置。

边层：

- section part_of topic。
- section grounded_by evidence。
- evidence derived_from source。
- section mentions entity。
- section mentions concept。
- topic mentions entity。
- topic mentions concept。
- source mentions entity。
- source mentions concept。
- topic belongs_to_taxonomy taxonomy。

assertion 可以保留，但 V3 初期不把它作为核心产物。若后续需要精细事实断言，再从 section 中派生 assertion。

## 文件系统路径

文件系统承担 4 类职责。

第一类是 raw source：

- 保存上传原文。
- 保存 markdown 转换结果。
- 支持回源。

第二类是 pipeline artifact：

- 保存每次 pipeline run 的中间结果。
- 支持审计、重试和问题定位。
- 不作为长期知识主库。

第三类是 wiki projection：

- 从 PG 生成可读 markdown。
- 面向人阅读。
- 可被重新生成。

第四类是 example 和文档：

- 保存 schema 示例。
- 保存设计、计划和路径指导。

## 实施路径

### 第一阶段：建立边界

先完成 domain、schema、example、pipeline state。

这一阶段不接上传入口，不写 PG，只验证：

- stage 名称固定。
- schema version 固定。
- example 可被校验。
- pipeline artifact 路径安全。

### 第二阶段：跑通离线 pipeline

使用 fake agent output 跑通：

- source prepared。
- topic planned。
- parts planned。
- parts materialized。
- parts extracted。
- knowledge connected。

这一阶段仍不写真实 PG。

### 第三阶段：接入 PG graph write

把 connected knowledge 转为 graph write，并写入 fake PG client。

验证：

- concept 是一等节点。
- section、topic、source 能 mentions concept。
- evidence 能回到 source。
- 冲突进入 review。

### 第四阶段：接入真实 PG

通过 project env 中的 graph database 配置接入真实 PG。

验证：

- 重复写入幂等。
- 冲突不覆盖。
- graph write 后状态可恢复。

### 第五阶段：生成 wiki projection

从 PG graph 读取 topic projection，生成 wiki topic 页面。

验证：

- 页面包含 section。
- 页面包含 entity。
- 页面包含 concept。
- 页面包含 evidence 摘录和 source 引用。

### 第六阶段：接上传入口

上传后自动触发 pipeline。

验证：

- 上传接口快速返回。
- pipeline 后台运行。
- 用户能看到 run id 和状态。

### 第七阶段：接 chat 入口

新增 chat 可用的 pipeline launcher。

废弃旧 knowledge-insert skill 的自由工具链。

验证：

- agent 只能启动 pipeline。
- agent 不能监管 pipeline。
- skill allowed tools 只保留 pipeline launcher。

### 第八阶段：清理旧路径

保留旧 V2 工具的兼容测试，但从用户入口和 skill 入口移除旧自由调用路径。

最终状态：

- 新资料进入系统只走 pipeline。
- PG 是主存储。
- wiki 是投影。
- agent 是结构化阶段 worker，不是流程控制者。

## 验收标准

整体完成后，应满足：

- 上传文件可以自动启动 pipeline。
- chat 可以把 attachment 或 source 交给 pipeline。
- pipeline 可以在 fake agent output 下稳定跑完。
- pipeline 可以写入 PG。
- PG 中存在 source、topic、section、entity、concept、evidence 节点。
- PG 中存在 section 到 topic、section 到 evidence、evidence 到 source、section 到 entity、section 到 concept 的关系。
- wiki topic 页面可以从 PG projection 生成。
- 旧 knowledge-insert skill 不再拥有旧工具链。
- agent 不再自由调用知识插入内部工具。

## 风险与处理

### 风险一：concept 引入后影响旧 graph 查询

处理方式：

- concept 先作为 graph node kind 加入。
- projection 逐步支持 concept。
- 旧 entity 查询不强制改造。

### 风险二：pipeline agent 输出不稳定

处理方式：

- example 优先。
- schema 强校验。
- 每个 stage 最多重试 2 次。
- 仍失败则记录失败状态，不继续下游。

### 风险三：PG 写入成功但 wiki 投影失败

处理方式：

- 不回滚 PG。
- pipeline 状态记录 projection failure。
- 支持后续重试 projection。

### 风险四：旧 skill 路径未完全隔离

处理方式：

- skill allowed tools 只保留 pipeline launcher。
- 测试明确断言旧工具不通过 skill 暴露。
- 文档标记旧 skill 已废弃。

## 最终方向

V3 的核心不是多加几个工具，而是改变职责边界：

- 系统负责流程。
- agent 负责结构化判断。
- PG 负责主存储。
- wiki 负责阅读。
- artifact 负责审计。

这条路径能避免旧方案中 topic 被切碎、section 被主题化、hint 权重过高、agent 自由调用导致链路不可控的问题。

