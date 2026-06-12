# Nightly packet — 2026-06-10 → 06-11 (tokenmaxx night)

*Final update ~05:30 local. Supervisor session worked the queue directly (lock held against the hourly boops — each boop verified exiting fast on the live lock, by design).*

## Headline

**Ten fix/docs/feature PRs merged (#116–#123, #125, #126 — #124 is a peer bot's unrelated art PR to dev), the ENTIRE approved-fix queue cleared, chunk 5 fully completed, 9 new ballots + 2 investigation answers + 4 spec questions in the inbox, and one bookkeeping erratum found and fixed.** Engine v2.1.31 → v2.1.40; suite 1937 → **2272** assertions (85 → 108 files), **zero unexplained flips all night** (the one surprise was judge-adjudicated INTENDED-CHANGE); every behavioral fix landed red→green; lint green throughout.

## Shipped (all robot-merged into audit/integration, author Thaumaturge-Claude)

| PR | What | Version |
|----|------|---------|
| #116 | Trigger-hygiene batch: A3-10 (emit-time eat → drain-time logged fizzle), A3-13 (deep-copy condition lists, 4 aliasing sites), A3-14 (fireAt validation), A3-5 (generator-table boot validation), A3-3 (budget docs ×4) | v2.1.32 |
| #117 | A3-4 canon §1000 rewrite (composable system + historical appendix) + A3-2 Stackable spec → `docs/plans/plan-stackable.md` | docs |
| #118 | A1-1 legs 2+3: ability pass-tracker reset + no synthetic priority rounds (closed-window drains now wait) | v2.1.33 |
| #119 | A6-1 option C: bargain stickers keep the broad pool, draws now weighted via the canonical `pickWeightedSticker` | v2.1.34 |
| #120 | A1-2 payer unification: one mana solver, plan-then-execute, greedy tapper deleted, payment atomic by construction | v2.1.35 |
| #121 | Docs ship batch: A4-10 PROTOCOL corrections, A4-25 comment sweep + dead locals, A5-9/10/12/13, + `docs/wiki/engine/synthesis-staple.md` | v2.1.36 |
| #122 | A2-1: first-strike membership snapshotted at combat-damage start (Joe's fix-per-MTG ruling); canon §803 updated; Godot live-read flagged for C1/C2 | v2.1.37 |
| #123 | The four named chunk-4 P1 GOs: A4-2 shared `lordBuffApplies` predicate + revoke pass (adjudicates A2-9), A4-3 fight fizzles-not-retargets, A4-5 copies keep copied keywords through CLEANUP, A4-6 color filters read full color identity | v2.1.38 |
| #125 | A4 batch — 14 approved items (A4-7..9, 11..17, 19..22): human chooses() prompts from trigger/ability loops, target_filter enforcement, fight/trample gate, filter-key whitelist, Phylactery life floor, scope:self fork, **A4-14 recursion guard**, steal save-gate, **A4-16 Elystra flicker-buff restoration (behavior change per her printed text, dedicated test)**, missing-param hardening, countered-spell owner graveyard, fetch arrival discipline, move_card selector table, reanimation full reset. A4-18 skipped honestly (test-battery sized). One surprise red judge-adjudicated INTENDED-CHANGE (high conf., fixture pinned a never-executable shape; 61/61 pool effects clean) | v2.1.39 |
| #126 | A3-6 feature build-out: `card_zone_change` for arbitrary zone movements (draws/tutors/discards/mills/casts/counters/resolutions/recursion/steal-mint); setup draws codified silent (§1002.2a); battlefield emissions byte-untouched; budget no-loop proof | v2.1.40 |

## Chunk 5 (synthesis/staple) — DONE

Tier-1: deep read → 15 findings → 9 hostile refuters (every one executed an independent repro) → 0 refuted / **3 substantively modified** → self-QA PASS (independently re-executed the P1 repro 9/9; 25+ line cites verified exact). Calibration note: unlike chunk 3's zero-refutation anomaly, every claim here carried an executed repro *before* refutation — and the refuters still corrected three claims, including making A5-2 **worse** (general case silently deletes an UNRELATED persisted run slot).

Triage: **A5-1 P1** (splice combat transfer side-blind — your merged creature attacks YOU; live, instant-speed) + 4 P2 + 10 P3 → 9 stage (ballots posted), 4 ship (landed in #121), 2 park. INDEX rebuilt (+ synced two stale rows: A2-3 → fixed #104, A2-5 → fixed #105, caught by self-QA).

## Inbox activity (PR #98)

- **A4-14 Elystra gate: CLEARED** (Elystra independent of the recursion; A4-14 rejoined the batch). Heads-up posted: batch-mate A4-16's fix *restores* Elystra's printed flicker behavior.
- **A4-4 decision packet posted**: the remembered hexproof constraint is real history but obsolete since the Slice-3 refactor (hexproof is structural at the target() layer; mass effects never touch it). Batch fix proposed, awaiting GO.
- **A3-2 Stackable spec questions** (4) + shipment confirmations posted.
- **9 chunk-5 ballots**: A5-1..A5-8 + A5-11 (the Clone-reward canon-vs-code ruling).

## Surprises / calibration data

- A1-1 builder discovered an adjacent latent: action enumeration skips `isMana` abilities but `doTapLandForMana` can't pay sac costs — a future sac-for-mana card would be invisible to the AI. Not fixed (out of scope); candidate finding for chunk 7 (AI).
- A2-1 test development independently re-encountered A4-14's recursion — corroborates the finding; no new filing.
- A1-2 disclosed one deliberate micro-change: pool generic spend is now C-first (was W-first); no test pinned the old order.
- PS5.1 BOM leaked into one commit subject (amended); the old `_repro_paymana_mismatch.js` scratch works only by accident (wrong wire key) — left untracked, noted.

## Bookkeeping erratum (found + fixed this night)

An earlier INDEX pass had pasted the round-1 PR numbers (#102–#105) onto four consecutive A6 rows (A6-1←#102, A6-2←#103, A6-3←#104, A6-5←#105) while the real fix rows (A1-3, A1-10, A2-3, A2-5) sat at "open". Verified against actual PR titles via gh + stickers.js git log: **A6-2, A6-3, A6-5 were never fixed and are open again** (errata noted in their rows); the four real rows now carry their correct PR numbers. The bad stamp had propagated into chunk-5's findings text and the A5-8 ballot ("A6-2/PR #103") — corrected in the docs; ballot erratum posted to the inbox. Lesson reconfirmed: INDEX rebuilds must cross-check PR titles, never inherit prior stamps.

## What the next session should do first

1. Process Joe's replies to the 9 chunk-5 ballots + A4-4 GO + the 4 Stackable questions (and any reaction to the A4-16 Elystra behavior change).
2. The approved-fix queue is EMPTY. Chunk queue: 7 (AI) is next (chunks 6,1,2,3,4,5 done) — feed it the sac-for-mana enumeration lead from #118's build report.
3. A6-2 (empower fallback re-roll) is back in the open pool — candidate for the next stickers-touching fix batch if Joe GOes it.
4. Mutation re-score runs 09:00 (machine task) — tonight's 10 PRs (+335 assertions) should move engine.js/stickers.js/run.js scores; refresh MUTATION-MAP numbers in any new ship judgments. A4-18 (the chunk-4 test battery) remains the named coverage debt, parked for its own session.
