# Ilana

Personal structure and time accounting. Offline-first PWA, single user, two devices.

The delta between plan and reality is the product: Ilana exists to answer "I planned 6 hours of deep work this week — how much did I deliver?" Logging a finished session is designed to take under 10 seconds and under 3 taps. See [SPEC.md](./SPEC.md) for the full design.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Local data layer, activity tree, goals, session logging (timer + manual) | Done |
| 1 | Planned blocks, Today screen, day-level planned vs actual | Done |
| 2 | PWA shell (manifest, service worker, install) | Not started |
| 3 | Sync server + protocol (rows already carry `updated_at`, `deleted_at`, `dirty`) | Not started |
| 4 | Week/month reports, trends | Basic version shipped early in Review; build the rest against real data |

## Stack

- SvelteKit (Svelte 5 runes) + `adapter-static`, pure SPA — every route falls back to the app shell
- IndexedDB via Dexie; **all** reads and writes go through `src/lib/repo.ts` so the store can be swapped
- UUIDv7 ids generated on the client, no server-assigned identifiers anywhere
- Bun for everything

```sh
bun install
bun run dev      # dev server
bun run check    # svelte-check
bun run build    # static build to ./build
```

## Deploying (Docker / Coolify)

The `Dockerfile` builds the SvelteKit app with bun and serves it as static files
from nginx with an SPA fallback — one container, one domain. There is no server
state yet (IndexedDB on the device is the source of truth), so no volumes and no
environment variables. Phase 3 swaps the nginx stage for the Rust sync server
serving the same static dir plus `/sync`, with SQLite on a `/data` volume.

In Coolify:

1. Create an app from this repo, build pack **Dockerfile**.
2. Port is `8080`; health check path is `/healthz`.

Local test with Docker:

```bash
docker compose up --build
# open http://localhost:8080
```

## Layout

```
src/lib/
  db.ts             Dexie schema — the six tables from SPEC §3
  repo.ts           the one data layer module: CRUD, tagging, queries
  derive.ts         day stats: adherence, accuracy, unplanned, per-block deltas
  time.ts           local-date helpers and duration formatting
  timer.svelte.ts   live timer, survives reloads via localStorage
  ui.svelte.ts      cross-page state (the log sheet)
  components/       LogSheet, DeltaBar, ActivityPicker
src/routes/
  /                 Today — the day's ledger, blocks, timer, log dock
  /plan             build tomorrow against the last 7 days of evidence
  /review           day / week / month / all-time rollups
  /manage           activities, goals, tagging (infrequent, off prime nav)
```

## Identity

Shares DNA with the Amana brand system (calm base, deep ink, mono figures, one
accent used sparingly) with its own modern voice: soft-white paper (`#F7F6F3`),
white cards, near-black ink (`#191824`), an iris-indigo accent (`#5B5BD6`), and
red ink (`#C6402C`) reserved for deficit figures only — like an accountant's
ledger. Type: Instrument Sans + JetBrains Mono (all figures tabular mono).
Semantic tokens (`--ink-*`, `--surface-*`, `--accent-*`) live in `src/app.css`,
so a recolor is one block of CSS.
