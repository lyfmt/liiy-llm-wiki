# Frontend Visual References

These references support the conservative frontend taxonomy and Raw resource plan.

Generated with `gpt-image-2`. The images are direction-setting review material only; final implementation should still be built in React/Tailwind and verified in a browser.

## Review Images

| Page | File | Prompt Summary | Status |
| --- | --- | --- | --- |
| Home | [images/home.png](images/home.png) | Simple home structure with a more artful editorial treatment: top nav, centered hero, line-art knowledge motif, one CTA, sparse recent updates, with Raw added to nav. | Pending |
| Knowledge taxonomy drill-down | [images/knowledge-taxonomy.png](images/knowledge-taxonomy.png) | Spec-led taxonomy drill-down: breadcrumb, back one level, current taxonomy layer only, counts, right-side summary, child nodes, and graph/evidence links. | Pending |
| Reading | [images/reading.png](images/reading.png) | Long-form reading page with source refs linking to Raw evidence and a right graph/evidence sidebar. | Pending |
| Raw list and reader | [images/raw-list-and-reader.png](images/raw-list-and-reader.png) | Read-only Raw resource list plus monospaced reader, line numbers, metadata, and highlighted locator fragment. | Pending |
| Chat | [images/chat.png](images/chat.png) | Existing chat workflow with transcript, composer, readiness/status cues, unified light blue-white style. | Pending |
| Settings | [images/settings.png](images/settings.png) | Original-simple admin/settings page: left rail and one core model access form. | Pending |

## Original Calibration Screenshots

These screenshots were captured from the current app with Chrome DevTools. Home and Settings use them as simplicity calibration. Knowledge is intentionally spec-led rather than copied from the current resource-type filter page.

| Page | File |
| --- | --- |
| Home | [original-home.png](original-home.png) |
| Knowledge | [original-knowledge.png](original-knowledge.png) |
| Settings | [original-settings.png](original-settings.png) |

## Style Checks

- Light fresh blue-and-white visual system.
- Pure solid sidebars, top bars, and content containers.
- No pixel art, thick black outlines, terminal aesthetic, or global pixel font.
- Calm, long-reading-friendly density.
- Knowledge page uses taxonomy drill-down as the primary interaction.
- Raw page is read-only evidence browsing.

## Human Review

Reading, Raw, Chat, and Settings are provisionally accepted. Home and Knowledge were regenerated from the latest feedback and are pending human review before Tailwind implementation begins.
