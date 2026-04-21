import { describe, expect, it } from 'vitest';

import { createSourceGroundedIngest } from '../../src/domain/source-grounded-ingest.js';

describe('createSourceGroundedIngest', () => {
  it('normalizes a minimal valid payload', () => {
    const ingest = createSourceGroundedIngest({
      sourceId: 'source:gof-book',
      sourcePath: 'raw/accepted/gof-book.md',
      topic: {
        slug: 'design-patterns',
        title: 'Design Patterns',
        summary: 'Overview of reusable software design solutions.'
      },
      sections: [
        {
          id: 'section:adapter-pattern',
          title: 'Adapter Pattern',
          summary: 'Wrap incompatible interfaces so they can work together.',
          grounded_evidence_ids: ['evidence:gof-p45-para2', 'evidence:gof-p45-para2', 'evidence:gof-p45-para3']
        }
      ],
      evidence: [
        {
          id: 'evidence:gof-p45-para2',
          title: 'Adapter definition',
          locator: 'p.45 ¶2',
          excerpt: 'Convert the interface of a class into another interface clients expect.',
          order: 1,
          heading_path: ['Structural Patterns', 'Adapter']
        },
        {
          id: 'evidence:gof-p45-para3',
          title: 'Adapter participants',
          locator: 'p.45 ¶3',
          excerpt: 'The client collaborates with objects conforming to the target interface.',
          order: 2,
          heading_path: ['Structural Patterns', 'Adapter']
        }
      ]
    });

    expect(ingest).toEqual({
      sourceId: 'source:gof-book',
      sourcePath: 'raw/accepted/gof-book.md',
      topic: {
        id: 'topic:design-patterns',
        slug: 'design-patterns',
        title: 'Design Patterns',
        summary: 'Overview of reusable software design solutions.'
      },
      sections: [
        {
          id: 'section:adapter-pattern',
          title: 'Adapter Pattern',
          summary: 'Wrap incompatible interfaces so they can work together.',
          grounded_evidence_ids: ['evidence:gof-p45-para2', 'evidence:gof-p45-para3']
        }
      ],
      evidence: [
        {
          id: 'evidence:gof-p45-para2',
          title: 'Adapter definition',
          locator: 'p.45 ¶2',
          excerpt: 'Convert the interface of a class into another interface clients expect.',
          order: 1,
          heading_path: ['Structural Patterns', 'Adapter']
        },
        {
          id: 'evidence:gof-p45-para3',
          title: 'Adapter participants',
          locator: 'p.45 ¶3',
          excerpt: 'The client collaborates with objects conforming to the target interface.',
          order: 2,
          heading_path: ['Structural Patterns', 'Adapter']
        }
      ]
    });
  });

  it('rejects sections with empty grounded_evidence_ids', () => {
    expect(() =>
      createSourceGroundedIngest({
        sourceId: 'source:gof-book',
        sourcePath: 'raw/accepted/gof-book.md',
        topic: {
          slug: 'design-patterns',
          title: 'Design Patterns',
          summary: 'Overview of reusable software design solutions.'
        },
        sections: [
          {
            id: 'section:adapter-pattern',
            title: 'Adapter Pattern',
            summary: 'Wrap incompatible interfaces so they can work together.',
            grounded_evidence_ids: []
          }
        ],
        evidence: [
          {
            id: 'evidence:gof-p45-para2',
            title: 'Adapter definition',
            locator: 'p.45 ¶2',
            excerpt: 'Convert the interface of a class into another interface clients expect.',
            order: 1,
            heading_path: ['Structural Patterns', 'Adapter']
          }
        ]
      })
    ).toThrow('Sections require at least one grounded evidence id');
  });

  it('rejects payloads without sections', () => {
    expect(() =>
      createSourceGroundedIngest({
        sourceId: 'source:gof-book',
        sourcePath: 'raw/accepted/gof-book.md',
        topic: {
          slug: 'design-patterns',
          title: 'Design Patterns',
          summary: 'Overview of reusable software design solutions.'
        },
        sections: [],
        evidence: [
          {
            id: 'evidence:gof-p45-para2',
            title: 'Adapter definition',
            locator: 'p.45 ¶2',
            excerpt: 'Convert the interface of a class into another interface clients expect.',
            order: 1,
            heading_path: ['Structural Patterns', 'Adapter']
          }
        ]
      })
    ).toThrow('Source-grounded ingest requires at least one section');
  });

  it('rejects payloads without evidence', () => {
    expect(() =>
      createSourceGroundedIngest({
        sourceId: 'source:gof-book',
        sourcePath: 'raw/accepted/gof-book.md',
        topic: {
          slug: 'design-patterns',
          title: 'Design Patterns',
          summary: 'Overview of reusable software design solutions.'
        },
        sections: [
          {
            id: 'section:adapter-pattern',
            title: 'Adapter Pattern',
            summary: 'Wrap incompatible interfaces so they can work together.',
            grounded_evidence_ids: ['evidence:gof-p45-para2']
          }
        ],
        evidence: []
      })
    ).toThrow('Source-grounded ingest requires at least one evidence entry');
  });

  it('rejects sections that reference missing evidence ids', () => {
    expect(() =>
      createSourceGroundedIngest({
        sourceId: 'source:gof-book',
        sourcePath: 'raw/accepted/gof-book.md',
        topic: {
          slug: 'design-patterns',
          title: 'Design Patterns',
          summary: 'Overview of reusable software design solutions.'
        },
        sections: [
          {
            id: 'section:adapter-pattern',
            title: 'Adapter Pattern',
            summary: 'Wrap incompatible interfaces so they can work together.',
            grounded_evidence_ids: ['evidence:gof-p45-para2', 'evidence:gof-p45-para3']
          }
        ],
        evidence: [
          {
            id: 'evidence:gof-p45-para2',
            title: 'Adapter definition',
            locator: 'p.45 ¶2',
            excerpt: 'Convert the interface of a class into another interface clients expect.',
            order: 1,
            heading_path: ['Structural Patterns', 'Adapter']
          }
        ]
      })
    ).toThrow('sections[].grounded_evidence_ids[] must reference an evidence id in evidence[]');
  });

  it('rejects evidence without locator or excerpt', () => {
    expect(() =>
      createSourceGroundedIngest({
        sourceId: 'source:gof-book',
        sourcePath: 'raw/accepted/gof-book.md',
        topic: {
          slug: 'design-patterns',
          title: 'Design Patterns',
          summary: 'Overview of reusable software design solutions.'
        },
        sections: [
          {
            id: 'section:adapter-pattern',
            title: 'Adapter Pattern',
            summary: 'Wrap incompatible interfaces so they can work together.',
            grounded_evidence_ids: ['evidence:gof-p45-para2']
          }
        ],
        evidence: [
          {
            id: 'evidence:gof-p45-para2',
            title: 'Adapter definition',
            locator: '   ',
            excerpt: '',
            order: 1,
            heading_path: ['Structural Patterns', 'Adapter']
          }
        ]
      })
    ).toThrow('Evidence entries require locator and excerpt');
  });

  it('rejects evidence with a non-positive or non-integer order', () => {
    expect(() =>
      createSourceGroundedIngest({
        sourceId: 'source:gof-book',
        sourcePath: 'raw/accepted/gof-book.md',
        topic: {
          slug: 'design-patterns',
          title: 'Design Patterns',
          summary: 'Overview of reusable software design solutions.'
        },
        sections: [
          {
            id: 'section:adapter-pattern',
            title: 'Adapter Pattern',
            summary: 'Wrap incompatible interfaces so they can work together.',
            grounded_evidence_ids: ['evidence:gof-p45-para2']
          }
        ],
        evidence: [
          {
            id: 'evidence:gof-p45-para2',
            title: 'Adapter definition',
            locator: 'p.45 ¶2',
            excerpt: 'Convert the interface of a class into another interface clients expect.',
            order: 1.5,
            heading_path: ['Structural Patterns', 'Adapter']
          }
        ]
      })
    ).toThrow('evidence[].order must be a positive integer');
  });
});
