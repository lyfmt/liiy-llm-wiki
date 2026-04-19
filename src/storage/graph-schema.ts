export function buildGraphSchemaSql(): string {
  return `
create table if not exists graph_nodes (
  id text not null,
  kind text not null,
  title text not null,
  summary text not null,
  aliases jsonb not null default '[]'::jsonb,
  status text not null,
  confidence text not null,
  provenance text not null,
  review_state text not null,
  retrieval_text text not null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (id)
);

create table if not exists graph_edges (
  edge_id text not null,
  from_id text not null,
  from_kind text not null,
  type text not null,
  to_id text not null,
  to_kind text not null,
  status text not null,
  confidence text not null,
  provenance text not null,
  review_state text not null,
  sort_order integer not null default 0,
  qualifiers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (edge_id),
  foreign key (from_id) references graph_nodes (id),
  foreign key (to_id) references graph_nodes (id)
);

create index if not exists graph_edges_from_id_idx on graph_edges (from_id);
create index if not exists graph_edges_to_id_idx on graph_edges (to_id);
`.trim();
}
