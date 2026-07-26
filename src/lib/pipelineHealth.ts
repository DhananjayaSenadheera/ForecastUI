// Pipeline-health presentation rules — the whole "which banner, what colour, how loud"
// decision, kept out of the component so it can be tested as data.
//
// Two honesty rules are encoded here and must not drift into styling opinions:
//  1. RED is reserved for "last night's data update did not happen" (missing/failed).
//     A blocked or partial night still produced usable data (the model keeps serving the
//     previous day's features), so it is AMBER caution, not danger.
//  2. A state this build does not know maps to NOTHING. Silence is the only honest
//     rendering of a word we cannot explain, and it can never crash a page.
import { isPipelineHealthState, type PipelineHealth, type PipelineHealthState } from '../api/types';

export interface PipelineHealthPresentation {
  /** Drives the colour token AND is part of the meaning, so it is always paired with
   *  the title text below — never colour alone. */
  tone: 'critical' | 'warn';
  /** alert = interrupt the reader (nothing ran); status = polite (it ran, imperfectly). */
  role: 'alert' | 'status';
  titleKey: string;
  bodyKey: string;
}

const CRITICAL = (name: string): PipelineHealthPresentation => ({
  tone: 'critical',
  role: 'alert',
  titleKey: `admin.pipelineHealth.${name}.title`,
  bodyKey: `admin.pipelineHealth.${name}.body`,
});

const WARN = (name: string): PipelineHealthPresentation => ({
  tone: 'warn',
  role: 'status',
  titleKey: `admin.pipelineHealth.${name}.title`,
  bodyKey: `admin.pipelineHealth.${name}.body`,
});

// A Record (not a switch) so adding a state to the contract fails the build here until
// this screen has both a sentence and a severity for it.
const PRESENTATION: Record<PipelineHealthState, PipelineHealthPresentation | null> = {
  green: null, // nothing to report — an "all good" banner is noise that trains people to ignore banners
  running: null, // not news yet; the ingestion page shows live progress
  missing: CRITICAL('missing'),
  failed: CRITICAL('failed'),
  gate_blocked: WARN('gateBlocked'),
  partial: WARN('partial'),
};

/** How to render a health state — or null for "render nothing" (green, running, and
 *  any state added to the API after this build shipped). */
export function presentPipelineHealth(state: string): PipelineHealthPresentation | null {
  return isPipelineHealthState(state) ? PRESENTATION[state] : null;
}

/** The identity a dismissal is remembered against: the state AND the day it is about.
 *  A new pipeline date, or the same date turning from partial to failed, is a DIFFERENT
 *  piece of news and must re-appear even though the admin dismissed the last one. */
export function pipelineHealthDismissKey(
  health: Pick<PipelineHealth, 'state' | 'expectedForDate'>,
): string {
  return `${health.state}|${health.expectedForDate}`;
}
