# Implementation Divergence — Godot ↔ html-proto

A living catalog of behavioral differences between the Godot port (at the repo root) and the html-proto reference implementation (`reference/html-proto/`). Pairs with [`RULES.md`](RULES.md) (the canonical spec) and [`ARCHITECTURE.md`](ARCHITECTURE.md) (the module map).

When the two implementations disagree, **`RULES.md` is the tie-breaker** — the implementation that doesn't match the canonical rule is wrong and is the one with a to-do.

## Severity tags

- 🔴 **GAME-AFFECTING** — running the same scenario in both produces a different game outcome
- 🟡 **UX-ONLY** — same final outcome, different player-facing interaction
- 🔵 **INTERNAL** — different mechanism, observably equivalent

## TO-DO tags

The TO-DO column describes the action; the tag describes who needs to do it.

- **godot:** the Godot port needs work. Covers both *alignment* (match proto's existing behavior) and *implementation* (add a feature proto has but Godot doesn't).
- **proto:** the html-proto needs work. Same two flavors.
- **both:** both engines need work to converge on a new (shared) behavior. Used when the canonical answer isn't "match the other side" but "redesign and align."
- **either-fine:** both implementations are defensible; pick one and align if convenient.
- **convention:** no code change needed; the fix is a card-authoring or doc-discipline rule.
- **already-aligned:** same behavior in both implementations; no action.
- **intentionally-divergent:** different by design or policy; do not change.
- **non-issue:** divergent on paper but operationally invisible (no card or scenario exposes the difference).

---

## A. Game setup

| # | Area | Godot | Proto | Tag | TO-DO |
|---|---|---|---|---|---|
| A1 | First player choice | Fixed to `"you"` (engine_state.gd init) | Random 50/50 (engine.js:5501) | 🔴 | **godot:** randomize first player at game start |
| A2 | First-turn draw skip | Not implemented — first player draws on turn 1 | Implemented (engine.js:5258) | 🔴 | **godot:** implement first-player draw-skip rule per RULES 100.5 |
| A3 | Starting life / hand / max hand | 20 / 7 / 7 | 20 / 7 / 7 | ✅ Same | **already-aligned** |
| A4 | Forced mulligan on extreme land counts | Not implemented | Implemented (engine.js:717-732). If opening hand has 0/1 or 6/7 lands, the drawn portion is reshuffled into library and re-drawn. One-shot, no player choice, no recursion. | 🔴 (different opening-hand distribution) | **godot:** *(DEFERRED — site of active experimentation in proto; do not align until the proto rule stabilizes)*. When the time comes: implement the same forced single-mulligan. Affects opening-hand distribution; without it Godot players see screwed/flooded hands more often. |
| A5 | Concede action | Not implemented | Implemented as `ENGINE.concede()` (engine.js:5551). Sets `G.gameOver = true; G.winner = opp`. | 🟡 (UX gap; game-affecting in that the player can resign) | **godot:** add `KIND_CONCEDE` action and engine handler. Mirrors proto: sets `state.winner` to opponent, emits `game_over`. RULES.md §100.6 already mentions concede as a loss condition; it's just unimplemented. |

A1 + A2 together: in proto the first player gets a tempo advantage offset by drawing one fewer card; in Godot, whoever is "you" goes first AND draws on turn 1 — a real fairness gap.

---

## B. Turn structure

