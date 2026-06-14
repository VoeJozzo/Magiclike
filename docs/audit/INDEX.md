# Audit findings index

> Consolidated triage table across all 11 chunk findings files (full per-finding
> detail in the `docs/audit/chunk-*.md` files). Finding format + severity scale:
> [`docs/plans/plan-proto-audit.md`](../plans/plan-proto-audit.md) → "Findings format".
> Rebuilt 2026-06-14 from the verified per-finding survey ledger at the close of
> the campaign (chunk-5 recovery by Opus).

**Campaign status: CONCLUDED.** 135 findings — **129 resolved**, 4 parked + 1 partial (pointer/refactor-feed is the deliverable; no fix expected), 1 won't-fix (A9-10 — Joe: no pre-snake-case saves exist, so the migration guards an empty population), **0 open**.

_"Resolved" includes ship/comment/docs fixes and design rulings (some "resolved" = ruled intentional + documented, no code change). The **parked-audit clear (v2.1.49)** then closed 21 of the 26 parked items — the test-coverage gaps, DRY refactors, and latent-bug guards that fit the Review-Refactor charter (each red→green, then a 6-agent adversarial review). The remaining 5: **A1-4** is partial (the centralized startMainPhase helper landed; the 76-file caller migration is a tracked follow-up); **A5-14 / A10-6 / A10-7** stay parked as genuinely-unreachable (no pool card exercises them — fixing now is speculative + untestable); **A7-6** is a notes-not-a-finding entry. The chunk-5 synthesis/staple batch + A1-6 were closed in the recovery pass (v2.1.48)._

## Chunk 1 — Turn machine / phases / mana / state (engine.js L4400-6770 core + priority/legality plumbing)

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A1-1 (leg 1: opp-handoff after cast) | P1 | stage | Caster loses priority after every cast | ✅ resolved |
| A1-1 (legs 2+3: pass-tracker + synthesized rounds) | P1 | stage | Ability never resets pass tracker; triggers synthesize rounds in closed windows | ✅ resolved |
| A1-2 | P1 | stage | Mana legality/payment mismatch crashes mid-cast | ✅ resolved |
| A1-3 | P1 | stage | Indestructible creature at toughness ≤0 illegally survives | ✅ resolved |
| A1-4 | P2 | park | 36/70 test files hand-write engine internals (silent-green on rename) | 🟡 partial *(v2.1.49: startMainPhase helper landed + self-tested; 76-file caller migration tracked)* |
| A1-5 | P2 | park | Action-vocab in 4 hand-synced switches; no default arm (silent no-op / hang) | ✅ resolved *(v2.1.49 clear)* |
| A1-6 | P2 | stage | CLEANUP drain silently discards unknown effect KINDS; retired returnFromExile comment | ✅ resolved *(closed in chunk-5 recovery)* |
| A1-7 | P3 | stage | Zero-attacker combat skips the §505 priority window | ✅ resolved |
| A1-8 | P3 | stage | G.attackers never pruned on death; L4992 dead arm; unstated re-guard contract | ✅ resolved |
| A1-9 | P3 | stage | DRAW step logs a draw that never happened (deck-out + phylactery rip) | ✅ resolved |
| A1-10 | P2 | stage | tapLandForMana legal during cleanup discard (land stays tapped through opp turn) | ✅ resolved |
| A1-11 | P3 | stage | Forced modal responses silently disarm End Turn fast-forward | ✅ resolved |
| A1-12 | P3 | ship | PROTOCOL.md §3.6 falsely says proto collapses UNTAP+UPKEEP+DRAW | ✅ resolved |
| A1-13 | P3 | ship | DIVERGENCE D0 misdocuments proto as caster-retains + 'already-aligned' | ✅ resolved |
| A1-14 | P3 | ship | skipApEndStep comment omits instant-speed trade; §606 gap; B6 stale cites | ✅ resolved |
| A1-15 | P3 | ship | fireAt:'endStep' naming lie (fires in CLEANUP, no priority) — comment caveat | ✅ resolved |
| A1-16 | P3 | ship | PENDING_DECISIONS header understates add-a-modal checklist (soft-lock trap) | ✅ resolved |
| A1-17 | P3 | ship | tests/README.md stale ~6× (13 files/362 assertions/9 modules) | ✅ resolved |
| A1-18 | P3 | ship | Canon §1102 '20-iteration SBA cap' describes Godot only, not proto | ✅ resolved |
| A1-19 | P3 | trivia | Dead !G.pendingTriggerTarget conjunct at step():6369 | ✅ resolved |
| A1-20 | P3 | trivia | openPriorityRound(initialHolder) dead parameter | ✅ resolved |
| A1-21 | P3 | park | Combat-reset four-field list duplicated across 3 engine sites + 1 test | ✅ resolved *(v2.1.49 clear)* |
| A1-22 | P3 | park | Empty-mana-pool literal ×3 + color-list inlined ×5 + draft.js dup COLORS | ✅ resolved *(v2.1.49 clear)* |
| A1-23 | P3 | park | Coverage gaps (11 grouped dark zones) — one full-turn test kills est. 100+ survivors | ✅ resolved *(v2.1.49 clear)* |

