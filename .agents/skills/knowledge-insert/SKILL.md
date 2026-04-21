---
name: knowledge-insert
description: 将新资源拆分、抽取、对齐并插入现有 wiki 结构。
allowed-tools:
  - find_source_manifest
  - read_source_manifest
  - prepare_source_resource
  - split_resource_blocks
  - merge_knowledge_candidates
  - audit_extraction_coverage
  - run_subagent
  - read_artifact
  - draft_knowledge_page
  - apply_draft_upsert
  - list_wiki_pages
  - read_wiki_page
  - lint_wiki
---

# Knowledge Insert

Use this skill when the user wants durable knowledge inserted into the wiki from new source material instead of receiving a one-off summary.

## Goals

- Prepare the accepted source into auditable artifacts before any synthesis.
- Keep long extraction work inside subagents instead of the main skill agent.
- Gate wiki writes on coverage, provenance, and review.

## Workflow

1. Resolve the target source manifest with `find_source_manifest` and `read_source_manifest`.
2. Prepare a source resource artifact with `prepare_source_resource`.
3. Split the prepared resource into stable blocks with `split_resource_blocks`.
4. For large or multi-section resources, launch `worker` subagents in batches with `run_subagent`.
5. Merge batch outputs with `merge_knowledge_candidates`.
6. Run `audit_extraction_coverage` before any alignment, drafting, or writeback.
7. Only after coverage passes, inspect the destination wiki surface with `list_wiki_pages` and `read_wiki_page`.
8. Draft governed wiki updates with `draft_knowledge_page`.
9. For important or high-impact writes, launch a `reviewer` subagent with `run_subagent` to verify the draft stays source-grounded.
10. Apply the draft with `apply_draft_upsert` only when review passes.
11. Always finish with `lint_wiki`.

## Stop Conditions

- Stop if the source manifest cannot be resolved to a single accepted source.
- Stop if `prepare_source_resource` or `split_resource_blocks` fails.
- Stop if extraction coverage is sparse or missing.
- Stop if the reviewer subagent cannot confirm the draft is source-grounded.

## Review Rules

- Large resources must be extracted through batched `worker` subagents.
- Coverage must pass before alignment or writeback.
- Important writes must be checked by a `reviewer` subagent before `apply_draft_upsert`.
- Do not claim insertion is complete until `lint_wiki` succeeds.