| # | Area | Godot | Proto | Tag | TO-DO |
|---|---|---|---|---|---|
| B1 | UPKEEP phase | Exists, no-op, opens priority (phase_machine.gd:8) | Doesn't exist — `step()` switch has no UPKEEP case | 🟡 | **intentionally-divergent** — per user. Godot keeps UPKEEP as a placeholder for future "at beginning of upkeep" triggers; proto's absence is intentional and consistently applied (no dead references; verified 2026-05-21). |
| B2 | Mana pool clearing | Every phase boundary (engine.gd:1147) — matches MTG 106.4 | Only at CLEANUP (engine.js:5413) | 🔴 (theoretically; no current card exposes it) | **proto:** clear mana at every phase boundary. Tracked in `reference/html-proto/BACKLOG.md`. |
| B3 | CLEANUP ordering | EOT modifiers clear → check discard | Discard → delayed triggers → EOT clear → mana clear → active-player swap | 🟡 | **either-fine:** harmonize the step ordering. Pick one canonical sequence and have both implementations match it. |
| B4 | Delayed triggers (e.g., "return at end of turn") | Not implemented | Implemented (CLEANUP-phase processing of `delayedTriggers`) | 🔴 (when porting cards that need it) | **godot:** implement delayed-trigger queue at Phase 7+ (when first card needs it). |
| B5 | Temporary control revert (stolen creatures return at EOT) | Not implemented | Implemented (engine.js:5387-5411) | 🔴 (when porting cards that need it) | **godot:** implement temp-control revert at Phase 7+. |
| B6 | Auto-pass when no legal action | Not implemented — `_settle_state` only auto-passes for AI; human player must explicitly pass priority even when they have nothing to do | Implemented via `hasNoAction(who)` at engine.js:5177 plus `skipApEndStep` at engine.js:5196. Any priority holder (including human) with no castSpell / activateAbility / playLand actions has priority auto-passed. Active player's empty-stack END priority is also auto-skipped. | 🟡 | **godot:** extract a `_open_priority_window(player_key)` helper that sets `state.priority_player_key` AND checks the auto-pass condition (no legal cast/activate/play-land action; OR empty-stack END-step). Replace the four current direct assignments (engine.gd:929, 1196-1203, 1442, 1503) with calls to the helper. Makes auto-pass structurally part of the state machine — you can't open a priority window without the check running. Add a `_has_no_legal_main_action(player_key)` helper that filters `get_legal_actions` to cast/activate/play-land kinds. |
| B7 | End-turn fast-forward shortcut | Not implemented | `endTurnPending` flag (engine.js:4627). Active player triggers an "end turn" UI action → engine completes any pending declaration (empty attackers), sets the flag, subsequent priority windows on player's side auto-pass until CLEANUP. UX shortcut for "skip me to end of turn." | 🟡 | **godot:** add as an action (`KIND_END_TURN`) that sets a similar flag in `EngineState`, then in `_settle_state` the flag combines with B6's no-legal-action check to fast-forward. Skipped declarations are commit-as-empty (no attackers). Flag clears at next turn start (UNTAP). |

---

## C. Combat

| # | Area | Godot | Proto | Tag | TO-DO |
|---|---|---|---|---|---|
| C1 | **Multi-blocker damage assignment** | Dumps all damage on `blockers[0]` (engine.gd:1080) | Smart distribution — sorts blockers by kill-value, indestructibles last, assigns minimum lethal to each in order (engine.js:4062-4153) | 🔴 BIG | **godot:** harmonize to proto's smart-distribution algorithm (RULES.md §803). |
| C2 | Deathtouch + multi-block | Marks first blocker lethal; subsequent take 0 damage from attacker | Uses "lethal = 1" against killable blockers; can kill multiple in one combat | 🔴 | **godot:** falls out of C1 fix automatically — implementing smart-distribution requires the deathtouch-reduces-threshold logic. |
| C3 | Menace single-blocker handling | Legal at declaration; collapses to unblocked at damage time (engine.gd:1008) | Illegal at declaration (engine.js:4842) | 🟡 (same outcome, different UX) | **either-fine:** pick one. Defer-collapse is more permissive; reject-at-declaration is more decisive. Pure UX call. |
| C4 | Attacker/blocker declaration undo | `undeclare_attacker` / `undeclare_blocker` actions exist (engine.gd) | No undo — declarations atomic; pre-commit state lives in UI selection | 🟡 | **godot:** align on proto's UI-tracked model. Build attacker/blocker selection as UI state in `game_board.gd`; engine receives one `declare_attackers([list])` / `declare_blockers({map})` action on commit; remove `undeclare_*` actions from `Action`. Smaller engine API, cleaner state, UI bugs no longer corrupt engine. |
| C5 | Killer attribution (`killedBy`) | Not tracked in combat | Tracked for keyword-claim death triggers (e.g., Endomorph Absorb) | 🔴 (when porting cards that need it) | **godot:** implement when first card needs killer-credit (likely Phase 7+ for proto-style absorb mechanics). |
| C6 | Unblockable keyword string | `"unblockable"` | `"unblockable"` | ✅ Same | **already-aligned** |

### C4 detail — what declaration undo means in play

Godot lets the active player declare an attacker, then change their mind before passing priority. They issue an `undeclare_attacker` action — the creature untaps, leaves the attackers list, and the player can declare something else. Same for blockers.

