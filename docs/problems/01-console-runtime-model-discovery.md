# 问题表单 01：Console 模型列表不够动态

## 1. 问题标题
Console 中的 provider/model 选项当前来自项目内 catalog，而不是基于用户输入的 runtime `base_url` 动态发现

## 2. 当前现象
- Console 设置页已经支持动态切换 provider / model。
- 但当前下拉 options 的来源仍然是系统已有的模型目录/知识库内 catalog。
- 用户即使修改了 `base_url`，model options 也不会真正根据这个目标服务端返回的可用模型实时变化。
- 因此它现在是“项目内动态”，不是“目标 runtime 动态”。

## 3. 期望行为
- 当用户输入或切换某个 `base_url` 后，系统应能基于该地址重新发现可用模型。
- provider/model 下拉选项应反映该目标 runtime 实际支持的模型，而不是仅依赖本地内置目录。
- 如果目标 runtime 不支持模型发现，也要明确给出降级行为：
  - 使用本地 catalog 作为 fallback；或
  - 明确提示“不支持远程模型枚举”。

## 4. 用户价值
- 用户配置自定义 OpenAI-compatible / Anthropic-compatible / 其他 runtime 时，界面行为更真实。
- 避免“界面显示可选，但目标服务并不支持”的错觉。
- 为后续多 provider / 多 runtime 扩展打基础。

## 5. 已知根因/背景
- 当前 `GET /api/chat/models` 主要由本地 runtime/catalog 推导。
- 已修复的问题是：catalog 不再被 persisted override 污染。
- 但尚未实现“根据输入的 base_url 远程探测模型”。

## 6. 边界与约束
- 应尽量保持当前 Console 视觉样式不变。
- 不应在每次键入时都疯狂请求远端，应有明确触发策略：
  - blur 后；
  - 点击 refresh；
  - 点击“检测模型”；
  - 保存前预检查。
- 需要处理：
  - 网络失败；
  - 认证失败；
  - CORS / 代理问题；
  - 目标 runtime 不支持列模型；
  - 返回格式与 provider 类型不完全一致。

## 7. 非目标
- 不是这一步就把所有 provider 统一成完整抽象层。
- 不是这一步就做自动测速、排序、健康检查大盘。
- 不是这一步就支持任意未知协议。

## 8. 影响范围
- Console settings 页面
- chat model discovery API
- runtime/provider 探测逻辑
- 前端 provider/model/base_url 联动逻辑

## 9. 初步验收标准
- [ ] 修改 `base_url` 后，可以触发一次针对该地址的模型发现
- [ ] 发现成功时，下拉中的模型列表实际变化
- [ ] 发现失败时，界面有明确反馈
- [ ] fallback 行为清楚且一致
- [ ] 保存后的 settings 与发现结果保持一致，不出现误导性 options
- [ ] 不破坏现有样式和布局

## 10. 待确认点
- 触发时机是“手动刷新”优先，还是“输入后自动刷新”优先？
- 是否允许不同 provider 对同一个 `base_url` 用不同探测方式？
- 对不支持列模型的服务，是保留手填 model，还是强制 fallback catalog？
