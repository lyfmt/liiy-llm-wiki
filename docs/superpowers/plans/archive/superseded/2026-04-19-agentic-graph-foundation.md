# Agentic Graph Foundation 实现计划

> **归档说明：** 本计划已被 `2026-04-21` 之后的 `wiki-first + subagent + knowledge-insert` 路线取代。它代表的是一条更偏 `graph-first` 的工程分解，保留仅作历史参考，不再作为当前执行基线。

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为当前仓库引入 PostgreSQL 支撑的图谱事实层，落地 `graph node / graph edge / graph projection` 的最小后端基础，并让后续 API、页面投影和 agent 写入都能建立在这一层之上。

**架构：** 本计划只覆盖第一条切片：数据库配置、图谱对象模型、PG 持久化、projection 读模型和公开导出。现有 `wiki/*.md` 存储与 Web 界面暂时保留为兼容层，但不再作为后续主架构的目标。前端迁移、graph API 路由接入、agent 写回命令作为后续独立计划处理。

**技术栈：** TypeScript、Node.js、PostgreSQL、`pg`、Vitest

---

## 文件结构

- 修改：`package.json` — 增加 PostgreSQL 运行依赖与必要脚本说明。
- 修改：`package-lock.json` — 锁定新增依赖。
- 修改：`docker-compose.yml` — 增加 PostgreSQL 服务，并让应用容器拿到 `GRAPH_DATABASE_URL`。
- 修改：`src/app/bootstrap-project.ts` — 在项目脚手架中加入 `GRAPH_DATABASE_URL` 默认配置。
- 修改：`test/app/bootstrap-project.test.ts` — 锁定 `.env` 与脚手架文件行为。
- 修改：`test/tooling/docker-files.test.ts` — 锁定 compose 文件中数据库服务与环境变量。
- 创建：`src/domain/graph-node.ts` — 定义图谱节点、节点 kind、状态枚举与校验逻辑。
- 创建：`test/domain/graph-node.test.ts` — 验证节点创建、归一化与非法输入处理。
- 创建：`src/domain/graph-edge.ts` — 定义 typed relation、边字段与关系合法性约束。
- 创建：`test/domain/graph-edge.test.ts` — 验证边类型、起止约束与非法关系处理。
- 创建：`src/storage/graph-database.ts` — 封装 `pg` 连接、项目环境解析与最小查询接口。
- 创建：`test/storage/graph-database.test.ts` — 锁定数据库 URL 解析与客户端构造。
- 创建：`src/storage/graph-schema.ts` — 声明 `graph_nodes`、`graph_edges` 表结构与 schema bootstrap 逻辑。
- 创建：`test/storage/graph-schema.test.ts` — 锁定 schema SQL 与关键约束。
- 创建：`src/storage/graph-store.ts` — 持久化和读取节点、边的最小仓储接口。
- 创建：`test/storage/graph-store.test.ts` — 用 fake client 锁定 SQL 调用和记录映射。
- 创建：`src/storage/graph-projection-store.ts` — 从节点与边构建 `taxonomy/topic/section/entity/source` 的 projection 读模型。
- 创建：`test/storage/graph-projection-store.test.ts` — 验证 `assertion -> evidence -> source` 聚合路径。
- 修改：`src/index.ts` — 导出新的 domain 与 storage API。
- 修改：`test/storage/index-exports.test.ts` — 扩展 storage 导出覆盖。
- 修改：`test/domain/index-exports-new.test.ts` — 扩展 domain 导出覆盖。

## 范围说明

本计划只覆盖图谱主导架构的第一条基础切片：

- 引入 PostgreSQL 作为新的事实层运行依赖
- 定义 graph node / edge 的核心模型
- 提供 PG 持久化接口
- 提供 projection 读模型
- 暴露库级 API 供后续 route、flow、runtime 复用

本计划明确不覆盖：

