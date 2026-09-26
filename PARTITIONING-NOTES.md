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

## Live-data investigation (this round) — confirmed data was never lost
User reported the live app showing "everything already loaded" for older
months and an export missing everything except the current month, right
after a chaotic period of deleting/recreating the GitHub repo and Cloudflare
Pages project and deploying via a cmd-line workaround.

Pulled the actual Supabase `app_data` table contents and reproduced the
exact scenario (real trip records already sitting in `trips_2025-04`,
`trips_2026-04`, `trips_2026-06`, `trips_2026-07`, `trips_2026-09`) against
the current code: fiscal-year prefetch correctly picked up every one of
them. **The partitioning/loading logic itself was never the problem** —
the data was intact the whole time. The live site was very likely still
running an earlier deploy from the messy migration period. Once the user
redeployed with the latest zip, the data appeared automatically.

## Fleet Dispatch: date range now actually filters the table (real bug, now fixed)
Reported separately: picking a date range only affected the Excel export —
the on-screen table kept showing everything regardless of the dates picked.
Fixed: the same date range now filters what's shown on screen too, using
the existing `inDateRange()` (which already gracefully handles just one
side of the range being set). 5 new tests lock this in.

## Fleet Dispatch layout — full redesign per the user's own detailed spec
Rebuilt the top of the Fleet Dispatch page into one compact, single-row
toolbar: Add trip, Company, Manager, Search, Date range, Clear, Export —
laid out together, wrapping sensibly on narrow screens, instead of several
stacked full-width blocks. Reused the app's existing `.ofl-filter-bar`
style (same one already used on the other dashboards) rather than
inventing new styling — no colors/theme/sidebar/header/table structure/
button behavior changed, only how compactly these controls are arranged.
The secondary toolbar (Upload your data / Full screen / Export JPG /
Export to Excel) and the table itself are untouched. Scoped to Fleet
Dispatch only, as asked — RTGS and Expenses screens weren't touched this
round.

60/60 tests passing (20 backend + 12 client-server e2e + 6 login + 7 nav +
6 date-input + 4 layout + 5 dispatch-filter), plus the no-undef lint check.

## One root cause behind four separate-looking bugs (this round)
Reported together: (1) "Load older data" status never resetting across
logout/login, (2) the table/export only ever showing a small, stale set of
trips no matter what date range was picked, (3) a page refresh forcing a
full re-login, (4) — the serious one — adding a new manager appearing to
delete every other manager and unassign their vehicles.

**All four traced back to one thing.** The session token only ever lived in
a JS variable, never saved anywhere — so any page refresh lost it and
forced a fresh login (bug 3). That made refreshing painful, so the natural
way to "start over" while testing became logging out and back in inside the
*same browser tab*, without ever refreshing. But `logout()` only cleared
the session — every other piece of in-memory state (which months were
loaded, the trips already in memory, the managers list, etc.) was left
exactly as it was from before. The next login then quietly built on top of
that stale leftover state instead of a clean one:
- Bug 1: the "load older data" status was never reset because nothing reset it.
- Bug 2: the table/export only reflected whatever trips happened to still be in memory from the previous session, not a proper fresh load.
- Bug 4 (the serious one): adding a manager pushes onto `state.managers` and saves — completely correct *if* that list was accurate. If it was actually a stale, incomplete leftover from an earlier session, the save's "here's everything I have" data legitimately looked like every other manager had been deleted, and the server's merge logic (which exists specifically to protect against silent data loss) faithfully did what it was told: removed what wasn't in that stale list. The server-side logic was working as designed — the bug was in what the client believed the truth was.

**Fix**: the session token now persists in `localStorage`, so a refresh
keeps you logged in and just re-loads data fresh (fixing bug 3 directly).
`logout()` now does a full page reload instead of a partial reset —
guaranteeing every single piece of state starts genuinely clean for
whoever logs in next, on the same device or a different one (fixing 1, 2,
and 4 all at once, since there's no longer any way for state to survive
between sessions). The server already independently re-validates the
token's expiry on every request regardless, so none of this changes the
actual security boundary — it's purely about not trusting stale
client-side memory across logins. 7 new tests, including round-tripping a
real token from the server's own signing function.

67/67 tests passing (20 backend + 12 client-server e2e + 6 login + 7 nav +
6 date-input + 4 layout + 5 dispatch-filter + 7 session), plus the no-undef
lint check.

## Security audit round (this drop) — Tier 1: fixed, tested, no business decisions needed

A very long external (ChatGPT-generated) bug list was reviewed — NOT trusted
at face value, each claim checked against the actual code first. Below are
the ones independently confirmed real and fixed this round. 84/84 tests
passing total, all new fixes covered by dedicated tests.

