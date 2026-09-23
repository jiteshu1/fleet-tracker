# Month partitioning + Login ID + Mobile navigation fix — all complete

45/45 tests passing (20 backend + 12 client-server e2e + 6 login + 7 nav).

## Partitioning (backend + client + older-data access + export)
See the previous summary — unchanged. In short: month-partitioned storage
for trips/expenses/rtgs_entries/branch_expenses, fast boot + background
fiscal-year prefetch, per-month saves, older-data access on every relevant
screen, date-range export with a race-condition fix.

## Login ID
Optional short Login ID per user (e.g. `trivia@trivia.com`) as an alternate
to typing the full name at login. Full name still works too. Doesn't change
how the app identifies companies/managers/branches/drivers internally.

## Mobile navigation fix (this round)
**The bug**: on a phone, the sidebar (desktop-only) is hidden by design, and
navigation instead relies on each landing screen having its own set of
quick-link buttons. The screen everyone lands on right after login (EWR
Dashboard) never had any — so on mobile there was genuinely no way to reach
any other section. This was already true in the app before this round of
changes; it wasn't something the partitioning work introduced.

**The fix**:
- A new `sidebarGroups()` function is the single source of truth for
  "what sections can this role reach" — extracted from the existing
  desktop sidebar logic so there's no second, driftable copy of that list.
- `flattenNavItems()` turns that into a flat, clickable list (unwrapping
  sub-groups like "Fleet Management" into their actual children).
- `renderMobileQuickNav()` renders that as a button grid, placed so it's
  automatically hidden on desktop (the sidebar is what desktop uses
  instead) and shown on mobile.
- Wired into every screen a role can land on right after login: EWR
  Dashboard (admin/company), Vehicle Tracking (admin, see below), My Fleet
  (manager), Daily Dispatch & RTGS (branch).
- **Admin's mobile landing screen changed**: on a phone, admin now lands on
  Vehicle Tracking instead of the EWR Dashboard, as asked. Vehicle
  Tracking's own quick-nav was also widened from a partial list (just its
  own sub-items) to the same full list, so an admin doesn't get stuck there
  either — this was a related version of the same bug, caught while fixing
  the first one.
- Company logins are unaffected by the landing-page change (they don't have
  a Vehicle Tracking section at all) and still land on their own Dashboard.
- 7 new tests verify, per role, exactly which sections are and aren't
  reachable (including the two edge cases: only East West Roadlines gets
  Branch Dispatch as a company login, and the 900px mobile/desktop
  breakpoint is matched exactly).

## Deploying
data.js, login.js, and index.html all go out together, as always.

## Date-input reset bug (this round)
**The bug**: typing a date into any of the dashboard date-range filters
worked for day and month, but typing the year reset the whole field back to
blank (dd/mm/yyyy).

**Root cause**: every one of these filters' change-handlers called
`render()` unconditionally — even when the browser reported an incomplete
value, which it naturally does for a moment while a multi-digit year is
still being typed. `render()` rebuilds the whole screen from scratch,
which recreates the date `<input>` fresh — destroying whatever the user
had typed so far. Day/month (2 digits each) mostly finish typing before
this becomes visible; the 4-digit year is what exposed it.

**Fix**: only update state and call `render()` once the browser reports a
syntactically complete, in-range date (`isValidFilterDate()` returns true).
Applied to all 10 affected date fields (Own Fleet Dashboard, Business
Dashboard, Branch Dashboard, Branch Expense Dashboard, and the new
date-range export fields). 6 new tests lock in the fix, including one that
simulates typing a year digit-by-digit and asserts a render only happens
once, on the final complete value.

45/45 -> **51/51 tests passing** (20 backend + 12 client-server e2e + 6
login + 7 nav + 6 date-input).

## Layout fix: the date-range export control was taking up way too much space (this round)
Reported with a screenshot: on the Dispatch board, "Export a specific date
range" showed as two full-width date inputs stacked on their own lines
(plus a label line, plus a button line) — 4-5 lines of near-empty white
space before the actual fleet data even started.

**Root cause**: this control used plain `<input type="date">` with no
width styling, so it fell back to the page's global "every input is 100%
wide" default. Every other date-range filter already in the app (Own Fleet,
Business, Branch, Branch Expense dashboards) avoids this by using a
`.ofl-filter-bar` class that constrains date inputs to a compact ~150-190px
width in a single dark toolbar row — this control just never had that
applied.

**Fix**: reused that exact same `.ofl-filter-bar` style (rather than
inventing new CSS) for both the date-range export control and the
"load older data" control next to it, on Fleet Dispatch, Branch Dispatch
RTGS, and Expenses. Both are now a single compact row apiece, consistent
with the rest of the app's filter bars.

55/55 tests passing (20 backend + 12 client-server e2e + 6 login + 7 nav +
6 date-input + 4 layout).

## CRITICAL — production-breaking bug, now fixed (this round)
The last deploy crashed the entire app for every user: "App load nahi hua.
Error: role is not defined". Reported with a screenshot of the live site.

**Root cause**: in an earlier round, `renderSidebar()` was refactored to
pull its role→section logic out into a shared `sidebarGroups()` function.
That refactor moved the `role` variable's declaration into `sidebarGroups()`
— but one remaining use of `role`, about 15 lines further down in
`renderSidebar()` itself (setting the sidebar's brand name for a company
login), was missed. Since `renderSidebar()` runs on every single page once
someone's logged in, this crashed the entire app immediately after login.

**Why this got past testing before**: `node --check` (used throughout this
project as the syntax gate before shipping) only catches malformed
JavaScript — it does not, and cannot, catch "this variable is read but was
never declared anywhere in scope," because that's syntactically valid code
that only fails at the moment it actually runs. A refactor that removes a
declaration while missing one remaining use is exactly the kind of mistake
that slips through a syntax check but crashes in the browser.

**Fix, immediate**: restored the missing `role` declaration in
`renderSidebar()`.

**Fix, structural — so this class of bug can't reach you again**: added
`tests/run-lint-check.mjs`, a proper scope-analysis check (via ESLint's
`no-undef` rule) that verifies every variable used anywhere in the app is
actually declared somewhere reachable. Confirmed clean across the entire
file (only other flag was Leaflet's legitimate `L` global, now whitelisted).
This is now part of the standard test run before every future change ships,
not just a syntax check.

55/55 functional tests + the new lint check, all passing.
