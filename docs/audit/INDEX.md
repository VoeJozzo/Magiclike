# Audit findings index

> Consolidated triage table across all chunk findings files. Rebuilt by the
> runner as chunks complete; sorted severity × effort at triage time.
> Finding format + severity scale: [`docs/plans/plan-proto-audit.md`](../plans/plan-proto-audit.md) → "Findings format".

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A6-1](chunk-06-stickers.md#a6-1--random-reward-eligibility-comment-understates-the-kind-pool) | P2 | Footgun/comment | `stickers.js:159-169` | Random-reward eligibility comment understates the kind pool | stage | open (decision packet) |
| [A6-2](chunk-06-stickers.md#a6-2--empower-fallback-roll-is-non-persistent-re-rolls-on-the-staple-path) | P3 | Rules correctness | `stickers.js:111-122` | Empower fallback roll non-persistent; re-rolls on staple path | stage | open |
| [A6-3](chunk-06-stickers.md#a6-3--inline-set_colorset_types-descriptors-accumulate-duplicate-persisted-entries) | P3 | Footgun/comment | `stickers.js:147-149` | Inline set_color/set_types accumulate duplicate persisted entries | park | open |
| [A6-4](chunk-06-stickers.md#a6-4--dispatch-test-header-over-claims-kind-coverage--shipped-docs-only) | P3 | Comment hygiene | `tests/sticker_kinds_dispatch_test.js:1-3` | Dispatch-test header over-claims kind coverage | ship | **fixed (PR #97)** |
| [A6-5](chunk-06-stickers.md#a6-5--grant_activated_ability-dedup-branch-absent-ability_id-is-untested) | P3 | Coverage gap | `stickers.js:75-80` | grant_activated_ability dedup branch (absent ability_id) untested | park | open |
| [A6-6](chunk-06-stickers.md#a6-6--applystickerkindeffect-violates-the-files-own-deep-copy-discipline-latent) | P3 | Footgun (latent) | `stickers.js:76-81` | applyStickerKindEffect violates file's own deep-copy discipline | park | open |
| [A6-7](chunk-06-stickers.md#a6-7--multi-sticker-cost-resolution-is-apply-order-dependent) | P3 | Rules correctness | `stickers.js:45-63` | Multi-sticker cost resolution is apply-order dependent | park | open |

| [A1-1](chunk-01-turn-machine.md) | P1 | turn-machine | engine.js | Priority cluster: opp gets priority after every cast (canon+Godot+D0 say caster-retains); abilities never reset the pass tracker (phase closes under the opponent); triggers synthesize rounds in closed windows (latent combat-skip) | stage | open |
| [A1-2](chunk-01-turn-machine.md) | P1 | turn-machine | engine.js | canPayPotential backtracks but payMana pays greedily → legal cast throws uncaught Error mid-payment, land left tapped, state half-applied | stage | open |
| [A1-3](chunk-01-turn-machine.md) | P1 | turn-machine | engine.js | Indestructible creature at toughness ≤ 0 illegally survives — SBA skips all three death causes; canon says it dies (one-line reorder + test) | stage | open |
| [A1-4](chunk-01-turn-machine.md) | P2 | turn-machine | engine.js | 36/70 test files hand-write engine internals; behavior-preserving rename left 34/36 silently green — feeds the parked step()/decomposition refactor planning | park | open |
| [A1-5](chunk-01-turn-machine.md) | P2 | turn-machine | engine.js | Action vocabulary in 4 hand-synced switches, executeAction + both phase switches have no default arm (silent no-op success / browser-hang landmine) — park with step() refactor | park | open |
| [A1-6](chunk-01-turn-machine.md) | P2 | turn-machine | engine.js | CLEANUP delayed-trigger drain silently discards unknown effect kinds; comment names the retired returnFromExile kind (comment fix + else-warn) | stage | open |
| [A1-7](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | Zero-attacker combat skips the §505 priority window entirely — latent canon divergence, Godot windows it; docs-vs-code fork | stage | open |
| [A1-8](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | G.attackers never pruned on death; L4992 zero-attackers arm is unreachable dead code with divergent flag hygiene; re-guard contract unstated | stage | open |
| [A1-9](chunk-01-turn-machine.md) | P3 | turn-machine | engine.js | "X draws." logged on deck-out loss and phylactery rip — the log's top line lies on both empty-library paths (one-line gate) | stage | open |
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

*Chunks done: 6 (dry run), 1. Severity × effort re-sort happens at triage.*