1. **CRITICAL — a non-admin could take over ANY account, including admin's.**
   The self-service "change my password" endpoint only checked that OTHER
   users' `name`+`role` were unchanged — it never looked at their
   `password` field at all. A crafted request could include a fresh
   password for someone else's account and it would be hashed and applied.
   Combined with a second gap — the caller's OWN record had no checks
   at all — a non-admin could also simply set `role: "admin"` for
   themselves. Both are fixed: a non-admin can now only ever change their
   own password; every other field of their own record, and every field
   (including password) of anyone else's record, must match exactly what's
   already stored.

2. **`trucks`, `drivers`, `managers` had no server-side permission check at
   all.** The UI only lets admin edit drivers/managers, and only lets a
   driver/manager edit their own truck/fleet — but a direct API call could
   bypass that entirely and overwrite any of these for any role. Fixed:
   drivers/managers are now admin-only server-side; trucks now enforces the
   same ownership rule the UI already implies (driver: only their own
   assigned vehicle, based on the database's current record — not
   whatever the request claims, so a truck can't be "claimed" by editing
   its driver field; manager: only vehicles in their own fleet, per the
   managers list on file).

3. **A failed database read was silently treated as "no data exists."**
   If a Supabase read failed for any transient reason mid-save, the code
   proceeded as if the dataset were empty, which could let a save wipe out
   real records that simply couldn't be read a moment before — and would
   have fooled the wipe-guard too, since it also computed "0 existing
   records" from the same false-empty read. Now a failed read aborts the
   whole request with a clean error; nothing is ever written on top of an
   assumed-empty dataset.

4. **The service worker was caching every API response**, including
   authenticated, per-user financial/RTGS data — directly contradicting
   its own comment ("does not cache app data") and the API's `no-store`
   header. If the network ever failed, a stale or wrong-user cached API
   response could be served back instead of a fresh authenticated request.
   Fixed: `/api/` requests are now completely excluded from the service
   worker (network-only, exactly as if the service worker didn't exist for
   them), and old cache versions are now deleted on activation so this
   takes effect immediately for anyone who already has the app installed.

## What's still open (not done this round)
The external list had 350+ items total. A representative, high-severity
sample across every category was independently verified against the real
code (not assumed correct); many of the ones above turned out to be real,
some turned out to be non-issues or intentional design choices already
decided earlier in this project (e.g. route/party profit ranking by
revenue only, on purpose). Still open, roughly in priority order:
- Server-side duplicate-name/Login ID enforcement (currently UI-only) for users, companies, branches, drivers, managers.
- Tightening CORS to the app's actual domain(s) instead of `*` (lower urgency for a Bearer-token API, since — unlike cookies — a browser won't automatically attach the token for a cross-origin site to exploit this).
- Login rate-limiting / brute-force protection.
- Reconciling the different profit formulas used across dashboards (Vehicle Profit vs Route Profit vs Own Fleet Profit) into one agreed definition — **this needs your input on what should count** (Driver Advance, Commission, Charges, TDS — which belong in "profit"?) before anything gets changed, since dashboards currently disagree with each other rather than one of them being objectively wrong.
- A handful of calculation-consistency and edge-case items (mileage averaging method, empty-KM at date-range boundaries, negative-value validation) — real, but not security- or data-loss-critical, and several depend on the same profit-formula decision above.

## CRITICAL — the real "adding a manager deletes all others" bug, found and fixed
This was reported multiple times and initially misdiagnosed as a stale-
session issue (that WAS a real, separate bug, already fixed — but it
wasn't this one). Confirmed via a live Supabase screenshot: `drivers` had
collapsed to exactly one entry, and `drivers_prev` (the automatic backup)
showed three different, real drivers from before. Same pattern for
`managers`.

**Root cause**: `drivers`, `managers`, and `branches` all use `name` as
their natural identity — none of them have an `id` field. But the server's
merge function (`scopedMerge`) defaulted to identifying every record by
`.id` when no other key was specified. Since `.id` is `undefined` for
every driver/manager/branch, they all collapsed into the exact same
internal map slot — so a save could only ever "see" one record per
dataset (whichever was last in the array), and every other one looked, to
the merge logic, like it had been deleted. This is why it happened
consistently, every single time, regardless of fresh login — it had
nothing to do with session staleness. `trips`, `trucks`, `rtgs_entries`,
`companies`, and `branch_expenses` all do have a real `id` field and were
never affected.

**Fix**: `scopedMerge` now uses `name` as the identity specifically for
drivers/managers/branches, matching what they actually are. 5 new tests
lock this in directly, including the exact reported scenario (add a
driver, confirm the others survive) and edit/delete cases for the same
three datasets.

**Your existing drivers were not permanently lost** — the automatic
backup (`drivers_prev` in Supabase) still has them. After deploying this
fix, you can re-add Masood 2607, Zulfikar 2614, and Ashrif 2667 (or any
other driver this happened to) through the app normally; from then on
they'll all correctly coexist.

89/89 tests passing total.
