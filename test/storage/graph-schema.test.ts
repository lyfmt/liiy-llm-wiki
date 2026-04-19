import { describe, expect, it } from 'vitest';

import { buildGraphSchemaSql } from '../../src/storage/graph-schema.js';

describe('buildGraphSchemaSql', () => {
  it('declares graph node and edge tables', () => {
    const sql = buildGraphSchemaSql();

    expect(sql).toContain('create table if not exists graph_nodes');
    expect(sql).toContain('create table if not exists graph_edges');
    expect(sql).toContain('aliases jsonb not null');
    expect(sql).toContain('qualifiers jsonb not null');
    expect(sql).toContain('primary key (id)');
    expect(sql).toContain('primary key (edge_id)');
    expect(sql).toContain('foreign key (from_id) references graph_nodes (id)');
    expect(sql).toContain('foreign key (to_id) references graph_nodes (id)');
    expect(sql).toContain('create index if not exists graph_edges_from_id_idx on graph_edges (from_id)');
    expect(sql).toContain('create index if not exists graph_edges_to_id_idx on graph_edges (to_id)');
  });
});
