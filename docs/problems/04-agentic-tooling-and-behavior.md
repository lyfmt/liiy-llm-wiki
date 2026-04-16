# 问题表单 04：Tool Call 与整体行为模式需要更 Agentic

## 1. 问题标题
当前系统的 tool call 与整体行为模式偏固定流程，缺少更自然的 agentic 行为

## 2. 当前现象
- 系统整体行为仍偏“死板”：
  - tool 使用像预设流程；
  - 对不同任务的策略切换不够自然；
  - 对观察、导航、澄清、执行、回写的选择不够灵活。
- 用户感受到的不是“会判断下一步的 agent”，更像“套了 agent 外观的固定流程”。

## 3. 期望行为
- 系统应更接近 agentic 工作方式：
  - 先观察知识空间；
  - 决定是否继续探索；
  - 必要时澄清；
  - 再综合、执行、回写；
  - 根据任务类型动态选择工具。
- tool call 应更像能力选择，而不是固定脚本步骤。

## 4. 用户价值
- 更符合本项目“wiki-first knowledge agent system”的方向。
- 让系统能区分：
  - 闲聊；
  - 查阅知识；
  - 维护知识；
  - 执行动作；
  - 请求审阅。
- 为后续真正的 agentic query / maintenance / publish 打基础。

## 5. 已知根因/背景
- 仓库设计方向在 `CLAUDE.md` 已经非常明确：
  - wiki-first
  - observe → synthesize → mutate → govern
  - agentic control flow + deterministic execution
- 但当前 web chat surface 仍更像固定工作流包装层。
- 已开始看：
  - `src/domain/system-prompt.ts`
  - `src/domain/intent-classifier.ts`
  - `src/domain/agent-session.ts`

## 6. 边界与约束
- 不应把系统放飞成“无边界自由 agent”。
- 仍需保留 deterministic/auditable 的执行层。
- 应在 agentic decision layer 与 deterministic execution layer 之间保持清晰边界。
- 需要注意产品描述诚实，不夸大当前能力。

## 7. 非目标
- 不是一步到位重写整个 agent runtime。
- 不是立刻接入复杂 planner / memory / autonomous loop 全家桶。
- 不是这一步就追求完全开放式 agent framework。

## 8. 影响范围
- system prompt
- intent classification
- tool routing / action selection
- run presentation
- 可能包括 wiki navigation/read/write 能力暴露方式

## 9. 初步验收标准
- [ ] 系统能区分不同任务类型并选择不同交互模式
- [ ] 普通聊天不被强行 workflow 化
- [ ] 知识查询更强调观察与导航，而不是直接套固定回答流程
- [ ] 需要执行或变更时，才进入更强约束的操作模式
- [ ] tool call 轨迹更符合任务本身，而不是所有任务都长得一样
- [ ] 整体行为仍可追踪、可审阅、可恢复

## 10. 待确认点
- 更 agentic 的第一步应该先改：
  - prompt / policy；
  - tool contract；
  - session model；
  - UI state；
  - 还是其中的最小组合？
- “agentic” 在这个项目的 MVP 边界到底要到哪一步？
- 哪些行为必须保留 deterministic gate？
