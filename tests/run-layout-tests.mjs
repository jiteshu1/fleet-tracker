// Locks in the layout fix for the "date-range export control takes up way
// too much vertical space" bug — reported with a screenshot showing two
// full-width stacked date inputs where a single compact row was expected.
// Root cause: the control used plain <input type="date"> with none of the
// existing compact ".ofl-filter-bar" styling every other date filter in
// the app already uses, so it fell back to the global 100%-width default.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("./layout-controls.extracted.js", import.meta.url), "utf8");

function makeApi(state) {
  const sandbox = { state };
  const fn = new Function(...Object.keys(sandbox), code + "\nreturn { renderLoadOlderControl, renderRangeExportControl };");
  return fn(...Object.values(sandbox));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("export-range control uses the compact .ofl-filter-bar style, not a full-width stacked layout", () => {
  const state = { _rangeExportFrom: {}, _rangeExportTo: {}, _rangeExportNote: {}, _rangeLoading: {} };
  const html = makeApi(state).renderRangeExportControl("trips");
  assert.ok(html.includes('class="ofl-filter-bar"'), "must reuse the app's existing compact filter-bar style");
  // The old bug: two <input type="date"> with no width constraint at all,
  // each falling back to the global width:100% rule and stacking on their
  // own line. Confirm both date inputs are present but NOT full-width.
  const dateInputs = html.match(/<input type="date"[^>]*>/g) || [];
  assert.equal(dateInputs.length, 2, "from and to date inputs must both be present");
  dateInputs.forEach(inp => assert.ok(!/style="[^"]*width:\s*100%/.test(inp), "a date input must not be forced to full width"));
});

test("export-range control is a single row's worth of elements (no extra wrapping divs stacking things vertically)", () => {
  const state = { _rangeExportFrom: {}, _rangeExportTo: {}, _rangeExportNote: {}, _rangeLoading: {} };
  const html = makeApi(state).renderRangeExportControl("rtgs_entries");
  const openDivs = (html.match(/<div/g) || []).length;
  assert.equal(openDivs, 1, "should be exactly one flex row container, not several stacked blocks");
});

test("load-older-data control (expanded, with months to pick) also uses the compact filter-bar style", () => {
  const state = {
    _olderMonthsOpen: { trips: true }, _discoveredMonths: { trips: ["2025-11", "2025-12"] },
    _loadedMonths: { trips: {} }, _olderMonthsNote: {}
  };
  const html = makeApi(state).renderLoadOlderControl("trips");
  assert.ok(html.includes('class="ofl-filter-bar"'));
  assert.ok(html.includes("<select"));
});

test("load-older-data control (collapsed) stays a single compact link line", () => {
  const state = { _olderMonthsOpen: {} };
  const html = makeApi(state).renderLoadOlderControl("trips");
  const openDivs = (html.match(/<div/g) || []).length;
  assert.equal(openDivs, 1);
  assert.ok(html.includes("Load older data"));
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
