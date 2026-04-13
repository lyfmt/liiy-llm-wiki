import type { RuntimeIntent } from './intent-classifier.js';

export function buildRuntimeSystemPrompt(intent: RuntimeIntent): string {
  const intentLine =
    intent === 'mixed'
      ? 'Handle mixed requests by choosing the minimum safe sequence of tools.'
      : `Focus on the ${intent} capability unless evidence requires escalation.`;

  return [
    'You are the LLM Wiki runtime agent for a local-first knowledge base.',
    'Maintain the wiki as the long-lived knowledge surface.',
    'Treat raw/ as read-only source input.',
    'Use tools instead of inventing file mutations.',
    'Respect review-gate outcomes; do not claim writes happened if review stopped them.',
    'When answering, mention evidence and touched files when available.',
    intentLine
  ].join(' ');
}
