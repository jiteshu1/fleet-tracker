# Deploying this app on Cloudflare Pages (free plan)

The backend API now lives in `/functions/api/` (Cloudflare's format) instead
of `/api/` (Vercel's format — that folder is no longer used and can be
ignored/deleted). The app itself (`index.html`) needed zero changes; it
already calls `/api/login` and `/api/data` as relative paths, so it works
the same regardless of which host serves it.

## 1. Create the Pages project

Easiest path — connect your Git repo (GitHub/GitLab) to Cloudflare Pages:

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Pick this repo. Build settings: leave **Build command** empty and set
   **Build output directory** to `/` (the project root — no build step, it's
   already static files + functions).

Or, if you prefer the CLI: `npx wrangler pages deploy .` from this folder
(the included `wrangler.toml` already has the right settings).

## 2. Turn on Node compatibility (required — do this first)

The login/security code uses Node's `crypto` module. Without this flag it
will fail immediately.

Dashboard → your Pages project → **Settings** → **Functions** →
**Compatibility Flags** → add `nodejs_compat` for **both** Production and
Preview.

(If deploying via `wrangler pages deploy`, this is already set in
`wrangler.toml` — nothing more to do.)

## 3. Set environment variables

Dashboard → your Pages project → **Settings** → **Environment variables** →
add these for **Production** (and Preview, if you want previews to work too):

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | Yes | The Supabase **service role** key (never the anon key). Same value you used on Vercel. |
| `SESSION_SECRET` | Yes | Any long random string. **Use the exact same value you had on Vercel** if you want existing logged-in sessions/tokens to keep working; otherwise everyone just has to log in again once, which is harmless. |
| `SUPABASE_URL` | No | Only needed if it's different from the default already baked into the code. |
| `FLEETX_USERNAME` | Only if using live GPS tracking | Same as before. |
| `FLEETX_PASSWORD` | Only if using live GPS tracking | Same as before. |

## 4. Deploy and test

After the first deploy, check these in order:

1. Open the site, log in — confirms `SESSION_SECRET` and `SUPABASE_SERVICE_KEY` are correct and `nodejs_compat` is on.
2. Add/edit something (a trip, an expense) — confirms writes work.
3. Settings → **Sync vehicle locations now** — confirms the FleetX proxy still works (only if you use live tracking).

If step 1 fails with a 500 error, it's almost always the compatibility flag
(step 2) or a missing/wrong environment variable (step 3) — those are the
two things Vercel handled differently that Cloudflare needs told explicitly.

## 5. Point your domain here, then you're done with Vercel

Once everything above checks out, add your custom domain to this Cloudflare
Pages project (**Custom domains** tab) and you can shut down the Vercel
project.
