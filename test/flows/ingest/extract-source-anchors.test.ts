import { describe, expect, it } from 'vitest';

import { extractSourceAnchors } from '../../../src/flows/ingest/extract-source-anchors.js';

describe('extractSourceAnchors', () => {
  it('extracts ordered anchors from headings and paragraphs', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-001',
      sourcePath: 'raw/accepted/patterns.md',
      markdown: `
# Introduction

Patch first keeps edits
reviewable.

Still part of intro.

## Trade-offs

It adds discipline.

### Deep Dive

Stable anchors matter.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-001#1',
        title: 'Introduction',
        locator: 'patterns.md#introduction:p1',
        excerpt: 'Patch first keeps edits reviewable.',
        order: 1,
        heading_path: ['Introduction']
      },
      {
        id: 'evidence:src-001#2',
        title: 'Introduction',
        locator: 'patterns.md#introduction:p2',
        excerpt: 'Still part of intro.',
        order: 2,
        heading_path: ['Introduction']
      },
      {
        id: 'evidence:src-001#3',
        title: 'Trade-offs',
        locator: 'patterns.md#trade-offs:p1',
        excerpt: 'It adds discipline.',
        order: 3,
        heading_path: ['Introduction', 'Trade-offs']
      },
      {
        id: 'evidence:src-001#4',
        title: 'Deep Dive',
        locator: 'patterns.md#deep-dive:p1',
        excerpt: 'Stable anchors matter.',
        order: 4,
        heading_path: ['Introduction', 'Trade-offs', 'Deep Dive']
      }
    ]);
  });

  it('uses a stable root heading when the markdown has no headings', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-002',
      sourcePath: 'raw/accepted/appendix.md',
      markdown: `

Lead paragraph without a heading.


Follow-up detail stays anchored.

`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-002#1',
        title: 'Document',
        locator: 'appendix.md#document:p1',
        excerpt: 'Lead paragraph without a heading.',
        order: 1,
        heading_path: ['Document']
      },
      {
        id: 'evidence:src-002#2',
        title: 'Document',
        locator: 'appendix.md#document:p2',
        excerpt: 'Follow-up detail stays anchored.',
        order: 2,
        heading_path: ['Document']
      }
    ]);
  });

  it('ignores multi-line list items instead of leaking continuation lines into anchors', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-003',
      sourcePath: 'raw/accepted/lists.md',
      markdown: `
# Notes

- item
  continuation

After list.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-003#1',
        title: 'Notes',
        locator: 'lists.md#notes:p1',
        excerpt: 'After list.',
        order: 1,
        heading_path: ['Notes']
      }
    ]);
  });

  it('ignores html blocks instead of extracting their inner text as anchors', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-004',
      sourcePath: 'raw/accepted/html.md',
      markdown: `
# HTML

<div>
inner
</div>

After html.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-004#1',
        title: 'HTML',
        locator: 'html.md#html:p1',
        excerpt: 'After html.',
        order: 1,
        heading_path: ['HTML']
      }
    ]);
  });

  it('ignores single-line html blocks instead of extracting them as anchors', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-006',
      sourcePath: 'raw/accepted/inline-html.md',
      markdown: `
# Inline HTML

<div>inner</div>

After inline html.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-006#1',
        title: 'Inline HTML',
        locator: 'inline-html.md#inline-html:p1',
        excerpt: 'After inline html.',
        order: 1,
        heading_path: ['Inline HTML']
      }
    ]);
  });

  it('ignores fenced code blocks opened by tildes', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-005',
      sourcePath: 'raw/accepted/code.md',
      markdown: `
# Code

~~~ts
const leaked = true;
~~~

After code.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-005#1',
        title: 'Code',
        locator: 'code.md#code:p1',
        excerpt: 'After code.',
        order: 1,
        heading_path: ['Code']
      }
    ]);
  });

  it('stops a paragraph before a blockquote line and skips the quote block', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-007',
      sourcePath: 'raw/accepted/quote.md',
      markdown: `
# Quote

Para
> quote

After quote.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-007#1',
        title: 'Quote',
        locator: 'quote.md#quote:p1',
        excerpt: 'Para',
        order: 1,
        heading_path: ['Quote']
      },
      {
        id: 'evidence:src-007#2',
        title: 'Quote',
        locator: 'quote.md#quote:p2',
        excerpt: 'After quote.',
        order: 2,
        heading_path: ['Quote']
      }
    ]);
  });

  it('stops a paragraph before a table row and skips the table block', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-008',
      sourcePath: 'raw/accepted/table.md',
      markdown: `
# Table

Para
| col |

After table.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-008#1',
        title: 'Table',
        locator: 'table.md#table:p1',
        excerpt: 'Para',
        order: 1,
        heading_path: ['Table']
      },
      {
        id: 'evidence:src-008#2',
        title: 'Table',
        locator: 'table.md#table:p2',
        excerpt: 'After table.',
        order: 2,
        heading_path: ['Table']
      }
    ]);
  });

  it('ignores ordered list items written with closing parentheses', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-009',
      sourcePath: 'raw/accepted/ordered-list.md',
      markdown: `
# Steps

1) item

