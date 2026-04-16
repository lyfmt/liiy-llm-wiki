# 问题表单 03：Accept / Ask User 等按钮应按请求类型动态变化

## 1. 问题标题
Chat UI 中的 accept / ask user 等操作按钮当前过于固定，未根据请求意图动态变化

## 2. 当前现象
- 当前对话界面存在类似 accept / ask user 的固定操作呈现。
- 这使所有请求看起来都像在走同一条“需要审阅/选择下一步”的工作流。
- 但如果用户只是闲聊、提问、做轻量问答，这些按钮显得突兀，体验不像普通 chat。

## 3. 期望行为
- 操作按钮应根据当前请求类型或 agent 当前状态动态出现。
- 如果是普通闲聊或直接问答：
  - 界面应尽量接近普通 ChatGPT；
  - 不应默认出现不必要的审阅/确认按钮。
- 如果是需要分支、审批、补充信息或执行动作的任务：
  - 再显示 accept / ask user / review 之类的 controls。

## 4. 用户价值
- 降低“所有请求都像 workflow engine”的割裂感。
- 让简单对话更自然，让复杂任务更可控。
- 让 UI 更真实地反映 agent 当前状态，而不是固定模板。

## 5. 已知根因/背景
- 当前 UI 更偏固定工作流壳子。
- 已开始查看：
  - `src/domain/system-prompt.ts`
  - `src/domain/intent-classifier.ts`
  - `web/src/features/ai-chat/pages/ai-chat-page.tsx`
- 当前问题可能不只是前端显示问题，还涉及：
  - 后端返回的状态类型；
  - 意图分类；
  - result/preview card 的渲染条件。

## 6. 边界与约束
- 不能只做前端隐藏按钮而不修正后端语义。
- 控件是否出现，应与真实状态一致。
- 需要定义哪些状态下显示哪些操作：
  - 普通聊天；
  - 需要澄清；
  - 需要用户确认执行；
  - 需要审阅变更；
  - 已完成仅展示结果。

## 7. 非目标
- 不是这一步就做完整可配置工作流编辑器。
- 不是这一步就做极复杂的多角色审批 UI。
- 不是这一步就做所有可能的 agent state machine 可视化。

## 8. 影响范围
- chat 页按钮区/preview card
- intent / mode classification
- run status / result type 到 UI 的映射
- prompt / backend response contract

## 9. 初步验收标准
- [ ] 普通聊天请求下，不默认显示多余的 accept / ask user 控件
- [ ] 需要用户确认时，才显示相应操作
- [ ] 需要补充信息时，才显示 ask user 或等价交互
- [ ] 前后端状态语义一致
- [ ] 用户能从界面直观看出“当前是普通回答、澄清请求、确认请求还是审阅请求”

## 10. 待确认点
- “普通闲聊”与“任务执行请求”的边界由谁判断：前端、后端、模型、还是混合？
- ask user 是一个真实交互状态，还是现阶段只是一种 UI affordance？
- accept 是否表示“采纳答案”、还是“批准执行下一步动作”？
