// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadScore, pickAttribution, smoothRate, transitionAllowed, winProbability } from "./rules.ts";

test("stage transition rules", () => {
  assert.equal(transitionAllowed(null, 5), true);           // no rule → anything
  assert.equal(transitionAllowed("", 5), true);
  assert.equal(transitionAllowed("4,5,11", 5), true);
  assert.equal(transitionAllowed("4,5,11", 7), false);
});

test("attribution credits exactly one campaign", () => {
  const touches = [{ campaign_id: 1 }, { campaign_id: null }, { campaign_id: 2 }, { campaign_id: 3 }];
  assert.equal(pickAttribution(touches, "first_touch")?.campaign_id, 1);
  assert.equal(pickAttribution(touches, "last_touch")?.campaign_id, 3);
  assert.equal(pickAttribution([{ campaign_id: null }], "last_touch"), undefined);
});

test("win probability and score stay in range and move the right way", () => {
  assert.equal(smoothRate(0, 0, 0.2), 0.2);                 // no data → prior
  assert.ok(Math.abs(smoothRate(50, 100, 0.2) - 0.4727) < 1e-3);
  const base = winProbability(0.3, 0.2, 0.2, 0.2);
  assert.ok(Math.abs(base - 0.3) < 1e-9);                    // average source/category → stage rate
  assert.ok(winProbability(0.3, 0.4, 0.2, 0.2) > base);      // better-converting source → higher
  assert.ok(winProbability(5, 5, 5, 0.1) <= 0.99);
  const hot = leadScore({ prob: 0.8, priorityRank: 0, priorityCount: 4, connectedCalls: 3, interested: true, daysIdle: 0 });
  const cold = leadScore({ prob: 0.05, priorityRank: 3, priorityCount: 4, connectedCalls: 0, interested: false, daysIdle: 30 });
  assert.ok(hot > cold && hot <= 100 && cold >= 0);
});