Proto: clicking "declare attackers" with a set commits that set atomically. To change a decision, you'd have to back up to a prior game state (which proto doesn't support either).

This is purely a player-experience choice. MTG itself has no formal rule on take-backs — paper play allows them by social convention, MTGO doesn't. Neither implementation is "more correct."

---

## D. Spells and effects

| # | Area | Godot | Proto | Tag | TO-DO |
|---|---|---|---|---|---|
| D1 | Multi-effect target snapshot | Live state read at each effect's resolution | Snapshots target stats per `targetSlot` before any effect runs (engine.js:3900-3938) | 🔴 (when multi-effect spells are added) | **either-fine:** matters zero times today (no multi-effect spell in current pool). MTG canon is closer to Godot's live read. Pick one and align. |
| D2 | `pump` effect duration | Parametrized via `duration: "eot"` / `"permanent"` | Two separate effects: `pump` (always EOT), `addCounter` (always permanent) | 🟡 | **proto:** consolidate to Godot's pattern — one `pump` effect with `duration` parameter, deprecate `addCounter` as a separate effect kind. |
| D3 | `gain_life` flexibility | Always to `ctx.controller` | Can route via `params.who` or target descriptor | 🟡 | **godot:** extend `gain_life.gd` to accept `who`/`target` parameters per proto's pattern. Enables future "target opponent gains N life" cards. |
| D4 | `gain_life` sign-based delta | Refuses non-positive amounts (warn+skip) | Silent apply (no event for negative direction) | 🟡 | **both:** redesign `gain_life` as a unified life-delta effect. Accept any integer amount; sign determines event direction. Positive → fire "life gained" event (for gain-life triggers). Negative → fire "life lost" event (for lose-life triggers). Zero → no event. Preserves the trigger-time distinction between gain and loss while making the card-authoring side a single effect, enabling runtime sign-flip mechanics (Ser Severity etc.). Lifelink unchanged (fires on damage-dealing, not life-gain). |
| D5 | `add_mana` shorthand | Accepts flat `{"R": 1}` OR canonical `{"amounts": {"R": 1}}` | Requires canonical form only | 🔵 | **convention:** all card authors write the canonical form `{"kind": "add_mana", "amounts": {...}}`. Both engines accept it. No code change in either engine. |
| D6 | `counter_spell` refuses to counter triggered abilities | Yes (engine.gd:1272) | Yes (engine.js:1780) | ✅ Same | **already-aligned** |
| D7 | Legendary uniqueness ("only one of each legendary tplId on the battlefield per player") | Not enforced | Enforced at cast-legality (engine.js:4721) | 🔴 (when Godot adds legendary cards) | **godot:** implement at the point Godot's pool gains its first legendary creature. |

### D1 detail — when target snapshots matter

This matters when a single spell has multiple effects that all reference the same target, AND an earlier effect modifies the target in a way the later effect cares about.

Hypothetical card we don't have yet: *"Target creature gets +2/+2 and gains lifelink. Then it deals damage equal to its toughness to its controller."*

- **Proto**: snapshots toughness BEFORE any effect runs. The pump applies, then the damage effect deals damage equal to the SNAPSHOT toughness (e.g., 3 for a 2/3 creature, not 5).
- **Godot**: each effect reads the live state at its own resolution. The pump applies (creature becomes 4/5), then damage = 5.

Today this matters zero times — no spell in either pool has multi-effect with same-target stat references. It becomes a real difference the first time we port one.

### D4 detail — non-positive life gain

