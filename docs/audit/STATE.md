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
| 2 | Combat (attack/block/damage, combat keywords) | 2 | done | 2026-06-10T13:54:35Z | 6327c73 | [`chunk-02-combat.md`](chunk-02-combat.md) |
| 3 | Stack / priority / triggers (`triggers.js`, `trigger-generator.js`) | 2 | done | 2026-06-10T16:37:17Z | e6715a9 | [`chunk-03-stack-triggers.md`](chunk-03-stack-triggers.md) |
| 4 | Effects dispatch + targeting legality (~25 effect kinds) | 2 | in_progress | 2026-06-10T21:53:55Z | 4d739ad | `chunk-04-effects-targeting.md` |
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

Status: **COMPLETE** (2026-06-10 ~11:20, 224 min, 7,592 mutants). Overall score **36%**. Per-file: engine.js 45, ai.js 17, run.js 17, card-text.js 59, draft.js 10, cards.js 41, stickers.js 40, triggers.js 76, trigger-generator.js 13, picklog.js 4, types.js 86. ALL CHUNKS UNLOCKED. Map at ~/.config/magiclike/audit/mutation/; nightly task refreshes incrementally.

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
- 2026-06-10 ~11:25: USAGE WALL hit mid-chunk-2 (resets 11:30). Chunk-2 workflow completed with rules lens fully verified (incl. new P1 A2-candidate: indestructible t<=0 skip — NOTE: same root bug as A1-3, must dedupe/fold at synthesis; adds in-pool Iron Statue+3xSicken repro) but 7 verifiers died at the wall (4 state + 1 testquality + 2 more state). RECOVERY: resume Workflow runId wf_30e2bc8d-680 (script audit-chunk-2-combat-wf_30e2bc8d-680.js in session workflows/scripts dir) after reset — cached agents return instantly, only the 7 failed re-run. THEN synthesize chunk-02-combat.md. Chunk 2 stays in_progress.
- 2026-06-10 ~12:25: chunk 2 DONE. 39+7 agents (usage-wall resume worked: cached agents instant, only 7 walled verifiers re-ran). 15 findings (2 P1 / 4 P2 / 9 P3) + A1-3 cross-chunk upgrade (in-pool Iron Statue repro, live-executed). Self-QA PASS (A2-2 trample P1 re-reproduced end-to-end). 7 stage / 3 ship (1 comment + 2 docs) / 5 park. Chunk-1 leads resolved (stale-iid guards sufficient for zone changes; ghost-attacker + change_control residuals filed). Verified-clean negative space recorded.
- 2026-06-10 ~12:40: chunk-2 ship PR #101 merged (comment+docs only, no bump). Chunk 3 claimed @ e6715a9 (dev unchanged).
- 2026-06-10 ~15:30: chunk 3 DONE. 59 agents; 16 findings (1 P1 / 8 P2 / 7 P3; 12 stage / 3 ship / 1 park) + A1-1 upgrade (consequence map). ZERO refutations (calibration anomaly, recorded) -> hostile self-QA re-attacked the weak items: PASS, and it CORRECTED A3-1 evidence (reachability mechanism was order-blocked; replaced with a stronger all-real-cards staple repro). Five leads adjudicated clean incl. CLEANUP-drain timing (closes chunk-1 lead) and the generated-trigger vocabulary. JOE VERDICT ROUND 1 processed: A1-1/A1-7/A1-11 intentional (docs remediation), A1-3/A1-10/A2-3/A2-5 GO (fix agent building), A6-1/A1-9 answered. Drafting-agent timeout (~72min, no file) on first synthesis attempt — retried with efficiency constraints, succeeded.
- 2026-06-10 ~16:30: Joe-approved fixes LANDED — PRs #102 (A1-3 indestructible t<=0, v2.1.20), #103 (A1-10 cleanup tap, v2.1.21), #104 (A2-3 ghost attacker w/ tombstone prune, v2.1.22), #105 (A2-5 change_control combat removal + canon §801 para + DIVERGENCE C7, v2.1.23). All red->green, suite 1786->1842 across 4 new test files, zero surprise reds. Chunk-3 ship + verdict-docs PR dispatched.
- 2026-06-10 ~17:55: PR #106 merged (chunk-3 ships + verdict docs — rulebook now documents intentional priority design). Chunk 4 claimed @ 4d739ad (dev unchanged).
- 2026-06-10 ~18:00: JOE VERDICT ROUND 2 (PR #98, 21:52Z). GO: A1-9 (log truth), A2-8+A3-11 (payload source_iid class), A3-1 (resolution-time re-validation — the P1), A3-4 (canon §1000 rewrite for composable system — authorized), A3-7 (remove dead twin), A3-12 (log silent fizzle). CONDITIONAL: A3-2 (investigate, fix if confirmed). FEATURE: A3-6 (build out arbitrary zone-movement events — approved enhancement). LEANING-INTENTIONAL: A2-1 (first-strike double damage — Joe open to keeping; needs implications reply, no action). QUESTIONS to answer in detail: A6-1 (Archdemon logic breakdown), A1-1 legs 2+3, A1-2 (relate to pay-costs-last plan), A2-2 (reachability: indestructible blockers), A2-4, A2-7, A3-3, A3-5, A3-10, A3-13, A3-14. Execution: explanations agent + small-fix agent (A1-9, A2-8/A3-11, A3-12, A3-7) tonight; A3-1 big fix next; A3-2/A3-4/A3-6 queued behind.
- 2026-06-10 ~19:10: round-2 small fixes LANDED — PRs #107 (A1-9 log truth, v2.1.24), #108 (A2-8+A3-11 source_iid class, v2.1.25 — red evidence exposed a LIVE self-cascade bug: combat lifelink triggers self-fired without source attribution), #109 (A3-12 fizzle log, v2.1.26), #110 (A3-7 dead twin removed, declared flips only, v2.1.27). Suite 1842->1873, zero surprise reds. 13 detailed answers posted to inbox. QUEUE for next sessions (per Joe verdicts): 1) A3-1 fix (re-validation, GO), 2) A3-2 investigate-then-fix, 3) A3-4 canon §1000 rewrite (GO), 4) A3-6 zone-events build-out (approved feature), then chunk queue (chunk 4 in flight; 5, 7-11 todo).
- 2026-06-10 ~19:50: A3-1 SHIPPED — PR #111 (v2.1.28): resolution-time target re-validation for spells AND triggers (tsRevalidateTargets gate in resolveTrigger + resolveTopOfStack), partial-fizzle semantics, fizzle logging, lying comments rewritten. 16 new assertions (suite 1873->1889), ZERO surprise reds. A3-2 investigation CONFIRMED (abilities never touch the stack; live-probed) — decision packet posted, rec (b) rule-intentional + fix docs (D8 misinforms the port either way). Remaining overnight queue: A3-4 canon rewrite, A3-6 zone-events feature, chunk-4 synthesis (workflow in flight), chunks 5/7-11.
