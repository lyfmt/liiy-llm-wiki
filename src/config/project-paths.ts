import path from 'node:path';

export interface ProjectPaths {
  root: string;
  agentSubagents: string;
  raw: string;
  rawInbox: string;
  rawAccepted: string;
  rawRejected: string;
  docs: string;
  docsSuperpowers: string;
  docsSuperpowersSpecs: string;
  wiki: string;
  wikiIndex: string;
  wikiLog: string;
  wikiSources: string;
  wikiEntities: string;
  wikiTaxonomy: string;
  wikiTopics: string;
  wikiQueries: string;
  schema: string;
  schemaAgentRules: string;
  schemaPageTypes: string;
  schemaUpdatePolicy: string;
  schemaReviewGates: string;
  state: string;
  stateRuns: string;
  stateCheckpoints: string;
  stateDrafts: string;
  stateArtifacts: string;
  stateSubagents: string;
  stateTasks: string;
  stateChatSessions: string;
  stateChatSettings: string;
  stateChatAttachments: string;
  projectEnv: string;
}

export function buildProjectPaths(root: string): ProjectPaths {
  const agentSubagents = path.join(root, '.agents', 'subagents');
  const raw = path.join(root, 'raw');
  const docs = path.join(root, 'docs');
  const docsSuperpowers = path.join(docs, 'superpowers');
  const wiki = path.join(root, 'wiki');
  const schema = path.join(root, 'schema');
  const state = path.join(root, 'state');
  const stateArtifacts = path.join(state, 'artifacts');
  const stateSubagents = path.join(stateArtifacts, 'subagents');

  return {
    root,
    agentSubagents,
    raw,
    rawInbox: path.join(raw, 'inbox'),
    rawAccepted: path.join(raw, 'accepted'),
    rawRejected: path.join(raw, 'rejected'),
    docs,
    docsSuperpowers,
    docsSuperpowersSpecs: path.join(docsSuperpowers, 'specs'),
    wiki,
    wikiIndex: path.join(wiki, 'index.md'),
    wikiLog: path.join(wiki, 'log.md'),
    wikiSources: path.join(wiki, 'sources'),
    wikiEntities: path.join(wiki, 'entities'),
    wikiTaxonomy: path.join(wiki, 'taxonomy'),
    wikiTopics: path.join(wiki, 'topics'),
    wikiQueries: path.join(wiki, 'queries'),
    schema,
    schemaAgentRules: path.join(schema, 'agent-rules.md'),
    schemaPageTypes: path.join(schema, 'page-types.md'),
    schemaUpdatePolicy: path.join(schema, 'update-policy.md'),
    schemaReviewGates: path.join(schema, 'review-gates.md'),
    state,
    stateRuns: path.join(state, 'runs'),
    stateCheckpoints: path.join(state, 'checkpoints'),
    stateDrafts: path.join(state, 'drafts'),
    stateArtifacts,
    stateSubagents,
    stateTasks: path.join(stateArtifacts, 'tasks'),
    stateChatSessions: path.join(stateArtifacts, 'chat-sessions'),
    stateChatSettings: path.join(stateArtifacts, 'chat-settings.json'),
    stateChatAttachments: path.join(stateArtifacts, 'chat-attachments'),
    projectEnv: path.join(root, '.env')
  };
}