## Chunk 2 — Combat (engine.js damage core, declaration legality, keyword gates, combat-state lifecycle)

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A1-3↑ | P1 | stage (chunk-1 cross-confirmation; docs half = A2-12 ship) | Indestructible at toughness ≤ 0 survives — re-derived via combat path | ✅ resolved |
| A2-1 | P1 | stage | First-strike pass-2 filter reads LIVE keywords → double damage when a lord dies in pass 1 | ✅ resolved |
| A2-2 | P1 | stage | lethalNeeded===0 blocker classed 'unsatisfied' — all trample carryover suppressed | ✅ resolved |
| A2-3 | P2 | stage | Ghost attacker via bounce + re-cast (cast arrivals don't re-mint iids) | ✅ resolved |
| A2-4 | P2 | stage | declareAttackers legality accepts duplicate iids — one creature attacks N times | ✅ resolved |
| A2-5 | P2 | stage | change_control never removes creature from combat — stolen attacker damages its OWN new controller | ✅ resolved |
| A2-6 | P2 | park (test addition) | Combat coverage darkness — 200/303 mutants survive; the C1/C2 spec the Godot port harmonizes to | ✅ resolved *(v2.1.49 clear)* |
| A2-7 | P3 | stage (genuine canon fork) | Deathtouch lethal-threshold carves out indestructible blockers (code vs canon fork) | ✅ resolved |
| A2-8 | P3 | stage (behavioral one-liner) | Combat lifelink life_changed emit omits source_iid | ✅ resolved |
| A2-9 | P3 | park (chunk-4 structural overlap) | Lord-buff predicate duplicated in two divergent loops (stat loop missing Creature gate) | ✅ resolved *(v2.1.49 clear)* |
| A2-10 | P3 | ship (comment-only) | dealtDeathtouch is an inverted name (marks the VICTIM, not the dealer) | ✅ resolved |
| A2-11 | P3 | ship (docs-only) | Rulebook §800/§802 carry false implementation-status claims (declaration-order + menace-fallback + stale cites) | ✅ resolved |
| A2-12 | P3 | ship (docs-only) | §1100 status line 'zero-toughness check: implemented' false for indestructibles | ✅ resolved |
| A2-13 | P3 | park (test addition) | Summoning sickness fenced by ONE accidental choreography-coupled assertion | ✅ resolved *(v2.1.49 clear)* |
| A2-14 | P3 | park | test_ui_targeting pins block legality by source-text regex (brittle, zero behavioral protection) | ✅ resolved *(v2.1.49 clear)* |
| A2-15 | P3 | park (test addition) | Menace enforcement has zero regression coverage at a documented-recurrence site | ✅ resolved *(v2.1.49 clear)* |

## Chunk 3

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A3-1 | P1 | stage | Targets not re-validated | ✅ resolved |
| A3-2 | P2 | stage | Abilities off stack | ✅ resolved |
| A3-3 | P2 | stage | Depth cap width | ✅ resolved |
| A3-4 | P2 | stage | Canon1000 retired | ✅ resolved |
| A3-5 | P2 | stage | Tables skip validators | ✅ resolved |
| A3-6 | P2 | stage | card_moves overpromise | ✅ resolved |
| A3-7 | P2 | stage | Dead twin | ✅ resolved |
| A3-8 | P2 | ship | PROTOCOL3.3 wire | ✅ resolved |
| A3-9 | P2 | park | Coverage cluster | ✅ resolved *(v2.1.49 clear)* |
| A3-10 | P3 | stage | Double-gated | ✅ resolved |
| A3-11 | P3 | stage | omit source_iid | ✅ resolved |
| A3-12 | P3 | stage | Fizzle silent | ✅ resolved |
| A3-13 | P3 | stage | Condition array ref | ✅ resolved |
| A3-14 | P3 | stage | fireAt forever | ✅ resolved |
| A3-15 | P3 | ship | header kind/type | ✅ resolved |
| A3-16 | P3 | ship | Comment-hygiene | ✅ resolved |

## Chunk 4 — Effects dispatch + targeting legality (A4-1 through A4-25)

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A4-1 | P1 | stage (closed-in-flight) | Spell resolution does no target-legality re-validation (A3-1's spell-side twin) | ✅ resolved |
| A4-2 | P1 | stage | Static lord KEYWORD grants are add-only, never revoked (adjudicates parked A2-9) | ✅ resolved |
| A4-3 | P1 | stage | Fight effects retarget around removal — friendly fire instead of fizzle | ✅ resolved |
| A4-4 | P1 | stage | Mass removal is sequential not simultaneous — trigger counts depend on board array order | ✅ resolved |
| A4-5 | P1 | stage | CLEANUP keyword rebuild is copyOf-blind — a copy loses copied keywords, regains base ones | ✅ resolved |
| A4-6 | P1 | stage | color/not_color filters test only the first colored pip | ✅ resolved |
| A4-7 | P2 | stage | Trigger/ability chooses() never routes to the human edict prompt | ✅ resolved |
| A4-8 | P2 | stage | target_filter silently dropped for creature_or_player/player/opp/spell kinds | ✅ resolved |
| A4-9 | P2 | stage (design fork) | Non-combat trample spills face damage from fight/effect damage | ✅ resolved |
| A4-10 | P2 | ship (docs-only) | PROTOCOL.md effects/targeting catalogs misdocument the wire 5+ ways | ✅ resolved |
| A4-11 | P2 | stage (rides A3-5 GO) | matchFilter key vocabulary has no boot validation — typo'd keys fail open | ✅ resolved |
| A4-12 | P2 | stage (design wrinkle) | Phylactery's 'life can't go below 0' violated by life-loss drains | ✅ resolved |
| A4-13 | P2 | stage | doActivateAbility self-scope lacks the creature-vs-player fork (divergent third copy of v0.99.29 fix) | ✅ resolved |
| A4-14 | P2 | stage | getStats <-> matchFilter mutual recursion — stat-bounded lord filter hard-crashes | ✅ resolved |
| A4-15 | P2 | stage | steal writes the human's persisted run state for any controller — opp-cast steal corrupts the save | ✅ resolved |
| A4-16 | P2 | stage (behavior change per Elystra text) | move_card battlefield-leave never flushes Elystra's permanent_eot buffs (dead keep_buffs param) | ✅ resolved |
| A4-17 | P2 | stage (rides A3-5/A1-6) | Missing target/params = uncaught TypeError mid-mutation or NaN damage immunity; EFFECT_SCHEMA gaps | ✅ resolved |
| A4-18 | P2 | park | Effects/targeting coverage darkness decomposed + test-quality cluster (grouped) | ✅ resolved *(v2.1.49 clear)* |
| A4-19 | P3 | stage | Countered spell routed to controller's graveyard not owner's (engine's lone owner-routing violation) | ✅ resolved |
| A4-20 | P3 | stage | fetchLibraryToBattlefield bypasses arrival discipline (no iid mint, no sickness) | ✅ resolved |
| A4-21 | P3 | stage (rides A3-5) | move_card schema validates pairs but dispatch needs triples; discard arm ignores selector | ✅ resolved |
| A4-22 | P3 | stage | Reanimation leaves killedBy stale (hand-rolled partial reset missed it) | ✅ resolved |
| A4-23 | P3 | park | Mid-resolution prompts: trailing effects run before human's pick; two prompts blind-overwrite | ✅ resolved *(v2.1.49 clear)* |
| A4-24 | P3 | park | Hexproof checkpoint is one layer but three pasted gates with guard drift; 2/3 copies mutation-dark | ✅ resolved *(v2.1.49 clear)* |
| A4-25 | P3 | ship (comment/docs) + trivia riders | Comment/trivia hygiene sweep — dead LKI locals, retired-kind comments, dev-speak log strings | ✅ resolved |

## chunk-05-synthesis (Synthesis / staple — apply_in_game_splice, charge accounting, the Stapler boon, clone/splice rewards, staple canon)

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A5-1 | P1 | stage | Side-blind splice combat transfer: stapling opp's attacker makes YOUR creature attack YOU | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-2 | P2 | stage | Stack-spell + battlefield-perm mis-files into S+S branch: spell evaporates, unrelated run slot deleted+persisted | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-3 | P2 | stage | Blocker merge deletes block entry instead of tombstoning — absorbed blocker's attacker hits face | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-4 | P2 | stage | Out-of-charges rip skips removeSlotByIdx caller contract — just-minted merged card gets out-of-bounds slotIdx | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-5 | P2 | stage | Cloned Stapler has no charges field: infinite charges, never ripped, display stuck at "3" | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-6 | P3 | stage | permaBuffs shape mismatch: merge core + unit test pin a phantom ARRAY shape no producer creates | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-7 | P3 | stage | In-game splice reads slot-only bonusTrigger/permaBuffs off runtime cards (always undefined); parity test omits exactly those fields | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-8 | P3 | stage | Empower roll mis-remapped on LAND-base splices (effects->triggers gate is creature-only) — sticker goes silently inert | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-9 | P3 | ship | matchFilter spliceable_base comment wrongly says "no Lands" | ✅ resolved |
| A5-10 | P3 | ship | Splice reward comment describes the retired pre-v1.0.47 pick-then-pick flow | ✅ resolved |
| A5-11 | P3 | stage | Canon §1504 misdescribes player Clone reward (it's the OPPONENT-clone heuristic); player Clone is uniformly random | ✅ resolved *(closed in chunk-5 recovery)* |
| A5-12 | P3 | ship | staple-synthesis.md inverted base/staple sentence + stale 'parked in BACKLOG' claim + matching stale code tag | ✅ resolved |
| A5-13 | P3 | ship | Stapler oracle text 'Choose two target permanents' vs actual permanent_or_spell targeting (card-text edit, rules-inert) | ✅ resolved |
| A5-14 | P3 | park | Land+Land merge doesn't union land subtypes (latent — no subtype-matters cards) | ⏸️ parked |
| A5-15 | P3 | park | Charge-rip purges zones by tplId on both sides with no leave-play discipline (latent footgun template) | ✅ resolved *(v2.1.49 clear)* |

## Chunk 6 - Stickers (stickers.js)

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A6-1 | P2 | stage | Random-reward eligibility comment understates kind pool | ✅ resolved |
| A6-2 | P3 | stage | Empower fallback roll non-persistent; re-rolls on staple path | ✅ resolved *(closed in chunk-5 recovery)* |
| A6-3 | P3 | park | Inline set_color/set_types accumulate duplicate persisted entries | ✅ resolved *(v2.1.49 clear)* |
| A6-4 | P3 | ship | Dispatch-test header over-claims kind coverage (docs-only) | ✅ resolved |
| A6-5 | P3 | park | grant_activated_ability dedup branch (absent ability_id) untested | ✅ resolved *(v2.1.49 clear)* |
| A6-6 | P3 | park | applyStickerKindEffect violates file's own deep-copy discipline (latent) | ✅ resolved *(v2.1.49 clear)* |
| A6-7 | P3 | park | Multi-sticker cost resolution is apply-order dependent | ✅ resolved *(v2.1.49 clear)* |

## chunk-07-ai

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A7-1 | P2 | stage | Extra-cost mana abilities triple-bypassed (cost-blind tapLandForMana surfacing + cost-skipping execution + solver counts them free); refuter-widened to tapless ones | ✅ resolved |
| A7-2 | P3 | stage | effectCoverageReport can't verify the cast-path scorer has a branch — add_counter VALUED-claimed but untargeted non-permanent casts score 0 | ✅ resolved |
| A7-3 | P3 | stage | pickBestTriggerTarget grave-return branch keyed on retired returnFromGraveyard — migrated move_card shape falls to valid[0] (oldest, value-blind); live for 3 cards | ✅ resolved |
| A7-4 | P4 | ship | Comment-vs-code mismatch in ai.js (non-modal self-damage gate comment promises an unwritten per-option check); honestly unreachable, pool-scanned | ✅ resolved |
| A7-5 | P3 | ship | Selfplay harness never reads executeAction's boolean — illegal AI actions loud on stderr but mislabeled 'runaway', corrupting action-mix stats | ✅ resolved |
| A7-6 | n/a | notes | Respond/priority-arm structural notes (object-identity counter coupling, kind-skip shape, the one Math.random) — NOT a finding | ⏸️ parked |

## Chunk 8 - Draft (draft.js + draft canon)

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A8-1 | P3 | ship | rollPack policy comment describes retired slot-3 bias; no slot-index logic in code | ✅ resolved |
| A8-2 | P3 | ship | Canon 1400 stale 3 ways (Desert Cube absent, 1404 omits boss, 1405 auto-allocate) | ✅ resolved |
| A8-3 | P4 | ship | countPips comment claims classic ignores lands; 5 artifact lands contribute pips | ✅ resolved |
| A8-4 | P4 | park | buildOpponentDeck oppColors UI-dead output + two-shape contract trap | ✅ resolved *(v2.1.49 clear)* |
| A8-5 | P3 | stage | Opp staple budget ~4/10 land-consuming, ~1/7 basic-fusing - texture or leak? | ✅ resolved |
| A8-6 | P4 | ship | Trivia bundle x4: consume_spirit, rollTransformPack doc, stale unused, dangling fragment | ✅ resolved |

## Chunk 9 — Run/meta/picklog (run.js save/load/migration, map, rewards, snapshot rollback; picklog.js)

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A9-1 | P2 | stage | v1->v2 save migration written against phantom shape; resurrects dead tplIds -> clearSave run destruction | ✅ resolved |
| A9-2 | P2 | stage | EFFECTS.rip (Vile Edict) skips removeSlotByIdx slotIdx-fixup contract; live in boss decks | ✅ resolved |
| A9-3 | P3 | stage | playedSlotIdxs never remapped by any slot removal; win-reward filters target wrong slots | ✅ resolved |
| A9-10 | P3 | stage | snake_case sweep (e2e151f) extended TPLID_RENAMES without bumping SAVE_VERSION to 3; gap-window v2 saves never migrated | 🚫 won't-fix (Joe: no pre-snake-case saves exist) |
| A9-4 | P4 | ship | load() silently accepts future-version saves (upward-only migration loop) | ✅ resolved |
| A9-5 | P4 | ship | picklog gamesPlayed double-counts on crash-restore; counts at start not completion | ✅ resolved |
| A9-6 | P3 | ship | RUN.start() comment cluster: phantom Watcher's Gift, retired triggerPool, contradictory apply() contracts, double-pasted header | ✅ resolved |
| A9-7 | P3 | ship | Canon §1500 gaps: endless sectors undocumented; §1502 omits 15% constructed mid-nodes; §1505 phantom Watcher's Gift; §1504 TwoStickers wording | ✅ resolved |
| A9-8 | P3 | park | pickRewardCandidate guard asymmetry (sticker/ripUp skip bounds re-check + non-stackable dedup); unreachable today | ✅ resolved *(v2.1.49 clear)* |
| A9-9 | P3 | park | TPLID_RENAMES keys must never be reused as live card ids (picklog re-applies renames every load) | ✅ resolved *(v2.1.49 clear)* |

## chunk-10 (card-text.js — describeCardText/describeAbility/describeEffect, triggerLogText, idiom registry, coverage report)

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A10-1 | P3 | ship | Ability-picker labels are a lying hand-rolled duplicate of describeAbility (raw kinds, inverted permanence, wrong subject, understated costs; cost-lying deepseam_quarry "Reanimate" vanilla-reachable) | ✅ resolved |
| A10-2 | P3 | ship | Mercurial Adept custom_text advertises a stale pool — 2/6 listed abilities don't exist (live: Reaper/Hexweaver); popup Repertoire never renders in current saves | ✅ resolved |
| A10-3 | P3 | ship | ~ placeholder leaks to players on two card faces + every ~-templated trigger log line/stack pill; double period UNIVERSAL on all trigger log lines | ✅ resolved |
| A10-4 | P3 | ship | add_type/set_types scope:'self' renders an empty subject — live on artifice_triumphant's face | ✅ resolved |
| A10-5 | P4 | ship | "you gains life equal to" grammar bug LOCKED IN by card_text_test.js:63-66 pinning the wrong string | ✅ resolved |
| A10-6 | P4 | park | coalesceEotBuffs drops the target filter from the coalesced subject (unreachable: 0 pool cards combine a filter + 2 coalescible EOT buffs) | ⏸️ parked |
| A10-7 | P4 | park | Modal modes whose idiom text embeds a period double-punctuate (unreachable: 0 pool modals use an idiom with an embedded period) | ⏸️ parked |
| A10-8 | P4 | ship | TEXT_IDIOM_ONLY drifted: apply_sticker is in the set but has a full standalone describe case — a future regression would pass boot coverage | ✅ resolved |
| A10-9 | P5 | ship/trivia | Stale "line 567" citation in the card-text.js bake-guard comment | ✅ resolved |

## chunk-11-card-json

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| A11-1 | P4 | ship | Slot/effect-level target strings unvalidated; typo equals uncastable card | ✅ resolved |
