# Ilana - Specification

Personal structure and time accounting system. Offline-first PWA, single user, two devices.

Status: draft v0.1

---

## 1. Problem

The failure mode is not "I don't know what to do today". It is "I decided what to do today and then did something else, and by Friday I have no idea where the week went".

Two consequences shape the whole design:

1. **The delta between plan and reality is the product.** Not the task list, not the checkmarks. If the system cannot tell me that I planned 6 hours of deep work this week and delivered 2.5, it has failed regardless of how nice the UI is.
2. **Logging must be nearly free.** Reports are only as truthful as my willingness to record a session at 11pm. Planning can afford friction because it happens once, deliberately, at a desk. Logging cannot. Target is under 10 seconds and under 3 taps to record a finished session on a phone.

Everything below follows from those two.

---

## 2. Non-goals

Explicitly out of scope. Listed so they stop being tempting.

- Multi-user, sharing, teams, permissions
- Real-time collaboration or any CRDT machinery
- Calendar integration (Google Calendar, CalDAV)
- Streaks, points, badges, or any gamification. It creates incentive to log dishonestly, which destroys the only thing the system is for.
- Natural language input parsing
- Task dependencies, Gantt charts, critical paths
- Pomodoro enforcement or app blocking
- Notifications and reminders in v1. Possible later, deliberately deferred.

---

## 3. Core model

Five entities. The nouns are chosen so there is exactly one way to represent anything.

### 3.1 Activity

A single self-referencing tree. A project, a task, and a subtask are the same thing at different depths. There is no separate "project" type.

```
activity
  id            uuid, client-generated
  parent_id     uuid, nullable, references activity(id)
  title         text
  notes         text, nullable
  status        enum: active | done | archived
  default_unit  text, nullable        -- prefilled when logging, e.g. "pages"
  sort_index    integer
  created_at    integer (epoch ms)
  updated_at    integer (epoch ms)
  deleted_at    integer, nullable
```

Notes:

- Depth is unbounded. Rollups are one recursive CTE.
- `default_unit` is convenience only. It does not constrain what can be logged.
- Recurring things ("go to CSC 306", "read") are just long-lived activities that accumulate sessions forever. There is no separate habit type.
- Deletion is always soft. Hard delete would break sync and destroy history.

### 3.2 Goal

The small number of things everything is supposed to be serving. Expect 3 to 6, not 30.

```
goal
  id           uuid
  title        text
  description  text, nullable
  color        text                  -- for charts
  is_active    boolean
  created_at   integer
  updated_at   integer
  deleted_at   integer, nullable
```

### 3.3 activity_goal

Many-to-many. A goal is a tag, not a parent. One activity can serve two goals. This is not an edge case, it is normal, and modelling goal as a foreign key on activity would force a lie.

```
activity_goal
  activity_id  uuid
  goal_id      uuid
  updated_at   integer
  deleted_at   integer, nullable
  primary key (activity_id, goal_id)
```

**Effective goals** of an activity = union of goals tagged on it and on every ancestor. Tag the project once, every subtask inherits. Override is not supported and is not needed.

An activity with no effective goals is fine. Cooking, resting, errands. There is no separate code path for them, they are activities with an empty tag set. Time in that bucket is worth seeing, not worth hiding.

### 3.4 planned_block

What I intended. Written the night before or that morning.

```
planned_block
  id               uuid
  activity_id      uuid
  plan_date        text (YYYY-MM-DD, local)
  planned_minutes  integer
  start_time       text (HH:MM, local), nullable   -- null = unscheduled, just "today"
  planned_qty      real, nullable                  -- e.g. 30
  planned_unit     text, nullable                  -- e.g. "pages"
  sort_index       integer
  created_at       integer
  updated_at       integer
  deleted_at       integer, nullable
```

A block is never "completed". It is not a checkbox. It is compared against sessions.

### 3.5 session

What actually happened. This is the only source of truth for any number in any report.

```
session
  id                uuid
  activity_id       uuid
  planned_block_id  uuid, nullable    -- link to intent, if there was one
  started_at        integer (epoch ms)
  duration_seconds  integer
  note              text, nullable
  created_at        integer
  updated_at        integer
  deleted_at        integer, nullable
```

`ended_at` is derived, not stored. Storing start + duration makes retroactive entry ("I read for about 40 minutes this morning") trivial, which matters because most logging is retroactive.

`planned_block_id` is nullable on purpose. Unplanned work is the most interesting thing the system will record.

### 3.6 session_measure

Units live on the session, not the activity. The same task is measured differently on different days: pages one day, problems the next, commits the next.

```
session_measure
  id          uuid
  session_id  uuid
  unit        text        -- free text, autocompleted from history
  quantity    real
  updated_at  integer
  deleted_at  integer, nullable
```

Zero or many per session. Time is never stored here, it is always `duration_seconds` on the session.

---

## 4. Derived views

Nothing below is stored. All of it is computed from sessions and planned blocks.

**Day**
- planned minutes vs logged minutes
- per-block: planned vs actual, and whether it was touched at all
- unplanned sessions, listed separately and not buried
- unaccounted time (waking hours minus logged), shown plainly

**Week / Month**
- minutes per goal, per activity subtree
- plan adherence: logged-on-planned / total planned
- plan accuracy: for blocks that were touched, actual / planned. Distinct from adherence and more useful. It answers "am I bad at starting or bad at estimating".
- unit totals per activity (pages read, problems solved)

