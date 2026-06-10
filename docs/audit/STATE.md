# Audit campaign state

> Control file for the overnight runner (`/audit-next-chunk`). The wrapper
> reads the **Armed** line; the runner reads/writes the queue table. Contract:
> [`docs/plans/plan-proto-audit.md`](../plans/plan-proto-audit.md).

Armed: no

## Branch model (adaptation, Joe 2026-06-10)

The plan was written with `dev` as the campaign's base; Joe re-scoped it at
kickoff: **`Audit-Review-Refactor` is the campaign trunk** — Claude's
autonomous workspace. `dev` is a safe upstream backup serving the live page,
NOT a PR target for in-progress audit work.

- `Audit-Review-Refactor` — campaign trunk. Phase 0 infrastructure, plan
  adaptations, and milestone merges land here.
- `audit/findings` — docs-only findings branch, cut from the trunk. The
  runner session lives in its worktree (`C:\Users\Joe\Documents\magiclike-audit\findings`).
- `audit/integration` — the workshop (code), cut from the trunk. Fix PRs
  target it and are robot-merged on green
  (worktree: `C:\Users\Joe\Documents\magiclike-audit\workshop`).
- Rolling anchor: the runner merges **`dev`** into the workshop at each chunk
  claim (Joe's live work continues on dev), and merges trunk forward when
  runner infrastructure changes.
- Exit: at campaign end (or on request), one consolidated
  `Audit-Review-Refactor` → `dev` PR gets Joe's ultimate review. Nothing
  reaches `dev` except through that gate.

## Chunk queue

Stop-after-any semantics; claim top-most `todo`. Chunk 6 is the supervised
dry-run target and runs first; thereafter strict priority order (1 → 11).

| # | Chunk | Tier | Status | Claimed (ISO) | Anchor SHA | Findings file |
|---|-------|------|--------|---------------|------------|---------------|
| 6 | Stickers pipeline (`stickers.js`) — DRY RUN | 1 | in_progress | 2026-06-10T11:14:05Z | 86dc5b0 | `chunk-06-stickers.md` |
| 1 | Turn machine / phases / mana / state (`engine.js` `step()` region) | 2 | todo | — | — | `chunk-01-turn-machine.md` |
| 2 | Combat (attack/block/damage, combat keywords) | 2 | todo | — | — | `chunk-02-combat.md` |
| 3 | Stack / priority / triggers (`triggers.js`, `trigger-generator.js`) | 2 | todo | — | — | `chunk-03-stack-triggers.md` |
| 4 | Effects dispatch + targeting legality (~25 effect kinds) | 2 | todo | — | — | `chunk-04-effects-targeting.md` |
| 5 | Synthesis / staple (`engine.js` splice region) | 1 | todo | — | — | `chunk-05-synthesis.md` |
| 7 | AI (`ai.js`) | 1 | todo | — | — | `chunk-07-ai.md` |
| 8 | Draft (`draft.js`) | 1 | todo | — | — | `chunk-08-draft.md` |
| 9 | Run / meta / picklog (`run.js`, `picklog.js`) | 1 | todo | — | — | `chunk-09-run-meta.md` |
| 10 | Card-text generation (`card-text.js`) | 1 | todo | — | — | `chunk-10-card-text.md` |
| 11 | Card-data JSON sweep (258 card JSONs) | 3 | todo | — | — | `chunk-11-card-json.md` |

Status values: `todo` / `in_progress` / `done`. A claim older than ~12h with
no live lock is treated as crashed — re-claim and rewrite the findings file
wholesale (chunk runs are idempotent).

## Mutation coverage map

Status: **first full run in flight** (started 2026-06-10 ~02:10 local; ~10h
ETA at observed pace — 7,592 mutants, 12 workers). Until it completes, every
fix demotes to *stage* by default (ship gate reads the map).

**Queue gate (2026-06-10):** beyond the chunk-6 dry run, no chunk may be
claimed until the first full mutation run is complete — the plan requires
the map before chunk 1. Complete = `mutation-first-full-run.log` (in
`~\.config\magiclike\audit\logs\`) ends with a `DONE:` line and
`MUTATION-MAP.md` covers all 11 target files. Delete this paragraph when it
no longer binds.

## Log

- 2026-06-10: Phase 0 started (supervised session, Joe present). Wrapper +
  scheduled task registered and test-fired. Branch model re-scoped per Joe.
- 2026-06-10 ~02:30: mutation first full run launched in background; pace
  slower than estimated (suite-level contention) → queue gated on map
  completion; tonight = dry run only.
- 2026-06-10 07:14: chunk-6 DRY RUN claimed (anchor 86dc5b0 = workshop tip;
  `origin/dev` 37c2eb2 already an ancestor, merge no-op). Mutation map still
  in flight (4080/7592 @ 07:09) and covers only types.js — stickers.js absent,
  so chunk-6 behavioral fixes demote to *stage* by default.
