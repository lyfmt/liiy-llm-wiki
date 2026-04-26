# Zip 前端框架接入实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 使用 `/home/lyfmt/src/study/llm-wiki-liiy/llm-wiki-liiy.zip` 中的最新前端框架改造当前 `web/` 前端，并保留/接入现有后端逻辑，尤其是 Chat 上传后的 Knowledge Insert Pipeline V3。

**架构：** zip 是独立 Vite UI 源稿，不直接覆盖仓库。当前项目继续使用 React 18、Tailwind 3、React Router、现有 `/api/*` 后端；从 zip 迁移视觉结构、布局密度、导航样式和页面构图。动态数据继续通过 `web/src/lib/api.ts`、hooks 和现有 DTO 获取。

**技术栈：** TypeScript、React 18、React Router、Tailwind CSS、Lucide React、现有 Node HTTP API、Vitest。

---

## 范围表

| 任务 | 内容 | 完成标准 |
| --- | --- | --- |
| 1 | 建立 zip 风格的全局 token 与导航骨架 | 去掉像素风全局字体/边框，保留蓝白简洁风格 |
| 2 | Home 使用 zip 的艺术化首页结构并接真实 discovery | 顶栏有 Knowledge/Raw/Settings，Recent Updates 使用真实数据且排除 source/raw |
| 3 | Knowledge 使用 zip 简洁侧栏外观但保留 taxonomy drill-down | 左侧当前层、面包屑、topic 下 Section/Entity/Concept、graph links 仍可用 |
| 4 | Raw 使用 zip 的列表 + 阅读预览构图并接真实 Raw API | `/app/raw` 可浏览资源并预览，`/app/raw/:id` 可读原文和行定位 |
| 5 | Reading 保持真实文章/graph/source refs，外观并入 zip 风格 | source refs 可跳 `/app/raw/:id` |
| 6 | Chat 接入 Knowledge Insert 可见状态 | 上传附件时启动 pipeline，页面显示 pipeline run/status，并轮询 `/api/knowledge-insert/pipelines/:id` |
| 7 | Settings 保留现有后端配置逻辑，轻量统一视觉 | 保存、探测模型、密钥写入逻辑不退化 |
| 8 | 验证与浏览器验收 | `npm run test`、`typecheck`、`typecheck:web`、`build`、`build:web` 通过并截图/DevTools 检查关键页面 |

## 任务 1：全局视觉与导航基础

**文件：**
- 修改：`web/src/styles/globals.css`
- 修改：`web/src/components/layout/template-primitives.tsx`
- 可创建：`web/src/components/layout/zip-navigation.tsx`

- [ ] 步骤 1：运行 `npm run typecheck:web` 记录当前基线。
- [ ] 步骤 2：移除全局像素字体和 `.pixel-*` 依赖，把 body 调整为清爽 sans 字体、浅蓝白背景、普通字距。
- [ ] 步骤 3：创建可复用的顶部导航/悬浮聊天按钮，使用 `/app`、`/app/kb`、`/app/raw`、`/app/console`、`/app/ai-chat` 路径。
- [ ] 步骤 4：运行 `npm run typecheck:web`。
- [ ] 步骤 5：Commit：`style(web): 接入 zip 风格视觉基础`。

## 任务 2：Home 接入 zip 首页结构

**文件：**
- 修改：`web/src/features/discovery/pages/discovery-page.tsx`

- [ ] 步骤 1：用真实 `useDiscovery()` 数据编写 Recent Updates 行为验证思路：只显示非 source 项。
- [ ] 步骤 2：把 zip `Home.tsx` 的艺术化 hero、简洁顶栏和 recent list 移植到当前页面。
- [ ] 步骤 3：保持 Raw 顶栏入口和 `/app/kb` 主按钮。
- [ ] 步骤 4：运行 `npm run typecheck:web && npm run build:web`。
- [ ] 步骤 5：Commit：`feat(web): 使用 zip 框架改造首页`。

