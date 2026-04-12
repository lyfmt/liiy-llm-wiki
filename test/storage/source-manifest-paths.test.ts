import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildSourceManifestPath } from '../../src/storage/source-manifest-paths.js';

describe('buildSourceManifestPath', () => {
  it('maps a manifest id into state/artifacts/source-manifests', () => {
    expect(buildSourceManifestPath('/tmp/llm-wiki-liiy', 'src-001')).toBe(
      path.join('/tmp/llm-wiki-liiy', 'state', 'artifacts', 'source-manifests', 'src-001.json')
    );
  });

  it.each(['', '../escape', 'nested/id', 'nested\\id', '.', '..'])('rejects an unsafe id: %s', (id) => {
    expect(() => buildSourceManifestPath('/tmp/llm-wiki-liiy', id)).toThrow(`Invalid source manifest id: ${id}`);
  });
});
