# Subagent 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为当前 runtime 增加一个简单但可复用的 subagent 系统，让主 agent 可以编写子任务提示词、选择子智能体模板、分配受控工具，并把长上下文工作卸载到独立实例中。

**架构：** 本计划基于现有 `read_skill / run_skill` 的隔离 agent 骨架继续演进，而不是另起一套多智能体框架。新增 `subagent profile` 发现与加载、artifact 读写能力、`run_subagent` 工具、subagent 实例收据（receipt）和实例级产物目录；主 agent 只保留 `task_prompt + receipt`，长输入与长输出进入 `state/artifacts/subagents/`。profile 存放在项目内的 `.agents/subagents/`，第一版只内置 `worker` 与 `reviewer` 两个模板。

**技术栈：** TypeScript、Node.js、`@mariozechner/pi-agent-core`、`@mariozechner/pi-ai`、Vitest

---

## 文件结构

- 修改：`src/config/project-paths.ts` — 增加 `.agents/subagents` 与 `state/artifacts/subagents` 的路径定义。
- 创建：`src/runtime/subagents/types.ts` — 定义 `SubagentProfile`、`RunSubagentInput`、`SubagentReceipt` 等运行时类型。
- 创建：`src/runtime/subagents/discovery.ts` — 发现、加载并解析 `.agents/subagents/*/SUBAGENT.md`。
- 创建：`test/runtime/subagents/discovery.test.ts` — 锁定 profile 发现与 frontmatter 解析行为。
- 创建：`src/storage/subagent-artifact-paths.ts` — 构造 subagent 实例的 artifact 输出目录。
- 创建：`test/storage/subagent-artifact-paths.test.ts` — 锁定 artifact 路径与非法 run id 校验。
- 创建：`src/runtime/tools/read-artifact.ts` — 让 agent / subagent 读取 artifact 文件。
- 创建：`src/runtime/tools/write-artifact.ts` — 让 agent / subagent 写入 artifact 文件。
- 创建：`test/runtime/tools/read-artifact.test.ts` — 验证 artifact 读取结果与证据字段。
- 创建：`test/runtime/tools/write-artifact.test.ts` — 验证 artifact 写入结果、目录创建与 overwrite 规则。
- 创建：`src/runtime/tools/run-subagent.ts` — 启动 subagent 实例，组合 profile 系统提示、主 agent 的 `task_prompt` 与输入 artifact。
- 创建：`test/runtime/tools/run-subagent.test.ts` — 验证 profile 限权、收据结构、实例独立上下文与 artifact 输出。
- 修改：`src/runtime/tool-catalog.ts` — 暴露 `run_subagent`、`read_artifact`、`write_artifact`。
- 修改：`src/runtime/agent-session.ts` — 将 subagent 作为主 agent 的受控能力挂入 runtime。
- 修改：`src/runtime/system-prompt.ts` — 明确何时适合使用 subagent，以及主 agent 只保留 receipt 而非长文本。
- 修改：`src/runtime/index.ts` — 导出新的 runtime API。
- 修改：`src/index.ts` — 对外导出 subagent 相关 API。
- 修改：`src/runtime/request-run-state.ts` — 让 runtime 能把 `run_subagent` 的 receipt 汇总为清晰的结果摘要。
- 修改：`src/storage/request-run-state-store.ts` — 增加 `subagent_spawned / subagent_completed / subagent_failed` 事件类型。
- 创建：`.agents/subagents/worker/SUBAGENT.md` — 执行型 subagent 模板。
- 创建：`.agents/subagents/reviewer/SUBAGENT.md` — 审查型 subagent 模板。
- 修改：`test/runtime/agent-session.test.ts` — 验证主 agent 能看到并调用 `run_subagent`。
- 修改：`test/runtime/index-exports.test.ts` — 扩展导出覆盖。
- 修改：`test/config/project-paths.test.ts` — 锁定新增路径。
- 修改：`test/storage/request-run-state-store.test.ts` — 覆盖新的 subagent 事件与 receipt 持久化。

