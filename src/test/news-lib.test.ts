// src/lib/news.ts — the display derivation behind the admin News table (category badge +
// expected price direction). These rules are honest heuristics shown to admins with an
// explainer; the tests lock the documented behaviour so a tuning change is deliberate.
import { describe, it, expect } from 'vitest';
import { PolicyDirection } from '../api/types';
import {
  deriveNewsDirection,
  isAgriNews,
  parseTopics,
  primaryTopic,
  NEWS_TOPIC_PRIORITY,
} from '../lib/news';

describe('parseTopics / primaryTopic', () => {
  it('parses the CSV in priority order regardless of input order', () => {
    expect(parseTopics('policy,flood')).toEqual(['flood', 'policy']);
  });

  it('empty string (scored, no topic) and null (unscored) both parse to []', () => {
    expect(parseTopics('')).toEqual([]);
    expect(parseTopics(null)).toEqual([]);
  });

  it('primary topic: concrete supply shock beats the broad policy bucket', () => {
    expect(primaryTopic('policy,pest')).toBe('pest');
    expect(primaryTopic('policy')).toBe('policy');
    expect(primaryTopic('')).toBeNull();
  });

  it('unknown topic strings are ignored, never rendered', () => {
    expect(parseTopics('weird_new_topic,flood')).toEqual(['flood']);
  });

  it('priority list covers exactly the scorer contract', () => {
    expect([...NEWS_TOPIC_PRIORITY]).toEqual([
      'pest', 'flood', 'drought', 'import_ban', 'fertiliser', 'policy',
    ]);
  });
});

describe('isAgriNews (the "Agriculture only" filter predicate)', () => {
  it('any fired topic counts; general and unscored do not', () => {
    expect(isAgriNews('policy')).toBe(true);
    expect(isAgriNews('')).toBe(false);
    expect(isAgriNews(null)).toBe(false);
  });
});

describe('deriveNewsDirection', () => {
  it('unscored (null topics) → null, never a guess', () => {
    expect(deriveNewsDirection(null, null)).toBeNull();
  });

  it('scored with no topic (general news) → Neutral', () => {
    expect(deriveNewsDirection('', 0.9)).toBe(PolicyDirection.Neutral);
  });

  it('supply-shock topics → Bullish regardless of the article tone', () => {
    expect(deriveNewsDirection('flood', -0.8)).toBe(PolicyDirection.Bullish);
    expect(deriveNewsDirection('flood', 0.8)).toBe(PolicyDirection.Bullish); // "floods receding" is still flood news
    expect(deriveNewsDirection('pest', 0)).toBe(PolicyDirection.Bullish);
    expect(deriveNewsDirection('drought', null)).toBe(PolicyDirection.Bullish);
    expect(deriveNewsDirection('import_ban', 0.5)).toBe(PolicyDirection.Bullish);
  });

  it('supply shock wins even when combined with an input/policy topic', () => {
    expect(deriveNewsDirection('flood,policy', 0.9)).toBe(PolicyDirection.Bullish);
  });

  it('fertiliser/policy invert the tone: bad news → Bullish, good news → Bearish', () => {
    expect(deriveNewsDirection('fertiliser', -0.6)).toBe(PolicyDirection.Bullish); // shortage
    expect(deriveNewsDirection('fertiliser', 0.6)).toBe(PolicyDirection.Bearish); // shipment cleared
    expect(deriveNewsDirection('policy', -0.3)).toBe(PolicyDirection.Bullish);
    expect(deriveNewsDirection('policy', 0.3)).toBe(PolicyDirection.Bearish);
  });

  it('the ±0.05 deadband and a missing score are Neutral for input/policy topics', () => {
    expect(deriveNewsDirection('policy', 0.04)).toBe(PolicyDirection.Neutral);
    expect(deriveNewsDirection('policy', -0.04)).toBe(PolicyDirection.Neutral);
    expect(deriveNewsDirection('policy', null)).toBe(PolicyDirection.Neutral);
    expect(deriveNewsDirection('policy', 0.05)).toBe(PolicyDirection.Bearish); // boundary inclusive
  });
});
