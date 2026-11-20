// Run: npm test   (acceptance criterion #10)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cac, conversionRate, cpl, kpis, roas, roi } from "./metrics.ts";

test("SRS §13 formulas", () => {
  assert.equal(cpl(10000, 200), 50);
  assert.equal(conversionRate(10, 200), 5);
  assert.equal(cac(10000, 10), 1000);
  assert.equal(roas(50000, 10000), 5);
  assert.equal(roi(15000, 10000), 50);
  assert.equal(roi(5000, 10000), -50);
});

test("zero denominators yield null, not Infinity/NaN", () => {
  assert.equal(cpl(100, 0), null);
  assert.equal(roas(100, 0), null);
  assert.equal(roi(100, 0), null);
  assert.equal(conversionRate(0, 0), null);
});

test("ROAS and ROI are not interchangeable", () => {
  const k = kpis({ spend: 10000, leads: 100, converted: 5, customers: 5, revenue: 40000, grossProfit: 12000 });
  assert.equal(k.roas, 4);
  assert.equal(k.roi, 20);
});