## 范围说明

本计划只覆盖“简单 subagent 系统”的最小闭环：

- 主 agent 可以选择一个项目内保存的 subagent profile
- 主 agent 可以为本次实例编写 `task_prompt`
- 主 agent 可以申请工具，但最终生效工具受 profile 上限约束
- subagent 具备独立上下文，不继承主会话的长历史
- subagent 通过 artifact 读写长内容，通过 receipt 返回短结果

本计划明确不覆盖：

- subagent 之间互相对话
- subagent 再启动 subagent
- 保留长期存活的 subagent 实例
- 通用多智能体调度框架
- 复杂 memory 系统

### 任务 1：定义 subagent profile 与目录约定

**文件：**
- 修改：`src/config/project-paths.ts`
- 创建：`src/runtime/subagents/types.ts`
- 创建：`src/runtime/subagents/discovery.ts`
- 创建：`test/runtime/subagents/discovery.test.ts`
- 修改：`test/config/project-paths.test.ts`
- 创建：`.agents/subagents/worker/SUBAGENT.md`
- 创建：`.agents/subagents/reviewer/SUBAGENT.md`

- [ ] **步骤 1：编写失败的测试**

在 `test/config/project-paths.test.ts` 中补充断言，要求新增：

```ts
expect(paths.agentSubagents).toBe(path.join(root, '.agents', 'subagents'));
expect(paths.stateSubagents).toBe(path.join(root, 'state', 'artifacts', 'subagents'));
```

在 `test/runtime/subagents/discovery.test.ts` 中新增以下覆盖：

```ts
import { describe, expect, it } from 'vitest';

import { discoverRuntimeSubagents } from '../../../src/runtime/subagents/discovery.js';

describe('discoverRuntimeSubagents', () => {
  it('loads worker and reviewer profiles from .agents/subagents', async () => {
    const result = await discoverRuntimeSubagents(root);

    expect(result.profiles.map((profile) => profile.name)).toEqual(['reviewer', 'worker']);
    expect(result.profiles[0]?.maxTools).toContain('read_artifact');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/config/project-paths.test.ts test/runtime/subagents/discovery.test.ts`

预期：FAIL，缺少路径字段、discovery 模块和 `.agents/subagents` profile 解析。

- [ ] **步骤 3：编写最少实现代码**

在 `src/runtime/subagents/types.ts` 中定义最小接口：

```ts
export interface SubagentProfile {
  name: string;
  description: string;
  systemPrompt: string;
  defaultTools: string[];
  maxTools: string[];
  receiptSchema: string;
  filePath: string;
}

export interface RunSubagentInput {
  profile: string;
  taskPrompt: string;
  inputArtifacts: string[];
  outputDir: string;
  requestedTools?: string[];
  successCriteria?: string[];
}

export interface SubagentReceipt {
  status: 'done' | 'needs_review' | 'failed';
  summary: string;
  outputArtifacts: string[];
  counters?: Record<string, number>;
  warnings?: string[];
}
```

在 `.agents/subagents/worker/SUBAGENT.md` 和 `.agents/subagents/reviewer/SUBAGENT.md` 中使用 frontmatter 约定：

```md
---
name: worker
description: 执行型子智能体，负责重上下文任务。
default-tools: read_artifact write_artifact
max-tools: read_artifact write_artifact list_wiki_pages read_wiki_page read_raw_source draft_knowledge_page apply_draft_upsert lint_wiki
receipt-schema: minimal-receipt-v1
---
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/config/project-paths.test.ts test/runtime/subagents/discovery.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/config/project-paths.ts src/runtime/subagents/types.ts src/runtime/subagents/discovery.ts test/config/project-paths.test.ts test/runtime/subagents/discovery.test.ts .agents/subagents/worker/SUBAGENT.md .agents/subagents/reviewer/SUBAGENT.md
git commit -m "feat: add subagent profile discovery"
```

### 任务 2：增加 subagent artifact 读写能力

