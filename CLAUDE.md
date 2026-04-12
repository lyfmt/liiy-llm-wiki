# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 当前仓库状态

- 项目设计文档放在 `docs/superpowers/specs/`,先阅读这个。
- 当前最重要的设计规格是 `docs/superpowers/specs/2026-04-11-llm-wiki-design.md`。
- 如果仓库根目录还没有 `package.json`、`src/`、`test/`，说明实现尚未合入主工作区；这时先读设计文档，再决定是否进入实现分支或工作树。

## 设计与流程文档位置

- **项目设计：** `docs/superpowers/specs/`
- 设计文档是当前阶段的主要事实来源，尤其是：
  - 系统目标
  - 目录结构
  - 核心对象模型
  - runtime / storage / policy 分层
  - MVP 范围

## 项目流程

按以下流程推进，不要跳步：

1. **状态分析**
2. **计划制定**
   - 先形成实现计划
   - 把计划交给 Codex 做 review
   - 最多循环 3 次，直到计划通过
3. **计划实施**
   - 把任务交付给 Codex 实现
   - 验收
   - 托付实现
   - 按任务循环推进，直到计划实现完成
4. **Review**
   - 把实现结果交付给 Codex review
   - 修复问题
   - 再次 review
   - 直到通过
5. **判断是否达到 MVP**
   - 如果达到：补一份实现报告和一份可展示的成果报告,要求使用html格式
   - 如果未达到：回到第 1 步继续循环

### 强制执行规则（高优先级，必须强调）

- **除系统级安全要求必须确认的高风险动作外，只有在“达到 MVP 阶段成功”之后，才能跳出上述循环来询问用户。**
- **在达到 MVP 之前，不要中途向用户询问选择、请求确认、汇报阶段性进度；应继续按照“状态分析 → 计划制定 → 计划实施 → Review → 判断是否达到 MVP”的闭环自主推进。**
- **如果第 5 步判断“尚未达到 MVP”，则不得中断向用户提问，必须直接回到第 1 步继续下一轮循环。**
- **只有当第 5 步明确判定“已经达到 MVP”时，才允许向用户同步结果，并提交 HTML 格式的实现报告与成果报告。**

## Git 与工作树约定

- 这个仓库使用 `.worktrees/` 作为项目内工作树目录。
- `.worktrees` 已加入 `.gitignore`，新实现工作优先放在这里。
- 如果要做非 trivial 功能，优先在独立 worktree 中执行，而不是直接在主工作区堆改动。

## 常用命令

### 设计阶段

当前主工作区如果还没有实现代码，优先使用这些动作：

```bash
# 查看仓库当前状态
ls -la

# 查看设计规格
ls docs/superpowers/specs
```

### 实现分支 / 工作树阶段

当工作区里已经有 `package.json` 后，使用以下 Node.js / TypeScript 命令：

```bash
# 安装依赖
npm install

# 运行全部测试
npm run test

# 运行单个测试文件
npx vitest run test/<path>.test.ts

# 类型检查
npm run typecheck

# 构建
npm run build
```

说明：

- 当前设计与计划里，测试工具是 `vitest`。
- 当前阶段还没有单独的 lint 命令时，不要臆造 `npm run lint`；优先使用 `npm run typecheck` 和针对性的测试命令。

## 高层架构

### 1. 四层知识目录

根据设计规格，项目根目录最终围绕 4 类持久化数据展开：

- `raw/`：原始资料层，只读事实输入
- `wiki/`：长期知识层，agent 持续维护
- `schema/`：规则层，约束 agent 如何维护知识库
- `state/`：运行态与中间产物，保存 run、plan、draft、changeset、finding、result

这是整个系统最重要的结构边界。后续实现时不要把这 4 层混在一起。

### 2. 运行模型

这个项目不是固定流水线，而是**单主 Knowledge Agent + 动态计划**：

- 用户发起自然语言请求
- 系统识别当前意图（例如 ingest / query / lint）
- agent 生成本次临时计划
- agent 调用知识工具执行
- 系统根据结果修订计划、落盘状态、决定是否进入 review gate

也就是说，流程是**动态计划驱动**，边界靠 `schema/`、policy 和状态持久化来约束。

### 3. 代码层职责（按设计规格）

实现代码落地后，重点关注以下模块边界：

- `src/domain/`：核心对象模型，例如 source manifest、knowledge page、request run、changeset、finding
- `src/storage/`：文件系统读写与持久化
- `src/runtime/`：`pi-ai` / `pi-agent-core` 集成、system prompt、tools、policy hooks
- `src/flows/`：ingest / query / lint 三类主要流程
- `src/app/`：项目初始化、意图解析、请求分发
- `src/policies/`：review gate 与风险控制规则

判断改动该放哪一层时，优先按职责，而不是按技术类型随意堆放。

### 4. 外部运行时依赖

设计与计划已经明确，这个项目的基础运行时方向是：

- `@mariozechner/pi-ai`
- `@mariozechner/pi-agent-core`
- 必要时参考 `pi-coding-agent` 的工具、session、hook 和扩展思路

含义是：

- 模型 / provider / tool schema 主要靠 `pi-ai`
- agent loop、tool execution、`beforeToolCall` / `afterToolCall` 主要靠 `pi-agent-core`
- 文件系统状态、wiki 更新、review gate 由本项目自己实现

## 进入实现前先确认什么

如果你准备开始或继续实现，先确认下面几点：

- 当前工作区是否已经有 `package.json`
- 当前任务对应的设计规格是否已经存在于 `docs/superpowers/specs/`
- 是否已经有对应的实现计划
- 当前改动是否应该放进 `.worktrees/` 中的独立工作树

如果这些前置条件缺失，先补前置条件，不要直接开始写代码。