**Activity detail**
- full session history for the subtree
- total time, first and last session, sessions per week trend

**Goal detail**
- time and session count, which activities contributed, share of total tracked time

A number is never shown without its denominator. "12 hours on systems work" alone is meaningless; "12 of 31 tracked hours" is not.

---

## 5. Offline and sync

### 5.1 Principle

IndexedDB on the device is the source of truth. The server is a sync relay and a backup, nothing more. Every read and every write is local and synchronous from the app's point of view. The app never shows a spinner because of the network and behaves identically with the VPS switched off.

Consequence: all IDs are UUIDv7 generated on the client. No server-assigned identifiers anywhere, no exceptions.

### 5.2 Protocol

Single user, two devices, low write volume, rare concurrent edits. This does not need CRDTs and will not get them.

Every row carries `updated_at` (client clock, epoch ms) and nullable `deleted_at`. The server additionally stamps a monotonic `server_seq` on every accepted write.

**Pull** `GET /sync?since={server_seq}` returns every row with a higher seq, plus the new cursor.

**Push** `POST /sync` sends every locally dirty row. Server applies last-write-wins per row using `updated_at`, tie-broken by `device_id` string comparison. Returns the assigned seqs.

Client keeps a dirty flag per row and a single cursor. Sync runs on app open, on reconnect, and every few minutes while the tab is alive.

**Clock skew** is the one real hazard. Ordering of the sync stream uses `server_seq`, which the client never generates, so a wrong client clock can only affect conflict resolution on the same row edited on both devices, which for a single user is close to never. The server rejects any `updated_at` more than 24 hours in the future and clamps it, which contains the damage from a badly set phone clock.

Sessions and measures are effectively append-only, so most of the sync surface has no conflicts at all.

### 5.3 PWA requirements

- Installable on Android and desktop. Manifest with icons, standalone display mode.
- Service worker precaches the full app shell. Cold start with no network must reach a usable logging screen.
- Cache-first for the shell, network-only for `/sync`. Never cache sync responses.
- Full functionality offline: create, edit, log, plan, and view every report. There is no online-only feature.
- Explicit sync status in the UI: last synced time, pending change count, and a manual sync button. Silent sync failure is the worst possible bug here.

---

## 6. Interface

Three surfaces. Resist adding a fourth.

**Today** is the default screen. Planned blocks for today, a running total of planned vs logged, and one large always-visible control to log a session. Live timer for work happening now, manual entry for work already done. Manual entry defaults to the most recent activity and a sensible duration, so the common case is two taps and a confirm.

**Plan** is where tomorrow gets built. Pick activities, assign minutes, optionally assign times. Shows the last 7 days of adherence beside the plan being made, because the point is to plan against evidence rather than optimism.

**Review** holds the reports from section 4. Day, week, month, all time. Filterable by goal and by activity subtree.

Activity and goal management lives in settings. It is infrequent and does not deserve prime navigation.

---

## 7. Stack

Recommendation, not a constraint.

- Frontend: SvelteKit, static adapter. Small bundle matters on a phone on Nigerian mobile data.
- Local store: IndexedDB via Dexie, or raw if it stays simple. All queries go through one data layer module so the store can be swapped.
- Service worker: Workbox or hand-rolled. Hand-rolled is maybe 100 lines here and easier to reason about.
- Backend: Rust with Axum. Roughly six endpoints. SQLite with WAL, single file.
- Deploy: Coolify on the existing VPS, single container, volume-mounted SQLite file.
- Backup: nightly `sqlite3 .backup` to object storage or just off the box. The database is the whole value of the system after month one.

The server does no business logic. It stores rows and hands them back by sequence number. Every computation described in section 4 runs on the client, which is what makes full offline possible without duplicating logic in two languages.

---

## 8. Phasing

Ordered by what produces usable data soonest, not by what is most fun to build.

**Phase 0 - local data layer and logging.** Schema in IndexedDB, activity tree CRUD, goals and tagging, session logging with timer and manual entry. No reports, no server, no PWA. Use it for a week and read the raw data in devtools. This phase answers the only question that matters: will I actually log?

**Phase 1 - planning and the delta.** Planned blocks, Today screen, day-level planned vs actual. This is the core loop. Sit here for two weeks.

**Phase 2 - PWA shell.** Manifest, service worker, install on phone. Data is already local so this is mostly packaging.

**Phase 3 - sync.** Server, endpoints, dirty tracking, cursor, sync status UI. Needed the moment the phone and laptop are both in use, and not before.

**Phase 4 - reports.** Week, month, goal breakdowns, trends. Build the specific charts that were wanted while staring at Phase 1 output, and nothing else. Weekly and monthly views are worthless before there is a month of data, so building them early is building blind.

Phase 4 will be tempting during Phase 0. Skipping ahead means designing dashboards for imagined data.

---

## 9. Open questions

- Time zone handling. Everything is local time with dates as YYYY-MM-DD strings. Adequate unless the devices ever end up in different zones. Revisit only if that happens.
- Whether unaccounted time should be estimated against a configured waking window or just left blank. Leaning toward showing it, because the gap is informative.
- Retroactive planning, meaning editing yesterday's plan after the fact. It corrupts the adherence number. Probably lock plans at end of day. Undecided.
- Whether measures need a canonical unit list to prevent "page" and "pages" fragmenting the totals. Autocomplete from history may be enough.