**文件：**
- 创建：`src/storage/subagent-artifact-paths.ts`
- 创建：`test/storage/subagent-artifact-paths.test.ts`
- 创建：`src/runtime/tools/read-artifact.ts`
- 创建：`src/runtime/tools/write-artifact.ts`
- 创建：`test/runtime/tools/read-artifact.test.ts`
- 创建：`test/runtime/tools/write-artifact.test.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/storage/subagent-artifact-paths.test.ts` 中新增：

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildSubagentArtifactPaths } from '../../src/storage/subagent-artifact-paths.js';

describe('buildSubagentArtifactPaths', () => {
  it('maps a subagent run id into state/artifacts/subagents', () => {
    expect(buildSubagentArtifactPaths('/tmp/llm-wiki-liiy', 'run-001--subagent-1').root).toBe(
      path.join('/tmp/llm-wiki-liiy', 'state', 'artifacts', 'subagents', 'run-001--subagent-1')
    );
  });
});
```

在 `test/runtime/tools/write-artifact.test.ts` 中新增：

```ts
expect(result.details.summary).toBe('wrote artifact subagents/run-001--subagent-1/receipt.json');
expect(await readFile(expectedPath, 'utf8')).toContain('"status": "done"');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/subagent-artifact-paths.test.ts test/runtime/tools/read-artifact.test.ts test/runtime/tools/write-artifact.test.ts`

预期：FAIL，缺少 artifact 路径构造和读写工具。

- [ ] **步骤 3：编写最少实现代码**

在 `src/runtime/tools/read-artifact.ts` 中让工具返回：

```ts
const outcome: RuntimeToolOutcome = {
  toolName: 'read_artifact',
  summary: `read artifact ${params.artifactPath}`,
  evidence: [absolutePath],
  resultMarkdown: content
};
```

在 `src/runtime/tools/write-artifact.ts` 中限制只写 `state/artifacts/` 以内的路径，并默认创建父目录。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/subagent-artifact-paths.test.ts test/runtime/tools/read-artifact.test.ts test/runtime/tools/write-artifact.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/storage/subagent-artifact-paths.ts test/storage/subagent-artifact-paths.test.ts src/runtime/tools/read-artifact.ts src/runtime/tools/write-artifact.ts test/runtime/tools/read-artifact.test.ts test/runtime/tools/write-artifact.test.ts src/runtime/index.ts src/index.ts
git commit -m "feat: add subagent artifact io tools"
```

### 任务 3：实现 `run_subagent` 工具与独立上下文执行

**文件：**
- 创建：`src/runtime/tools/run-subagent.ts`
- 创建：`test/runtime/tools/run-subagent.test.ts`
- 修改：`src/runtime/tool-catalog.ts`
- 修改：`src/runtime/agent-session.ts`
- 修改：`src/runtime/system-prompt.ts`
- 修改：`src/runtime/index.ts`
- 修改：`src/index.ts`
- 修改：`test/runtime/agent-session.test.ts`
- 修改：`test/runtime/index-exports.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/runtime/tools/run-subagent.test.ts` 中新增以下覆盖：

```ts
import { describe, expect, it } from 'vitest';

describe('createRunSubagentTool', () => {
  it('launches an isolated subagent with profile-limited tools and returns a receipt', async () => {
    const result = await tool.execute('tool-call-1', {
      profile: 'worker',
      taskPrompt: 'Read the provided artifact and write a receipt.',
      inputArtifacts: ['state/artifacts/subagents/input/source.json'],
      outputDir: 'state/artifacts/subagents/run-001--subagent-1',
      requestedTools: ['read_artifact', 'write_artifact', 'apply_draft_upsert']
    });

    expect(result.details.summary).toBe('ran subagent worker');
    expect(result.details.data?.effectiveTools).toEqual(['read_artifact', 'write_artifact']);
  });
});
```

