# stress-bot

App-agnostic stress / fuzz testing bot. Points at any deployed web app,
logs in as a test user, runs scripted scenarios + a random-action fuzz layer,
and writes an HTML + JSON report.

Currently bundled with one **target adapter** for Folios. Add more under
`src/targets/<name>/` to retarget at Lanyard, Gauge, or anything else.

stress-bot has no dependency on Folios — it lives inside the Folio repo for
convenience but the entire folder is self-contained. To split it into its own
repo, see "Extracting to its own repo" below.

## Quick start

```bash
cd stress-bot
npm install
npm run install:browsers
cp .env.example .env
# Fill in TARGET_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD
npm run stress
```

Open `reports/<timestamp>/report.html` when it finishes.

## What it does

**Scripted scenarios** — deterministic flows under `src/targets/folios/scenarios/`:

| Scenario   | Checks                                                          |
|------------|-----------------------------------------------------------------|
| `auth`     | wrong password is rejected; weak signup password is rejected; good creds log in |
| `accounts` | add-account modal opens; new account appears in list; survives reload (persisted) |
| `meetings` | Meetings view mounts; log-meeting CTA visible                   |
| `cadences` | Cadence view mounts; month nav clicks without error             |
| `pip`      | `/api/pip` rate-limits a burst (>=1 of 25 → 429); doesn't 500 on prompt-injection; doesn't echo injection payload |
| `rls`      | Supabase RLS only returns own rows; user B cannot read user A's row by ID |

**Fuzz layer** — random actions for `fuzz.durationMs` (default 60s):

- `monkeyClick` — clicks random visible buttons/links/checkboxes.
- `fuzzInputs` — fills inputs with nasty strings (10k chars, SQL/XSS patterns, emoji, prompt injection, etc).
- `doubleSubmit` — rapid-fire double-clicks save buttons (catches duplicate writes).
- `navChurn` — bounces between routes to stress mount/unmount.

While all of the above runs, page-level watchers (`src/lib/chaos.js`) capture
`pageerror`, `console.error`, failed requests on the target host, and any 5xx
response. These get clustered by message prefix in the final report so 200
identical errors collapse into one row.

## CLI flags

```bash
npm run stress                            # full run
npm run stress -- --scripted-only         # skip the fuzz layer
npm run stress -- --fuzz-only             # skip scripted scenarios
npm run stress -- --headed                # show the browser (debugging)
npm run stress -- --scenarios=auth,pip    # subset of scripted scenarios
npm run stress -- --fuzz-duration=2m      # override fuzz duration
```

Exit code: `0` if every scripted check passes, `1` if any fail, `2` on
config/runtime error.

## Configuration

Edit `stress.config.js` for non-secret options (which scenarios to run,
fuzz weights, viewport size, etc).

Secrets and the target URL live in `.env` (gitignored). See `.env.example`.

| Env var                 | Required? | Notes                                  |
|-------------------------|-----------|----------------------------------------|
| `TARGET_URL`            | yes       | Where the app is deployed              |
| `TEST_USER_EMAIL`       | yes       | Dedicated stress-test account          |
| `TEST_USER_PASSWORD`    | yes       |                                        |
| `SUPABASE_URL`          | no        | Enables the `rls` scenario             |
| `SUPABASE_ANON_KEY`     | no        |                                        |
| `TEST_USER_B_EMAIL`     | no        | Second user for cross-tenant RLS check |
| `TEST_USER_B_PASSWORD`  | no        |                                        |

**Create a dedicated test user.** Don't point this at your real account —
the fuzz layer types random garbage into every input it can find.

## Targeting a different app

1. Make a new folder under `src/targets/<your-app>/`.
2. Mirror the Folios structure:
   - `adapter.js` exports `login`, `logout`, `routes`, and `scenarios`.
   - `selectors.js` — your app's selectors in one place.
   - `scenarios/*.js` — each exports `run({ page, config })` returning `[{ name, passed, note }]`.
3. Set `target: "<your-app>"` in `stress.config.js` and add the import case to `loadAdapter` in `src/runner.js`.

The fuzz layer and reporter are 100% generic — they don't know or care
which app they're hitting.

## Extracting to its own repo

When you're ready to break it out:

```bash
cp -r stress-bot/ ../folios-stress-bot/
cd ../folios-stress-bot
git init && git add -A && git commit -m "init stress-bot"
gh repo create folios-stress-bot --private --source . --push
```

The `.github/workflows/nightly.yml` workflow is already in the right relative
location — once the folder is the repo root, GitHub will pick it up
automatically. Configure the secrets listed in the workflow file under
**Settings → Secrets and variables → Actions**.

## Roadmap

- More scenarios (Routes, Settings, multi-tab sync, offline-then-online).
- Visual regression — screenshot diff per route.
- API-layer hammering separate from the UI (direct Supabase REST).
- Pip prompt-injection corpus — pull from a maintained list.
- Failure triage — auto-cluster by stack trace, not just message prefix.
