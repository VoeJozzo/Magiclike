# Proto-audit campaign — completion log

> The campaign's running log, closed at conclusion. Control file: [`STATE.md`](STATE.md).
> Per-finding ledger: [`INDEX.md`](INDEX.md). Plan: [`../plans/plan-proto-audit.md`](../plans/plan-proto-audit.md).

## What the campaign was

A systematic, chunk-by-chunk audit of the html-proto rules engine (~20k LOC,
`reference/html-proto/js/*.js`), split into **11 chunks** (turn machine, combat,
stack/triggers, effects/targeting, synthesis/staple, stickers, AI, draft,
run/meta, card-text, card-JSON). Each chunk produced a findings file
(`chunk-NN-*.md`), findings were triaged by severity (P1–P3) and class
(**stage** = behavioral fix needs a ballot; **ship** = docs/comment auto-class;
**park** = the pointer/refactor-feed is the deliverable), behavioral fixes were
ruled by Joe in the living **PR #98** inbox, and approved fixes shipped red→green
to the `audit/integration` workshop, version-bumped on the html-proto.

## Outcome

**135 findings — 108 resolved, 26 parked, 1 won't-fix (A9-10), 0 open.** The
campaign is CONCLUDED. Full per-finding status: [`INDEX.md`](INDEX.md).

- **Resolved (108)** spans behavioral fixes (with red→green tests), design
  rulings (some "resolved" = Joe ruled the behavior intentional + the docs were
  corrected, no code change), and ship-class docs/comment fixes.
- **Parked (26)** are tracked-but-deliberately-deferred: test-coverage additions
  and DRY/refactor feeds where the pointer itself is the deliverable — nothing
  misbehaves.
- **Won't-fix (1):** A9-10 (a SAVE_VERSION bump for a snake_case rename gap-window)
  — Joe ruled it out: no pre-snake-case saves exist, so the migration would guard
  an empty population.

## The recovery pass (Opus, 2026-06-13 → 06-14)

Fable (the campaign runner) went offline mid-campaign. At that point chunks 1–11
were audited and the fix lane had shipped through v2.1.44, but **chunk 5
(synthesis/staple)** had been ruled in PR #98 yet never implemented, and **A1-6**
was still open. Opus finished it in a dedicated recovery worktree
(`Audit-Review-Refactor-Recovery`), leaving Fable's frozen worktrees untouched.

Closed this pass (each red→green; full suite green at every step):

| Finding(s) | Fix |
|---|---|
| A1-6 | CLEANUP delayed-trigger drain warns on an unhandled effect kind (was a silent drop) + retired stale comment |
| A5-11 | Canon §1504 player-Clone reward corrected (random slot, may decline) + proto backlog note |
| A5-4 | out-of-charges Stapler rip routes through the shared slot-pointer fixup |
| A5-5 | Clone reward photocopies a Stapler's REMAINING charges; rip scoped to the ripped slot's instance (a charged clone survives) |
| A5-1 + A5-3 | side-aware in-game combat-state transfer (a spliced opp attacker no longer attacks YOU; an absorbed blocker's attacker stays blocked; a spliced blocked-attacker re-points its blockers) |
| A5-2 | a spell stapled onto a non-creature permanent FIZZLES (countered, no charge) instead of fast-resolving + deleting a run slot |
| A5-8 | empower roll on a spell stapled onto a LAND base survives (relocates to the ETB trigger); oracle-derived prior counts |
| A6-2 | a stored-blank empower roll stays blank instead of re-rolling a random target each rebuild |
| A5-6 + A5-7 | Elystra's `permaBuffs` object (a 5-site object-vs-array bug class the splice merge silently dropped) retired in favor of `stat_boost`/`kw_*` slot stickers + a legacy save migration |

A **4-agent adversarial review** of the combined chunk-5 diff then surfaced two
real high-severity issues — both introduced by the batch — which were fixed:
the A5-1 blocked-attacker block-transfer regression, and the A5-5 rip purging by
`tplId` (destroying a charged clone). Plus low/nit robustness fixes (the legacy
`permaBuffs` save migration, `getStats` inline-`stat_boost` handling, comment
accuracy).

## Final state

- html-proto **v2.1.48**; suite **125 files / 2487 assertions, 0 failed**; lint clean.
- Branch `Audit-Review-Refactor-Recovery` carries the complete campaign (Fable's
  fixes via `audit/integration` + the recovery pass). Pushed for Joe's exit-PR
  review; nothing reaches `dev` except through that gate.
