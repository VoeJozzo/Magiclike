# Audit findings index

> Consolidated triage table across all chunk findings files. Rebuilt by the
> runner as chunks complete; sorted severity × effort at triage time.
> Finding format + severity scale: [`docs/plans/plan-proto-audit.md`](../plans/plan-proto-audit.md) → "Findings format".

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A6-1](chunk-06-stickers.md#a6-1--random-reward-eligibility-comment-understates-the-kind-pool) | P2 | Footgun/comment | `stickers.js:159-169` | Random-reward eligibility comment understates the kind pool | stage | **fixed (PR #102)** (decision packet) |
| [A6-2](chunk-06-stickers.md#a6-2--empower-fallback-roll-is-non-persistent-re-rolls-on-the-staple-path) | P3 | Rules correctness | `stickers.js:111-122` | Empower fallback roll non-persistent; re-rolls on staple path | stage | **fixed (PR #103)** |
| [A6-3](chunk-06-stickers.md#a6-3--inline-set_colorset_types-descriptors-accumulate-duplicate-persisted-entries) | P3 | Footgun/comment | `stickers.js:147-149` | Inline set_color/set_types accumulate duplicate persisted entries | park | **fixed (PR #104)** |
| [A6-4](chunk-06-stickers.md#a6-4--dispatch-test-header-over-claims-kind-coverage--shipped-docs-only) | P3 | Comment hygiene | `tests/sticker_kinds_dispatch_test.js:1-3` | Dispatch-test header over-claims kind coverage | ship | **fixed (PR #97)** |
| [A6-5](chunk-06-stickers.md#a6-5--grant_activated_ability-dedup-branch-absent-ability_id-is-untested) | P3 | Coverage gap | `stickers.js:75-80` | grant_activated_ability dedup branch (absent ability_id) untested | park | **fixed (PR #105)** |
| [A6-6](chunk-06-stickers.md#a6-6--applystickerkindeffect-violates-the-files-own-deep-copy-discipline-latent) | P3 | Footgun (latent) | `stickers.js:76-81` | applyStickerKindEffect violates file's own deep-copy discipline | park | closed — intentional (Joe 2026-06-10) |
| [A6-7](chunk-06-stickers.md#a6-7--multi-sticker-cost-resolution-is-apply-order-dependent) | P3 | Rules correctness | `stickers.js:45-63` | Multi-sticker cost resolution is apply-order dependent | park | closed — intentional (Joe 2026-06-10) |

| [A1-1](chunk-01-turn-machine.md) | P1 | turn-machine | engine.js | Priority cluster: opp gets priority after every cast (canon+Godot+D0 say caster-retains); abilities never reset the pass tracker (phase closes under the opponent); triggers synthesize rounds in closed windows (latent combat-skip) | stage | closed — intentional; comment fix shipping |
| [A1-2](chunk-01-turn-machine.md) | P1 | turn-machine | engine.js | canPayPotential backtracks but payMana pays greedily → legal cast throws uncaught Error mid-payment, land left tapped, state half-applied | stage | open |
| [A1-3](chunk-01-turn-machine.md) | P1 | turn-machine | engine.js | Indestructible creature at toughness ≤ 0 illegally survives — SBA skips all three death causes; canon says it dies (one-line reorder + test) | stage | open |
| [A1-4](chunk-01-turn-machine.md) | P2 | turn-machine | engine.js | 36/70 test files hand-write engine internals; behavior-preserving rename left 34/36 silently green — feeds the parked step()/decomposition refactor planning | park | open |
| [A1-5](chunk-01-turn-machine.md) | P2 | turn-machine | engine.js | Action vocabulary in 4 hand-synced switches, executeAction + both phase switches have no default arm (silent no-op success / browser-hang landmine) — park with step() refactor | park | open |
| [A1-6](chunk-01-turn-machine.md) | P2 | turn-machine | engine.js | CLEANUP delayed-trigger drain silently discards unknown effect kinds; comment names the retired returnFromExile kind (comment fix + else-warn) | stage | open |
| [A1-7](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | Zero-attacker combat skips the §505 priority window entirely — latent canon divergence, Godot windows it; docs-vs-code fork | stage | open |
| [A1-8](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | G.attackers never pruned on death; L4992 zero-attackers arm is unreachable dead code with divergent flag hygiene; re-guard contract unstated | stage | open |
| [A1-9](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | "X draws." logged on deck-out loss and phylactery rip — the log's top line lies on both empty-library paths (one-line gate) | stage | **fixed (PR #107)** |
| [A1-10](chunk-01-turn-machine.md) | P2 | turn-machine | engine.js | tapLandForMana legal during cleanup discard — UI-reachable, mana unusable, land stays tapped through the opponent's turn | stage | open |
| [A1-11](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | Forced modal answers silently disarm End Turn fast-forward — compelled responses treated as voluntary re-engagement (one-line carve-out) | stage | open |
| [A1-12](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | PROTOCOL.md §3.6 falsely says the proto collapses UNTAP+UPKEEP+DRAW — UNTAP and DRAW are distinct real phases (docs edit) | ship | open |
| [A1-13](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | DIVERGENCE D0 misdocuments the proto as caster-retains and "already-aligned" — record the live opp-handoff divergence, ref A1-1 (docs edit) | ship | open |
| [A1-14](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | skipApEndStep comment omits the instant-speed trade; §606 doesn't list the sanctioned AP-END skip; B6 line numbers stale (comment/docs only) | ship | open |
| [A1-15](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | fireAt:'endStep' fires in CLEANUP — comment-only warning that this queue isn't the home for genuine §509 triggers (rename would be stage) | ship | open |
| [A1-16](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | PENDING_DECISIONS header's 2-step add-a-modal recipe omits 4 mandatory sites → soft-lock trap; write the full checklist (comment) | ship | open |
| [A1-17](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | tests/README.md stale ~6×: claims 13 files/362 assertions/9 modules vs 74/1786/17 (docs edit, replace counts with pointers) | ship | open |
| [A1-18](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | Canon §1102's "20-iteration SBA cap" describes Godot only; proto is uncapped with provable termination — scope the sentence, optional DIVERGENCE row | ship | open |
| [A1-19](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | Dead `!G.pendingTriggerTarget` conjunct at step():6369 — unreachable-false, tripwire-proven over full suite + 200-game selfplay (chunk-1 trivia PR) | trivia | open |
| [A1-20](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | openPriorityRound's initialHolder param dead — 3 call sites all zero-arg, contract would be clobbered anyway (chunk-1 trivia PR) | trivia | open |
| [A1-21](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | Combat-reset four-field list maintained in 3 engine sites + 1 test copy — resetCombatState() helper, home is the step() refactor | park | open |
| [A1-22](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | Empty-mana-pool literal ×3 + color list inlined ×5 + draft.js duplicate COLORS — pure DRY, fold into decomposition (float-hazard framing refuted) | park | open |
| [A1-23](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | Coverage gaps (11 grouped): win/loss, cleanup discard, endTurnPending, lifeLostThisTurn, phylactery, temp-control revert, fireFor, play/draw+turn count, NAP END window, B2 thinness, t≤0 SBA — one full-turn test kills est. 100+ survivors | park | open |

| [A1-3↑](chunk-02-combat.md) | P1 | combat | engine.js | Cross-chunk confirmation: indestructible t≤0 re-derived via combat, live in-pool repro (Iron Statue + 3× Sicken, executed); §1100's own status line false → A2-12 | (stage, ch.1) | open |
| [A2-1](chunk-02-combat.md) | P1 | combat | engine.js | First-strike pass-2 filter reads LIVE keywords — lord dies in pass 1, its granted creature deals damage in BOTH passes (5 vs canon 3, executed); inverse: gaining FS = zero damage | stage | open |
| [A2-2](chunk-02-combat.md) | P1 | combat | engine.js | lethalNeeded==0 blocker (fully-marked indestructible, or A1-3 survivor) classed "unsatisfied" — all trample carryover suppressed + whole remainder dumped on it (found by all 4 lenses, 4 live repros) | stage | **fixed (PR #112)** |
| [A2-3](chunk-02-combat.md) | P2 | combat | engine.js | Ghost attacker: cast arrivals don't re-mint iids — bounce + re-cast (two Quicklings, 4 mana) re-matches the stale G.attackers entry; attacks while sick/untapped/undeclared; falsifies chunk-1 R2's premise | stage | open |
| [A2-4](chunk-02-combat.md) | P2 | combat | engine.js | declareAttackers legality accepts duplicate iids (blockers side has the Set) — one creature attacks N times, N× damage + N× 'attacks' triggers; engine API surface only | stage | **fixed (PR #113)** |
| [A2-5](chunk-02-combat.md) | P2 | combat | engine.js | change_control never removes from combat — stolen attacker damages its OWN new controller (+ lifelink to them, self-block legal); latent today, live with the first flash/triggered steal; bundle with A2-3 | stage | open |
| [A2-6](chunk-02-combat.md) | P2 | combat | engine.js | Combat coverage darkness: 200/303 mutants survive; 9 of 10 behavior-deleting mutants invisible (batteries executed twice); the region IS the C1/C2 spec Godot harmonizes to — one test_combat_damage.js battery | park | open |
| [A2-7](chunk-02-combat.md) | P3 | combat | engine.js | Deathtouch lethal-threshold carves out indestructible blockers — deliberate per comment, absent from canon; sticker-reachable defender-life fork; decision: follow canon (rec.) or write the house rule in; ai.js:778 mirrors | stage | **fixed (PR #114, design ruling)** |
| [A2-8](chunk-02-combat.md) | P3 | combat | engine.js | Combat lifelink's life_changed omits source_iid (both siblings attach it) — noSelfCascade + Codex-built gain-life triggers misbehave today; one-line fix | stage | **fixed (PR #108)** |
| [A2-9](chunk-02-combat.md) | P3 | combat | engine.js | Lord-buff predicate duplicated in two divergent loops — stat loop buffs ANY permanent (no Creature gate, executed: lands get +1/+1), keyword loop gates; inert today; chunk-4 structural overlap | park | open |
| [A2-10](chunk-02-combat.md) | P3 | combat | engine.js | dealtDeathtouch names the VICTIM (Godot already renamed it lethal_marked) — clarifying comments ship; mechanical 14-site rename is a trivia candidate | ship | open |
| [A2-11](chunk-02-combat.md) | P3 | combat | engine.js | Rulebook §800/§802 false claims (docs-only, merged): L52 declaration-order "in both implementations," L26 + 900-keywords L33 menace-fallback parentheticals (Godot-only), stale DIVERGENCE C1/C3 cites, §803 "drain" wording rider | ship | open |
| [A2-12](chunk-02-combat.md) | P3 | combat | engine.js | §1100 status line "zero-toughness check: implemented" false for indestructibles — qualify it, reference A1-3's staged packet | ship | open |
| [A2-13](chunk-02-combat.md) | P3 | combat | engine.js | Summoning sickness fenced by ONE accidental choreography-coupled assertion (1785/1786 isolation run) — three direct assertions, land before the A1-7 packet | park | open |
| [A2-14](chunk-02-combat.md) | P3 | combat | engine.js | test_ui_targeting pins block legality by source-text regex — false-reds on rename, green under flying-gate deletion (both executed); replace with behavioral check, keep the delegation pin | park | open |
| [A2-15](chunk-02-combat.md) | P3 | combat | engine.js | Menace enforcement: zero coverage at a site whose comment documents a prior silent-failure bug of this exact shape — check deletable, suite green; two assertions in the A2-6 battery | park | open |

| [A3-1](chunk-03-stack-triggers.md) | P1 | stack-triggers | triggers/engine | Trigger targets are NOT re-validated at resolution: a target that became illegal on the st | stage | **fixed (PR #111)** |
| [A3-2](chunk-03-stack-triggers.md) | P2 | stack-triggers | triggers/engine | Non-mana activated abilities resolve entirely OFF the stack, contradicting canon §705 — th | stage | awaiting design ruling (investigation posted) |
| [A3-3](chunk-03-stack-triggers.md) | P2 | stack-triggers | triggers/engine | The trigger "depth cap" counts WIDTH, not depth: 101 flat, independent triggers trip it an | stage | open |
| [A3-4](chunk-03-stack-triggers.md) | P2 | stack-triggers | triggers/engine | Canon rulebook page §1000 (triggered abilities) documents the RETIRED pre-migration trigge | stage | open |
| [A3-5](chunk-03-stack-triggers.md) | P2 | stack-triggers | triggers/engine | The three generated-trigger data tables sit outside BOTH boot validators: a typo'd effect | stage | open |
| [A3-6](chunk-03-stack-triggers.md) | P2 | stack-triggers | triggers/engine | The composable `card_moves` zone vocabulary over-promises: the engine only emits zone-chan | stage | open |
| [A3-7](chunk-03-stack-triggers.md) | P2 | stack-triggers | triggers/engine | `generateRandomTrigger` is a production-dead twin of `assembleTrigger` that omits the noSe | stage | **fixed (PR #110)** |
| [A3-8](chunk-03-stack-triggers.md) | P2 | stack-triggers | triggers/engine | PROTOCOL.md §3.3 misdocuments the trigger-event wire it canonizes — and the wrong rows are | ship | open |
| [A3-9](chunk-03-stack-triggers.md) | P2 | stack-triggers | triggers/engine | Trigger-layer coverage darkness + test-quality cluster (dimensions 4/5, grouped): the orch | park | open |
| [A3-10](chunk-03-stack-triggers.md) | P3 | stack-triggers | triggers/engine | Trigger target legality is gated at EMIT time (inside the event) as well as at drain time: | stage | open |
| [A3-11](chunk-03-stack-triggers.md) | P3 | stack-triggers | triggers/engine | `life_changed` / leave-play event payload conformance sweep (A2-8's class, completed): dam | stage | **fixed (PR #108)** |
| [A3-12](chunk-03-stack-triggers.md) | P3 | stack-triggers | triggers/engine | Mid-prompt trigger fizzle is silent: when a human's multi-slot target prompt ends in fizzl | stage | **fixed (PR #109)** |
| [A3-13](chunk-03-stack-triggers.md) | P3 | stack-triggers | triggers/engine | Generated-trigger cloning discipline is inconsistent: two consumer sites share the `condit | stage | open |
| [A3-14](chunk-03-stack-triggers.md) | P3 | stack-triggers | triggers/engine | Delayed-trigger queue keeps unknown `fireAt` values forever: the sibling leak to A1-6 — un | stage | open |
| [A3-15](chunk-03-stack-triggers.md) | P3 | stack-triggers | triggers/engine | triggers.js's unified-event-shape header (the contract block predicates are written agains | ship | open |
| [A3-16](chunk-03-stack-triggers.md) | P3 | stack-triggers | triggers/engine | Comment-hygiene sweep (merged): three more verified-false attribution/contract comments in | ship | open |



*Chunks done: 6 (dry run), 1, 2, 3, 4 — the rules core is complete. Severity × effort re-sort happens at triage.*
