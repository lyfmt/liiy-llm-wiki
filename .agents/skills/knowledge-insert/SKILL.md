---
name: knowledge-insert
description: Deprecated shim. Start the system-governed Knowledge Insert Pipeline V3.
allowed-tools:
  - start_knowledge_insert_pipeline
---

# Knowledge Insert Deprecated Shim

The legacy free-form knowledge insertion workflow is deprecated.

Use only `start_knowledge_insert_pipeline` with either an attachment id or a source id. Do not read pipeline artifacts, review extracted knowledge, write PG, or write wiki pages. The system-owned V3 pipeline is responsible for stage validation, graph persistence, wiki projection, and status transitions.
