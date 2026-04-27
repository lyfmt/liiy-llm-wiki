# Knowledge Insert Pipeline V3 任务表单

> **面向 AI 代理的工作者：** 使用任务驱动执行。每个任务必须有明确目标、文件范围、验证命令和状态。除非任务明确要求，不扩大范围到无关重构。

**目标：** 以任务表单驱动完成 V3 pipeline 收尾，让实现、隔离、验证和遗留类型债可追踪。

**架构：** V3 pipeline 由系统编排，agent 只返回结构化 JSON；PG graph 是主存储，wiki 是投影；旧 `knowledge-insert` skill 只作为 launcher shim。

**技术栈：** TypeScript、Node.js、Vitest、PostgreSQL graph store、Chat runtime tools、wiki projection。

---

## 当前状态

| ID | 任务 | 状态 | 交付物 | 验证 |
| --- | --- | --- | --- | --- |
| T01 | V3 domain/schema/artifact/stage 基础 | 完成 | `knowledge-insert-pipeline.ts`、`pipeline-schema.ts`、`pipeline-artifacts.ts`、`pipeline-agent-stage.ts`、examples | `vitest` 目标测试通过 |
| T02 | graph 支持 concept 一等节点 | 完成 | `graph-node.ts`、`graph-edge.ts`、graph tests | `test/domain/graph-node.test.ts test/domain/graph-edge.test.ts` |
| T03 | 离线 pipeline 主编排 | 完成 | `run-knowledge-insert-pipeline.ts`、pipeline tests | `test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts` |
| T04 | connected knowledge -> PG graph write | 完成 | V3 graph write adapter、concept/evidence/source edges | `test/domain/knowledge-insert-graph-write.test.ts` |
| T05 | PG projection 展示 concepts | 完成 | projection traversal/render 更新 | storage projection/page tests |
| T06 | 上传入口自动触发 pipeline launcher | 完成 | upload DTO/API/web flag | `test/app/web-server.test.ts test/app/api-services.test.ts` |
| T07 | chat agent 只触发 pipeline | 完成 | `start_knowledge_insert_pipeline`、tool catalog、runtime exports | runtime launcher tests |
| T08 | 旧 skill 链路隔离 | 完成 | deprecated shim、runtime tool hiding、skill tests | run-skill/discovery/agent-session tests |
| T09 | typecheck 阻塞分类 | 完成 | 错误清单已分组；未发现 V3 新增文件本身报错 | `npm run typecheck` 已运行，失败项见 T11 |
| T10 | 修复 V3 引入的 typecheck 问题 | 完成 | 无 V3 新增文件 typecheck 错误需要修复 | `npm run typecheck` 错误中无 `src/flows/knowledge-insert/*` |
| T11 | 决策 V2 类型债处理方式 | 完成 | 已按子任务清理 V2 类型债，全量 typecheck 通过 | `npm run typecheck` PASS |
| T12 | 最终验证与报告 | 完成 | 目标测试和 typecheck 均通过 | `20 files / 116 tests` PASS；`npm run typecheck` PASS |

## 执行规则

- 每次只推进一个任务 ID。
- 每个任务开始前标记 `进行中`，完成后标记 `完成`。
- 每个任务必须记录验证命令和结果。
- 当前工作区已有大量未提交改动，不自动 commit，除非用户明确要求。
- 不修复与当前任务无关的文件。

## 下一批任务细化

### T09：typecheck 阻塞分类

**目标：** 把 `npm run typecheck` 输出分为 V3 新增问题、V2 既有问题、测试 fixture 类型问题三类。

**文件：**
- 只读：`src/flows/wiki/render-topic-drafts-from-plan.ts`
- 只读：`src/runtime/tools/draft-topic-pages-from-plan.ts`
- 只读：`src/runtime/tools/resolve-source-topics.ts`
- 只读：`test/domain/knowledge-insert-graph-write.test.ts`
- 只读：`test/storage/save-knowledge-insert-graph-write.test.ts`
- 只读：`test/runtime/tools/audit-taxonomy-hosting.test.ts`

**验证：**
```bash
npm run typecheck
```

**完成标准：**
- 输出一张分类表。
- 明确哪些错误属于 V3 必修，哪些应单独建 V2 类型债任务。

### T10：修复 V3 引入的 typecheck 问题

**目标：** 若 T09 发现 V3 新增文件或 V3 改动导致类型错误，按最小补丁修复。

**文件：**
- 可能修改：`src/flows/knowledge-insert/*`
- 可能修改：`src/domain/knowledge-insert-pipeline.ts`
- 可能修改：`src/runtime/tools/start-knowledge-insert-pipeline.ts`
- 可能修改：V3 相关 tests

**验证：**
```bash
npx vitest run test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts test/runtime/tools/start-knowledge-insert-pipeline.test.ts
npm run typecheck
```

**完成标准：**
- V3 新增文件无 typecheck 错误。
- 若 typecheck 仍失败，剩余错误必须全部归类为非 V3 新增范围。

### T11：V2 类型债处理决策

**目标：** 用户要求任务驱动继续推进，因此将 V2 类型债拆成独立子任务逐个修复，目标是让全量 typecheck 通过。

**当前已知错误组：**
- [x] T11.1 `draft-topic-pages-from-plan.ts` artifact cast 类型收窄。
- [x] T11.2 `resolve-source-topics.ts` decision 字面量类型和 artifact cast。
- [x] T11.3 `render-topic-drafts-from-plan.ts` existing topic page 空值收窄。
- [x] T11.4 `knowledge-insert-graph-write` / `save-knowledge-insert-graph-write` 旧 fixture `"topic"` literal 推断。
- [x] T11.5 `audit-taxonomy-hosting.test.ts` unknown data 访问。
- [x] T11.6 `upsert-knowledge-insert-graph.test.ts` tuple 下标。

**验证：**
```bash
npm run typecheck
```

**完成标准：**
- 若继续修：拆成独立子任务。
- 若暂不修：最终报告明确 typecheck 未通过原因。

### T12：最终验证与报告

**目标：** 给出可复现验证证据和剩余风险。

**验证：**
```bash
npx vitest run test/domain/knowledge-insert-pipeline.test.ts test/flows/knowledge-insert/pipeline-schema.test.ts test/flows/knowledge-insert/pipeline-artifacts.test.ts test/flows/knowledge-insert/pipeline-agent-stage.test.ts test/domain/graph-node.test.ts test/domain/graph-edge.test.ts test/domain/knowledge-insert-graph-write.test.ts test/storage/load-topic-graph-projection.test.ts test/storage/graph-projection-store.test.ts test/storage/load-topic-graph-page.test.ts test/runtime/tools/start-knowledge-insert-pipeline.test.ts test/runtime/tools/run-skill.test.ts test/runtime/skills/discovery.test.ts test/runtime/agent-session.test.ts test/flows/knowledge-insert/run-knowledge-insert-pipeline.test.ts test/app/api-services.test.ts test/app/web-server.test.ts
npm run typecheck
```

**完成标准：**
- 目标测试通过。
- typecheck 通过，或剩余错误有明确任务归属。
