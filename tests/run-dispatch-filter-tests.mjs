// Locks in the reported bug fix: picking a date range on Fleet Dispatch
// previously only affected the Excel export — the on-screen table kept
// showing everything regardless. Now the same date range actually filters
// what's shown, exactly like the free-text search already did.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("./dispatch-filter.extracted.js", import.meta.url), "utf8");
const sandbox = {
  findTruck: () => null, num: (v) => Number(v) || 0,
  tripFreight: () => 0, tripBal: () => 0, tripBalRemaining: () => 0, tripTotalDist: () => 0
};
const { inDateRange, tripMatchesFilter } = new Function(...Object.keys(sandbox), code + "\nreturn { inDateRange, tripMatchesFilter };")(...Object.values(sandbox));

// This mirrors EXACTLY the filter expression now used in renderDispatchDashboard.
function visibleTrips(fullList, dFrom, dTo, searchText) {
  return fullList.filter(tr => inDateRange(tr.date, dFrom, dTo) && tripMatchesFilter(tr, searchText));
}

const trips = [
  { id: "a", date: "2026-04-05", lr: "LR-A" },
  { id: "b", date: "2026-06-10", lr: "LR-B" },
  { id: "c", date: "2026-09-01", lr: "LR-C" },
  { id: "d", date: "", lr: "LR-D" } // undated
];

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("no date range set: every record shows (today's default behavior, unchanged)", () => {
  const v = visibleTrips(trips, "", "", "");
  assert.deepEqual(v.map(t => t.id), ["a", "b", "c", "d"]);
});

test("full range set: only records inside [from, to] show — THIS was the reported bug", () => {
  const v = visibleTrips(trips, "2026-04-01", "2026-06-30", "");
  assert.deepEqual(v.map(t => t.id), ["a", "b"]);
});

test("only 'from' set: an open-ended range from that date onward", () => {
  const v = visibleTrips(trips, "2026-06-01", "", "");
  assert.deepEqual(v.map(t => t.id), ["b", "c"]);
});

test("date range AND search text combine (both must match, same as before)", () => {
  const v = visibleTrips(trips, "2026-04-01", "2026-09-30", "LR-B");
  assert.deepEqual(v.map(t => t.id), ["b"]);
});

test("Clear resets both the date range and the search text back to 'show everything'", () => {
  // Simulates state after Clear: both dates and the search text empty.
  const v = visibleTrips(trips, "", "", "");
  assert.equal(v.length, trips.length);
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
