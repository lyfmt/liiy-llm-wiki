# liiy-llm-wiki

`liiy-llm-wiki` 是一个本地优先的 LLM Wiki 知识代理实验仓库。项目把知识维护拆成 `raw/`、`wiki/`、`schema/`、`state/` 四层，并同时提供 CLI 运行时与 Web 界面。

## 仓库结构

- `src/`：Node.js/TypeScript 后端、CLI、运行时与存储模块
- `web/`：前端界面
- `wiki/`：长期保留的知识页
- `raw/`：可接受的原始来源输入
- `schema/`：规则、约束与维护策略
- `docs/`：设计文档与实现说明

## 快速开始

```bash
npm install
npm --prefix web install
npm run build
npm run build:web
npm run test
```

## 常用命令

```bash
npm run typecheck
npm run lint
npm run build
npm run build:web
npm run test
```

## 仓库约定

- 运行态产物写入 `state/`，默认不提交到 Git。
- 用户上传附件默认落在 `raw/accepted/attachments/`，默认不提交到 Git。
- 构建产物与本地工具目录（如 `dist/`、`web/dist/`、`output/`）默认不提交到 Git。

如果要为公开仓库保留示例数据，建议放在 `raw/accepted/` 的小型、可公开分发文件中，而不是直接提交用户导入的原始附件。
