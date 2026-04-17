export type RuntimeIntent = 'general' | 'ingest' | 'query' | 'lint' | 'mixed';

interface IntentSignal {
  intent: Exclude<RuntimeIntent, 'mixed' | 'general'>;
  matched: boolean;
}

export function classifyIntent(userRequest: string): RuntimeIntent {
  const normalized = userRequest.trim().toLowerCase();

  if (normalized.length === 0) {
    return 'general';
  }

  if (detectGeneralChatIntent(normalized)) {
    return 'general';
  }

  const signals = [
    detectIngestIntent(normalized),
    detectQueryIntent(normalized),
    detectLintIntent(normalized)
  ].filter((signal) => signal.matched);
  const mutationMatched = detectMutationIntent(normalized);

  if (mutationMatched) {
    return 'mixed';
  }

  if (signals.length === 0) {
    return 'general';
  }

  if (signals.length === 1) {
    return signals[0]!.intent;
  }

  return 'mixed';
}

export function buildIntentPlan(intent: RuntimeIntent): string[] {
  switch (intent) {
    case 'general':
      return ['understand the request', 'decide whether any tools are truly needed', 'reply or act with the minimum necessary context'];
    case 'ingest':
      return ['inspect the source request', 'resolve ambiguity before mutating anything', 'run ingest and report persistence or review results'];
    case 'query':
      return ['inspect whether wiki evidence is actually needed', 'gather only the necessary wiki or source context', 'answer clearly and write back only if durable value is obvious'];
    case 'lint':
      return ['inspect the lint or audit request', 'run the minimum necessary inspection tools', 'summarize findings, fixes, and review candidates'];
    case 'mixed':
      return ['understand the combined request', 'choose the minimum safe tool sequence', 'summarize outcomes, writebacks, and any review gates'];
  }
}

function detectIngestIntent(normalized: string): IntentSignal {
  return {
    intent: 'ingest',
    matched:
      /\bingest\b/.test(normalized) ||
      /\bimport\b/.test(normalized) ||
      /\babsorb\b/.test(normalized) ||
      /\bprocess\b/.test(normalized) ||
      normalized.includes('raw/accepted/') ||
      normalized.includes('source manifest')
  };
}

function detectQueryIntent(normalized: string): IntentSignal {
  return {
    intent: 'query',
    matched:
      /\bquery\b/.test(normalized) ||
      /\bask\b/.test(normalized) ||
      /\bwhat\b/.test(normalized) ||
      /\bhow\b/.test(normalized) ||
      /\bwhy\b/.test(normalized) ||
      normalized.includes('?')
  };
}

function detectLintIntent(normalized: string): IntentSignal {
  return {
    intent: 'lint',
    matched:
      /\blint\b/.test(normalized) ||
      /\binspect\b/.test(normalized) ||
      /\baudit\b/.test(normalized) ||
      /\bcheck\b/.test(normalized) ||
      normalized.includes('missing link') ||
      normalized.includes('orphan page')
  };
}

function detectMutationIntent(normalized: string): boolean {
  return (
    /\bcreate\b/.test(normalized) ||
    /\bupdate\b/.test(normalized) ||
    /\bupsert\b/.test(normalized) ||
    /\binsert\b/.test(normalized) ||
    /\bwrite\b/.test(normalized) ||
    /\bedit\b/.test(normalized) ||
    normalized.includes('new wiki') ||
    normalized.includes('new page')
  );
}

function detectGeneralChatIntent(normalized: string): boolean {
  return (
    /^(test|testing|ping|hello|hi|hey|yo|sup)$/.test(normalized) ||
    /^who are you\??$/.test(normalized) ||
    /^what can you do\??$/.test(normalized) ||
    /^你是谁[？?]?$/.test(normalized) ||
    /^你能做什么[？?]?$/.test(normalized)
  );
}
