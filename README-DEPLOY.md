# How to deploy this

This zip is your WHOLE project folder — index.html, functions/api/
(data.js, login.js, _auth.js, live.js), sw.js, manifest.json, wrangler.toml,
and icons/ — exactly as it should sit in your Cloudflare Pages project.
Same as before: extract it and redeploy the whole folder the way you always
have. Nothing needs to be assembled or placed by hand — every file is
already where it belongs.

Only data.js, login.js, and index.html actually changed in this round.
Everything else (_auth.js, live.js, sw.js, manifest.json, wrangler.toml,
icons/) is included unchanged, just so the zip is the complete project and
you're never guessing what's missing or mixing old and new folders together.

## What changed, in one line each
- **data.js** — month-partitioned storage for trips/expenses/rtgs_entries/branch_expenses (see PARTITIONING-NOTES.md for the full design).
- **index.html** — loads/saves data the new month-aware way (same screens, same look), plus a new optional "Login ID" field on user accounts.
- **login.js** — a user can now log in with either their full name or a separate, short Login ID, if one was set for them.

## Before you deploy
Nothing extra required beyond what you've always done. This is a single
combined deploy — data.js + login.js + index.html all go out together.

## After you deploy — quick manual check
1. Log in as admin, confirm the app loads normally.
2. Edit an existing user (or add a test one) and set a Login ID (e.g. trivia@trivia.com) — log out, log back in using that Login ID instead of the full name, confirm it works.
3. Add or edit a trip, check the dashboard still shows correct numbers.
4. Try the new "Load older data" / date-range export pieces on one screen.

If anything looks off, the previous version is your rollback — plus data.js
has its own internal rollback switch (partition_status) if only the storage
layer needs to be reverted, described in PARTITIONING-NOTES.md.
