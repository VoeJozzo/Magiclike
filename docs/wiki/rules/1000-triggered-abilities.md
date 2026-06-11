---
type: rules
tags: [magiclike, rules]
section: "1000"
created: 2026-06-04
updated: 2026-06-10
---

# 1000. Triggered Abilities

*[[rulebook|Rulebook]] › §1000*

> **Rewritten 2026-06-10** around the composable trigger system (audit A3-4; rewrite authorized in PR #98 review). The prior text — which describes the system the Godot port still implements — is preserved at the bottom in *Appendix: prior §1000 text (historical)*. Wire shapes and payload field names: `docs/PROTOCOL.md` §3.3–3.4 is the source of truth.

## 1001. Definition — the composition

- **1001.1** A triggered ability is a **composition** of three parts declared on a card (or attached to it at runtime):
  - an **event** it listens for (§1002),
  - a **condition** that filters which occurrences of that event it fires on (§1003),
  - one or more **effects** that run when it resolves (§1006).
- **1001.2** It reads as "When/Whenever [event + condition], [effects]." Example (the composed shape):

  ```
  "event": "card_zone_change",
  "condition": ["this_card", "card_moves(battlefield, graveyard)"],
  "effects": [ { "kind": "gain_life", "scope": "self", "amount": 2 } ]
  ```

  — "When this dies, gain 2 life."
- **1001.3** A trigger may additionally carry: target declarations (`target` / `target_slots` / `distinct_targets`, §1005), an optional cost ("you may pay {cost}:", §1006.3), the `noSelfCascade` guard (§1003.4), and an authored `text` label (§1009.3).
- **1001.4** A triggered ability is not a card. It goes on the stack as its own kind of object (§1004) and ceases to exist when it resolves or fizzles (§1006.4).

## 1002. Events

- **1002.1** The event vocabulary is exactly **five kinds**:

  | event | fires when | payload (summary) |
  |---|---|---|
  | `card_zone_change` | a card moves between zones (see 1002.2) | subject card + controller, `from_zone`, `to_zone`, optional `source_iid` |
  | `spell_cast` | a player casts a spell | subject card + controller |
  | `attacks` | a creature is declared as an attacker | subject card + controller, `defender_key` |
  | `life_changed` | a player's life total changes | `who`, signed `delta`, optional `source_iid` |
  | `combat_damage` | a creature deals combat damage to a player | subject card + controller, `who`, `amount` |

  Full field-by-field payloads: `docs/PROTOCOL.md` §3.3 (canonical).
- **1002.2** Zone tokens for `card_zone_change` are `hand`, `library`, `graveyard`, `exile`, `stack`, `battlefield`, plus the synthetic `none` (a token minted directly onto the battlefield came from no prior zone). **Currently only moves that touch the battlefield are announced** — entering it or leaving it. Moves between non-battlefield zones (draws, discards, mills) emit no event today, so a trigger written against such a pair never fires. (Announcing arbitrary zone movements is an approved build-out — audit A3-6.)
- **1002.3** `source_iid` names the card that **caused** the event (e.g. the token-maker behind a token's arrival), distinct from the event's subject. It exists for causal attribution — the `noSelfCascade` guard (§1003.4) reads it.
- **1002.4** Adding a new event kind requires emitting it from the matching state-change point in the engine and updating the PROTOCOL §3.3 table.

## 1003. Conditions — composable predicates

*Design rationale: [[composable-predicates]].*

- **1003.1** Conditions are built from **atomic predicates**: pure, string-keyed functions over (game state, the trigger's source card, the event). The registry (canonical ids, snake_case — see PROTOCOL §3.4):

  | predicate | true when |
  |---|---|
  | `this_card` | the event's subject is the trigger's own source card |
  | `another_card` | the subject is some other card |
  | `card_is_creature` | the subject is a creature |
  | `controlled_by(p)` | the subject's controller is `p` (`you` = the trigger's controller, `opp` = the other player) |
  | `card_moves(from, to)` | the zone change matches; either side may be `anywhere` |
  | `card_has_subtype(s)` | the subject has subtype `s` (word-exact against the unified types array) |
  | `card_damaged_by_this` | the subject was damaged by the source this turn |
  | `card_has_effect(k)` | the subject carries an effect of kind `k` |
  | `affected_player_is(p)` | the event's affected player is `p` |
  | `is_life_gain` / `is_life_loss` | the life delta is positive / negative |
  | `lost_life_this_turn(p)` | player `p` has lost life this turn |

- **1003.2** Atoms compose. A condition may be: omitted or `""` (the trigger fires unconditionally), a bare predicate name, a call string `name(args)`, an **array of terms (AND-ed)** — the canonical card-data shape — or an operator tree `{op: "and"|"or"|"not", terms: [...]}`.
- **1003.3** Self vs. other is expressed *in* the condition: `this_card` makes a trigger fire only off its own source's events ("When **this** dies"); `another_card` excludes them ("Whenever **another** creature dies"). There is no separate self-only flag in this system — that was a feature of the prior shape (see appendix).
- **1003.4** **`noSelfCascade`** — a trigger-level guard, checked before the condition: the trigger refuses to fire when its own source *caused* the event (the event's `source_iid` equals the source's instance id). It exists to stop self-feeding loops — e.g. "whenever a creature enters, create a token" re-firing off its own tokens. All generated triggers carry it (§1010.3). Loops between *different* cards are the budget's job (§1008.3).
- **1003.5** Defaults on bad input: an unknown predicate name evaluates **false** (with a console warning), as does a malformed condition expression; a trigger with no condition at all fires unconditionally. Every card-declared predicate name and event kind is validated against the registries at boot; unknowns are reported as warnings.

## 1004. Timing — queue and drain

*Design rationale: [[trigger-resolution]].*

- **1004.1** When an event fires, the engine scans every card on both battlefields — plus the event's departed subjects, supplied alongside the event so that simultaneous deaths see each other and a card can see its own leave-play event. Each trigger whose event matches and whose condition passes (evaluated **now**, once — §1007) is **queued**, not yet placed on the stack.
- **1004.2** A trigger that requires targets must have a legal target available in **every** slot to go on the stack (a distinct-targets trigger needs a full set of distinct legal targets). This is checked when the trigger would queue and again as it would be pushed onto the stack; failing the push-time check fizzles it with a log. (In MTG this is rule 603.3c's job; Magiclike applies the same principle at these two moments.)
- **1004.3** Queued triggers go onto the stack the next time priority would open, **before** any player receives priority, in **APNAP order**: the active player's triggers first (in queue order), then the non-active player's — so under LIFO the non-active player's resolve first.
- **1004.4** The order is bound **at drain time**. Triggers queued while priority is closed (§605) wait; triggers queued during cleanup survive the turn boundary and drain at the **next turn's first priority window**, ordered by the **new** active player. Their conditions were already evaluated when the event fired (§1007), so any "this turn" reading refers to the turn the event actually happened.
- **1004.5** Each trigger pushed onto the stack resets the response round and hands priority to the **opponent of that trigger's controller** — the same rule as casting a spell ([[600-priority-and-the-stack|§603]]). After a drain completes, priority is therefore held by the opponent of the controller of the last trigger pushed (the one on top of the stack).
- **1004.6** Triggers on the stack can be responded to like spells. They **cannot be countered**: counter effects refuse trigger entries, and "target spell" targeting excludes them ([[700-casting-and-activating|§706]]).
- **1004.7** *Contrast — activated abilities:* non-mana **activated** abilities currently do not take a stack entry at all; they resolve immediately when activated, and only the triggers they spawn are respondable (see §700's implementation status; audit A3-2 — current behavior ruled acceptable). A per-ability **Stackable** designation is being specced separately; this rule carries that forward-pointer.

## 1005. Target selection

- **1005.1** A targeted trigger's targets are chosen by its **controller** as it goes onto the stack (at drain) — not when it queues, and not when it resolves.
- **1005.2** Slots with no genuine choice fill automatically: **implicit** target types (the source itself, the lone opponent, a free player choice, a stack spell) and **forced** choices (exactly one legal target). AI-controlled triggers always auto-pick, preferring effect-appropriate targets.
- **1005.3** When a human's trigger has a genuine choice, the drain pauses and the game prompts slot by slot; every other action is frozen until the prompt finishes. The remaining queued triggers drain afterward.
- **1005.4** Slot picks are committed in order, without backtracking. (For multi-slot distinct-target triggers with asymmetric per-slot filters, an early pick could in principle strand a later slot; every current distinct-target trigger is two slots with the same filter, where this cannot happen.)
- **1005.5** If a slot has no legal target left mid-prompt, the whole trigger **fizzles**, with a log message.

## 1006. Resolution

When a trigger's stack entry reaches the top and resolves (after the budget check, §1008):

- **1006.1** **Targets re-validate at resolution.** Every targeted slot is re-judged against current legality — the same legal sets used when the target was chosen. A slot whose target became illegal (left play, gained hexproof in response, stopped matching the filter) is dropped; if **no** targeted slot survives, the **whole trigger fizzles**, untargeted rider effects included — the same fizzle behavior as spells ([[700-casting-and-activating|§704.1]]).
- **1006.2** Surviving effects then resolve **in order**. Legality is judged once, at the start of resolution; between effects only liveness applies — an individual effect whose target has since left play does nothing, while the trigger's other effects still run. Later effects see the game state as modified by earlier ones.
- **1006.3** **Optional costs.** A "you may pay {cost}:" trigger resolves its target choices normally, then pauses for the controller's pay/decline decision; a controller who cannot afford the cost auto-declines. Decline (either way) means no effects run.
- **1006.4** The trigger then leaves the stack and ceases to exist. It does not go to a graveyard — triggers aren't cards.

## 1007. Conditions check once

The condition is evaluated **exactly once, when the event fires** (§1004.1). It is never re-checked — not at drain, not at resolution: a trigger whose condition has become false by the time it resolves still resolves. (In MTG, "intervening if" clauses are re-checked on resolution — rule 603.4. Magiclike intentionally diverges: one check, at event time. Both engines align on this — `docs/DIVERGENCE.md` E5.) A useful consequence: "this turn" trackers are read on the turn the event happened, even for triggers that drain on a later turn (§1004.4).

## 1008. The trigger budget

- **1008.1** Trigger resolutions are capped at **100 per stack episode**. Every trigger resolution counts against the budget; the counter resets once the stack has emptied (both players passing on an empty stack). A trigger resolving beyond the budget is discarded without effect, with a logged warning.
- **1008.2** This is a cumulative **budget**, not a nesting depth — deliberately so: a budget bounds mutual A→B→A trigger loops that true nesting-depth accounting would never catch, since each round of such a loop resolves at shallow depth. (Design ruling, PR #98, 2026-06-10; audit A3-3. An earlier "no cap needed if the drain is correct" stance was reversed after real card design produced accidental infinite-loop combinations.)
- **1008.3** The budget is the second of two loop defenses; `noSelfCascade` (§1003.4) is the first, stopping single-source self-loops before they queue.

## 1009. Trigger text is generated

*Design rationale: [[procedural-card-text]].*

- **1009.1** A trigger's rules text is **generated from its composition**, not hand-authored: a "When/Whenever …," preamble derived from the event + condition, then a body derived from the effects.
- **1009.2** The preamble comes from **archetype classification**: the condition's terms, in array order, form a signature that maps to a named archetype ("this dies", "another creature enters under your control", …). Term order is load-bearing — author conditions in the canonical order the migration table established, or classification silently degrades to a generic preamble (and archetype-keyed consumers, like AI trigger valuation, see `null`).
- **1009.3** A trigger carrying an authored `text` string uses it verbatim — generated triggers (§1010) and the few custom-text cards whose effects don't generate cleanly.

## 1010. Generated triggers

- **1010.1** Two systems compose triggered abilities at runtime from the same vocabulary as card data:
  - the **Architect's Codex** build flow — the player is offered 3 condition options, then 3 effect options, and the chosen pair is assembled into a trigger;
  - the **Mercurial Adept** — a boon dealt from a static pool of pre-composed triggers.
- **1010.2** The Codex's effect options are filtered against the chosen condition so that effects requiring a live source ("~ gets +X/+X") are never offered with conditions where the source may be gone ("~ dies") — the only *hard*-break pairing. Soft mismatches are intentionally allowed.
- **1010.3** Every assembled trigger carries `noSelfCascade` (§1003.4) and an authored `text` label (§1009.3).

## 1011. Delayed effects are not triggered abilities

"Do X at end of turn" effects (e.g. an exile-until-end-of-turn card's return) are **scheduled**, in a separate delayed queue — not the trigger queue. They fire during **cleanup**: no priority window, no stack entry, no response. That timing is correct for "until end of turn" durations, which is this queue's purpose; it is **not** a home for a genuine "at the beginning of the end step" triggered ability, which would belong on the stack in a real priority window (no such card exists yet). Triggers caused *by* a delayed effect (e.g. the returning creature's ETB) queue normally under §1004 and drain at the next priority window.

## Implementation status — Triggered Abilities

- **The composable system (§§1001–1003, 1009–1010) is live in the html-proto** (`docs/DIVERGENCE.md` E1/E2: PROTO done — all card triggers, the generator, and the Mercurial pool migrated; the legacy vocabulary removed). **The Godot port still implements the prior system** — legacy event names (`card_enters_battlefield`, `card_dies`), the `cond_id` predicate registry, and the `self_only` flag (E1/E2: GODOT pending). Until the port migrates, the historical appendix below is its reference.
- §1006.1 resolution-time re-validation: html-proto implemented 2026-06-10 (audit A3-1 ruling, PR #111). Godot-side status not verified at this rewrite.
- §1008 budget: html-proto implemented (`TRIGGER_DEPTH_CAP`); Godot pending — the port will mirror the threshold (E6; "Patterns to REPLICATE" in the root `CLAUDE.md`).
- §1007: both engines align (E5).
- §1004.7 / activated abilities off-stack: html-proto behavior, ruled acceptable pending the Stackable design (audit A3-2, PR #98).
- §1005 prompt machinery, per-engine names: proto `pendingTriggerTarget` / `triggerTargetPick`; Godot `awaiting_target_for_trigger` / `pick_trigger_target`.
- §1011 delayed queue: realized in the proto (`schedule_delayed`); the `'end_step'` wire name is a known misnomer for cleanup timing (see PROTOCOL's caveat).

---

## Appendix: prior §1000 text (historical)

> Superseded 2026-06-10 by the rewrite above (audit A3-4; authorized in PR #98 review). This is the page body as it stood from 2026-06-04, documenting the **pre-migration trigger system** — retired in the html-proto (DIVERGENCE E2), still implemented by the Godot port (E1/E2: GODOT pending), which makes this appendix the port's working reference until its migration. Preserved as history, not authority: the audit flagged that, against the proto, its §1002 vocabulary and §1003 status claims were already false when superseded (A3-4). Headings are demoted one level to keep this page's anchors unique; the text is otherwise verbatim.

### 1001. Definition *(historical)*
A triggered ability is an ability declared on a card's template that fires in response to an **event** in the game, optionally gated by a **condition**.

```
"event": "card_enters_battlefield",
"cond_id": "opp_lost_life_this_turn",
"effects": [ ... ],
"self_only": true,           # the trigger only fires from the source card's own events
"target_filter": "creature_or_player"   # if effects use target: "chosen"
```

### 1002. Event vocabulary *(historical)*
The current event vocabulary is:
- `card_enters_battlefield` — a card enters the battlefield.
- `card_dies` — a creature on the battlefield moves to the graveyard.

The engine can emit other event kinds, but no current card listens for them. Planned events for future cards include `card_attacks`, `spell_cast`, `card_drawn`, `damage_dealt`, `life_gained`.

### 1003. Self-only vs. global listeners *(historical)*
- `self_only: true` (the default in practice) — the trigger fires only when the **source card itself** is the event subject. Example: Pyromaniac's ETB trigger fires when Pyromaniac enters, not when any other card enters.
- `self_only: false` — the trigger fires for any matching event. Example: a hypothetical "When another creature enters, draw a card" trigger.

### 1004. Trigger timing — queue and drain *(historical)*
- When an event fires, the engine scans all listeners (every card on the battlefield, plus the event subject if it just left the battlefield). For each listener with a matching event, condition, and self-only check, a **trigger entry** is queued onto `state.pending_triggers`.
- Triggers are queued, **not** placed on the stack immediately.
- The next time priority is about to open, the engine **drains pending triggers**: each trigger is moved from the queue to the stack, in **APNAP order** (Active Player triggers first by queue order, then Non-Active Player triggers; on the stack, NAP triggers end up on top, so they resolve first under LIFO).
- After the drain completes, priority opens with the active player. Players can respond to the stacked triggers normally.

### 1005. Target selection on triggers *(historical)*
- If a trigger's effects use `target: "chosen"`, the trigger pauses at drain time and prompts the **controller of the trigger** to pick a target.
- The engine sets `state.awaiting_target_for_trigger`. Drain does not continue until the controller submits a `pick_trigger_target` action with a target matching `target_filter`.
- After the pick, the trigger continues drain and resolution.

### 1006. Trigger resolution *(historical)*
When a trigger's stack entry reaches the top:
1. Re-validate targets (same fizzle behavior as spells, see [[700-casting-and-activating|§704.1]]).
2. Resolve each effect in order.
3. The trigger leaves the stack. It does NOT go to a graveyard (triggers aren't cards).

### 1007. Intervening "if" re-check *(historical)*
*(MTG rule 603.4: "if" clauses in triggers are re-checked on resolution.)*
Currently, the engine **only checks `cond_id` at queue time**, not at resolution. If a trigger's condition becomes false between queue and resolution, the trigger still resolves. Tracked in `docs/DIVERGENCE.md` E5.

### 1008. Trigger chain depth *(historical)*
The html-proto caps trigger-chain depth at 100 nested resolutions; exceeding it bails with a warning. The Godot port does not yet have this cap, but **will mirror proto's threshold** — an earlier "no cap needed if drain is correct" stance was reversed after real card design produced accidental infinite-loop combinations. See `docs/DIVERGENCE.md` E6 and the "Patterns to REPLICATE" note in the root `CLAUDE.md`.

### Implementation status — Triggered Abilities *(historical)*
- 1007 intervening-if: not implemented (known deviation).
- 1003 `self_only: false`: code path exists but no current card uses it; not exercised by tests.
- 1002: future events will require new emission sites in the engine and new card templates.
