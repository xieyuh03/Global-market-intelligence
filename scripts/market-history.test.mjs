import { strict as assert } from "node:assert";
import { test } from "node:test";
import { completedChinaDate, mergeIndexTail, parseIndexCsv } from "./market-history.mjs";
const row = (date, close = 100) => ({ date, open: close, close, high: close + 1, low: close - 1 });
test("incremental prices need overlap and preserve baseline", () => {
  assert.equal(mergeIndexTail([row("2026-10-26"), row("2026-10-27")], [row("2026-10-27"), row("2026-10-28")]).length, 3);
  assert.throws(() => mergeIndexTail([row("2026-10-27")], [row("2026-10-28")]), /overlap/);
  assert.throws(() => mergeIndexTail([row("2026-10-27")], [row("2026-10-27", 110)]), /disagrees/);
});
test("unclosed China sessions are excluded and missing CSV fields stay null", () => {
  assert.equal(completedChinaDate(new Date("2026-10-29T06:59:00Z")), "2026-10-28");
  assert.equal(completedChinaDate(new Date("2026-10-29T08:01:00Z")), "2026-10-29");
  assert.equal(parseIndexCsv("date,close,amount\n2026-10-28,100,\n")[0].amount, null);
});
