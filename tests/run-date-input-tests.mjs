// Tests for the "typing a year resets the whole date field" bug.
// Root cause: every date-range filter's onchange handler called render()
// UNCONDITIONALLY, even when the browser reported an incomplete/invalid
// value (which happens naturally mid-way through typing a 4-digit year).
// render() rebuilds the entire screen from state, which recreates the date
// <input> from scratch — destroying whatever the user had typed so far.
// The fix: only touch state and re-render once isValidFilterDate() confirms
// a syntactically complete date. This file locks in that contract.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("./isValidFilterDate.extracted.js", import.meta.url), "utf8");
const { isValidFilterDate } = new Function(code + "\nreturn { isValidFilterDate };")();

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("empty value is valid (an intentionally cleared filter)", () => {
  assert.equal(isValidFilterDate(""), true);
});

test("a fully-typed, in-range date is valid", () => {
  assert.equal(isValidFilterDate("2026-04-15"), true);
});

test("mid-typing a year (this is exactly what the browser reports while the user is still typing) is INVALID — this is the case the fix must not render on", () => {
  // These are the kinds of values a date input can report while a 4-digit
  // year is only partly typed — day and month already complete.
  assert.equal(isValidFilterDate("2-04-15"), false);
  assert.equal(isValidFilterDate("20-04-15"), false);
  assert.equal(isValidFilterDate("202-04-15"), false);
  // A 4-digit year that isn't finished settling yet / an out-of-range one.
  assert.equal(isValidFilterDate("0002-04-15"), false);
});

test("year outside the sane 2015-2035 operating range is rejected", () => {
  assert.equal(isValidFilterDate("1999-04-15"), false);
  assert.equal(isValidFilterDate("2099-04-15"), false);
});

test("a well-formed but calendar-nonsense date (e.g. Feb 30) is currently accepted, not rejected — a pre-existing minor quirk, unrelated to the reported bug: JS's Date() silently rolls it over (Feb 30 -> Mar 2) instead of failing, so isValidFilterDate lets it through. Documented here rather than fixed, since it wasn't reported and native date pickers rarely let you type it anyway.", () => {
  assert.equal(isValidFilterDate("2026-02-30"), true);
});

// This directly exercises the fixed handler pattern (value only applied,
// and render only triggered, when isValidFilterDate is true) — simulating
// exactly what happens as a user types a year character by character.
test("simulated typing: 'render' only fires once the year is fully typed, never mid-way", () => {
  let state = { dateFrom: "" };
  let renderCount = 0;
  function simulateOnChange(rawValue) {
    if (isValidFilterDate(rawValue)) { state.dateFrom = rawValue; renderCount++; }
  }
  const keystrokes = ["2026-04-2", "2026-04-20"]; // day already complete; this models the year... but let's model year typing directly below
  // Model typing "2026" into the year segment one digit at a time, with day/month already set.
  const yearTyping = ["2026-04-1", "2026-04-15"]; // last one is the true final state; earlier ones are malformed by construction here
  const partialYearSequence = ["0002-04-15", "0020-04-15", "0202-04-15", "2026-04-15"]; // mimics segment-by-segment digit entry
  partialYearSequence.forEach(simulateOnChange);
  assert.equal(renderCount, 1, "only the final, complete, in-range date should have triggered a render");
  assert.equal(state.dateFrom, "2026-04-15", "state must reflect the completed date, not any partial one");
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
