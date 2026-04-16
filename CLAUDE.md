# CLAUDE.md

This file provides high-level guidance to Claude Code when working in this repository.

## Source of truth

- Start with `docs/superpowers/specs/`.
- The most important design document is `docs/superpowers/specs/2026-04-11-llm-wiki-design.md`.
- Treat the design documents as the primary source of truth for product direction, system boundaries, and MVP scope.
- If the implementation and the design intent diverge, prefer moving the implementation back toward the design direction unless there is a clear newer decision recorded in the repository.

## Product identity

This project is **not** meant to become a slightly smarter deterministic retrieval pipeline.

Its intended shape is:

- a **local-first knowledge agent system**;
- centered on a **wiki as the long-lived knowledge surface**;
- driven by an agent that can observe, navigate, synthesize, and maintain knowledge over time.

The system should help an agent move through a knowledge space, not just select a best page and produce a one-shot answer.

## Core product direction

The correct long-term direction is:

1. A user makes a natural-language request.
2. The agent inspects the wiki structure first.
3. The agent navigates pages, summaries, links, tags, aliases, and source references.
4. The agent decides whether the current evidence is sufficient.
5. The agent answers, proposes changes, or requests review when needed.
6. Valuable results are written back into the wiki or related state.

In other words, this repository should evolve toward **navigation over knowledge space**, not toward a monolithic query engine that tries to pre-compute everything before agent reasoning begins.

## Guiding principles

### 1. Agentic control flow, deterministic execution
The system should remain split in this way:

- **Agentic:** what to inspect first, which pages to follow, when evidence is sufficient, when to continue, when to write back.
- **Deterministic:** file I/O, manifests, page persistence, run state, review gates, patch application, and auditable state transitions.

Do not collapse these two layers into either:

- a fully hard-coded pipeline, or
- an unstructured agent with no operational boundaries.

### 2. Wiki-first, not answer-first
The wiki is not just an output store.
It is the main interface through which knowledge is organized, revisited, and expanded.

Prefer approaches that strengthen the wiki as a usable knowledge surface:

- index and overview pages;
- summaries and synopses;
- links and backlinks;
- tags;
- aliases;
- source references;
- clear page kinds.

### 3. Observe before synthesize, synthesize before mutate
A healthy default order is:

**Observe → Synthesize → Mutate → Govern**

That means:

- inspect the current knowledge structure first;
- form an answer or judgment from observed evidence;
- write only when there is durable value;
- use policy and review gates for high-impact actions.

### 4. Keep contracts truthful
Do not describe the system as more capable than it really is.

If a capability is currently a narrow helper, fallback, or compatibility layer, describe it that way.
Avoid language that makes the product sound like a fully realized semantic query engine when it is actually using bounded deterministic heuristics.

### 5. Prefer durable knowledge over ephemeral output
The product should favor knowledge that remains useful after the current chat ends.

Good outputs are not only immediate responses, but also:

- improved wiki pages;
- better navigation structure;
- clearer links between concepts;
- traceable query pages with provenance;
- inspectable run state and review records.

## Architectural boundaries

Keep the repository organized around these four persistent layers:

- `raw/` — source material, treated as factual input and generally read-only
- `wiki/` — long-lived knowledge maintained by the system
- `schema/` — rules, constraints, and maintenance guidance
- `state/` — run state, plans, drafts, findings, changesets, and results

Do not blur these responsibilities.
A change that belongs to one layer should not be casually pushed into another.

## How to think about query, ingest, and lint

Do not treat these as unrelated product features.
They are three views of the same knowledge-maintenance system:

- **ingest** expands and refreshes knowledge;
- **query** navigates and synthesizes knowledge;
- **lint** checks knowledge quality, structure, and consistency.

Query should not become the sole center of the product.
If a deterministic query flow exists, it should be viewed as a helper, fallback, baseline, or compatibility layer unless it truly reflects the intended agentic workflow.

## Tooling direction

Prefer small, composable, observable capabilities over one large tool that tries to do everything.

In general, the system should move toward tools that help an agent inspect and navigate knowledge, rather than tools that hide all reasoning behind a single opaque call.

Good capability direction includes:

- reading wiki entry points;
- listing and locating pages;
- following links and references;
- reading source-backed pages;
- understanding relationships across pages.

## Web product direction

The long-term product is larger than a CLI runtime.
It should grow toward a web-based knowledge and operations system with at least these surfaces:

### 1. Web knowledge wiki
A browsable wiki interface for humans and agents, including:

- index and overview entry points;
- topic, source, entity, and query pages;
- link, backlink, tag, and source-reference navigation;
- page summaries, provenance, and history.

### 2. Management console
An operational surface for managing:

- source materials and manifests;
- wiki pages and schema;
- run state and findings;
- changesets and review decisions;
- knowledge-quality issues such as conflicts, stale pages, or missing links.

### 3. Task publishing and tracking
A structured task layer for knowledge work, where users can publish and track work such as:

- ingest tasks;
- research and synthesis tasks;
- cleanup and maintenance tasks;
- review tasks.

Tasks should be treated as first-class work objects, not as an afterthought.

### 4. Chat operations backend
Chat should not be treated as a simple message log.
It should become an execution surface where the system can expose:

- the current request;
- the current plan;
- tool-call traces;
- evidence collected;
- touched files;
- draft changes;
- result summaries.

## Working style for Claude Code

When making changes in this repository:

- read the relevant design documents first;
- preserve the high-level product direction;
- prefer architectural clarity over local hacks;
- keep changes aligned with the wiki-centered agent model;
- avoid overfitting the system to short-term deterministic query behavior;
- keep write paths auditable and reviewable;
- prefer patches that strengthen navigation, traceability, and long-term knowledge quality.

## Practical orientation

Before implementing major changes, confirm:

- the relevant design spec already exists;
- the intended change supports the wiki-centered agent direction;
- the change strengthens long-term knowledge maintenance rather than only short-term answer generation;
- the system description remains honest about what is already implemented versus what is still aspirational.

If the repository is in an early or partial implementation state, use the design documents to guide the next increment instead of improvising a different product shape.
