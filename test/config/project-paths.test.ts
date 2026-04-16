import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildProjectPaths } from '../../src/config/project-paths.js';

describe('buildProjectPaths', () => {
  it('builds the required project paths and expanded skeleton from the root', () => {
    const root = '/tmp/llm-wiki-liiy';

    expect(buildProjectPaths(root)).toEqual(
      expect.objectContaining({
        root,

        raw: path.join(root, 'raw'),
        rawInbox: path.join(root, 'raw', 'inbox'),
        rawAccepted: path.join(root, 'raw', 'accepted'),

        docs: path.join(root, 'docs'),
        docsSuperpowers: path.join(root, 'docs', 'superpowers'),
        docsSuperpowersSpecs: path.join(root, 'docs', 'superpowers', 'specs'),

        wikiIndex: path.join(root, 'wiki', 'index.md'),
        wikiLog: path.join(root, 'wiki', 'log.md'),
        wikiSources: path.join(root, 'wiki', 'sources'),
        wikiEntities: path.join(root, 'wiki', 'entities'),

        schema: path.join(root, 'schema'),
        schemaUpdatePolicy: path.join(root, 'schema', 'update-policy.md'),
        schemaReviewGates: path.join(root, 'schema', 'review-gates.md'),

        state: path.join(root, 'state'),
        stateRuns: path.join(root, 'state', 'runs'),
        stateArtifacts: path.join(root, 'state', 'artifacts'),
        stateTasks: path.join(root, 'state', 'artifacts', 'tasks'),
        stateChatSettings: path.join(root, 'state', 'artifacts', 'chat-settings.json')
      })
    );
  });
});