- **Godot**: `gain_life.gd:7-9` pushes a warning ("nonpositive amount X — skipping") and returns without applying. You catch authoring bugs ("oops I wrote `amount: 0`") at runtime.
- **Proto**: just applies the amount. `amount: 0` → no change, no log entry. `amount: -2` → life DROPS by 2 (proto doesn't guard).

MTG-canonical: "gain 0 life" is a real but no-op event, and triggers like "whenever you gain life" should NOT fire on it. Both implementations match this (Godot by skipping entirely, proto by adding 0 silently with no event emission).

### D5 detail — add_mana data formats

Both forms produce identical mana pool changes. Cards using `{"kind": "add_mana", "amounts": {"R": 1}}` work in both engines. Cards using `{"kind": "add_mana", "R": 1}` work only in Godot. The shorthand was probably added for hand-authoring convenience.

---

## E. Triggered abilities

| # | Area | Godot | Proto | Tag | TO-DO |
|---|---|---|---|---|---|
| E1 | Event vocabulary + zone-change unification | 2 emitted: `card_etb`, `card_dies` | 6+ emitted, with overlapping `cardDies`/`cardLeavesBattlefield` | 🔴 | **both:** unify zone-change events into a single emission with destination data (e.g., `card_left_battlefield` with `to_zone: "graveyard"/"hand"/"exile"`). "Dies" becomes a composable predicate over the unified event, not a separate event. Then expand emission to cover `attacks`, `spell_cast`, `life_gained`. Driven by card-pool needs (Phase 6+) and the E2 composable-predicate refactor. |
| E2 | Predicate composability + registry size | 1 monolithic predicate (`opp_lost_life_this_turn`); registry is name→function | 14 monolithic predicates; registry is name→function | 🔴 | **both:** refactor to composable predicates. Registry holds atomic primitives (e.g., `subject_is_source`, `subject_is_creature`, `controller_is_you`, `opp_lost_life_this_turn`). Card data uses an expression — single name for trivial cases, list of names for AND, optionally a `{op, terms}` tree for OR/NOT. Evaluator walks the expression; boot validation walks every leaf. Cards become declarative compositions of building blocks instead of N specific functions. Scales to 258+ cards plus Architect's Codex runtime composition naturally. Pre-empts tech debt before Phase 6 expansion. |
| E3 | Queue-and-drain pattern | Same | Same | ✅ Same | **already-aligned** |
| E4 | APNAP drain order | Yes (engine.gd:1449) | Yes (engine.js:2820) | ✅ Same | **already-aligned** |
| E5 | Intervening-"if" re-check on resolution | Not implemented | Not implemented | ✅ Same (mutual deviation from MTG 603.4) | **either-fine:** implement on both sides if any card needs it. Already in Godot's BACKLOG. |
| E6 | Trigger chain depth cap | None | 100 (engine.js:2731) | 🟡 | **godot:** add the cap. The "bet on drain correctness" stance from CLAUDE.md doesn't survive contact with real card design — the user has already accidentally produced infinite-loop card combinations on proto. The cap costs one counter + one comparison; the defensive value (preventing a hung session, surfacing the bug at the right place) is high. Mirror proto's 100-depth threshold. CLAUDE.md "Patterns to NOT replicate" entry to be removed in the same commit. |
| E7 | Auto-pick trigger target (AI) | Greedy: face damage first → first creature | Effect-aware scoring (damage prefers killable, pump prefers own best) | 🟡 | **godot:** upgrade AI auto-pick to effect-aware scoring as the AI iterates (Phase 6+ AI work). |
| E8 | Death triggers fire from graveyard | Yes — `subject_card` in event payload | Yes — `extraSources` in emit call | ✅ Same | **already-aligned** |

### E1 + E2 detail — events and predicates explained

In our game, cards have triggered abilities like "When this creature dies, do X" or "Whenever you cast a spell, do Y." For these to work, the engine needs two pieces of machinery:

1. **Events**: a notice the engine posts when something happens. "Creature X just entered the battlefield." "Player Y just cast a spell." Every category of trigger needs the right kind of notice to listen for.
2. **Predicates**: the criteria each card uses to decide "does this notice apply to me?" Bloodlust Berserker doesn't fire on every death — only its own death, and only when the opponent lost life this turn.

**Godot's bulletin board** (current state):
- `card_etb` — a card entered the battlefield
- `card_dies` — a card died

Godot's predicate registry: 1 entry, `opp_lost_life_this_turn`.

**Proto's bulletin board:**
- `cardEntersBattlefield` — same as Godot's card_etb
- `cardDies` — same as Godot's card_dies
- `cardLeavesBattlefield` — broader than dying. Includes bouncing back to hand, exiling, etc.
- `attacks` — a creature was declared as attacker
- `spellCast` — any spell was put on the stack
- `lifeGained` — any player gained life

Proto's predicate registry (14):

| Predicate | Fires when |
|---|---|
| `thisEnters` | The card that just entered IS this trigger's source |
| `anotherCreatureYouEntersStrict` | Another (non-self) creature you control entered |
| `anotherCreatureYouEntersOfSubtype` | Another of your creatures with a specific subtype entered |
| `thisAttacks` | This trigger's source just attacked |
| `thisAttacksAfterOppLifeLoss` | ... and the opponent lost life this turn |
| `creatureYouAttacksOfSubtype` | Any of your creatures with subtype X attacked |
| `thisDies` | This trigger's source just died |
| `thisLeaves` | This trigger's source just left play (any way) |
| `anotherCreatureDies` | Another creature you control just died |
| `anyCardDies` | Any card died, either side |
| `thisKillsCreature` | A creature died, killed by damage from this source |
| `youGainLife` | You gained life |
| `youCastSpell` | You cast a spell |
| `youCastCounterspell` | You cast a counterspell specifically |

**Why this matters for porting.** Of proto's 258 cards, roughly 80-120 have triggered abilities, and most of those use one of these 14 predicates against one of the 6 events. Until Godot has the matching events AND predicates, porting those cards is blocked at the templating step.

**The good news.** Each event is one or two lines of code (an `_fire_event({...})` call placed at the right point in the engine). Each predicate is a small static function in `predicates.gd` plus one entry in `_PRED_NAMES`. Boot validation catches typos. The work for Phase 6 (card pool expansion) is really: pick the next 15–20 cards, identify which events and predicates they need, add those, then write the templates.

---

## F. State-based actions

| # | Area | Godot | Proto | Tag | TO-DO |
|---|---|---|---|---|---|
| F1 | Creature death checks (lethal damage, deathtouch, 0 toughness) | Same | Same | ✅ Same | **already-aligned** |
| F2 | Indestructible damage handling | Preserves marked damage; only the death-check is skipped (engine.gd:948). If indestructible is lost mid-turn, marked damage is still present and the creature dies at the next SBA — MTG-correct. | Clears `damage` on indestructibles during SBA (engine.js:3591-3594). If indestructible is removed, the previously-marked damage is gone and the creature survives damage it shouldn't have. | 🔴 (when a card removes indestructible mid-turn) | **proto:** align on Godot. Don't clear damage from indestructibles — just skip the death check. Damage clears at end of turn like everything else. |
| F3 | Token vanishing on leave-play | N/A (no tokens) | Implemented | 🔴 (when porting tokens) | **godot:** implement at the point Godot's pool gains tokens. |
| F4 | SBA sweep ordering | Single-pass collect-and-apply, iterative repeat | Single-pass collect-and-apply, iterative repeat | ✅ Same | **already-aligned** |

---

## G. UI / information visibility

The rules engine handles hidden information correctly in both implementations (neither AI peeks at the opponent's hand). The UI layer is where the two diverge.

| # | Area | Godot | Proto | Tag | TO-DO |
|---|---|---|---|---|---|
| G1 | Opponent's hand visibility to the human player | Spawned with the same visual as the player's own hand — face-up, fully readable. `game_board.gd:274` calls `_spawn_visual_for_instance` for every card in `s.opp.hand` into the `_opp_hand` zone with no face-down treatment. | Rendered as card backs only. `render.js:141` calls `renderOppHandBacks(G.opp.hand.length)`; only the count is visible, not card identities. Proto's `.frame-cardback` CSS hides name/art/cost. | 🔴 (information leak) | **godot:** add a face-down/cardback visual for cards in `_opp_hand`. Either skip spawning full Card visuals and just show N placeholder backs, or extend `scenes/card.gd` with a `face_down` mode that suppresses oracle text, name, and art. The engine state is already correct (the AI doesn't read the human's hand); only the UI presentation leaks. |

---

## False positives flagged during audit

The audit surfaced one claim that turned out to be wrong; logging it here so it doesn't get repeated:

- **"Godot Phase 4 promises Mercurial Adept spellCast triggers but doesn't emit the event."** False. Mercurial Adept is a proto-only card. Godot's Phase 4 ships Pyromaniac (`card_etb`) and Bloodlust Berserker (`card_dies`) — both events are emitted. The audit confused proto's Phase 4 with Godot's Phase 4.

---

## Maintaining this file

- When an item is fixed in one implementation, update the affected row and either delete the row or move it to a "Recently aligned" section with a date.
- When a new divergence is discovered, add a row with a stable ID. Don't renumber existing rows — IDs are referenced from RULES.md and elsewhere.
- The TO-DO column is part of the row, not a separate tracker. When work begins on a TO-DO, no need to migrate it elsewhere; just check status here.