After list.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-009#1',
        title: 'Steps',
        locator: 'ordered-list.md#steps:p1',
        excerpt: 'After list.',
        order: 1,
        heading_path: ['Steps']
      }
    ]);
  });

  it('resets heading_path to the correct parent when heading levels move back up', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-010',
      sourcePath: 'raw/accepted/headings.md',
      markdown: `
# Top

### Deep

Deep text.

## Mid

Mid text.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-010#1',
        title: 'Deep',
        locator: 'headings.md#deep:p1',
        excerpt: 'Deep text.',
        order: 1,
        heading_path: ['Top', 'Deep']
      },
      {
        id: 'evidence:src-010#2',
        title: 'Mid',
        locator: 'headings.md#mid:p1',
        excerpt: 'Mid text.',
        order: 2,
        heading_path: ['Top', 'Mid']
      }
    ]);
  });

  it('does not inherit a missing parent heading when levels move from third to second', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-011',
      sourcePath: 'raw/accepted/heading-gaps.md',
      markdown: `
### Third

Third text.

## Second

Second text.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-011#1',
        title: 'Third',
        locator: 'heading-gaps.md#third:p1',
        excerpt: 'Third text.',
        order: 1,
        heading_path: ['Third']
      },
      {
        id: 'evidence:src-011#2',
        title: 'Second',
        locator: 'heading-gaps.md#second:p1',
        excerpt: 'Second text.',
        order: 2,
        heading_path: ['Second']
      }
    ]);
  });

  it('ignores single-line html comments', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-012',
      sourcePath: 'raw/accepted/comments.md',
      markdown: `
# Comment

<!-- comment -->

After comment.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-012#1',
        title: 'Comment',
        locator: 'comments.md#comment:p1',
        excerpt: 'After comment.',
        order: 1,
        heading_path: ['Comment']
      }
    ]);
  });

  it('ignores nested html blocks with the same tag name', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-013',
      sourcePath: 'raw/accepted/nested-html.md',
      markdown: `
# Nested HTML

<div>
<div>
inner
</div>
</div>

After nested html.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-013#1',
        title: 'Nested HTML',
        locator: 'nested-html.md#nested-html:p1',
        excerpt: 'After nested html.',
        order: 1,
        heading_path: ['Nested HTML']
      }
    ]);
  });

  it('ignores multi-line html comments', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-014',
      sourcePath: 'raw/accepted/multiline-comment.md',
      markdown: `
# Multi Comment

<!--
comment
-->

After multiline comment.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-014#1',
        title: 'Multi Comment',
        locator: 'multiline-comment.md#multi-comment:p1',
        excerpt: 'After multiline comment.',
        order: 1,
        heading_path: ['Multi Comment']
      }
    ]);
  });

  it('ignores html blocks whose opening line compactly nests the same tag', () => {
    const result = extractSourceAnchors({
      sourceId: 'src-015',
      sourcePath: 'raw/accepted/compact-nested-html.md',
      markdown: `
# H

<div><div>
inner
</div></div>

After.
`
    });

    expect(result).toEqual([
      {
        id: 'evidence:src-015#1',
        title: 'H',
        locator: 'compact-nested-html.md#h:p1',
        excerpt: 'After.',
        order: 1,
        heading_path: ['H']
      }
    ]);
  });
});
