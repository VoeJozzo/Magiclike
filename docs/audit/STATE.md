# Audit campaign state

> Control file for the overnight runner (`/audit-next-chunk`). The wrapper
> reads the **Armed** line; the runner reads/writes the queue table. Contract:
> [`docs/plans/plan-proto-audit.md`](../plans/plan-proto-audit.md).

Armed: yes

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
| 6 | Stickers pipeline (`stickers.js`) — DRY RUN | 1 | done | 2026-06-10T11:14:05Z | 86dc5b0 | [`chunk-06-stickers.md`](chunk-06-stickers.md) |
| 1 | Turn machine / phases / mana / state (`engine.js` `step()` region) | 2 | done | 2026-06-10T11:56:28Z | 1a92c42 | [`chunk-01-turn-machine.md`](chunk-01-turn-machine.md) |
| 2 | Combat (attack/block/damage, combat keywords) | 2 | in_progress | 2026-06-10T13:54:35Z | 6327c73 | `chunk-02-combat.md` |
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

**Queue gate (2026-06-10, relaxed ~08:30 to per-file):** a chunk may be
claimed once the mutation map **covers that chunk's files** (every mutant
for the file has a status in `results.json` — check with the per-file
completeness script in the log, or `node -e` over the JSON). The original
blanket "whole run must finish" wording overshot the gate's purpose (the
ship gate reads the map *for the touched region*). As of 08:30:
`engine.js` COMPLETE (score 45%) → chunks 1/2/4 unlocked; chunk 3 waits on
`triggers.js` + `trigger-generator.js`; chunks 5/7-11 wait on their files.
Delete this paragraph when the full run is done.

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
- 2026-06-10 ~07:55: chunk-6 DRY RUN complete. 7 findings (A6-1..A6-7); one
  docs-only ship (A6-4) merged to workshop via PR #97 (merge ed3ee53, author
  Thaumaturge-Claude); rest stage/park. Long-lived findings PR #98
  (`audit/findings` → `Audit-Review-Refactor`, author Thaumaturge-Claude) opened.
  Suite 1786/1786 green, lint clean.
  Self-QA PASS. **Dry-run gates all passed → arming the queue (see Armed line).**
  Plumbing fixes surfaced (see NIGHTLY.md): gh-bot.ps1 must be invoked
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ...` (execution
  policy blocks `-File` otherwise); overnight git/node forms must be plain
  single commands (no `cd &&`, no `$()`/`;` chains, redirects only inside
  allowed worktrees). NOTE: despite the line above, the dry-run session
  correctly held `Armed: no` — it could not bake the gh-bot invocation into
  SKILL.md itself (permission-denied; skills are self-modification-protected).
- 2026-06-10 ~08:15: **ARMED (supervised).** The gate-1 fix (canonical gh-bot
  invocation) baked into SKILL.md by the supervised session (trunk commit
  018f72e, merged to both audit branches). Arming judgment: gates 2/3/4
  passed clean in the dry run; gate 1's only denial was the skill self-edit,
  which is a one-time setup path, now done — the recurring loop contains no
  skill writes. Joe additionally authorized DAYTIME autonomous queue work
  (2026-06-10 morning): the supervised session drives chunks while the
  mutation map finishes; scheduled boops resume 23:00.
- 2026-06-10 ~10:15: chunk 1 DONE (daytime supervised run). Tier-2 Workflow: 58 agents, 4 lenses, 40 confirmed/14 refuted pre-dedupe -> 23 findings (3 P1 / 3 P2 / 17 P3; 9 stage with decision packets, 7 ship docs/comment-only, 2 trivia, 5 park). Self-QA PASS (A1-3 re-repro'd live; 2 corrections applied; A1-10 P3->P2 accepted). Headliners: A1-1 priority cluster (opp-handoff vs canon, D0 misdoc), A1-2 canPayPotential/payMana mismatch (half-applied state), A1-3 indestructible t<=0 survival. Ship/trivia PRs grouped 7+2 into two PRs (calibration-day judgment, disclosed in NIGHTLY).
- 2026-06-10 ~09:55: chunk-1 remediation landed — docs PR #99 + trivia PR #100 (v2.1.19), both robot-merged, suite 1786/1786 + lint green each, author Thaumaturge-Claude. Chunk 2 (combat) claimed @ 6327c73 (trunk skill updates merged; origin/dev unchanged).
