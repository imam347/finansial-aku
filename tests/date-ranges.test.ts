import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardRange, getTransactionDateRange } from "../src/lib/date-ranges";

const referenceDate = new Date(2026, 6, 8, 12, 0, 0);

test("dashboard week range uses Monday through Sunday", () => {
  assert.deepEqual(getDashboardRange("week", referenceDate), {
    from: "2026-07-06",
    to: "2026-07-12",
  });
});

test("dashboard month range covers the whole calendar month", () => {
  assert.deepEqual(getDashboardRange("month", referenceDate), {
    from: "2026-07-01",
    to: "2026-07-31",
  });
});

test("dashboard custom range uses valid inclusive dates", () => {
  assert.deepEqual(getDashboardRange("custom", referenceDate, "2026-07-03", "2026-07-11"), {
    from: "2026-07-03",
    to: "2026-07-11",
  });
});

test("dashboard custom range falls back to month when invalid", () => {
  assert.deepEqual(getDashboardRange("custom", referenceDate, "2026-07-20", "2026-07-11"), {
    from: "2026-07-01",
    to: "2026-07-31",
  });
});

test("transaction presets produce inclusive local date ranges", () => {
  assert.deepEqual(getTransactionDateRange("today", referenceDate), {
    from: "2026-07-08",
    to: "2026-07-08",
  });
  assert.deepEqual(getTransactionDateRange("last30", referenceDate), {
    from: "2026-06-09",
    to: "2026-07-08",
  });
});
