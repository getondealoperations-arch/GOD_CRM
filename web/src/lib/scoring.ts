// Lead scoring & predictive conversion (SRS Phase 3). Recomputed hourly by automation and on demand.
import { exec, q } from "./db";
import { getPriorities } from "./leads";
import { leadScore, smoothRate, winProbability } from "./rules";

const CONNECTED = "'Connected','Interested','Call Back Requested','Follow-up Required','Converted','Not Interested'";

export async function recomputeScores() {
  const stages = await q<{ id: number; position: number; is_won: number; is_lost: number }>("SELECT id, position, is_won, is_lost FROM stages");
  const wonPos = Math.max(0, ...stages.filter((s) => s.is_won).map((s) => s.position));
  const firstPos = Math.min(...stages.map((s) => s.position));

  // Closed leads with the furthest (non-lost) stage they reached
  const closed = await q<{ won: number; source: string; category: string | null; reached: number | null }>(
    `SELECT s.is_won won, l.source, l.category,
       (SELECT MAX(ts.position) FROM stage_history h JOIN stages ts ON ts.id IN (h.to_stage_id, h.from_stage_id)
        WHERE h.lead_id=l.id AND ts.is_lost=0 AND ts.position<=?) reached
     FROM leads l JOIN stages s ON s.id=l.stage_id WHERE s.is_won=1 OR s.is_lost=1`, [wonPos]);
  const won = closed.filter((c) => c.won).length;
  const global = closed.length ? won / closed.length : 0.1;

  const rateBy = (key: (c: (typeof closed)[number]) => string) => {
    const m = new Map<string, { w: number; n: number }>();
    for (const c of closed) { const k = key(c); const v = m.get(k) ?? { w: 0, n: 0 }; v.n++; v.w += c.won; m.set(k, v); }
    return (k: string) => { const v = m.get(k); return smoothRate(v?.w ?? 0, v?.n ?? 0, global); };
  };
  const bySource = rateBy((c) => c.source);
  const byCategory = rateBy((c) => c.category ?? "");
  const stageRate = new Map<number, number>();
  for (const s of stages) {
    if (s.is_won || s.is_lost) continue;
    if (s.position > wonPos) { stageRate.set(s.id, global * 0.5); continue; } // e.g. Nurture: parked
    // every lead reached the first stage, even with no recorded history
    const reachedIt = closed.filter((c) => c.won || (c.reached ?? firstPos) >= s.position);
    stageRate.set(s.id, smoothRate(reachedIt.filter((c) => c.won).length, reachedIt.length, global));
  }

  const priorities = await getPriorities();
  const open = await q<{ id: number; stage_id: number; source: string; category: string | null; priority: string; connected: number; interested: number; idle: number }>(
    `SELECT l.id, l.stage_id, l.source, l.category, l.priority,
       (SELECT COUNT(*) FROM calls c WHERE c.lead_id=l.id AND c.disposition IN (${CONNECTED})) connected,
       (s.name='Interested' OR s.is_qualified=1 OR EXISTS (SELECT 1 FROM calls c WHERE c.lead_id=l.id AND c.disposition='Interested')) interested,
       DATEDIFF(NOW(), COALESCE(l.last_contact_at, l.created_at)) idle
     FROM leads l JOIN stages s ON s.id=l.stage_id WHERE s.is_won=0 AND s.is_lost=0`);

  const rows = open.map((l) => {
    const prob = winProbability(stageRate.get(l.stage_id) ?? global, bySource(l.source), byCategory(l.category ?? ""), global);
    const rank = priorities.indexOf(l.priority);
    return { id: l.id, prob, score: leadScore({ prob, priorityRank: rank < 0 ? priorities.length - 1 : rank, priorityCount: priorities.length,
      connectedCalls: Number(l.connected), interested: !!Number(l.interested), daysIdle: Number(l.idle) }) };
  });
  for (let i = 0; i < rows.length; i += 1000) {
    const b = rows.slice(i, i + 1000);
    await exec(`UPDATE leads SET score = CASE id ${b.map(() => "WHEN ? THEN ?").join(" ")} END,
      win_prob = CASE id ${b.map(() => "WHEN ? THEN ?").join(" ")} END WHERE id IN (?)`,
      [...b.flatMap((r) => [r.id, r.score]), ...b.flatMap((r) => [r.id, Math.round(r.prob * 10000) / 100]), b.map((r) => r.id)]);
  }
  await exec(`UPDATE leads l JOIN stages s ON s.id=l.stage_id SET l.win_prob=IF(s.is_won,100,0), l.score=0
    WHERE (s.is_won=1 OR s.is_lost=1) AND (l.win_prob IS NULL OR l.win_prob NOT IN (0,100))`);
  return { scored: rows.length, closedSample: closed.length, globalRate: Math.round(global * 1000) / 10 };
}
