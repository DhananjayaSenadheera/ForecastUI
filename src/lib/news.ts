// Presentation logic for the admin News table: derive the farmer-facing category and
// expected price direction from the PER-ARTICLE signals the Python scorer persists
// (NewsArticles.Topics CSV + SentimentScore). The wire carries facts; everything here is
// display derivation, deliberately deterministic and documented so it can be tuned without
// touching the pipeline or a backfill.
//
// DIRECTION RULES (honest heuristics, not model output — the ⓘ explainer says so):
//   1. Supply-shock topics (pest / flood / drought / import_ban) → BULLISH: harvest damage
//      or blocked imports reduce supply, which usually pushes prices UP — regardless of the
//      article's tone (a cheerful "floods receding" piece is still flood news).
//   2. Input/policy topics (fertiliser / policy) → INVERSE of sentiment: bad news about
//      inputs or policy (shortage, restriction; VADER ≤ -0.05) tightens supply → bullish;
//      good news (subsidy released, shipment cleared; ≥ +0.05) eases it → bearish; the
//      deadband in between is neutral.
//   3. No topic fired ('' — general news) → NEUTRAL: no direct crop-price effect expected.
//   4. Not scored yet (null topics) → null: the table shows an honest "—", never a guess.
import { PolicyDirection } from '../api/types';

// Stable priority for picking ONE primary topic when several fire: concrete supply shocks
// beat broad buckets ("policy" matches any government/ministry mention, so it goes last).
export const NEWS_TOPIC_PRIORITY = [
  'pest',
  'flood',
  'drought',
  'import_ban',
  'fertiliser',
  'policy',
] as const;

export type NewsTopic = (typeof NEWS_TOPIC_PRIORITY)[number];

const SUPPLY_SHOCK_TOPICS: ReadonlySet<string> = new Set(['pest', 'flood', 'drought', 'import_ban']);

// VADER compound deadband — |score| below this is "no clear tone".
const SENTIMENT_DEADBAND = 0.05;

export function parseTopics(topicsCsv: string | null): NewsTopic[] {
  if (!topicsCsv) return [];
  const present = new Set(topicsCsv.split(',').map((t) => t.trim()));
  return NEWS_TOPIC_PRIORITY.filter((t) => present.has(t));
}

/** The single topic shown as the category badge, or null for general/unscored news. */
export function primaryTopic(topicsCsv: string | null): NewsTopic | null {
  return parseTopics(topicsCsv)[0] ?? null;
}

/** True when at least one agri topic fired — the "Agriculture only" filter predicate. */
export function isAgriNews(topicsCsv: string | null): boolean {
  return parseTopics(topicsCsv).length > 0;
}

/**
 * Expected price direction as a PolicyDirection value (reuses the Policy flags badge
 * mapper), or null when the article is unscored (render a muted "—", never a guess).
 */
export function deriveNewsDirection(
  topicsCsv: string | null,
  sentimentScore: number | null,
): PolicyDirection | null {
  if (topicsCsv === null || topicsCsv === undefined) return null;

  const topics = parseTopics(topicsCsv);
  if (topics.length === 0) return PolicyDirection.Neutral;

  if (topics.some((t) => SUPPLY_SHOCK_TOPICS.has(t))) return PolicyDirection.Bullish;

  // fertiliser / policy: inverse of tone (see header rules).
  const s = sentimentScore ?? 0;
  if (s <= -SENTIMENT_DEADBAND) return PolicyDirection.Bullish;
  if (s >= SENTIMENT_DEADBAND) return PolicyDirection.Bearish;
  return PolicyDirection.Neutral;
}
