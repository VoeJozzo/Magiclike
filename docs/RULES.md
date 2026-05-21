# Magiclike — Comprehensive Rules

This document describes how the game works, in plain English, independent of any implementation. When the doc and the code disagree, **the doc is canon**; the code is the patient.

Rules are numbered hierarchically (`100.1`, `100.1a`) so other docs and code comments can reference them. The numbering scheme borrows from Magic: The Gathering's Comprehensive Rules but uses our own ranges.

Each major section ends with an **Implementation status** block that flags where the Godot port and the html-proto currently deviate from the canonical rule, and what's not implemented anywhere.

Sections:
- [100. Game Concepts](#100-game-concepts)
- [200. Parts of a Card](#200-parts-of-a-card)
- [300. Card Types](#300-card-types)
- [400. Zones](#400-zones)
- [500. Turn Structure](#500-turn-structure)
- [600. Priority and the Stack](#600-priority-and-the-stack)
- [700. Casting and Activating](#700-casting-and-activating)
- [800. Combat](#800-combat)
- [900. Keywords](#900-keywords)
- [1000. Triggered Abilities](#1000-triggered-abilities)
- [1100. State-Based Actions](#1100-state-based-actions)
- [1200. Ending the Game](#1200-ending-the-game)
- [1300. Stickers](#1300-stickers)
- [1400. Draft](#1400-draft)
- [1500. The Run (Roguelike Meta)](#1500-the-run-roguelike-meta)

---

## 100. Game Concepts

### 100.1 Players
A game of Magiclike is played between exactly two players: **you** and **opp**. There are no multiplayer formats.

### 100.2 Starting life total
Each player begins the game with **20 life**.

### 100.3 The deck
- Each player has a **deck**, used to populate their library at game start.
- Within a single game, a deck is fixed and known to both players' libraries are shuffled at the start of the game.
- Deck composition is determined by the run-meta layer (see [1400](#1400-draft) and [1500](#1500-the-run-roguelike-meta)); the rules in this section assume a deck already exists.

### 100.4 Starting hand
At the start of the game, each player **draws seven cards** from their library into their hand. There is no mulligan step.

### 100.5 First player
- One player is the **active player** for turn 1.
- For the html-proto, this is randomized at game start.
- The first player **skips their draw step on turn 1**.

### 100.6 Win and loss conditions
A player **loses the game** if any of the following becomes true:
- Their life total is 0 or less.
- They attempt to draw a card with an empty library.
- They concede. *(Not yet implemented — there is no concede action.)*

A player **wins the game** when their opponent loses.

Both players losing simultaneously is treated as the active player losing (the inactive player wins). *(Not yet tested.)*

### 100.7 Game state and information
- **All zones are public except the hand and the library.** The opponent's hand is hidden; both players' libraries are hidden (face-down).
- The game log is public to both players.

### Implementation status — Game Concepts
- 100.6 concede: not implemented.
- 100.5 random first player: html-proto randomizes; Godot port currently uses a fixed first player in tests.

---

## 200. Parts of a Card

### 200.1 Card identity
Every card has a stable **template id** (`card_id` in Godot, `tplId` in html-proto). The id identifies the card definition; multiple instances of the same template can exist in the game and are distinguished by an **instance id**.

### 200.2 Mana cost
The cost paid to cast the card. Composed of:
- **Colored requirements**: any combination of `W` (white), `U` (blue), `B` (black), `R` (red), `G` (green).
- **Generic requirement** (`C`): can be paid with any color.

Lands have no mana cost. Some spells may have no mana cost (free spells).

### 200.3 Type line
- **Card types**: `land`, `creature`, `instant`, `sorcery`, `artifact`, `enchantment`.
- **Subtypes**: e.g., `human`, `warrior`, `plains`, `goblin`. Subtypes are flavor + matter-for-tribal; the rules engine does not treat them specially unless an effect references them.

A card may have more than one card type (e.g., artifact creature) but our current pool uses single-type cards.

### 200.4 Power and toughness
Creatures have **power** (damage dealt in combat) and **toughness** (damage they can survive in a turn). Both are non-negative integers in the templates; runtime modifiers can produce any integer.

### 200.5 Oracle text
A human-readable description of the card's effects, abilities, and triggers. The rules engine does not parse oracle text; behavior is driven by structured effect/ability/trigger data.

### 200.6 Keywords
A creature's intrinsic keywords (e.g., `flying`, `trample`). See [900](#900-keywords) for the full list.

### 200.7 Effects, abilities, triggers
A card may declare:
- **On-cast effects**: resolve when the spell resolves (spells) or when the permanent enters the battlefield (permanents — currently we don't have permanents with non-trigger ETB effects).
- **Activated abilities**: a cost the controller can pay to produce an effect (e.g., `{T}: Add {R}`).
- **Triggered abilities**: see [1000](#1000-triggered-abilities).

### Implementation status — Parts of a Card
- Artifacts and enchantments are listed as legal card types but the current pool has none.
- Multi-type cards work mechanically (`has_type` checks each type) but are unused.

---

## 300. Card Types

### 301. Lands
- **Lands have no mana cost.** They are played, not cast.
- A player may **play one land per turn**, only during their own main phase, only while the stack is empty.
- Playing a land puts it directly onto the battlefield. It does not go on the stack and cannot be responded to.
- Every land has an intrinsic activated ability: `{T}: Add one mana of color C` for each color in its `mana_produced` list. This ability is auto-constructed; do not declare it on the template.
- Lands are not affected by summoning sickness in any way that matters today — they have no power/toughness and cannot attack.

### 302. Creatures
- Creatures are permanents (they stay on the battlefield after resolving).
- Each has a power and toughness.
- A creature can attack and block, subject to combat rules ([800](#800-combat)) and its keywords ([900](#900-keywords)).
- **Summoning sickness**: a creature cannot attack or use abilities with `{T}` in the cost the turn it enters the battlefield under your control, unless it has [haste](#9011-haste). It loses summoning sickness during its controller's next untap step.

### 303. Instants
- Castable at any time the caster has priority, **except** during the active player's untap, draw, combat-damage, and cleanup phases (where priority does not open).
- After resolving, an instant goes to its owner's graveyard.

### 304. Sorceries
- Castable only by the active player, only during their main phase, only while the stack is empty.
- After resolving, a sorcery goes to its owner's graveyard.

### 305. Artifacts and enchantments
- Treated as permanents. Currently unused.

### Implementation status — Card Types
- 305 is reserved; no cards of these types exist.
- 301 mana abilities are auto-constructed from `mana_produced` — do NOT populate `activated_abilities` on a land template.

---

## 400. Zones

There are five zones per player plus one shared zone. All five per-player zones are private only for hand and library (see 100.7).

### 401. Library
- The player's deck, face-down.
- Ordered (top to bottom).
- Drawing takes from the top.
- Emptying the library is itself harmless; only **attempting to draw from an empty library** loses the game (see 100.6).

### 402. Hand
- The cards a player has drawn but not yet played or discarded.
- **Maximum hand size: 7.** Enforced in cleanup step ([514](#514-cleanup-step)).
- Hidden from the opponent.

### 403. Battlefield
- The shared field where permanents (lands, creatures, artifacts, enchantments) reside.
- Public.
- Each permanent on the battlefield is controlled by some player; control can differ from ownership (a permanent's "owner" is who started with it in their deck; "controller" is who currently makes decisions for it).

### 404. Graveyard
- A player's discard/dead-card pile.
- Public, ordered.
- Cards in the graveyard are not playable from the graveyard. *(Future cards may grant graveyard interactions.)*

### 405. Stack
- A shared zone holding spells and triggered abilities that have been cast/triggered but not yet resolved.
- LIFO (last in, first out).
- See [600](#600-priority-and-the-stack).

### 406. Exile
- A "removed from game" zone. Public, unordered.
- Currently no card moves cards to exile. *(Reserved for future cards.)*

### 407. Zone changes
A card on the battlefield that leaves the battlefield is a **new object** when it returns. Its instance id is preserved for ongoing tracking, but persistent runtime state (counters, granted keywords, marked damage) is cleared on leave-play.

### Implementation status — Zones
- 406 exile: zone exists in `Player` but no effects use it.
- 407: counters and granted keywords currently clear on leave-play; some `permaBuffs` in html-proto persist across leave-play for specific run-meta scenarios (Elystra-style). Godot port does not have permaBuffs yet.

---

## 500. Turn Structure

A turn consists of ten phases, in this order:

| # | Phase | Active player gets priority? | Turn-based actions |
|---|---|---|---|
| 501 | Untap | No | Untap all permanents the active player controls; clear summoning sickness on their creatures; reset `life_lost_this_turn` to 0 for both players. |
| 502 | Upkeep | Yes | None currently. *(Reserved for "at beginning of upkeep" triggers.)* |
| 503 | Draw | No | Active player draws a card. (First player skips this on turn 1, see 100.5.) |
| 504 | Main 1 | Yes | None. The active player may cast spells and activate abilities. |
| 505 | Combat: Declare Attackers | Yes | Active player declares attackers. |
| 506 | Combat: Declare Blockers | Yes (after blocks are declared) | Defending player declares blockers. Priority opens **after** block declarations are confirmed. |
| 507 | Combat: Damage | No | Combat damage is resolved (see [800](#800-combat)). |
| 508 | Main 2 | Yes | None. Same as 504. |
| 509 | End | Yes | None currently. *(Reserved for "at end of turn" triggers.)* |
| 510 | Cleanup | No | Active player discards down to 7 cards (see 514). EOT modifiers clear from creatures. |

After 510, phase wraps to 501 and the active player swaps.

### 511. Untap step (501)
- Tap state cleared on all of the active player's permanents.
- All of the active player's creatures lose summoning sickness.
- Both players' `life_lost_this_turn` counters reset to 0.
- The active player does **not** get priority during untap.

### 512. Draw step (503)
- Active player draws one card from the top of their library.
- If their library is empty, they lose the game (see 100.6).
- The first player skips this step on the first turn of the game.

### 513. Combat damage step (507)
Combat damage is resolved in **up to two passes** — see [801](#801-combat-flow) for the sequence. Priority does not open during this step; damage is a single turn-based action.

### 514. Cleanup step (510)
1. **EOT modifier clearance.** Each creature on the battlefield clears its end-of-turn modifiers: `temp_power`, `temp_toughness`, and any `eot_grants` (granted keywords with EOT duration) drop to zero / empty.
2. **Discard to max hand size.** If the active player has more than 7 cards in hand, they choose cards to discard until they have 7.
3. **Attacker/blocker state clear.** Combat-state arrays (`attackers`, `blockers`) are cleared so they don't leak into the next turn.

Priority does not open during cleanup. Discard is a turn-based action; no spells or abilities can be cast in response to it.

### Implementation status — Turn Structure
- 502 (upkeep) is a real phase but currently no triggers fire there. The phase exists for future "at beginning of upkeep" triggers.
- 509 (end step) similarly placeholder.
- **No Beginning-of-Combat step**: MTG has a separate step where "at beginning of combat" triggers fire. Our game does not — combat starts directly with declare attackers. If such triggers become useful, a phase needs to be inserted between Main 1 and Declare Attackers.
- 513 first-strike sequencing: see [801](#801-combat-flow) for the current Godot implementation's two-pass scheme.

---

## 600. Priority and the Stack

### 601. The stack
A LIFO list of spells and triggered abilities waiting to resolve. Resolves top-down.

### 602. When priority opens
At each phase that opens a priority window (see [500](#500-turn-structure) table), priority opens **with the active player**. After both players pass priority in succession with the stack empty, the phase ends.

### 603. Priority-passing rules
- A player with priority may take a legal action (cast a spell, activate an ability, declare an attacker/blocker if the phase allows) or pass priority.
- After a player takes an action, **that player retains priority** (MTG rule 117.1c). The cycle of "I act → I retain priority → I act again → I pass" is normal.
- After priority is passed, it goes to the other player.
- When **both players pass in succession**:
  - If the stack is non-empty, the **top object of the stack resolves**. Then priority opens again with the active player.
  - If the stack is empty, the phase ends.

### 604. Mana pool emptying
Mana pools empty **at the end of every phase and step**. Players cannot float mana across phase boundaries. (MTG rule 106.4.)

### 605. Priority is closed during
- Untap step (501).
- Draw step (503).
- Combat damage step (507).
- Cleanup step (510).
- The block-declaration turn-based action inside step 506 (until blocks are confirmed).
- The discard turn-based action inside step 510 (until satisfied).

During these windows, **no spells or abilities can be cast or activated**. (Triggered abilities can still trigger and queue, but they don't drain until priority next opens.)

### 606. Implementation: auto-pass
For the AI driver and for unattended priority windows, the engine auto-issues `pass_priority` actions. This is agent UX, not a rules cheat — the priority pass IS happening, the AI is just calling it automatically. The human player passes priority via UI (currently Space/Enter keybind on the Godot side).

### Implementation status — Priority
- The "stop on cast / stop on draw / stop on attack" MTGO-style explicit-priority-hold UI is not implemented (see `docs/BACKLOG.md`).
- A "hold priority for follow-up instant" UI is not implemented.

---

## 700. Casting and Activating

### 701. Playing a land
- Active player only, main phase only, stack empty only.
- Maximum **one per turn**.
- Goes directly to the battlefield. Does not use the stack.

### 702. Casting a spell
The caster must have priority. The sequence is:

1. **Announce the spell**: choose the card to cast.
2. **Choose targets**, if the spell requires them. All chosen targets must be **legal** at the time of casting (see [703](#703-target-legality)). If no legal targets exist, the spell cannot be cast.
3. **Pay the cost**: tap lands and use mana abilities to produce the required mana. Mana abilities (lands tapping for mana) do not use the stack — they pay immediately.
4. **Push onto stack**: the spell enters the stack as a stack entry. The card is moved out of the hand into a stack-zone buffer.
5. **Caster retains priority** for any follow-up actions.

### 703. Target legality
- A target is **legal** if it matches the spell's `target_filter`:
  - `any` — any creature or player.
  - `creature` — any creature.
  - `player` — either player.
  - `opp_creature` — only the opponent's creatures.
  - `your_creature` — only your creatures.
  - `spell` — any spell on the stack (used by counterspell).
- **Hexproof** (see [904](#904-hexproof)) blocks targeting by the opponent's spells and abilities. A player with hexproof's creature cannot be the target of opponent spells; the same player CAN target their own hexproof creatures.

### 704. Spell resolution
When a spell's stack entry reaches the top and both players have passed priority:
1. **Re-check legality of targets.** If all targets are illegal (left play, became hexproof, etc.), the spell **fizzles** — it goes to graveyard without effect.
2. Resolve each of the spell's `on_cast_effects` in order. Effects with `target: "chosen"` reference the locked-in target chosen at cast time.
3. Move the card from the stack-zone buffer to its owner's graveyard (instants/sorceries) or battlefield (creatures and other permanents).

### 705. Activated abilities
- An activated ability has a cost and an effect.
- The currently-implemented cost components are `tap` (`{T}`) and `mana`.
- Activated abilities go on the stack the same as spells, except: **mana abilities** (abilities that produce mana and have no targets) resolve immediately without using the stack. This is the only fast-path.
- The owner must have priority to activate, except mana abilities (which can be activated any time mana could be paid, even mid-cost-payment).

### 706. Counterspell
A spell with the `counter_spell` effect targets another spell on the stack. When it resolves:
- If the target spell is still on the stack: remove it, send the card to its owner's graveyard (countered spells **never go to the battlefield**, even creatures).
- If the target is gone: the counterspell fizzles cleanly.

Triggered abilities cannot be countered by `counter_spell` (no Stifle equivalent in the pool).

### Implementation status — Casting and Activating
- 702.2 target choice currently happens at cast time and is locked in. There is no "choose target on resolution" pattern.
- 705 mana ability fast-path: lands' tap-for-mana skips the stack and pays immediately. Other mana abilities (e.g., creatures that tap for mana) would use the same path.

---

## 800. Combat

### 801. Combat flow
The combat phase consists of three steps in order: Declare Attackers (505), Declare Blockers (506), Combat Damage (507).

1. **Step 505 — Declare Attackers** opens with the active player having priority. The active player declares which of their creatures are attacking by tapping each (unless [vigilance](#9012-vigilance)). Declared attackers are added to `state.attackers`. The active player can undo declarations before passing priority. When the active player passes, priority goes to the defender for instant-speed response. When both players pass with the stack empty, the step ends.
2. **Step 506 — Declare Blockers** is entered with **block declaration as a turn-based action** that happens **before priority opens** (MTG 509.1a). The defending player assigns each of their untapped creatures to block exactly one of the attackers (subject to legality — see [802](#802-blocking-legality)). After the defending player confirms blocks (`confirm_blocks` action), priority opens with the active player.
3. **Step 507 — Combat Damage** is a turn-based action with no priority window. See [803](#803-combat-damage-resolution).

### 802. Blocking legality
A blocker assignment is legal if:
- The blocker is untapped.
- The blocker has not been declared as another block.
- The attacker does **not** have [unblockable](#9013-unblockable).
- The attacker does not have [flying](#9014-flying) (or, if it does, the blocker also has flying or [reach](#9015-reach)).
- If the attacker has [menace](#9016-menace), the defending player must assign **at least 2 blockers** to it (or it remains unblocked). A single blocker assigned to a menace creature is collapsed back to unblocked at the start of combat damage resolution.

### 803. Combat damage resolution
Combat damage is resolved in **up to two passes**:

1. **Pass 1 — First-Strike pass**: skipped entirely if no attacker or blocker in this combat has [first strike](#9017-first-strike). Otherwise, every attacker and blocker that has first strike assigns and deals damage. State-based actions sweep (creatures die). Death triggers drain. Win conditions checked.
2. **Pass 2 — Normal pass**: every attacker and blocker that did NOT have first strike (and any first-strike creatures that survived pass 1, which contribute no further damage in our current implementation — see Implementation status) assigns and deals damage. State-based actions sweep again. Death triggers drain.

Within each pass, each attacker assigns damage as follows:

- **Unblocked attacker**: assigns its full power as damage to the defending player.
- **Blocked attacker**: assigns its damage across all assigned blockers in order, applying enough damage to be lethal to each blocker before moving on to the next.
- **Trample**: if the attacker has [trample](#9018-trample), excess damage beyond what was assigned to blockers spills to the defending player. With trample, the attacker need only assign each blocker's *remaining toughness* worth of damage (not more) before considering the blocker satisfied; if deathtouch is also present, "enough to be lethal" drops to 1 damage per blocker.

Each blocker assigns its full power to the attacker it is blocking.

When a creature is dealt damage by a source with [deathtouch](#9019-deathtouch), that creature is **marked as lethal** for the next state-based-action sweep regardless of damage amount. With deathtouch, the "lethal damage" threshold for damage-assignment purposes drops to 1.

When a creature deals damage and its source has [lifelink](#9020-lifelink), the source's controller gains life equal to the damage dealt.

[Indestructible](#9021-indestructible) creatures do not die from damage (lethal-marked or otherwise). They die only when their toughness becomes 0 or less.

### Implementation status — Combat
- **Multi-blocker damage assignment** is currently split between the two implementations and the divergence is gameplay-affecting. See `docs/DIVERGENCE.md` items C1, C2, C3 for details. Briefly: html-proto matches the canonical rule above (smart distribution, deathtouch reduces threshold to 1). Godot **dumps all attacker damage on the first assigned blocker** — three 1/1 chumps blocking a 5/5 result in 1 death (Godot) vs. 3 deaths (proto). Harmonization to Godot is on the to-do list.
- **First-strike interaction with double-strike**: double-strike is not implemented in either. A first-strike creature surviving pass 1 contributes no damage in pass 2.
- **Damage assignment by attacker**: in MTG the attacker chooses the blocker order at declare-blockers step (508.6). Currently the order is fixed at block declaration time (the order the defender declared them in) in both implementations.

---

## 900. Keywords

This section defines each keyword's effect. A creature can have multiple keywords; their effects are independent unless noted.

### 901. Static combat keywords

#### 901.1 Haste
A creature with haste **ignores summoning sickness**. It can attack and use `{T}` abilities the turn it enters the battlefield under your control.

#### 901.2 Vigilance
A creature with vigilance **does not tap when it attacks**. It remains untapped after combat and can be tapped for other purposes.

#### 901.3 Unblockable
A creature with unblockable **cannot be blocked**. Block declarations targeting it are illegal.

#### 901.4 Flying
A creature with flying **can only be blocked by creatures with flying or reach**. It can block any creature (flying or not).

#### 901.5 Reach
A creature with reach **can block creatures with flying**. It is otherwise an ordinary blocker.

#### 901.6 Menace
A creature with menace **cannot be blocked except by two or more creatures**. A single-blocker assignment against a menace attacker is illegal; if a defender declares only one blocker against a menace attacker, the attacker is treated as unblocked at damage resolution.

#### 901.7 Defender
A creature with defender **cannot attack**. It can block normally.

### 902. Damage-step keywords

#### 902.1 First Strike
A creature with first strike **deals its combat damage in a separate, earlier pass** (pass 1). It does not take damage from non-first-strike attackers or blockers until pass 2. Lethal damage from pass 1 kills creatures before pass 2; first-strike creatures often emerge unscathed if they kill their target in pass 1.

#### 902.2 Trample
When a creature with trample attacks and is blocked, damage in excess of the blocker's remaining toughness **spills over to the defending player**. The attacker need only assign enough damage to be lethal to the blocker before assigning the rest.

#### 902.3 Deathtouch
Any amount of damage (including 0+1 damage, but in practice >0 damage) dealt by a source with deathtouch to a creature is considered **lethal**. The creature is destroyed in the next state-based-action sweep.

#### 902.4 Lifelink
When a source with lifelink deals damage, **its controller gains that much life**. Lifelink fires on combat damage and on damage from spells/abilities equally.

### 903. Permanent-status keywords

#### 903.1 Indestructible
A creature with indestructible **is not destroyed by lethal damage**. The lethal-damage and lethal-marked checks in SBAs ([1100](#1100-state-based-actions)) ignore it. It can still be removed by:
- 0 or less toughness (e.g., if `current_toughness()` drops to 0 from a debuff).
- An effect that explicitly says "destroy" with the rider "regardless of indestructible" *(no such effect exists today)*.
- An effect that exiles the creature *(no such effect exists today)*.
- Sacrifice *(no sacrifice effects today)*.

### 904. Hexproof
A creature with hexproof **cannot be targeted by spells or abilities the opponent controls**. The controller can still target their own hexproof creature.

This is a targeting restriction enforced at cast/activation time. Hexproof does **not** prevent damage from already-resolved effects or combat.

### 905. Granted keywords
Keywords can be **granted at runtime** to a creature that doesn't have them on its template (e.g., a pump spell granting flying until end of turn, or a sticker granting unblockable). Granted keywords behave identically to printed keywords. Granted keywords with an EOT duration clear during cleanup ([514](#514-cleanup-step)).

### Implementation status — Keywords
- All keywords in 901–904 are implemented in both Godot and html-proto.
- Double strike, banding, regeneration, shroud, ward, protection: not implemented.
- 905 granted keywords: implemented. Stickers (see [1300](#1300-stickers)) are the primary user.

---

## 1000. Triggered Abilities

### 1001. Definition
A triggered ability is an ability declared on a card's template that fires in response to an **event** in the game, optionally gated by a **condition**.

```
"event": "card_etb",
"condition_predicate": "opp_lost_life_this_turn",
"effects": [ ... ],
"self_only": true,           # the trigger only fires from the source card's own events
"target_filter": "creature_or_player"   # if effects use target: "chosen"
```

### 1002. Event vocabulary
The current event vocabulary is:
- `card_etb` — a card enters the battlefield.
- `card_dies` — a creature on the battlefield moves to the graveyard.

The engine can emit other event kinds, but no current card listens for them. Planned events for future cards include `card_attacks`, `spell_cast`, `card_drawn`, `damage_dealt`, `life_gained`.

### 1003. Self-only vs. global listeners
- `self_only: true` (the default in practice) — the trigger fires only when the **source card itself** is the event subject. Example: Pyromaniac's ETB trigger fires when Pyromaniac enters, not when any other card enters.
- `self_only: false` — the trigger fires for any matching event. Example: a hypothetical "When another creature enters, draw a card" trigger.

### 1004. Trigger timing — queue and drain
- When an event fires, the engine scans all listeners (every card on the battlefield, plus the event subject if it just left the battlefield). For each listener with a matching event, condition, and self-only check, a **trigger entry** is queued onto `state.pending_triggers`.
- Triggers are queued, **not** placed on the stack immediately.
- The next time priority is about to open, the engine **drains pending triggers**: each trigger is moved from the queue to the stack, in **APNAP order** (Active Player triggers first by queue order, then Non-Active Player triggers; on the stack, NAP triggers end up on top, so they resolve first under LIFO).
- After the drain completes, priority opens with the active player. Players can respond to the stacked triggers normally.

### 1005. Target selection on triggers
- If a trigger's effects use `target: "chosen"`, the trigger pauses at drain time and prompts the **controller of the trigger** to pick a target.
- The engine sets `state.awaiting_target_for_trigger`. Drain does not continue until the controller submits a `pick_trigger_target` action with a target matching `target_filter`.
- After the pick, the trigger continues drain and resolution.

### 1006. Trigger resolution
When a trigger's stack entry reaches the top:
1. Re-validate targets (same fizzle behavior as spells, see [704.1](#704-spell-resolution)).
2. Resolve each effect in order.
3. The trigger leaves the stack. It does NOT go to a graveyard (triggers aren't cards).

### 1007. Intervening "if" re-check
*(MTG rule 603.4: "if" clauses in triggers are re-checked on resolution.)*
Currently, the engine **only checks `condition_predicate` at queue time**, not at resolution. If a trigger's condition becomes false between queue and resolution, the trigger still resolves. Listed in `docs/BACKLOG.md` as a known deviation.

### 1008. Trigger chain depth
There is no engine-imposed cap on trigger-chain depth. The html-proto has a safety net of 100 (historical); the Godot port does not (intentionally — if drain logic is correct, no net is needed).

### Implementation status — Triggered Abilities
- 1007 intervening-if: not implemented (known deviation).
- 1003 `self_only: false`: code path exists but no current card uses it; not exercised by tests.
- 1002: future events will require new emission sites in the engine and new card templates.

---

## 1100. State-Based Actions

State-based actions (SBAs) are checks the engine performs **automatically** whenever a player would gain priority. They are the engine's housekeeping for "things that just happen."

### 1101. SBA contents
On every sweep, the engine checks:
- **Creature death**: any creature with damage marked equal to or greater than its current toughness, or toughness ≤ 0, or `lethal_marked = true` (from deathtouch) is moved to its owner's graveyard. **Indestructible creatures are exempt from the lethal/lethal-marked checks** but still die at 0 toughness.
- **Life loss**: a player at 0 or less life loses the game (see 100.6).
- **Decking out**: handled in the draw step (not strictly an SBA in our implementation — see 512).

### 1102. SBA sweep order
A sweep is a single pass: identify all SBA-affected objects, then apply them simultaneously. After applying, the sweep **repeats** until no further changes occur (in case a death triggers another death via chain effects).

A safety counter caps the sweep at 20 iterations to prevent runaway loops. This cap is a safety net for correctness bugs; under correct rules it should never be hit.

### 1103. When SBAs run
SBAs sweep:
- Whenever a player would gain priority.
- After each pass of combat damage resolution.
- Implicitly after spell/ability resolution.

### 1104. Compared to MTG
MTG specifies SBA contents in rule 704.5 with strict ordering. Our SBA sweep is **simpler**:
- We don't strictly order the checks within a sweep — we collect all affected objects and apply them in one pass.
- We don't check token-not-on-battlefield (no tokens in Godot port yet; html-proto handles tokens vanishing on leave-play).
- We don't check aura/equipment attachment validity (no auras/equipment yet).
- We don't check legendary uniqueness (no legendaries yet).

### Implementation status — SBAs
- 1104 deviations from MTG 704.5: documented.
- 1101 zero-toughness check: implemented.

---

## 1200. Ending the Game

### 1201. Game-over triggers
The game ends immediately when a player loses. The losing condition is detected via SBAs ([1101](#1101-sba-contents)) or via the draw-from-empty-library check ([512](#512-draw-step-503)).

### 1202. Effects after game end
Once `state.winner` is non-empty, the engine **does not process further actions or triggers**. Stacked spells and queued triggers are abandoned. The `game_over` signal fires once.

### 1203. Restart and rematch
A finished game does not transition automatically. The roguelike meta layer ([1500](#1500-the-run-roguelike-meta)) handles game-to-game progression in the html-proto. The Godot port does not yet implement game-to-game transitions.

---

# Meta-Game Rules

The following sections describe systems that operate **between** games, persisting across a run. They are implemented in the html-proto and planned for Phases 7–9 of the Godot port.

---

## 1300. Stickers

### 1301. Purpose
A sticker is a per-instance modifier attached to a deck slot that persists across games within a run. Stickers are the primary reward currency.

### 1302. Sticker types
- **Keyword sticker** — grants a keyword (e.g., `flying`, `lifelink`) to the creature in the slot.
- **Stat sticker** — grants a stat increase (e.g., +1/+1 permanently).
- **Empower sticker** — increases an effect's magnitude (e.g., Lightning Bolt deals 4 instead of 3). Requires a target effect on the card; rolled at sticker application time.
- **Subtype sticker** — grants an additional subtype (e.g., "+Wizard"). Rolled at application time.

### 1303. Legality
Each sticker type has eligibility rules:
- Keyword stickers require a creature.
- Stat stickers require a creature.
- Empower stickers require the card to have at least one empowerable effect (damage, draw, pump, etc.).
- Lifelink keyword stickers require a damage-dealing source.

### 1304. Stacking and limits
- Multiple stickers can stack on a single slot.
- Some sticker types are non-stackable on the same slot (the same keyword cannot apply twice).
- A creature's effective keywords are the union of its template keywords plus all granted keywords plus all sticker-granted keywords.

### 1305. Persistence
- Stickers are tied to the **deck slot**, not the card instance in play. If the same template appears in multiple slots, only the stickered slot benefits.
- Stickers persist across all games within a run; they are lost when the run ends.

### Implementation status — Stickers
- Fully implemented in html-proto.
- Not yet implemented in Godot port. Planned for Phase 7.
- The seam in `CardInstance.effective_keywords()` is reserved to union template + grants + sticker contributions.

---

## 1400. Draft

### 1401. Pack structure
- The deck is built by drafting **23 cards over 23 picks** (one card per pack).
- Each pack contains **3 cards**.
- Pack cards are sampled from a pool consisting of all non-special card templates.

### 1402. Pack rolling
- Each pack slot rolls a color, then a card of that color from the pool.
- **In-deck colors are weighted higher** (rescue against color screw).
- **Off-deck colors drop from the pool** after the first appearance of a different color choice.
- Cards have an optional `draftWeight` field; default 1.0; 0 excludes from packs.

### 1403. Player pick
- The player sees 3 cards per pack and picks one.
- The two unpicked cards are discarded (no pack-passing in single-player draft).

### 1404. Opponent deck
- Built at the end of the player's draft.
- Two modes:
  - **Heuristic draft sim**: the AI drafts 23 cards using the same pack-rolling and scoring system.
  - **Constructed archetype**: a hand-curated deck list (Goblin Aggro, Spirit Tribal, Aristocrats, Archdemon Boss, Balancer Boss). Used for special map nodes.

### 1405. Lands
- After draft, lands are auto-allocated to fill the deck to 40 cards.
- Land color distribution matches the deck's color distribution (~17 lands typical).

### Implementation status — Draft
- Fully implemented in html-proto.
- Not yet implemented in Godot port. Planned for Phase 8.

---

## 1500. The Run (Roguelike Meta)

### 1501. Structure
A **run** is a sequence of games against successively more difficult opponents. The player drafts a deck once at the start; the deck (and its stickers) persists across all games in the run.

### 1502. The map
- A branching DAG of nodes, Slay-the-Spire style.
- Depth 5, width 3. One root, one exit; mid-nodes branch.
- Mid-nodes are either **colored** (the opponent's deck is drafted with that color affinity) or **colorless** (random colors).
- The exit node is a **boss**: a constructed archetype.

### 1503. Per-game opponent scaling
- Each game N adds `N - 1` stickers to the opponent's deck.
- Opponent decks may also gain spliced cards (`stapledTpls`), cloned slots, or both, scaling with depth.

### 1504. Rewards
After winning a game, the player picks one of up to three reward offers. Reward types (weighted):
- **Sticker** (weight 12) — apply a sticker to a slot in the deck.
- **TwoStickers** (3) — apply two stickers (often to one slot for a polarized threat).
- **Transform** (2) — replace a slot with a draft pack of 3 cards, pick one.
- **Clone** (2) — duplicate the highest-value non-land slot.
- **Splice** (2) — combine two slots into a single multi-effect card.
- **RipUp** (1) — remove a slot from the deck.
- **ThreeStickersBlind** (1) — apply three random stickers to a random creature slot (mystery offer).

### 1505. Run-start modifiers (Neow-style)
At the start of a run, the player may choose a **modifier** (e.g., City of Brass adds a free mana source, Watcher's Gift attaches a bonus trigger to a chosen creature). Modifiers can append extra slots or mutate existing slots.

### 1506. Persistence and crash recovery
- Run state persists in browser `localStorage` (`magiclike_run_v1` key) in the html-proto.
- The Godot port will use `user://magiclike_run_v1.json` via Godot's `FileAccess` (planned for Phase 9).
- At the start of each new game in the run, a **midGameSlotsSnapshot** is taken. If the player quits mid-game and reloads, slots are restored from the snapshot — this prevents reward-farming by quit-on-loss.

### Implementation status — Run
- Fully implemented in html-proto (save schema version 2, migrations for v1→v2 tplId renames).
- Not yet implemented in Godot port. Planned for Phase 9.

---

# Appendices

## A1. Glossary

- **Active player (AP)** — the player whose turn it is.
- **Non-active player (NAP)** — the other player.
- **APNAP order** — Active Player's effects queued/declared first, then Non-Active Player's. On the stack, this means NAP's effects end up on top (resolve first under LIFO).
- **Card** — a template definition. Distinct from an instance.
- **Instance** — a runtime copy of a card with its own state (tapped, damaged, etc.).
- **SBA** — state-based action. See [1100](#1100-state-based-actions).
- **Stack** — see [601](#601-the-stack).
- **Permanent** — a card on the battlefield (land, creature, artifact, enchantment).
- **Source** — the card whose ability or effect is causing something to happen.
- **Controller** — the player making decisions for a permanent. Usually the same as the owner; can differ via "steal" effects.
- **Owner** — the player who started with the card in their deck.

## A2. Authoritative behaviors checklist

When you (the user) want to confirm "is the implementation doing what I expect," use this:

- [ ] Combat damage with first-strike attacker vs. non-first-strike blocker: blocker dies in pass 1, attacker survives pass 2. ([802](#802-blocking-legality), [902.1](#9021-first-strike))
- [ ] Trample with chump blocker: full power minus blocker's toughness spills to face. ([902.2](#9022-trample))
- [ ] Deathtouch hitting a large blocker: blocker dies even with 1 damage. ([902.3](#9023-deathtouch))
- [ ] Lifelink in combat: controller gains life equal to damage dealt. ([902.4](#9024-lifelink))
- [ ] Hexproof on opp's creature: your spells can't target it. ([904](#904-hexproof))
- [ ] Indestructible creature with 10 marked damage: survives. ([903.1](#9031-indestructible))
- [ ] Triggers fire in APNAP order. ([1004](#1004-trigger-timing--queue-and-drain))
- [ ] Countered spell goes to graveyard, never battlefield. ([706](#706-counterspell))
- [ ] Counterspell with no legal target fizzles (does not get countered itself). ([704](#704-spell-resolution))
- [ ] Empty library draw = loss. ([100.6](#1006-win-and-loss-conditions), [512](#512-draw-step-503))
- [ ] Mana pool empties at phase end. ([604](#604-mana-pool-emptying))
- [ ] Land per turn limit: 1, active player only, main phase only. ([701](#701-playing-a-land))

## A3. Known deviations from the canonical rules
Rolling list of places where the implementation knowingly diverges from this document. For the full Godot↔proto comparison, see [`docs/DIVERGENCE.md`](DIVERGENCE.md).

- **Godot multi-blocker damage assignment** dumps all damage on the first blocker (proto matches the canonical rule). See DIVERGENCE C1.
- **No first-player draw-skip in Godot** (proto implements it). See DIVERGENCE A2.
- **Proto only clears mana at CLEANUP**, not at every phase boundary (Godot matches the canonical rule). See DIVERGENCE B2.
- [1007](#1007-intervening-if-re-check): "intervening if" not re-checked on resolution (both implementations).
- [502](#500-turn-structure) Upkeep step: phase exists in Godot but no triggers fire there yet; proto does not implement upkeep at all.
- [509](#500-turn-structure) End step: phase exists but no triggers fire there yet (both).
- No Beginning-of-Combat step — combat starts directly with declare attackers (both).
- [1102](#1102-sba-sweep-order): SBA ordering is single-pass collect-and-apply, not the strict per-rule order from MTG 704.5 (both).
- No exile-zone effects today (both).
- No tokens in Godot port (html-proto has tokens).
- No delayed triggers or temporary control revert in Godot port (proto has both).
