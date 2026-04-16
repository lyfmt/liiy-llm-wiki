export type RuntimeIntent = 'ingest' | 'query' | 'lint' | 'mixed';

interface IntentSignal {
  intent: Exclude<RuntimeIntent, 'mixed'>;
  matched: boolean;
}

export function classifyIntent(userRequest: string): RuntimeIntent {
  const normalized = userRequest.trim().toLowerCase();

  if (normalized.length === 0) {
    return 'query';
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
    return 'query';
  }

  if (signals.length === 1) {
    return signals[0]!.intent;
  }

  return 'mixed';
}

export function buildIntentPlan(intent: RuntimeIntent): string[] {
  switch (intent) {
    case 'ingest':
      return ['inspect the source request', 'run the ingest capability', 'report review-gate or persistence results'];
    case 'query':
      return ['inspect the question', 'query the wiki', 'summarize the answer with sources'];
    case 'lint':
      return ['inspect the lint request', 'run the lint capability', 'summarize findings and review candidates'];
    case 'mixed':
      return ['inspect the combined request', 'choose the minimum safe tool sequence', 'summarize outcomes and any review gates'];
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
