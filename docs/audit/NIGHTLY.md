# Daily packet — 2026-06-10 (day shift)

> Rewritten per run. This covers the daytime supervised session that followed
> the overnight Phase 0 build. Previous packet content (dry-run report) is in
> git history and summarized below.

## Read these closely (calibration window)

1. **Chunk 1 found three P1s in the rules core.** All staged (not shipped) with
   plain-English decision packets in
   [`chunk-01-turn-machine.md`](chunk-01-turn-machine.md):
   - **A1-1 priority cluster** — after ANY cast, priority goes to the opponent;
     canon (and DIVERGENCE D0, and the Godot port) say the caster keeps it.
     Affects every game ever played in the proto. Three interlocking legs;
     coordinated fix drafted.
   - **A1-2** — the "can you afford this spell?" check is smarter than the
     code that actually takes the mana; when they disagree the engine crashes
     mid-payment leaving half-paid state. Repro included.
   - **A1-3** — indestructible creatures with 0 or less toughness illegally
     survive (canon says they still die). Live-reproduced twice (finder +
     self-QA independently).
2. **Ship/trivia grouping judgment (deviation, disclosed):** the plan says one
   PR per ship item; chunk 1's seven ship items are ALL docs/comment-only
   one-liners, so they grouped into ONE docs PR (+ one trivia code PR) to keep
   the paper trail readable. Say "stop grouping" to revert to strict per-item
   PRs.
3. **engine.js mutation score is 45%** — the suite misses over half of
   deliberate sabotage in the engine's core file. 682 of 1,103 turn-machine
   region mutants survive. This is why everything behavioral staged: the
   ladder's coverage gate is doing its job. ai.js is trending far worse
   (~80% survival, partial).

## Done today (so far)

- **Phase 0 complete** + campaign ARMED (after dry-run gate fix; see STATE log).
- **Chunk 6 (dry run):** 7 findings; 1 shipped docs-only (PR #97, merged);
  1 decision packet for Joe (A6-1).
- **Chunk 1 (turn machine):** 23 findings (3 P1 / 3 P2 / 17 P3) from a 58-agent
  tier-2 fan-out; 14 claims refuted by adversarial verification; self-QA PASS
  with corrections. Docs + trivia PRs in flight (see PR list on #98).
- **Mutation map:** engine.js COMPLETE (45%); full run continuing, ETA early
  afternoon.

## Surprises / anomalies

- Overnight automation never fired (scheduler first-window gotcha + a lost
  background launch). Tonight 23:00 is the unattended path's first real test.
- Workflow verifiers caught the live workshop tree moving under them
  (git merges during reads) and self-corrected to anchor-SHA sandboxes; this
  is now baked into the runner skill.
- Mutation runner was initially sized for the desktop (12 workers) on a
  4-core laptop; right-sized to 8.

## Next

1. Fix PRs (docs + trivia) merge into the workshop on green.
2. Chunk 2 (combat) — engine.js map already complete, unlocked now.
3. Chunk 3 waits on triggers.js map; chunks 5/7-11 wait on their files.
4. Tonight: 21:00 nightly machine (mutation refresh + selfplay); 23:00
   scheduled boops resume the queue unattended.

## Decision queue for Joe (non-blocking)

- A6-1 sticker-pool taste call (chunk-06 packet).
- A1-1/A1-2/A1-3 staged P1 fixes — each has a decision packet; the
  recommendation in all three is "fix per canon," confidence high for A1-1
  and A1-3, medium-high for A1-2.
- A1-10 cleanup-window land tap (P2, staged, small fix).
