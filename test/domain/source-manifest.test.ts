import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../src/domain/source-manifest.js';

describe('createSourceManifest', () => {
  it('creates a source manifest with spec field names and inbox defaults', () => {
    const manifest = createSourceManifest({
      id: 'src-001',
      path: 'raw/inbox/example.md',
      title: 'Example Source',
      type: 'markdown',
      hash: 'sha256:abc123',
      imported_at: '2026-04-11T00:00:00.000Z'
    });

    expect(manifest).toEqual({
      id: 'src-001',
      path: 'raw/inbox/example.md',
      title: 'Example Source',
      type: 'markdown',
      status: 'inbox',
      hash: 'sha256:abc123',
      imported_at: '2026-04-11T00:00:00.000Z',
      tags: [],
      notes: ''
    });
  });

  it('preserves an explicit processed status with tags and notes', () => {
    const manifest = createSourceManifest({
      id: 'src-002',
      path: 'raw/accepted/example.md',
      title: 'Processed Source',
      type: 'markdown',
      status: 'processed',
      hash: 'sha256:def456',
      imported_at: '2026-04-11T01:00:00.000Z',
      tags: ['llm', 'wiki'],
      notes: 'accepted for synthesis'
    });

    expect(manifest.status).toBe('processed');
    expect(manifest.tags).toEqual(['llm', 'wiki']);
    expect(manifest.notes).toBe('accepted for synthesis');
  });

  it("does not mutate the created manifest when the caller's tags array changes later", () => {
    const tags = ['llm'];
    const manifest = createSourceManifest({
      id: 'src-003',
      path: 'raw/accepted/mutable.md',
      title: 'Mutable Tags Source',
      type: 'markdown',
      status: 'accepted',
      hash: 'sha256:ghi789',
      imported_at: '2026-04-11T02:00:00.000Z',
      tags
    });

    tags.push('wiki');

    expect(manifest.tags).toEqual(['llm']);
  });
});
