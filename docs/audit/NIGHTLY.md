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

**135 findings — 129 resolved, 4 parked + 1 partial, 1 won't-fix (A9-10), 0 open.**
The campaign is CONCLUDED. Full per-finding status: [`INDEX.md`](INDEX.md).

- **Resolved (129)** spans behavioral fixes (with red→green tests), design
  rulings (some "resolved" = Joe ruled the behavior intentional + the docs were
  corrected, no code change), and ship-class docs/comment fixes. The
  **parked-audit clear (v2.1.49)** moved 21 items here from parked (see below).
- **Parked (4) + partial (1):** A5-14 / A10-6 / A10-7 stay parked as genuinely
  unreachable (no pool card exercises them — fixing now is speculative and
  untestable); A7-6 is a notes-not-a-finding entry; **A1-4 is partial** (the
  startMainPhase helper landed; the 76-file caller migration is a tracked
  follow-up — the spec explicitly warns against batching it).
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

## The parked-audit clear (Opus, 2026-06-14, v2.1.49)

After the recovery pass, Joe re-triaged the 26 parked items and directed clearing
the ~22 that fit the **Audit-Review-Refactor** charter (test-coverage gaps, DRY
refactors, latent-bug guards) rather than leaving refactor work parked on a
branch named for refactoring. A read-only scoping workflow (8 agents) turned the
frozen chunk findings into apply-ready specs; each fix then landed red→green with
the full suite green at every commit:

| Items | What |
|---|---|
| A6-3/5/6/7 | inline sticker dedup, granted-ability/trigger deep-copy, cost-order + grant-dedup characterization |
| A8-4, A9-8, A9-9 | dead opp-colors output removed, reward-pick bounds/dedup guards, TPLID_RENAMES collision boot-check |
| A2-6/13/14/15 | combat coverage (vigilance, multi-block, sickness, menace) + a behavioral block-legality pin (A2-9 was already moot) |
| A4-24, A4-18, A4-23 | three drifted hexproof gates → one predicate, grant_cast_permission/keyword coverage, two-discard accumulate (leg 2) |
| A3-9 | trigger auto-pick heuristic pinned + generator green-theater test replaced with literal-flag pins |
| A1-23/21/22/5 | scripted full-turn test, resetCombatState()/emptyManaPool() DRY, three switch default arms (incl. step() hang-guard) |
| A1-4 (Phase 1) | centralized startMainPhase test helper + self-test (the 76-file migration is a tracked follow-up) |
| A5-15 | the out-of-charges Stapler rip routed through leave-play discipline |

A **6-agent adversarial review** of the combined diff (cdcc967..HEAD) found **zero
production defects** and one self-introduced test-theater assertion (a ripUp guard
test using a past-end index that `splice` no-ops regardless of the guard) — fixed
by switching to a negative index and verified by neuter→red→restore. A9-10 was
reclassified won't-fix. Deliberately surfaced for Joe (not auto-decided): A6-7
fork-a (order-independent cost), A4-23 leg-1 (trailing-effect defer), and the
A1-4 bulk migration.

## Final state

- html-proto **v2.1.49**; suite **139 files / 2589 assertions, 0 failed**; lint clean.
- Branch `Audit-Review-Refactor-Recovery` carries the complete campaign (Fable's
  fixes via `audit/integration` + the recovery pass + the parked-audit clear).
  Pushed for Joe's exit-PR review; nothing reaches `dev` except through that gate.
