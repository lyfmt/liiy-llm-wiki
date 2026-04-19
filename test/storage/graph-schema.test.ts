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