- Web 路由切换到 graph API
- 现有前端阅读页改造
- agent 写入 graph 的 command flow
- 旧的 `knowledge-page-store` 全量删除
- 复杂自动推理关系

后续建议拆为独立计划：

1. `graph-read-api-and-ui`
2. `graph-agent-write-path`
3. `legacy-wiki-page-retirement`

### 任务 1：加入 PostgreSQL 运行配置与项目脚手架

**文件：**
- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`docker-compose.yml`
- 修改：`src/app/bootstrap-project.ts`
- 修改：`test/app/bootstrap-project.test.ts`
- 修改：`test/tooling/docker-files.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/app/bootstrap-project.test.ts` 中补充断言，要求 `.env` 初始脚手架同时包含：

```ts
expect(envContent).toContain('RUNTIME_API_KEY=');
expect(envContent).toContain('GRAPH_DATABASE_URL=');
```

在 `test/tooling/docker-files.test.ts` 中补充断言，要求 `docker-compose.yml` 包含 PostgreSQL 服务和应用侧数据库 URL：

```ts
expect(compose).toContain('postgres:');
expect(compose).toContain('POSTGRES_DB: llm_wiki_liiy');
expect(compose).toContain('POSTGRES_PASSWORD: postgres');
expect(compose).toContain('GRAPH_DATABASE_URL=postgres://postgres:postgres@postgres:5432/llm_wiki_liiy');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/app/bootstrap-project.test.ts test/tooling/docker-files.test.ts`

预期：FAIL，缺少 `GRAPH_DATABASE_URL` 与 PostgreSQL 服务相关断言。

- [ ] **步骤 3：编写最少实现代码**

在 `package.json` 中增加：

```json
{
  "dependencies": {
    "pg": "^8.16.3"
  }
}
```

在 `src/app/bootstrap-project.ts` 的 `.env` 脚手架中加入：

```ts
[projectPaths.projectEnv]: 'RUNTIME_API_KEY=\nGRAPH_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/llm_wiki_liiy\n'
```

在 `docker-compose.yml` 中加入 PostgreSQL 服务，并让应用服务拿到 `GRAPH_DATABASE_URL`。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/app/bootstrap-project.test.ts test/tooling/docker-files.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add package.json package-lock.json docker-compose.yml src/app/bootstrap-project.ts test/app/bootstrap-project.test.ts test/tooling/docker-files.test.ts
git commit -m "feat: scaffold postgres graph runtime"
```

### 任务 2：定义图谱节点与关系对象

**文件：**
- 创建：`src/domain/graph-node.ts`
- 创建：`test/domain/graph-node.test.ts`
- 创建：`src/domain/graph-edge.ts`
- 创建：`test/domain/graph-edge.test.ts`
- 修改：`src/index.ts`
- 修改：`test/domain/index-exports-new.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/domain/graph-node.test.ts` 中新增以下覆盖：

```ts
import { describe, expect, it } from 'vitest';

import { createGraphNode } from '../../src/domain/graph-node.js';