## 任务 3：Knowledge 页面视觉迁移

**文件：**
- 修改：`web/src/features/knowledge/components/taxonomy-drilldown-sidebar.tsx`
- 修改：`web/src/features/knowledge/components/knowledge-level-view.tsx`
- 修改：`web/src/features/discovery/pages/knowledge-base-page.tsx`

- [ ] 步骤 1：保留现有 `useKnowledgeNavigation()` 和 drill-down 状态。
- [ ] 步骤 2：将左侧栏和内容卡片调整为 zip 的简洁白底、slate 文本、brand 蓝交互。
- [ ] 步骤 3：确保页面仍是 `h-screen overflow-hidden`，左右栏内部滚动。
- [ ] 步骤 4：运行 `npm run typecheck:web && npm run build:web`。
- [ ] 步骤 5：Commit：`feat(web): 使用 zip 框架改造知识库浏览`。

## 任务 4：Raw 页面视觉和真实数据预览

**文件：**
- 修改：`web/src/features/raw/pages/raw-index-page.tsx`
- 修改：`web/src/features/raw/pages/raw-reading-page.tsx`

- [ ] 步骤 1：`/app/raw` 使用真实 `useRawSources()` 列表，默认选中第一项并调用 `useRawSource()` 展示只读预览。
- [ ] 步骤 2：保留 `/app/raw/:sourceId` 深链接阅读页，使用 zip 的行号/片段高亮风格。
- [ ] 步骤 3：运行 `npm run typecheck:web && npm run build:web`。
- [ ] 步骤 4：Commit：`feat(web): 使用 zip 框架改造 Raw 资源页`。

## 任务 5：Reading 页面视觉迁移

**文件：**
- 修改：`web/src/features/reading/components/reading-sidebar.tsx`
- 修改：`web/src/features/reading/pages/reading-page.tsx`

- [ ] 步骤 1：保留 `getKnowledgePage()`、Markdown 渲染、source refs、related_by_source。
- [ ] 步骤 2：统一为 zip 的阅读排版和简洁侧栏。
- [ ] 步骤 3：运行 `npm run typecheck:web && npm run build:web`。
- [ ] 步骤 4：Commit：`feat(web): 使用 zip 框架改造阅读页`。

## 任务 6：Knowledge Insert 前端接入

**文件：**
- 修改：`web/src/lib/types.ts`
- 修改：`web/src/lib/api.ts`
- 修改：`web/src/features/ai-chat/pages/ai-chat-page.tsx`
- 测试：`test/app/web-server.test.ts` 已覆盖后端上传启动 pipeline；前端以 typecheck/build 和浏览器验收为主。

- [ ] 步骤 1：新增 `getKnowledgeInsertPipeline(runId)` API 与最小 Pipeline 状态类型。
- [ ] 步骤 2：上传附件收到 `pipeline_run_id` 后记录到页面状态。
- [ ] 步骤 3：轮询 `/api/knowledge-insert/pipelines/:id`，404 时显示“启动中/等待状态文件”，成功后显示当前阶段/状态。
- [ ] 步骤 4：在 Chat 页面附件区或侧栏显示 Knowledge Insert 状态。
- [ ] 步骤 5：运行 `npm run typecheck:web && npm run build:web`。
- [ ] 步骤 6：Commit：`feat(web): 显示 Knowledge Insert 流水线状态`。

## 任务 7：最终验证

- [ ] 运行 `npm run test`
- [ ] 运行 `npm run typecheck`
- [ ] 运行 `npm run typecheck:web`
- [ ] 运行 `npm run build`
- [ ] 运行 `npm run build:web`
- [ ] 启动 `node dist/cli.js serve <project-root> 3000`
- [ ] 用 Chrome DevTools 检查 `/app`、`/app/kb`、`/app/raw`、`/app/raw/:id`、Reading、Chat 上传区、Settings。
- [ ] 仅在有测试或文档变更时提交：`test(web): 验证 zip 前端框架接入`
