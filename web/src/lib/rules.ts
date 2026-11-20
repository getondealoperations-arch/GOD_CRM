// Pure business rules (no I/O) — unit-tested in rules.test.ts.

/** Stage transition rule: empty allowed list = any move allowed. */
export function transitionAllowed(allowedNext: string | null | undefined, toStageId: number) {
  const ids = String(allowedNext ?? "").split(",").map(Number).filter(Boolean);
  return !ids.length || ids.includes(toStageId);
}

/** Campaign a sale is credited to (exactly one). Touches must be ordered oldest first. */
export function pickAttribution<T extends { campaign_id: number | null }>(touches: T[], model: string): T | undefined {
  const withCampaign = touches.filter((t) => t.campaign_id);
  return model === "first_touch" ? withCampaign[0] : withCampaign[withCampaign.length - 1];
}

/** Conversion rate pulled toward a prior when the sample is small (k pseudo-observations). */
export const smoothRate = (won: number, closed: number, prior: number, k = 10) => (won + k * prior) / (closed + k);

/**
 * Win probability for an open lead: the historical win rate of leads that reached its stage, nudged by how its
 * source and category convert relative to the overall rate.
 * ponytail: naive multiplicative model, explainable and data-light. Move to logistic regression once there are
 * a few thousand closed leads per vertical.
 */
export function winProbability(stageRate: number, sourceRate: number, categoryRate: number, globalRate: number) {
  if (globalRate <= 0) return Math.min(0.99, Math.max(0.01, stageRate));
  const p = stageRate * Math.sqrt(sourceRate / globalRate) * Math.sqrt(categoryRate / globalRate);
  return Math.min(0.99, Math.max(0.01, p));
}

/**
 * Lead score 0–100 for prioritising the calling queue: mostly win probability, plus priority, engagement and recency.
 * priorityRank: 0 = highest priority, priorityCount-1 = lowest.
 */
export function leadScore(x: { prob: number; priorityRank: number; priorityCount: number; connectedCalls: number; interested: boolean; daysIdle: number }) {
  const pr = x.priorityCount > 1 ? 1 - x.priorityRank / (x.priorityCount - 1) : 0.5;
  const s = 50 * x.prob + 15 * pr + 15 * Math.min(x.connectedCalls, 3) / 3 + 10 * (x.interested ? 1 : 0) + 10 * Math.max(0, 1 - x.daysIdle / 14);
  return Math.round(Math.min(100, Math.max(0, s)));
}