在 `test/runtime/agent-session.test.ts` 中补充断言，要求主 runtime 工具列表包含 `run_subagent`，并能把 `Subagent Receipt` 写进 `toolOutcomes`。

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/runtime/tools/run-subagent.test.ts test/runtime/agent-session.test.ts test/runtime/index-exports.test.ts`

预期：FAIL，缺少 `run_subagent` 工具与相应导出。

- [ ] **步骤 3：编写最少实现代码**

在 `src/runtime/tools/run-subagent.ts` 中实现：

```ts
const effectiveTools = uniqueToolNames([
  ...profile.defaultTools,
  ...(params.requestedTools ?? [])
]).filter((toolName) => profile.maxTools.includes(toolName));

const agent = new Agent({
  initialState: {
    systemPrompt: buildSubagentPrompt(profile, params),
    model: options.model,
    tools: effectiveTools.map((toolName) => options.toolCatalog[toolName]!)
  },
  getApiKey: options.getApiKey,
  convertToLlm
});
```

返回结果必须包含结构化 receipt：

```ts
data: {
  profile: profile.name,
  effectiveTools,
  receipt
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/runtime/tools/run-subagent.test.ts test/runtime/agent-session.test.ts test/runtime/index-exports.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/runtime/tools/run-subagent.ts test/runtime/tools/run-subagent.test.ts src/runtime/tool-catalog.ts src/runtime/agent-session.ts src/runtime/system-prompt.ts src/runtime/index.ts src/index.ts test/runtime/agent-session.test.ts test/runtime/index-exports.test.ts
git commit -m "feat: add isolated run_subagent tool"
```

### 任务 4：补齐 subagent 事件、收据持久化与运行审计

**文件：**
- 修改：`src/runtime/request-run-state.ts`
- 修改：`src/storage/request-run-state-store.ts`
- 修改：`test/storage/request-run-state-store.test.ts`
- 修改：`test/runtime/request-run-state.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/storage/request-run-state-store.test.ts` 中增加新的事件类型覆盖：

```ts
expect(loaded.events).toEqual([
  expect.objectContaining({ type: 'subagent_spawned', summary: 'Spawned subagent worker' }),
  expect.objectContaining({ type: 'subagent_completed', summary: 'Subagent worker completed' })
]);
```

在 `test/runtime/request-run-state.test.ts` 中要求 `run_subagent` 的最新结果摘要优先使用 receipt summary，而不是长文本结果。

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/request-run-state-store.test.ts test/runtime/request-run-state.test.ts`

预期：FAIL，现有状态模型不认识 subagent 事件，也不会汇总 receipt。

- [ ] **步骤 3：编写最少实现代码**

在 `src/storage/request-run-state-store.ts` 中扩展：

```ts
export type RequestRunEventType =
  | 'run_started'
  | 'plan_available'
  | 'tool_started'
  | 'tool_finished'
  | 'evidence_added'
  | 'draft_updated'
  | 'subagent_spawned'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'run_completed'
  | 'run_failed';
```

在 `src/runtime/request-run-state.ts` 中把 `run_subagent` 视为 receipt-first 工具，优先提炼：

```ts
if (outcome.toolName === 'run_subagent' && typeof outcome.data?.receipt?.summary === 'string') {
  return outcome.data.receipt.summary;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/request-run-state-store.test.ts test/runtime/request-run-state.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/runtime/request-run-state.ts src/storage/request-run-state-store.ts test/storage/request-run-state-store.test.ts test/runtime/request-run-state.test.ts
git commit -m "feat: persist subagent receipts in run state"
```

## 验证清单

- [ ] `npx vitest run test/config/project-paths.test.ts test/runtime/subagents/discovery.test.ts`
- [ ] `npx vitest run test/storage/subagent-artifact-paths.test.ts test/runtime/tools/read-artifact.test.ts test/runtime/tools/write-artifact.test.ts`
- [ ] `npx vitest run test/runtime/tools/run-subagent.test.ts test/runtime/agent-session.test.ts test/runtime/index-exports.test.ts`
- [ ] `npx vitest run test/storage/request-run-state-store.test.ts test/runtime/request-run-state.test.ts`

