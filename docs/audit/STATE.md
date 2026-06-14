# Audit campaign state

> Control file for the overnight runner (`/audit-next-chunk`). The wrapper
> reads the **Armed** line; the runner reads/writes the queue table. Contract:
> [`docs/plans/plan-proto-audit.md`](../plans/plan-proto-audit.md).

Armed: no

**Campaign status: CONCLUDED (2026-06-14).** All 11 chunks audited; 135 findings
— 108 resolved, 26 parked, 1 deferred (A9-10), 0 open (see [`INDEX.md`](INDEX.md)).
The chunk-5 synthesis/staple batch + A1-6 were closed in the recovery pass (Opus,
v2.1.48) after Fable went offline mid-campaign. See [`NIGHTLY.md`](NIGHTLY.md) for
the campaign log. The runner stays disarmed.

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
| 6 | Stickers pipeline (`stickers.js`) — DRY RUN | 1 | done | — | — | `chunk-06-stickers.md` |
| 1 | Turn machine / phases / mana / state (`engine.js` `step()` region) | 2 | done | — | — | `chunk-01-turn-machine.md` |
| 2 | Combat (attack/block/damage, combat keywords) | 2 | done | — | — | `chunk-02-combat.md` |
| 3 | Stack / priority / triggers (`triggers.js`, `trigger-generator.js`) | 2 | done | — | — | `chunk-03-stack-triggers.md` |
| 4 | Effects dispatch + targeting legality (~25 effect kinds) | 2 | done | — | — | `chunk-04-effects-targeting.md` |
| 5 | Synthesis / staple (`engine.js` splice region) | 1 | done | — | — | `chunk-05-synthesis.md` |
| 7 | AI (`ai.js`) | 1 | done | — | — | `chunk-07-ai.md` |
| 8 | Draft (`draft.js`) | 1 | done | — | — | `chunk-08-draft.md` |
| 9 | Run / meta / picklog (`run.js`, `picklog.js`) | 1 | done | — | — | `chunk-09-run-meta.md` |
| 10 | Card-text generation (`card-text.js`) | 1 | done | — | — | `chunk-10-card-text.md` |
| 11 | Card-data JSON sweep (258 card JSONs) | 3 | done | — | — | `chunk-11-card-json.md` |

Status values: `todo` / `in_progress` / `done`. A claim older than ~12h with
no live lock is treated as crashed — re-claim and rewrite the findings file
wholesale (chunk runs are idempotent).

## Mutation coverage map

Status: **not yet run** — until mutation scores exist, every fix demotes to
*stage* by default (ship gate reads the map). First full run is Phase 0 step 3.

## Log

- 2026-06-10: Phase 0 started (supervised session, Joe present). Wrapper +
  scheduled task registered and test-fired. Branch model re-scoped per Joe.
- 2026-06-13: Fable (the campaign runner) went offline mid-campaign; chunks 1–11
  audited and the fix lane shipped through v2.1.44, but the chunk-5 synthesis/
  staple batch was ruled in PR #98 yet never implemented, and A1-6 was still open.
  Opus picked it up in a recovery worktree (`Audit-Review-Refactor-Recovery`),
  leaving Fable's frozen worktrees untouched. Scheduled tasks disarmed.
- 2026-06-14: **Campaign concluded.** Implemented the chunk-5 batch (A5-1/2/3/4/
  5/8, A5-6/7, A6-2) + A1-6 + A5-11, each red→green, then a 4-agent adversarial
  review (two high-severity findings fixed). html-proto v2.1.48, suite 125 files
  / 2487 assertions green, lint clean. INDEX rebuilt from the verified ledger:
  0 open. Branch pushed for Joe's exit-PR review.