describe('createGraphNode', () => {
  it('creates a topic node with normalized aliases and retrieval text', () => {
    const node = createGraphNode({
      id: 'topic:design-patterns',
      kind: 'topic',
      title: 'Design Patterns',
      summary: 'Durable overview of software design patterns.',
      aliases: ['GoF Patterns'],
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      retrieval_text: 'Design Patterns GoF Patterns durable overview',
      attributes: { scope_note: 'Software architecture topic.' },
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(node.kind).toBe('topic');
    expect(node.aliases).toEqual(['GoF Patterns']);
  });

  it('rejects evidence nodes without locator and excerpt', () => {
    expect(() =>
      createGraphNode({
        id: 'evidence:001',
        kind: 'evidence',
        title: 'Broken evidence',
        status: 'draft',
        confidence: 'weak',
        provenance: 'agent-extracted',
        review_state: 'unreviewed',
        retrieval_text: '',
        attributes: {},
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    ).toThrow('Evidence nodes require locator and excerpt');
  });
});
```

在 `test/domain/graph-edge.test.ts` 中新增以下覆盖：

```ts
import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';

describe('createGraphEdge', () => {
  it('creates a valid assertion to evidence edge', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:001',
      from_id: 'assertion:adapter-definition',
      from_kind: 'assertion',
      type: 'supported_by',
      to_id: 'evidence:gof-p45-para2',
      to_kind: 'evidence',
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      qualifiers: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(edge.type).toBe('supported_by');
  });

  it('rejects invalid supported_by start kinds', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:002',
        from_id: 'topic:design-patterns',
        from_kind: 'topic',
        type: 'supported_by',
        to_id: 'evidence:gof-p45-para2',
        to_kind: 'evidence',
        status: 'draft',
        confidence: 'weak',
        provenance: 'agent-synthesized',
        review_state: 'unreviewed',
        qualifiers: {},
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    ).toThrow('supported_by edges must connect assertion to evidence');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/domain/graph-node.test.ts test/domain/graph-edge.test.ts test/domain/index-exports-new.test.ts`

预期：FAIL，相关模块尚不存在，或导出缺失。

- [ ] **步骤 3：编写最少实现代码**

在 `src/domain/graph-node.ts` 中定义：

```ts
export type GraphNodeKind =
  | 'taxonomy'
  | 'topic'
  | 'section'
  | 'entity'
  | 'source'
  | 'evidence'
  | 'assertion';

export type GraphStatus = 'draft' | 'active' | 'stale' | 'disputed' | 'archived';
export type GraphConfidence = 'asserted' | 'inferred' | 'weak' | 'conflicted';
export type GraphReviewState = 'unreviewed' | 'reviewed' | 'rejected';
export type GraphProvenance = 'source-derived' | 'agent-extracted' | 'agent-synthesized' | 'human-edited';
```

并通过 `createGraphNode` 做最小化校验。  
在 `src/domain/graph-edge.ts` 中定义 `GraphEdgeType` 和 `createGraphEdge`，至少校验：

- `supported_by` 只能是 `assertion -> evidence`
- `derived_from` 只能是 `evidence -> source`
- `belongs_to_taxonomy` 只能指向 `taxonomy`

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/domain/graph-node.test.ts test/domain/graph-edge.test.ts test/domain/index-exports-new.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/graph-node.ts src/domain/graph-edge.ts test/domain/graph-node.test.ts test/domain/graph-edge.test.ts src/index.ts test/domain/index-exports-new.test.ts
git commit -m "feat: add graph domain records"
```

### 任务 3：增加 PostgreSQL 图谱 schema 与仓储接口

**文件：**
- 创建：`src/storage/graph-database.ts`
- 创建：`test/storage/graph-database.test.ts`
- 创建：`src/storage/graph-schema.ts`
- 创建：`test/storage/graph-schema.test.ts`
- 创建：`src/storage/graph-store.ts`
- 创建：`test/storage/graph-store.test.ts`
- 修改：`src/index.ts`
- 修改：`test/storage/index-exports.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/storage/graph-database.test.ts` 中锁定数据库 URL 解析：

```ts
import { describe, expect, it } from 'vitest';

import { resolveGraphDatabaseUrl } from '../../src/storage/graph-database.js';

describe('resolveGraphDatabaseUrl', () => {
  it('reads GRAPH_DATABASE_URL from project env text', () => {
    expect(resolveGraphDatabaseUrl('RUNTIME_API_KEY=\nGRAPH_DATABASE_URL=postgres://localhost:5432/llm_wiki_liiy\n')).toBe(
      'postgres://localhost:5432/llm_wiki_liiy'
    );
  });

  it('rejects missing GRAPH_DATABASE_URL', () => {
    expect(() => resolveGraphDatabaseUrl('RUNTIME_API_KEY=\n')).toThrow('Missing GRAPH_DATABASE_URL');
  });
});
```

在 `test/storage/graph-schema.test.ts` 中锁定 schema SQL：

```ts
import { describe, expect, it } from 'vitest';

import { buildGraphSchemaSql } from '../../src/storage/graph-schema.js';

describe('buildGraphSchemaSql', () => {
  it('declares graph node and edge tables', () => {
    const sql = buildGraphSchemaSql();

    expect(sql).toContain('create table if not exists graph_nodes');
    expect(sql).toContain('create table if not exists graph_edges');
    expect(sql).toContain('primary key (id)');
    expect(sql).toContain('primary key (edge_id)');
  });
});
```

在 `test/storage/graph-store.test.ts` 中用 fake client 锁定仓储行为：

```ts
import { describe, expect, it } from 'vitest';

import { createGraphNode } from '../../src/domain/graph-node.js';
import { saveGraphNode } from '../../src/storage/graph-store.js';

describe('saveGraphNode', () => {
  it('persists a graph node through the database client', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [] };
      }
    };

    await saveGraphNode(
      client,
      createGraphNode({
        id: 'topic:design-patterns',
        kind: 'topic',
        title: 'Design Patterns',
        summary: 'Durable overview.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        retrieval_text: 'Design Patterns',
        attributes: { scope_note: 'Architecture topic.' },
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    );

    expect(calls[0]?.sql).toContain('insert into graph_nodes');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/graph-database.test.ts test/storage/graph-schema.test.ts test/storage/graph-store.test.ts test/storage/index-exports.test.ts`

预期：FAIL，模块缺失。

- [ ] **步骤 3：编写最少实现代码**

在 `src/storage/graph-database.ts` 中定义最小数据库接口：

```ts
export interface GraphDatabaseClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}
```

并提供：

- `resolveGraphDatabaseUrl(projectEnvText: string): string`
- `createGraphDatabasePool(databaseUrl: string): GraphDatabaseClient`

在 `src/storage/graph-schema.ts` 中声明最小表结构：

```sql
create table if not exists graph_nodes (
  id text primary key,
  kind text not null,
  title text not null,
  summary text not null,
  aliases jsonb not null,
  status text not null,
  confidence text not null,
  provenance text not null,
  review_state text not null,
  retrieval_text text not null,
  attributes jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists graph_edges (
  edge_id text primary key,
  from_id text not null references graph_nodes(id) on delete cascade,
  from_kind text not null,
  type text not null,
  to_id text not null references graph_nodes(id) on delete cascade,
  to_kind text not null,
  status text not null,
  confidence text not null,
  provenance text not null,
  review_state text not null,
  sort_order integer not null default 0,
  qualifiers jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

在 `src/storage/graph-store.ts` 中提供最小仓储：

- `saveGraphNode`
- `saveGraphEdge`
- `loadGraphNode`
- `listOutgoingGraphEdges`
- `listIncomingGraphEdges`

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/graph-database.test.ts test/storage/graph-schema.test.ts test/storage/graph-store.test.ts test/storage/index-exports.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/storage/graph-database.ts src/storage/graph-schema.ts src/storage/graph-store.ts test/storage/graph-database.test.ts test/storage/graph-schema.test.ts test/storage/graph-store.test.ts src/index.ts test/storage/index-exports.test.ts
git commit -m "feat: add postgres graph storage"
```

### 任务 4：构建图谱 projection 读模型

**文件：**
- 创建：`src/storage/graph-projection-store.ts`
- 创建：`test/storage/graph-projection-store.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/storage/graph-projection-store.test.ts` 中锁定 `topic -> assertion -> evidence -> source` 聚合路径：

```ts
import { describe, expect, it } from 'vitest';

import { buildGraphProjection } from '../../src/storage/graph-projection-store.js';
import { createGraphNode } from '../../src/domain/graph-node.js';
import { createGraphEdge } from '../../src/domain/graph-edge.js';

describe('buildGraphProjection', () => {
  it('builds a topic projection with assertions and evidence summaries', () => {
    const topic = createGraphNode({
      id: 'topic:design-patterns',
      kind: 'topic',
      title: 'Design Patterns',
      summary: 'Topic summary.',
      aliases: [],
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      retrieval_text: 'Design Patterns',
      attributes: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    const assertion = createGraphNode({
      id: 'assertion:adapter-definition',
      kind: 'assertion',
      title: 'Adapter definition',
      summary: 'Adapter converts one interface to another.',
      aliases: [],
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      retrieval_text: 'Adapter converts one interface to another.',
      attributes: { statement: 'Adapter converts one interface to another.' },
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    const evidence = createGraphNode({
      id: 'evidence:gof-p45-para2',
      kind: 'evidence',
      title: 'GoF p45 para2',
      summary: 'Definition excerpt.',
      aliases: [],
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      retrieval_text: 'Convert the interface of a class...',
      attributes: { locator: 'p45 para2', excerpt: 'Convert the interface of a class...' },
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    const source = createGraphNode({
      id: 'source:gof-book',
      kind: 'source',
      title: 'Design Patterns',
      summary: 'GoF book source.',
      aliases: [],
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      retrieval_text: 'Design Patterns book',
      attributes: { path: 'raw/accepted/gof.md', source_type: 'markdown' },
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    const projection = buildGraphProjection({
      root: topic,
      nodes: [topic, assertion, evidence, source],
      edges: [
        createGraphEdge({
          edge_id: 'edge:about',
          from_id: 'assertion:adapter-definition',
          from_kind: 'assertion',
          type: 'about',
          to_id: 'topic:design-patterns',
          to_kind: 'topic',
          status: 'active',
          confidence: 'asserted',
          provenance: 'source-derived',
          review_state: 'reviewed',
          qualifiers: {},
          created_at: '2026-04-19T00:00:00.000Z',
          updated_at: '2026-04-19T00:00:00.000Z'
        }),
        createGraphEdge({
          edge_id: 'edge:supported-by',
          from_id: 'assertion:adapter-definition',
          from_kind: 'assertion',
          type: 'supported_by',
          to_id: 'evidence:gof-p45-para2',
          to_kind: 'evidence',
          status: 'active',
          confidence: 'asserted',
          provenance: 'source-derived',
          review_state: 'reviewed',
          qualifiers: {},
          created_at: '2026-04-19T00:00:00.000Z',
          updated_at: '2026-04-19T00:00:00.000Z'
        }),
        createGraphEdge({
          edge_id: 'edge:derived-from',
          from_id: 'evidence:gof-p45-para2',
          from_kind: 'evidence',
          type: 'derived_from',
          to_id: 'source:gof-book',
          to_kind: 'source',
          status: 'active',
          confidence: 'asserted',
          provenance: 'source-derived',
          review_state: 'reviewed',
          qualifiers: {},
          created_at: '2026-04-19T00:00:00.000Z',
          updated_at: '2026-04-19T00:00:00.000Z'
        })
      ]
    });

    expect(projection.root.id).toBe('topic:design-patterns');
    expect(projection.assertions).toHaveLength(1);
    expect(projection.evidence[0]?.source.id).toBe('source:gof-book');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/graph-projection-store.test.ts`

预期：FAIL，模块缺失。

- [ ] **步骤 3：编写最少实现代码**

在 `src/storage/graph-projection-store.ts` 中定义：

```ts
export interface GraphProjection {
  root: GraphNode;
  taxonomy: GraphNode[];
  sections: GraphNode[];
  entities: GraphNode[];
  assertions: Array<{
    node: GraphNode;
    evidence: Array<{
      node: GraphNode;
      source: GraphNode | null;
    }>;
  }>;
  evidence: Array<{
    node: GraphNode;
    source: GraphNode | null;
  }>;
}
```

并实现最小 pure function：

- `buildGraphProjection(input)`

要求：

- 只信任 typed edges，不扫描自由正文
- `topic/section/entity` 的证据都通过 `assertion -> supported_by -> evidence` 聚合
- `evidence` 的来源通过 `derived_from` 回溯

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/graph-projection-store.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/storage/graph-projection-store.ts test/storage/graph-projection-store.test.ts
git commit -m "feat: add graph projection read model"
```

### 任务 5：公开图谱基础 API 并补齐库入口

**文件：**
- 修改：`src/index.ts`
- 修改：`test/storage/index-exports.test.ts`
- 修改：`test/domain/index-exports-new.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `test/storage/index-exports.test.ts` 中增加对下列 API 的断言：

```ts
import {
  buildGraphProjection,
  buildGraphSchemaSql,
  createGraphDatabasePool,
  loadGraphNode,
  saveGraphEdge,
  saveGraphNode
} from '../../src/index.js';

expect(typeof createGraphDatabasePool).toBe('function');
expect(typeof buildGraphSchemaSql).toBe('function');
expect(typeof saveGraphNode).toBe('function');
expect(typeof saveGraphEdge).toBe('function');
expect(typeof loadGraphNode).toBe('function');
expect(typeof buildGraphProjection).toBe('function');
```

在 `test/domain/index-exports-new.test.ts` 中增加：

```ts
import { createGraphEdge, createGraphNode } from '../../src/index.js';

expect(typeof createGraphNode).toBe('function');
expect(typeof createGraphEdge).toBe('function');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run test/storage/index-exports.test.ts test/domain/index-exports-new.test.ts`

预期：FAIL，包入口尚未导出这些 API。

- [ ] **步骤 3：编写最少实现代码**

在 `src/index.ts` 中新增导出：

```ts
export { createGraphNode } from './domain/graph-node.js';
export type {
  GraphNode,
  GraphNodeKind,
  GraphStatus,
  GraphConfidence,
  GraphReviewState,
  GraphProvenance
} from './domain/graph-node.js';

export { createGraphEdge } from './domain/graph-edge.js';
export type { GraphEdge, GraphEdgeType } from './domain/graph-edge.js';

export { resolveGraphDatabaseUrl, createGraphDatabasePool } from './storage/graph-database.js';
export { buildGraphSchemaSql } from './storage/graph-schema.js';
export { saveGraphNode, saveGraphEdge, loadGraphNode, listOutgoingGraphEdges, listIncomingGraphEdges } from './storage/graph-store.js';
export { buildGraphProjection } from './storage/graph-projection-store.js';
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run test/storage/index-exports.test.ts test/domain/index-exports-new.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/index.ts test/storage/index-exports.test.ts test/domain/index-exports-new.test.ts
git commit -m "feat: export graph foundation apis"
```

## 交付检查

执行完本计划后，应满足：

- `.env` 与 compose 已经具备 PostgreSQL 运行配置
- graph node / edge 已经成为受约束的显式对象
- PostgreSQL 表结构与最小仓储可用
- projection 读模型已经能按强语义边聚合 `assertion / evidence / source`
- 这些能力已经通过公共入口导出

## 手工验证

完成全部任务后，执行：

```bash
npm install
npx vitest run test/app/bootstrap-project.test.ts test/tooling/docker-files.test.ts test/domain/graph-node.test.ts test/domain/graph-edge.test.ts test/storage/graph-database.test.ts test/storage/graph-schema.test.ts test/storage/graph-store.test.ts test/storage/graph-projection-store.test.ts test/storage/index-exports.test.ts test/domain/index-exports-new.test.ts
npm run typecheck
npm run lint
```

预期：

- 全部测试通过
- TypeScript 无类型错误
- ESLint 无新增告警
