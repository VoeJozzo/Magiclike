# Refactor Plan: Unified Effects Registry — Audit, Decompose, and Align

**Status:** Plan complete, ready for review. Not yet executed.
**Pre-execution note:** The structural design for `rip` is resolved (compositional approach: `[force_sacrifice, rip(previous_target)]`; see §4 and §13). One remaining open question — trigger semantics (annihilation vs sacrifice) — is deferred to either a card-pool change that surfaces it or a deliberate retrofit decision. The plan is implementable as written.
**Cross-references:** `docs/DIVERGENCE.md` items D1 (target target-state semantics — see §3.6), D2 (`pump` duration → `addCounter`), D3 (`gain_life` flexibility), D4 (`gain_life` signed delta), B4 (delayed-trigger machinery — required for `exile_until_eot` decomposition), C5 (killer attribution — adjacent), E1/E2 (event vocabulary + composable predicates, prerequisite for the `move_card` effect's destination semantics). `docs/RULES.md` §703 (target legality), §704 (resolution + fizzle), §904 (hexproof). `docs/SPEC.md` §1.4 (effect descriptor schema).
**Effort estimate:** **L** (~4.5–5.5 days end-to-end across both engines, ~64–69 hours, including card migration, tests, splice helper extraction, and registry consolidation; this is the largest of the three planned refactors because it touches all 258 proto cards, all 32 Godot templates, and rewrites the dispatch table itself).

Produced by an Explore/Plan pass against `reference/html-proto/js/engine.js` (EFFECTS table at line 1366, 38 handlers below it), `engine/effects/*.gd` (Godot's 5 handlers), `data/card_resource.gd`, and all 32 Godot templates plus 258 proto card JSONs. The goal is to land the long-term effects design (a small registry of atomic effects, parameterized target filters, decomposed compounds) before Phase 6 card-pool expansion makes mechanical migration expensive.

This refactor is sequenced **after** `plan-zone-change-and-composable-predicates.md` (E1/E2) and **after** B4 (delayed-trigger machinery) for the `exile_until_eot` decomposition. See §9.

---

## 1. Current effect-kind audit

### Godot — 5 effect kinds

| Name | Source | One-line semantics | Target shape | Params |
|---|---|---|---|---|
| `damage` | `engine/effects/damage.gd` | Deal N damage to a creature OR player. | `chosen` (`ctx.targets[0]` = creature\|player) or constant `controller`\|`opponent`. | `amount: int, target: String` |
| `add_mana` | `engine/effects/add_mana.gd` | Add to `ctx.controller.mana`. | None (always controller). | `amounts: Dict` OR flat `R:1` shorthand |
| `pump` | `engine/effects/pump.gd` | Boost creature P/T; `duration="eot"` → temp, else +1/+1 counters. | `chosen` (must be creature). | `amount_power, amount_toughness, duration, target` |
| `gain_life` | `engine/effects/gain_life.gd` | Add life to controller; refuses non-positive. | None (always controller). | `amount: int` |
| `counter_spell` | `engine/effects/counter_spell.gd` | Remove a stack entry via `RulesEngine.counter_stack_entry`. | `chosen` (must be `kind:"stack"`). | `target: "chosen"` (constant) |

### Proto — 38 effect kinds (37 distinct names, 1 silent duplicate)

Lines are within `reference/html-proto/js/engine.js`.

| # | Name | Line | One-line semantics | Target shape | Params |
|---|---|---|---|---|---|
| 1 | `damage` | 1367 | Deal N to one target (creature, player, or "any"). | `target` (any) | `amount` |
| 2 | `pump` | 1370 | +P/+T temp (EOT). | `creature` | `power, toughness` |
| 3 | `weaken` | 1378 | −P/−T temp (EOT). | `creature` | `power, toughness` |
| 4 | `addCounter` | 1386 | Permanent +1/+1 counters (permPower / permTou). | `creature` or `self` | `power, toughness` |
| 5 | `endomorphAbsorb` | 1401 | Card-specific: steal a kw from killed victim, else +1/+1 sticker. | `self` | — |
| 6 | `removeCreature` | 1476 | Severity ladder: 1=tap, 2=bounce, 3=destroy, 4=exile. | `creature` (single) | `severity` |
| 7 | `destroyAndStickerSlot` | 1534 | Destroy + apply slot sticker (Scarification). | `creature` | `stickerId` |
| 8 | `symmetricize` | 1565 | Opens player-choice prompt; sets P=T=cost. | `creature` | — |
| 9 | `embargo` | 1590 | Bounce + slot.extraCost++. | `creature` | — |
| 10 | `bleach` | 1621 | Exile + slot.colorOverride='C'. | `creature` | — |
| 11 | `bargainStickerSelf` | 1650 | Archdemon ETB: number prompt 1-5 stashed for later. | none | — |
| 12 | `bargainStickerOther` | 1664 | Archdemon LTB: spend stashed number on opp permanents. | none | — |
| 13 | `shuffleIntoLibrary` | 1672 | Move bf creature → owner's library, shuffle. | `creature` | — |
| 14 | `steal` | 1692 | Counter-or-take + permanent run-slot transfer. | `permanentOrSpell` | — |
| 15 | `returnFromGraveyard` | 1765 | Move card grave→hand. | `creature in own graveyard` | — |
| 16 | `counter` | 1777 | Remove non-trigger stack entry → graveyard. | `stack` | — |
| 17 | `addMana` | 1787 | Add to controller's mana pool. | none | `amounts: Dict` |
| 18 | `gainLife` | 1792 | Add life (with `params.who` or target). | optional `player` | `amount, who?` |
| 19 | `draw` | 1804 | Draw N. | none | `amount` |
| 20 | `discard` | 1808 | Discard N (player-routed; controller default). | optional `player` | `amount` |
| 21 | `searchLandTapped` | 1832 | Search library for a land, ETB tapped. | none | — |
| 22 | `searchCreature` | 1843 | Tutor a creature into hand. | none | — |
| 23 | `restrict` | 1866 | `cantAttack` and/or `cantBlock` flags (per-source set). | `creature` | `cantAttack, cantBlock` |
| 24 | `grantKeyword` | 1888 | Grant kw to one creature OR mass (`whose: allYours|all`), EOT or permanent. | `creature` or mass | `keyword, whose, duration` |
| 25 | `createTokens` | 1926 | Mint N tokens of `tokenId`, ETB. | none | `tokenId, count, controller` |
| 26 | `edict` | 1959 | Opp sacrifices a creature (chooser auto for AI; UI placeholder for you). | none | — |
| 27 | `ripPermanent` | 1979 | Target player opens rip-select prompt; destroy + slot loss. | `player` | — |
| 28 | `sacrifice` | 2003 | Sacrifice the targeted creature (typically `target: self`). UNUSED in card pool. | `creature` (`self`) | — |
| 29 | `damageAll` | 2016 | Pyroclasm — deal N to every creature. | none | `amount` |
| 30 | `removeAll` | 2042 | Mass removal: severity ladder with `whose: all|opp`. | none | `severity, whose` |
| 31 | `flicker` | 2098 | Pluck + re-ETB (new iid). Tokens cease. | `creature` | — |
| 32 | **`gainControl` (first)** | 2123 | **Dead code** — silently overridden by definition #34. | `creature` | `duration, haste, untap` |
| 33 | `exileUntilEOT` | 2154 | Exile via delayedTriggers; return at end-step. | `creature` | — |
| 34 | `gainControl` (second) | 2177 | The actually-running implementation. Threaten/Mind Control. | `creature` | `duration, grantHaste, untap` |
| 35 | `pumpAllYours` | 2203 | Mass +P/+T EOT to your creatures. | none | `power, toughness` |
| 36 | `fightTarget` | 2215 | Your biggest creature fights target. | `creature` | — |
| 37 | `untap` | 2233 | Untap target creature. | `creature` | — |
| 38 | `noop` | 2241 | Empty handler. Used as a target-slot placeholder (Stapler's second target). | `permanentOrSpell` | — |
| 39 | `applyInGameSplice` | 2246 | Stapler — merge two stack/perm targets into one slot via the splice infra. | `permanentOrSpell × 2` | — |

#### 1.1 Cross-engine matrix

| Name (proto) | Name (Godot) | Present in both? |
|---|---|---|
| `damage` | `damage` | Both |
| `addMana` | `add_mana` | Both |
| `pump` | `pump` | Both (Godot already merged `addCounter` via `duration`) |
| `gainLife` | `gain_life` | Both |
| `counter` | `counter_spell` | Both — note name divergence |

All 33 other proto kinds: proto-only. (The Godot side will gain everything below `gain_life` in the audit table when Phase 6 begins porting proto cards.)

#### 1.2 Footnotes on the audit

- **Duplicate `gainControl` (#32 / #34)**: real bug. JS object literals silently override. The first definition (line 2123) handles `params.haste` (string-additive), the second (line 2177) handles `params.grantHaste` (boolean → `applyGrant`). The two have subtly different semantics for the haste-grant path — the first puts the creature out of sickness manually, the second uses the proper grant infrastructure. Fixing this falls out of decision 11 (unify into `change_control`).
- **`noop` (#38) usage** is structural, not semantic — `cards/stapler/card.json` uses `kind: "noop"` to mark the second target slot of the activated ability so the target-validation system requires two targets. The handler body is `{}`. Decision 17 said "investigate; if unused, delete." Audit verdict: it IS used, but not as an effect — it's a target-slot marker. **Recommendation: replace `noop` with a structural property on the ability** (`target_slots: 2`) so the effect-kind registry doesn't have to carry an empty-body marker. Pure handler-side cleanup, no semantic change. Flagged as a step in §10.
- **`target_slots: N` generalization** — beyond Stapler, five other cards use multi-target patterns: `twinStrike`, `branchingBolt`, `drainLife`, `rootsAndBranches`, `swordAndSorcery`. They currently use ad-hoc `targetSlot` indexing per effect. The `target_slots: N` ability-schema field becomes the canonical declaration for ALL multi-target abilities, not just Stapler. Each effect in the array can declare `target_slot: 0` or `target_slot: 1` (etc.) to say which target it operates on. Replaces the `noop` Stapler hack AND unifies the ad-hoc indexing of the other 5 cards.
- **`sacrifice` (#28)** is defined but no card uses `kind: "sacrifice"` as an EFFECT (Carrion Feeder uses `sacrifice: "creature"` as a COST, which is a separate code path in the cost-payment logic). Decision 15 unifies it with `edict`. Audit confirms `sacrifice` is effectively dead — only the unified `force_sacrifice` lives in the new registry.
- **Splice duplicate-pathway**: confirmed at `js/engine.js:124` ("Splice merge math — shared by RUN.applySplice and ENGINE.EFFECTS.applyInGameSplice") and `js/run.js:865`. The two paths share `canonicalSplicePair`, `isSpliceableBase`, `isCompatibleStaplePair`, `remapEmpowerRollForStaple` helpers, but each has its own ~200-line body for slot mutation, slotIdx index fixups, and merged-data assembly. Decision 8 flagged this; §7 makes it an investigation sub-task.
- **`damageAll`'s hexproof note** at engine.js:2010-2014 already documents the correct rule ("Hexproof doesn't protect (this isn't a targeted effect)") and `edict` at engine.js:1957 has the matching note ("no targeting, so hexproof doesn't protect"). Decision 2's hexproof contract is already encoded in the proto behavior; this refactor is making it structural rather than per-kind tribal knowledge.
- **`createTokens` vs `flicker` ETB emit**: both emit `cardEntersBattlefield` for the produced/returning card. After the E1 refactor lands, both will emit `card_zone_change(anywhere→battlefield)` — the `move_card` effect inherits this for free.

### 1.3 Dead code / loose ends surfaced during audit

| Item | Where | Fate |
|---|---|---|
| Duplicate `gainControl` | engine.js:2123 (dead) | Deleted as part of decision 11. |
| `sacrifice` effect | engine.js:2003 (no card uses it) | Subsumed by `force_sacrifice` (decision 15). |
| `noop` as effect | engine.js:2241 (Stapler's slot marker) | Replaced by `target_slots: 2` on ability schema. |
| `pumpAllYours` distinct from `pump` | engine.js:2203 | Folded into `pump` with target_filter (decision 2). |
| `damageAll` distinct from `damage` | engine.js:2016 | Folded into `damage` with target_filter (decision 2). |
| `removeAll` distinct from `removeCreature` | engine.js:2042 | Folded into single removal effect with target_filter (decision 2). |
| `weaken` distinct from `pump` | engine.js:1378 | Folded into `pump` via signed delta (decision 3). |
| `addCounter` distinct from `pump` | engine.js:1386 | Folded into `pump` via `duration` (decision 4). |
| `flicker` + `exileUntilEOT` overlap | 2098 / 2154 | Both decompose into `move_card` + delayed-effect chain (decision 9). |
| `restrict` only sets boolean flags | engine.js:1866 | Replaced by `grant_keyword(defender)` + new hidden `no_block` kw (decision 13). |

---

## 2. Decision-by-decision mapping (the 18 fixed decisions)

Every fixed decision from the prompt, traced to its kinds.

| # | Decision | Affects | Outcome |
|---|---|---|---|
| 1 | snake_case | All 38 proto kinds | Renamed: `addMana`→`add_mana`, `gainLife`→`gain_life`, `addCounter`→`add_counter` (then collapsed), `removeCreature`→`remove_creature` (then renamed in #12), `damageAll`→ (collapses, no rename), `removeAll`→(collapses), `pumpAllYours`→(collapses), `endomorphAbsorb`→`endomorph_absorb`, `destroyAndStickerSlot`→`destroy_and_sticker_slot` (then decomposed), `shuffleIntoLibrary`→(collapses into `move_card`), `returnFromGraveyard`→(collapses), `searchLandTapped`→(collapses), `searchCreature`→(collapses), `fightTarget`→`fight_target`, `grantKeyword`→`grant_keyword`, `createTokens`→`create_tokens`, `ripPermanent`→`rip_permanent`, `exileUntilEOT`→(decomposes), `gainControl`→(unifies into `change_control`), `bargainStickerSelf`→`bargain_sticker_self`, `bargainStickerOther`→`bargain_sticker_other`, `applyInGameSplice`→`apply_in_game_splice`. |
| 2 | Target-filter unification | `damage`+`damageAll`, `removeCreature`+`removeAll`, `pump`+`pumpAllYours` | Three pairs collapse to three single effects with a `target_filter` parameter. Untargeted filter values (`all_creatures`, `all_yours`, `all_opps`) bypass hexproof structurally — see §3.5. |
| 3 | Signed `pump` | `pump`+`weaken` | Single `pump(power, toughness, ...)` accepts negative deltas. `weaken` deleted. |
| 4 | `add_counter` → `pump` | `pump`+`addCounter` | `pump` gains `duration` parameter (`eot`\|`permanent`). Godot's pump already had this; proto migrates. `add_counter` deleted. |
| 5 | `fight_target` stays | `fightTarget` | Kept as a primitive. Self-as-source-and-target structure (each fighter is both target and damage source) doesn't decompose into chained damage primitives without bespoke chaining machinery. |
| 6 | `bargain_sticker_*` stays | both `bargainSticker*` | Card-specific (Archdemon of Bargains) with unique player-input flow. Kept verbatim. |
| 7 | `embargo` / `bleach` / `symmetricize` → decompose Scarified-style (**REVISED** — was tentative `apply_sticker` collapse) | three sticker effects | **Sticker audit complete (§3.8).** Each decomposes into `[effect] → apply_sticker(specific_kind)`: `embargo` → `cost_mod(+1)`, `bleach` → `set_color('C')`, `symmetricize` → snapshot `stat_boost` + `cost_mod` (no new kind). `applyBalancerOverrides` deleted. `apply_sticker` stays as the generic primitive carrying whichever kind. Full design + empower/dedup/persistence cleanup in §3.8. |
| 8 | `apply_in_game_splice` duplicate hunt | `RUN.applySplice` + `EFFECTS.applyInGameSplice` | Sub-task in §7. Don't fully spec splice harmonization here. |
| 9 | `exile_until_eot` + `flicker` → `move_card` + delayed-effect | both | Both become `move_card(battlefield, exile, ...)` followed by a delayed `move_card(exile, battlefield)`. `flicker` is the synchronous variant (delay = "immediately"); `exile_until_eot` uses an actual delay until end step. **Depends on B4 (delayed-trigger machinery).** §9 sequences this. |
| 10 | Card-movement unification → `move_card` | `draw`, `discard`, `shuffle_into_library`, `return_from_graveyard`, `search_land_tapped`, `search_creature`, `flicker`, `exile_until_eot` | All collapse to `move_card(from_zone, to_zone, selector, amount, [post_action])`. The post_action open question is resolved in §4.1 → **bundle** them as parameters of `move_card`. |
| 11 | `gain_control` + `steal` → `change_control` | `gainControl` (both copies), `steal` | Unified into `change_control(target, duration, grant_haste, untap_on_take)`. `steal` is the variant that also flips ownership permanently (parameter: `transfer_ownership: bool`). The dead duplicate is dropped. |
| 12 | Rename `remove_creature` | `removeCreature` (single + mass via #2) | **Recommendation: `affect_creature(severity)`** with severity values `tap, bounce, destroy, exile`. "Affect" rather than "act_on" because the latter is too generic for code-search. Tap-as-severity-1 stays as a single effect — splitting tap out as its own kind would lose the empower-bump-severity mechanic that Codex/Mercurial rolls produce (e.g., a tap that escalates to bounce via empower). The "affect" name lets severity=tap read naturally without implying destruction. |
| 12b | Rename `ripPermanent` → `rip` | `ripPermanent` | Per-user-decision: drop the "Permanent" qualifier. Just `rip(target)`. **Behavior unchanged from current proto** — see §13 for why this is a kludge and what the final design should be. |
| 13 | `restrict` → `grant_keyword` | `restrict` | Deleted. `restrict(cantAttack: true)` → `grant_keyword(defender)`. `restrict(cantBlock: true)` → `grant_keyword(no_block)` where `no_block` is a new hidden internal keyword added to the keyword registry. `restrict(cantAttack: true, cantBlock: true)` → an array of two `grant_keyword` effects (the existing array-of-effects machinery handles compounds). |
| 14 | `untap` stays | `untap` | Kept as its own primitive. Not on the severity ladder (it's the inverse of tap, not part of removal). |
| 15 | `edict` + `sacrifice` → `force_sacrifice` | both | Unified. `force_sacrifice(player, count, filter)` where `player` is `controller`\|`opponent`. Existing `edict` is `force_sacrifice(opponent, 1, creature)`. Future "sacrifice X of your own" would be `force_sacrifice(controller, N, ...)`. `rip_permanent` is structurally similar but stays distinct because of the slot-loss permanence — see §3.4. |
| 16 | `endomorph_absorb` stays | `endomorphAbsorb` | Kept as-is. Card-specific complex mechanic. |
| 17 | `noop` | `noop` (Stapler's slot marker) | **Audit finding**: not unused. It's structural. Replaced by `target_slots: N` on the ability schema (see §1.2). `noop` effect kind deleted. |
| 18 | Compound decomposition | `destroy_and_sticker_slot` (1 card: Scarification) | Becomes `[affect_creature(severity:destroy), apply_sticker(scarified)]`. Audit found no other compounds masquerading as monolithic kinds — Wizard Adept's `[draw, discard]` pattern is already array-based. So #18 is small in scope: one card. |

---

## 3. Unification + decomposition table (per-kind disposition)

For each of the 38 proto kinds, what happens. Final column shows the new home; "kept" means stays as its own atomic.

| # | Old name | Disposition | New name / chain |
|---|---|---|---|
| 1 | `damage` | unified (#2) | `damage(amount, target_filter)` |
| 2 | `pump` | unified (#3, #4) | `pump(power, toughness, duration, target_filter)` |
| 3 | `weaken` | removed (#3) | → `pump` with negative deltas |
| 4 | `addCounter` | removed (#4) | → `pump` with `duration: permanent` |
| 5 | `endomorphAbsorb` | kept (#16) | `endomorph_absorb` |
| 6 | `removeCreature` | renamed + unified (#2, #12) | `affect_creature(severity, target_filter)` |
| 7 | `destroyAndStickerSlot` | decomposed (#18) | `[affect_creature(severity:destroy), apply_sticker(scarified)]` |
| 8 | `symmetricize` | decomposed (#7, §3.8) | `[stat_boost(snapshot Δ), cost_mod(snapshot Δ)]` via `apply_sticker` |
| 9 | `embargo` | decomposed (#7, §3.8) | `[move_card(battlefield, hand), apply_sticker(cost_mod, +1)]` |
| 10 | `bleach` | decomposed (#7, §3.8) | `[move_card(battlefield, exile), apply_sticker(set_color, 'C')]` |
| 11 | `bargainStickerSelf` | kept (#6) | `bargain_sticker_self` |
| 12 | `bargainStickerOther` | kept (#6) | `bargain_sticker_other` |
| 13 | `shuffleIntoLibrary` | unified (#10) | `move_card(battlefield, library, target, 1, {post: shuffle})` |
| 14 | `steal` | unified (#11) | `change_control(target, transfer_ownership:true)` |
| 15 | `returnFromGraveyard` | unified (#10) | `move_card(graveyard, hand, target_selector, 1)` |
| 16 | `counter` | renamed | `counter_spell(target_filter: spell)` — matches Godot's name |
| 17 | `addMana` | renamed | `add_mana(amounts)` |
| 18 | `gainLife` | renamed + flex (D3/D4) | `gain_life(amount, target)` — signed delta per D4, optional target per D3 |
| 19 | `draw` | unified (#10) | `move_card(library, hand, controller, N)` |
| 20 | `discard` | unified (#10) | `move_card(hand, graveyard, target_player_selector, N)` |
| 21 | `searchLandTapped` | unified (#10) | `move_card(library, battlefield, library_search(land), 1, {post: tap, shuffle})` |
| 22 | `searchCreature` | unified (#10) | `move_card(library, hand, library_search(creature), 1, {post: shuffle})` |
| 23 | `restrict` | removed (#13) | → `grant_keyword(defender)` and/or `grant_keyword(no_block)` |
| 24 | `grantKeyword` | renamed + unified (#2) | `grant_keyword(keyword, duration, target_filter)` |
| 25 | `createTokens` | renamed | `create_tokens(token_id, count, controller)` |
| 26 | `edict` | unified (#15) | `force_sacrifice(opponent, 1, creature)` |
| 27 | `ripPermanent` | renamed `rip(target)` | See §3.4 and §13. Engine action currently kludge (sacrifice + slot remove); pre-execution decision flagged. |
| 28 | `sacrifice` | unified (#15) | `force_sacrifice(controller, 1, target_or_self)` (no current card uses it) |
| 29 | `damageAll` | removed (#2) | → `damage(amount, target_filter: all_creatures)` |
| 30 | `removeAll` | removed (#2) | → `affect_creature(severity, target_filter: all_creatures \| all_opps)` |
| 31 | `flicker` | decomposed (#9) | `[move_card(battlefield, exile, target, 1), schedule_delayed(move_card(exile, battlefield), immediate)]` — but see §4.2 |
| 32 | `gainControl` (dead) | deleted | (silent override removed) |
| 33 | `exileUntilEOT` | decomposed (#9) | `[move_card(battlefield, exile, target, 1), schedule_delayed(move_card(exile, battlefield), end_step)]` |
| 34 | `gainControl` (live) | unified (#11) | `change_control(target, duration, grant_haste, untap)` |
| 35 | `pumpAllYours` | removed (#2) | → `pump(power, toughness, duration:eot, target_filter: all_yours)` |
| 36 | `fightTarget` | kept (#5) | `fight_target` |
| 37 | `untap` | kept (#14) | `untap(target_filter)` |
| 38 | `noop` | removed (#17 audit) | (replaced by `target_slots` ability-schema field) |
| 39 | `applyInGameSplice` | renamed; harmonize w/ RUN.applySplice as sub-task (#8) | `apply_in_game_splice` (or possibly `staple` after harmonization) |

### 3.4 Why `rip` stays distinct from `force_sacrifice`

`force_sacrifice` is a sac (battlefield → graveyard) selected by the target player. `rip` opens a player-choice prompt that ALSO removes the slot from the run permanently (run.js bookkeeping, not just engine). The slot-loss is a roguelike-layer side effect; folding it into `force_sacrifice` would either (a) saddle every sac with a "permanent-loss" parameter that's only true for one card, or (b) require post-effect chaining that runs `slot_remove` after sacrifice. Neither pays off. Keep `rip` separate; document the overlap in card-author notes. See §13 for the pre-execution decision on `rip`'s engine action.

### 3.5 Hexproof / targeting model — the critical correctness section

**The contract.** An effect's `target_filter` value falls into one of two classes:

- **Targeted filters** (the engine resolves targets at cast time, locks them in, and re-validates at resolution — RULES.md §703/§704). Subject to hexproof. The card-author UX surface is "the spell prompts the player to pick a target."
- **Untargeted filters** (the effect enumerates affected cards/players at resolution time without any cast-time choice). NOT subject to hexproof. MTG-canonical: Pyroclasm hits hexproof creatures.

**Concrete filter-value classification:**

| `target_filter` value | Class | Resolves via |
|---|---|---|
| `chosen` | Targeted | `ctx.targets[i]` from cast-time choice |
| `chosen_creature` | Targeted | same; creature-only |
| `chosen_player` | Targeted | same; player-only |
| `chosen_spell` | Targeted | same; stack entry |
| `controller` | Untargeted | `ctx.controller` (constant) |
| `opponent` | Untargeted | `ctx.state.opponent_of(ctx.controller.key)` |
| `self` | Untargeted | `ctx.source` (the source card itself) |
| `all_creatures` | Untargeted | enumerate every creature in battlefield zones |
| `all_yours` | Untargeted | enumerate `ctx.controller`'s creatures |
| `all_opps` | Untargeted | enumerate opponent's creatures |
| `each_player` | Untargeted | both players (e.g., "each player draws a card") |
| `library_search(filter)` | Untargeted-with-choice | enumerate from library; controller picks at resolve time (not cast time → not "targeting") |

**Implementation.** Add `Effects.is_targeted_filter(filter: String) -> bool` to both engines. Cast-legality (RULES.md §703) walks every effect, calls `is_targeted_filter` per effect's target_filter, and only enters the target-selection flow if at least one effect's filter is targeted. Resolution-time hexproof check runs only when `is_targeted_filter` is true. Untargeted enumeration just runs the enumerator and applies — no hexproof gate.

**Why this is structural, not per-effect:** today, proto encodes the "this isn't a targeted effect" rule as inline comments at `damageAll` (engine.js:2010-2014) and `edict` (engine.js:1957). The semantics are correct but the rule is invisible to anyone reading just the EFFECTS table. After the refactor, `is_targeted_filter` makes it a one-line lookup. Boot-time validation can assert that any effect with `target_filter: "chosen*"` has a matching `target_slots` declaration on its ability.

**Special case — `library_search`.** The controller picks a card from their own library at resolution time. MTG calls this "choose" but not "target" (Demonic Tutor doesn't target). Hexproof never applies (your own library, no opponent involvement). The filter is parametric — `library_search(land)`, `library_search(creature)`, `library_search(creature, cost_le: 3)`. Phase 1 of this refactor only needs `library_search(land)` and `library_search(creature)`; the filter language can grow later. Classified as untargeted.

**Test obligation.** §12 includes regression tests verifying Pyroclasm hits hexproof creatures, Lightning Bolt does not target hexproof opponent's creatures, force_sacrifice on hexproof creatures works (no target gate), and grant_keyword(mass) bypasses hexproof.

### 3.6 Last-known-information + iid-mint-on-arrival — the MTG hybrid

**The contract** (MTG CR 113.7a, 608.2g): when a multi-effect spell resolves, each effect sees:
- **Live state** for any referenced target/object that's STILL in its expected zone.
- **Last-known-information** — a snapshot of relevant attributes — for any target that has LEFT its zone between effects in the same resolution.

This supersedes DIVERGENCE D1, which previously said "align proto on Godot's live-read." The correct alignment is the hybrid:

| Scenario | Effect sees |
|---|---|
| Target stays on battlefield throughout | Live state (post-each-effect mutations visible to subsequent effects) |
| Target leaves battlefield between effects | Snapshot captured at the moment it left |

**Worked example — Swords to Plowshares**: `[move_card(battlefield, exile, chosen_creature), gain_life(amount=??, target=controller_of_chosen)]`. The exile moves the creature out of battlefield; the gain_life references "its power" — which is no longer queryable from a live battlefield position. The engine reads last-known-info: power at the moment of zone-change. Without this, the second effect would either crash or return 0.

**Worked example — Self-buff-then-damage**: `[pump(+2/+2, chosen), grant_keyword(lifelink, chosen), damage(amount=its_toughness, target=chosen)]`. The creature stays on battlefield throughout. Live state applies: damage = post-pump toughness. **Order matters**: if the spell text were "deal damage = toughness, then +2/+2 and lifelink," the damage uses pre-pump toughness because that's the live state at THAT effect's resolution.

**Implementation**: each `CardInstance` (Godot) / `card` object (proto) gets a `last_known_info` snapshot field. When a card leaves a zone (`move_card` to non-original-zone, `sacrificeCard`, etc.), the engine snapshots `{power, toughness, controller, subtypes, granted_keywords, ...}` into that field BEFORE the zone-change completes. Subsequent references to the card's properties during the same spell's resolution check `last_known_info` if the card is no longer in its expected zone.

The snapshot lifetime is "one spell's resolution scope." After the resolution completes, the snapshot can be cleared (it's irrelevant once we're between spells).

**Estimated implementation**: ~30-50 lines per engine. One field on the card struct, one capture site (in `move_card` / `sacrificeCard` / etc.), one resolution-time check site (in each effect handler that reads target properties).

### 3.7 iid-mint-on-arrival — the rule that gives "flicker beats removal" for free

**The contract** (MTG): every time a card enters the battlefield, it gets a fresh iid. The slot persists across the move (it identifies the deck-slot the card belongs to); the iid does NOT.

**Why this matters**: targeting locks onto iid. A spell targeting iid=12 cannot be redirected; if iid=12 ceases to exist (because the underlying card was flickered and the returning card got iid=17), the spell fizzles on resolution.

**Worked scenario — Lightning Bolt vs Cloudshift**:
1. You target opp's Grizzly Bear (iid=12) with Lightning Bolt.
2. Opp casts Cloudshift on the Bear in response.
3. Cloudshift resolves: Bear exits battlefield to exile (iid=12 cleanup), then returns with a fresh iid (let's call it 17). Same slot, new game object.
4. Lightning Bolt resolves: looks for iid=12. Not found in any zone. Fizzles.

This is MTG-canonical and gives "flicker beats removal" without any special rule. The engine just mints a new iid every time `move_card(zone, battlefield, ...)` completes; targeting checks iid-existence at resolution per the existing fizzle mechanism.

**Currently a bug in proto**: returning cards reuse the old iid, so Lightning Bolt would resolve on the returned creature. The refactor fixes this by ensuring every battlefield-arrival is a fresh game object.

**Implementation**: in `move_card`, when `to_zone == "battlefield"`, allocate a new iid for the arriving card instance. The slot.iid mapping updates accordingly. Existing iid-lookup paths (e.g., `find_instance`) work unchanged because they find by current iid, not historical iid.

**Estimated implementation**: ~10 lines per engine.

---

### 3.8 Sticker-system integration — DECISION 7 REVERSED

The sticker-system audit (proto-only today; Godot has no sticker layer yet) overturned decision 7's tentative "collapse the three Balancer effects into a generic `apply_sticker(kind)`." The corrected design decomposes each effect Scarified-style — an in-game effect runs, then **applies a persistent sticker** through the normal pipeline — and deletes the parallel `applyBalancerOverrides` channel (engine.js:3473) entirely. Everything flows through one sticker pipeline.

**Why the reversal.** `embargo` (`extraCost`), `bleach` (`colorOverride`), and `symmetricize` (`symmetricized`) currently write slot fields that `applyBalancerOverrides` reads at card-birth *before* the sticker loop runs — a second modification channel that bypasses stickers. They are doing the same job as stickers (persistent per-slot card modification), so the clean model is to make them stickers, exactly as `Scarification` already does with `scarified`.

**New sticker kinds (snake_case throughout):**

| Source effect | Sticker kind | Semantics | Notes |
|---|---|---|---|
| `embargo` (extraCost) | `cost_mod` (signed) | additive | **unifies with `costMinus1`** — one signed kind: `-1` for the reward sticker, `+1` for embargo. No floor guard (per-run reductions are fine; clamp generic at 0). |
| `bleach` (colorOverride) | `set_color` (any WUBRG/C) | set | also serves a future "this card is blue" reward sticker. Color has no additive counterpart, so no ordering concern. |
| `symmetricize` | **none — reuses `stat_boost` + `cost_mod`** | additive snapshot | see below |

**Symmetricize as an additive snapshot.** Design intent: the card is balanced *at that moment*; nothing stops it being re-buffed later. So it is NOT a persistent "set P=T=cost=N" clamp — it's a one-time delta computed at resolution. Pick power(N) on an effective 3/3-for-2 → apply `stat_boost {power:0, toughness:0}` + `cost_mod +1` → 3/3-for-3. Pick cost(2) → `stat_boost {-1,-1}`, `cost_mod 0`. Every choice reduces to "store the delta needed right now," all additive. Consequences:
- **No new `set_stats` kind** — symmetricize reuses `stat_boost` (signed) and `cost_mod`.
- **No two-phase set-before-add ordering** (the old `applyBalancerOverrides` constraint). Later `+1/+1`s just stack.
- **The `symmetrizedTo` sentinel is deleted** (set at engine.js:3487, 4457; read at 3431 and stickers.js:28). This also removes the sole behavioral divergence between the batch and incremental apply paths (see dedup below), making their merge a behavioral no-op.

All three sticker kinds get `weight: 0` (never offered in random reward pools, like `scarified`). The effect computes its value (symmetricize via its player-choice prompt) and calls the shared apply + persistence path.

**Empower redesign (rides along with the effects pass — it touches effect shape).**
1. **Fold empowerable params into the effect registry.** Today `EMPOWER_FIELDS` (cards.js:129) is a parallel table that can silently drift from the effect definitions. Each effect kind should declare its own bumpable params (`damage.amount`, `pump.power/toughness`, `affect_creature.severity`). Single source of truth.
2. **Address by semantic identity, not raw array index.** Replace the positional `{location, subIdx, effIdx, modeIdx, field}` pointer with "(effect-kind + field + Nth-of-that-kind)." Stable under reordering; stapling keeps a remap hook but keyed on identity.
3. **Store the resolved delta and apply additively — stop mutating effect objects in place.** `applyEmpowerRoll` currently does `e[field] = cur + amount` on a possibly-shared object (stickers.js:231), requiring implicit deep-copy discipline. Storing `{field-identity, +N}` and adding at read time makes cross-instance leakage structurally impossible.
4. **Drop the non-deterministic fallback** (`re-roll on missing roll`, stickers.js:46–52) — always persist the resolved roll.

**Subtype rolls get the same treatment.** The `subtype` sticker uses an identical parallel-array cursor pattern (`subtypeRolls` parallel to `'subtype'` occurrences, consumed by `subtypeCursor` in `applyStickersToCard` and `stickersForSlot`) and carries the same positional-fragility and silent-skip-on-missing-roll smells as empower. Apply the same fixes: persist the resolved roll deterministically, and address by occurrence-identity rather than a raw positional cursor.

**`grant_mana_ability(color)` generalizes `landColor`.** The engine already supports tap-for-mana on non-lands via `abilities: [{cost:{tap}, effects:[{addMana, amounts}]}]` (Llanowar Elves, `cards/elves/`). The generalized sticker emits that ability shape for any permanent, so a future "tap this creature for {G}" needs no new engine work. See the open mana-model question in §3.9.

**Pipeline cleanup (refactor smells from the audit):**
- **Dedup.** `applyStickersToCard` (batch, card-birth) and `applyOneStickerToRuntimeCard` (incremental, sole caller = Archdemon of Bargains via `applyRandomStickersToSide`, stickers.js:138) are ~90% identical. Unify into one `applyStickerToCard(card, id, rollProvider)`; the only real difference (empower/subtype rolls) is the callback. Archdemon's *selection* stays in its `eligibleStickerIds` filter, so his picks are unchanged.
- **Decouple persistence from application.** `embargo`/`bleach` call `RUN.save()` mid-resolution (engine.js:1615, 1643). Application (mutating the live card) and persistence (writing the run save) must be separated: the sticker primitive mutates the card and *records* "slot N gained sticker X"; the run layer persists at a defined checkpoint. This also matches the Godot rule (no reaching into the save layer from effect handlers) and lets the pipeline be tested without a save system attached.
- **snake_case rename.** `plus1plus1 → plus1_plus1`, `costMinus1`/`extraCost → cost_mod`, `landColor_W → land_color_w`, kinds `statBoost → stat_boost`, `costReduction → cost_mod`. No save-migration map needed (single player, proto-only).

### 3.9 Mana-production model — DECISION: deep clean (unify onto abilities)

`extraManaColors` (lands) and the `add_mana` ability (non-lands) are two parallel mana models, both handled by branching in `doTapLandForMana` (engine.js:4177). `extraManaColors` is a legacy shortcut predating the general `add_mana` ability. **Decision: unify lands onto the `add_mana` ability model** — a land becomes a permanent with a tap-for-mana ability, exactly like Llanowar Elves (`cards/elves/`). `extraManaColors` is retired; `doTapLandForMana` loses its type branch; the `grant_mana_ability` sticker becomes trivially generic across lands and creatures.

**The one new engine capability required:** `add_mana` carries a fixed `amounts` dict today, which can't express a color *choice* (a dual taps for W-or-U; City of Brass taps for any). Extend `add_mana` with a choice form — `{add_mana, choose: ["W","U"]}` / `{add_mana, choose: "any"}` — alongside the existing fixed `amounts`. Without this the ability model can't represent the lands we already have.

**Scope this pulls in** (mana is foundational — every game touches it turn one, so this carries real regression risk and needs solid test coverage):
1. Extend `add_mana` with the color-choice form.
2. Migrate every land's `card.json` from `{mana, extraManaColors}` to the ability shape, plus basic-land generation in the engine.
3. Collapse `doTapLandForMana`'s land/non-land branch into one ability path.
4. Update `landProducibleColors` consumers — AI mana planning (`canPayPotential`), the tap action, auto-tap-for-cost (engine.js:1277–1308).
5. Rewrite the land+creature staple-merge logic (engine.js:391–441) that reads `extraManaColors`.
6. UI: color-choice tap prompt + mana-pip rendering read the ability's color set.

**Sequencing:** done as an **adjacent step within this same coordinated pass**, sequenced *after* the effects+sticker core is passing tests — so a mana regression has a clean diagnostic surface and can't be confused with an effect/sticker regression during bring-up. (Architectural detail; the "what" is settled, the exact step ordering is at the implementer's discretion.)

> **Still open before execution:** the `rip` trigger-semantics discussion (§3.4 / decision notes).

### 3.10 Staple template-synthesis cleanup

`synthesizeStapledTemplate` + `mergeStapleInto` (engine.js:270–454) merge a base and staple card into one template. The refactor already touches this function (mana-model rewrite §3.9 step 5, `target_slots` §1.2, empower remap §3.8); since it's being edited anyway, fold in three structural fixes — proto-side cleanup, and design-from-scratch guidance for the Godot port (which has no staple system yet).

**The merge is a triangular matrix, not a square one — leverage the canonicalization hierarchy.** `canonicalSplicePair` (engine.js:90–103) already picks the base by a type *priority*: Creature(0) > Artifact(1) > Land(2) > Spell(3), lower wins the base slot. That guarantee makes most of the 3×3 grid unreachable: a Land base can never have a Creature staple (the creature would have won the base slot), and a Spell base can only ever pair with a Spell staple. **Six reachable cells, not seven:**

| Base ↓ \ Staple → | Creature | Land | Spell |
|---|---|---|---|
| **Creature** | Cr+Cr (body merge) | Cr+Ld ({T}:add_mana ability) | Cr+Sp (spell → ETB trigger) |
| **Land** | — creature would be base | Ld+Ld (mana merges) | Ld+Sp (spell → ETB trigger) |
| **Spell** | — | **— land would be base (Sp+Ld is DEAD CODE)** | Sp+Sp (effects concat, multiTarget) |

The current `else if (stapleTpl.type === 'Land')` branch (engine.js:435, "spell gains add_mana on resolve") **cannot be reached** through canonicalization — a Spell+Land pair always stores Land as base (Land=2 beats Spell=3). Verify no caller bypasses `canonicalSplicePair`, then **delete it**.

**Dispatch by the canonicalization hierarchy + what the staple contributes — NOT by branch order.** The current implementation is an order-dependent if/else where catch-alls (`else if type==='Creature'`/`'Land'`) rely on earlier cases peeling off first, and the final `else` silently swallows unexpected pairs as Sp+Sp. This fragility only exists because the code re-derives behavior instead of trusting the canonicalization guarantee. The clean structure:
- **Base is chosen by hierarchy** (already done by `canonicalSplicePair`; the "if creature → creature, else if land → land, else spell" rule).
- **Merge dispatches on the staple's contribution + whether the base is a permanent**, which collapses redundant cells:
  - Staple = Creature → body merge (base is always Creature here).
  - Staple = Spell → permanent base gets an ETB trigger; spell base concatenates effects. **Cr+Sp and Ld+Sp are byte-for-byte identical today** (same `cardEntersBattlefield`/`thisEnters` trigger) — collapse to one handler.
  - Staple = Land → permanent base gains the land's tap-ability. Post-§3.9 (lands *are* tap-abilities), Cr+Ld and Ld+Ld collapse into "append the staple's mana ability."

Net: ~3 behaviors keyed on staple-type, with permanent-vs-spell as the only secondary split — replacing a 7-branch order-dependent chain. An unmapped/impossible pair should `throw`, not fall through to Sp+Sp.

**Delete the multi-color-land staple rejection once `add_mana` has `choose`.** `isCompatibleStaplePair` (engine.js:113–120) refuses a multi-color land stapled onto a creature/spell base, because the synthesized ability uses a fixed `amounts` dict (engine.js:394–399) — a WU land would build `{W:1,U:1}` = "add W *and* U," not "choose one." (Note: multi-color *lands* already tap-for-choice fine via `extraManaColors` + `landProducibleColors`; only the synthesized *ability* lacks choice.) §3.9's `add_mana` `choose` form fixes this directly, so the 113–120 rejection can be removed — multi-color lands become valid staples onto any base.

**Hand-maintained field-copy → generic deep clone.** The `merged` object (277–310) manually copies every template field. A new schema field forgotten here is silently lost on every stapled card — the same bug-class as the City-of-Brass `extraManaColors` loss that CLAUDE.md warns about. Templates are pure JSON (no functions), so replace the manual copy with `structuredClone(baseTpl)` (or a JSON round-trip) + attach `stapledFrom`. New fields then carry automatically.

**Drop hand-concatenated merged text; rely on `describeCardText`.** `mergeStapleInto` builds `merged.text` via `appendMergedText`, but `makeCard` overwrites it with `describeCardText(card)` (engine.js:567, regenerating from the merged effects/triggers/abilities, with a `customText:true` opt-out). So the concat is already redundant in the runtime path; it only survives for consumers reading a synthesized template before `makeCard` (staple-preview tooltips). Since `describeCardText` already renders stapled templates (card-text.js reads `synthesizeStapledTemplate` for baselines), remove the `appendMergedText` calls and point preview consumers at `describeCardText(merged)`. Single source of truth for card text.

---

## 4. Final atomic effects registry (proposed)

Target count: **19 atomic effects** down from proto's 38. Grouped by category. All take `(effect: Dictionary, ctx: Dictionary)` per the existing Godot `Effects.resolve_one` contract.

### 4.1 The OPEN QUESTION on `move_card` post-actions — RESOLVED

**Recommendation: bundle post-actions as parameters of `move_card`.**

Pro-bundling: the common idiom "search for a Forest, put it onto the battlefield TAPPED" is one card-author concept; splitting it into `[move_card(library, battlefield, ...), tap(the_card_that_just_moved)]` introduces a "the card that just moved" reference that doesn't exist as a first-class concept. Same for "exile, return at end of turn" — the delayed return needs to reference the exiled card.

Pro-decomposition: smaller primitives. But this benefit pays off only if multiple cards use the same post-action across effects. Today: `tap-on-arrival` is used by exactly one effect (`search_land_tapped`); `shuffle-after-move` is used by 3-4. The orthogonality argument doesn't carry its weight in the current card pool.

**Decision: `move_card` takes an optional `post` object** with these well-known keys:
- `tap: true` — tap the moved card on arrival
- `shuffle: true` — shuffle the source zone (for library searches)
- `grant_haste: true` — for control-change-like ETB-as-yours moves
- `untap_on_arrive: true` — for steals
- `enter_via_etb: true` — fire ETB triggers (default true for moves TO battlefield)
- `keep_buffs: true` — for flicker-style return (preserve perma-buffs)

This keeps the dispatch flat and avoids the "what is `the card just moved`?" infra problem. If a future effect-chaining mechanism lands (B4 + something heavier), these can be re-decomposed without breaking card data.

### 4.2 The 19-effect registry

Shorthand-style signature; parameters are descriptive, not exhaustive.

**Damage (1)**
- `damage(amount, target_filter)` — replaces proto's `damage` + `damageAll`. Filters: `chosen`, `controller`, `opponent`, `all_creatures`.

**Stat-modify (3)**
- `pump(power, toughness, duration, target_filter)` — replaces `pump` + `weaken` + `addCounter` + `pumpAllYours`. Signed deltas; `duration: eot|permanent`; filters: `chosen`, `self`, `all_yours`, `all_creatures`.
- `grant_keyword(keyword, duration, target_filter)` — replaces `grantKeyword` + `restrict`. Hidden internal keyword `no_block` introduced for restrict's `cantBlock` path.
- `untap(target_filter)` — kept primitive.

**Removal (1)**
- `affect_creature(severity, target_filter)` — replaces `removeCreature` + `removeAll`. Severity: `tap|bounce|destroy|exile`. Filters: `chosen`, `all_creatures`, `all_yours`, `all_opps`.

**Card-movement (1)**
- `move_card(from_zone, to_zone, selector, amount, post?)` — replaces `draw`, `discard`, `shuffle_into_library`, `return_from_graveyard`, `search_land_tapped`, `search_creature`, `flicker`*, `exile_until_eot`*. Selector vocab: `controller`, `target_player`, `chosen_creature`, `library_search(filter)`, `self`. (* See decision 9 — these need delayed-effect machinery for the return half; the OUTGOING move uses `move_card`.)

**Control (1)**
- `change_control(target, duration, grant_haste, untap_on_take, transfer_ownership)` — replaces `gainControl` (both defs) + `steal`. Steal sets `transfer_ownership: true` plus an internal "shuffle into library" follow-up.

**Mana / life (2)**
- `add_mana(amounts)` — kept; accepts flat shorthand per D5.
- `gain_life(amount, target)` — kept; signed per D4, optional target per D3.

**Counter / stack (1)**
- `counter_spell(target_filter)` — renamed from proto's `counter`. Filter: `chosen_spell`.

**Tokens (1)**
- `create_tokens(token_id, count, controller)` — kept.

**Sacrifice (1)**
- `force_sacrifice(player, count, filter)` — replaces `edict` + `sacrifice`. Player: `controller|opponent`.

**Stickers (1)**
- `apply_sticker(kind, target, ...params)` — the generic persistent-modification primitive. Carries a sticker `kind` (`stat_boost`, `cost_mod`, `set_color`, `grant_mana_ability`, `scarified`, keyword kinds, etc.) plus that kind's params. Replaces the `embargo`/`bleach`/`symmetricize` bespoke channel: each is now `[movement/choice effect] → apply_sticker(specific_kind)` and `applyBalancerOverrides` is deleted. Full design in §3.8.

**Specials — card-bespoke (5)**
- `endomorph_absorb` — Endomorph.
- `bargain_sticker_self` — Archdemon ETB.
- `bargain_sticker_other` — Archdemon LTB.
- `fight_target(target_filter)` — Beast's Fury.
- `apply_in_game_splice(target_pair)` — Stapler.

**Run-layer primitives (1)**
- `rip(target)` — removes the targeted card's slot from the run via `RUN.removeSlotByIdx`. Does NOT touch the in-play card itself (that's the caller's responsibility — typically a preceding `force_sacrifice` or similar). Compositional building block: "Vile Edict"-style cards become `[force_sacrifice(opponent, 1, creature), rip(previous_target)]`. Phylactery's engine-internal path also ends up calling `RUN.removeSlotByIdx` (same underlying primitive) but doesn't go through this effect dispatcher (it's not card-effect-driven). See §13 for trigger-semantics discussion.

| Category | Count |
|---|---|
| Damage | 1 |
| Stat-modify | 3 |
| Removal | 1 |
| Card-movement | 1 |
| Control | 1 |
| Mana / life | 2 |
| Counter | 1 |
| Tokens | 1 |
| Sacrifice | 1 |
| Stickers (tentative) | 1 |
| Specials (card-bespoke) | 5 |
| Run-layer (`rip`) | 1 |
| **Total** | **19** |

Compare to proto's 38 (37 distinct + 1 dup + 1 dead `sacrifice`). 50% reduction.

---

## 5. Card-data format

Effects appear in card data three places: `on_cast_effects`, `activated_abilities[i].effects`, `triggered_abilities[i].effects`. Each effect is a `Dictionary` keyed by `"kind"` plus per-kind fields.

**Two surface shapes, matching the predicate plan's convention:**

| Shape | Example | When to use |
|---|---|---|
| Canonical dict | `{"kind": "damage", "amount": 3, "target_filter": "chosen"}` | Always works in both engines. The evaluator's internal form. |
| Function-call shorthand | `"damage(amount=3, target=chosen)"` (string) | Concise authoring; parses to the canonical dict. |

The function-call shorthand is the same parser introduced in the predicate plan (§4.x of `plan-zone-change-and-composable-predicates.md`), generalized to keyword-style args. Parser rules:

- Bare identifiers are positional and ordered (`damage(3, chosen)`); keyword args use `name=value` (`damage(amount=3, target=chosen)`). Mix is allowed: positional args precede keyword args.
- Arg coercion: integer → int, float → float, `true`/`false` → bool, quoted string → string, bare identifier → string. Identical to the predicate parser.
- Whitespace-tolerant.
- Single-arg or no-arg works: `untap(chosen)`, `bargain_sticker_self()`.

**`target_filter` replaces `target`.** The proto field name `target` was overloaded (it was both a target-shape selector AND a controller-relative hint like `"any"` or `"self"`). The new `target_filter` is unambiguously about which entities the effect operates on. Migration shim accepts `target` and aliases it to `target_filter` during cutover; final cleanup step removes the alias.

**`severity` enum.** `affect_creature`'s `severity` field is one of `tap|bounce|destroy|exile` (was `1|2|3|4` in proto). String-typed for readability; the dispatcher maps to internal severity values. Empower-bump-severity remains supported (an empower sticker promotes `tap`→`bounce`→`destroy`→`exile`).

### 5.2 Shorthand effect names for common card-movement idioms

The `move_card` primitive is powerful but verbose for the common cases. To keep card authoring natural, the parser recognizes a small curated set of **shorthand effect names** that desugar to canonical `move_card` invocations at boot:

| Shorthand | Desugars to |
|---|---|
| `draw(N)` | `move_card(library, hand, controller_top, N)` |
| `discard(N)` | `move_card(hand, graveyard, controller_chosen, N)` |
| `target_player_discards(N)` | `move_card(hand, graveyard, target_player_chosen, N)` |
| `mill(N)` | `move_card(library, graveyard, controller_top, N)` |
| `bounce(target)` | `move_card(battlefield, hand, target, 1)` |
| `flicker(target)` | TWO calls: `[move_card(battlefield, exile, target, 1, post: {keep_buffs: true}), move_card(exile, battlefield, previous_target, 1, post: {enter_via_etb: true})]` |
| `search_for(filter)` | `move_card(library, hand, library_search(filter), 1, post: {shuffle: true})` |
| `search_land_tapped()` | `move_card(library, battlefield, library_search(land), 1, post: {tap: true, shuffle: true})` |
| `shuffle_into_library(target)` | `move_card(battlefield, library, target, 1, post: {shuffle: true})` |

**Note on `post`**: the `post` argument is an OPTIONAL affix on `move_card`. The canonical signature is `move_card(from_zone, to_zone, selector, amount, post?)`. A bare `move_card(library, hand, controller_top, 1)` is fully valid — no post needed. Each key inside `post` is also optional. The examples above include `post: {...}` only because THOSE specific shorthand patterns need post-actions; most uses of `move_card` carry no post argument.

**Note on `return_from_graveyard`**: NOT included in the shorthand set, even though it's a common card-design pattern. Reason: graveyard cards can return to hand (Mortician's Assistant style), to battlefield (reanimation), or to library (top or shuffled). One shorthand can't cover all variants without an extra parameter that breaks the simplicity. Card authors who need it use the full `move_card(graveyard, ...)` form, or we add specific shorthand later if a clear sub-pattern emerges (e.g., `reanimate(target)` for graveyard→battlefield specifically).

**Design rules for the shorthand set:**
- Each shorthand is a parser-table entry; ONE canonical handler (`move_card`) runs at execution time.
- Card data files can use EITHER the shorthand OR the full canonical form — boot validation accepts both.
- New shorthands are added only when a card-design pattern is common enough to warrant one AND has unambiguous default parameters. Don't preemptively add shorthand for one-off cases or ambiguous patterns (`return_from_graveyard` is the cautionary case).
- The shorthand-to-canonical mapping lives in a single registry (boot-time parser), making it easy to evolve. Adding `target_player_mills(N)` later is a one-line entry.

**Effect on registry size**: from a card-author perspective, the effective vocabulary is ~30 effects (19 canonical atomic + 10 shorthand names for movement). From an engine perspective, still 19 handlers. Best of both worlds.

**Boot validation**: validator accepts shorthand names AND canonical names. Card data is normalized to canonical form at parse time. Grep-ability is preserved on both sides.

---

## 6. Worked migration examples

Twelve representative cards across categories. Each block shows the proto JSON before, the canonical dict after, AND the function-call shorthand.

### 6.1 Lightning Bolt — basic targeted damage

```js
// Before (cards/bolt/card.json):
{ "effects": [ {"kind": "damage", "target": "any", "amount": 3} ] }

// After (canonical):
{ "effects": [ {"kind": "damage", "amount": 3, "target_filter": "chosen"} ] }

// After (shorthand):
{ "effects": [ "damage(amount=3, target_filter=chosen)" ] }
```

`"any"` (creature-or-player) is what `chosen` means by default; if the card needs a more restrictive filter, the ability schema's `target_filter: "creature_or_player"` (or `creature`, `player`) constrains it. Per-effect `target_filter` always says "chosen" when targeted — the ability-level filter is the one that controls cast-time selection legality.

### 6.2 Pyroclasm — mass damage (hexproof case)

```js
// Before:
{ "effects": [ {"kind": "damageAll", "amount": 2} ] }

// After:
{ "effects": [ {"kind": "damage", "amount": 2, "target_filter": "all_creatures"} ] }
// Shorthand: "damage(amount=2, target_filter=all_creatures)"
```

`is_targeted_filter("all_creatures")` returns false → no cast-time target prompt, no hexproof gate at resolution, hits every creature including hexproof ones. Behavior matches MTG canon.

### 6.3 Sicken — weaken via signed pump

```js
// Before:
{ "effects": [ {"kind": "weaken", "target": "creature", "power": 2, "toughness": 2} ] }

// After:
{ "effects": [ {"kind": "pump", "power": -2, "toughness": -2, "duration": "eot", "target_filter": "chosen"} ] }
// Shorthand: "pump(power=-2, toughness=-2, duration=eot, target_filter=chosen)"
```

`weaken` is dead. Signed deltas read naturally; card text rendering ("Target creature gets -2/-2 EOT") is a card-text helper that watches for negative values.

### 6.4 Awakener — addCounter folds into pump

```js
// Before:
{ "effects": [ {"kind": "addCounter", "target": "creature", "power": 1, "toughness": 1, "filter": {"controller": "self"}} ] }

// After:
{ "effects": [ {"kind": "pump", "power": 1, "toughness": 1, "duration": "permanent", "target_filter": "chosen"} ] }
```

Note the `filter: {controller: "self"}` becomes the ability-level `target_filter: "your_creature"` on the trigger — it's not a per-effect concern. Per-effect `target_filter: "chosen"` means "use the picked target."

### 6.5 Horned Herald — pumpAllYours folds in

```js
// Before:
{ "effects": [ {"kind": "pumpAllYours", "power": 1, "toughness": 1} ] }

// After:
{ "effects": [ {"kind": "pump", "power": 1, "toughness": 1, "duration": "eot", "target_filter": "all_yours"} ] }
// Shorthand: "pump(power=1, toughness=1, duration=eot, target_filter=all_yours)"
```

### 6.6 Pacifism — restrict decomposes into grant_keyword

```js
// Before:
{ "effects": [ {"kind": "restrict", "target": "creature", "cantAttack": true, "cantBlock": true} ] }

// After (array of two grant_keyword effects — uses existing array machinery):
{
  "effects": [
    {"kind": "grant_keyword", "keyword": "defender", "duration": "permanent", "target_filter": "chosen"},
    {"kind": "grant_keyword", "keyword": "no_block",  "duration": "permanent", "target_filter": "chosen"}
  ]
}
// Shorthand (same target picked once at cast time, applied to both):
{ "effects": [
    "grant_keyword(keyword=defender, duration=permanent, target_filter=chosen)",
    "grant_keyword(keyword=no_block, duration=permanent, target_filter=chosen)"
  ]
}
```

The "same target picked once at cast time and locked in" semantics already exist (Wizard Adept's `[draw, discard]` shares ctx). Two effects, one targeting prompt, both apply.

### 6.7 Wrath of God — removeAll folds in

```js
// Before:
{ "effects": [ {"kind": "removeAll", "severity": 3} ] }

// After:
{ "effects": [ {"kind": "affect_creature", "severity": "destroy", "target_filter": "all_creatures"} ] }
// Shorthand: "affect_creature(severity=destroy, target_filter=all_creatures)"
```

### 6.8 Diabolic Edict — edict folds into force_sacrifice

```js
// Before:
{ "effects": [ {"kind": "edict"} ] }

// After:
{ "effects": [ {"kind": "force_sacrifice", "player": "opponent", "count": 1, "filter": "creature"} ] }
// Shorthand: "force_sacrifice(player=opponent, count=1, filter=creature)"
```

### 6.9 Mind Control + Steal — both fold into change_control

```js
// Mind Control before:
{ "effects": [ {"kind": "gainControl", "target": "creature", "filter": {"controller": "opp"}} ] }
// After:
{ "effects": [ {"kind": "change_control", "target_filter": "chosen", "duration": "permanent"} ] }

// Steal before:
{ "effects": [ {"kind": "steal", "target": "permanentOrSpell", "filter": {"notToken": true}} ] }
// After:
{ "effects": [ {"kind": "change_control", "target_filter": "chosen", "duration": "permanent",
                "transfer_ownership": true} ] }
```

`transfer_ownership: true` triggers the run-slot transfer logic (the proto `steal` body that appends a slot and shuffles a fresh instance into library). Counter-spell path for `steal` (when target is a stack entry) is handled by `change_control` recognizing the target shape — the handler routes through the `counter` half automatically.

### 6.10 Oblation — shuffleIntoLibrary becomes move_card

```js
// Before:
{ "effects": [ {"kind": "shuffleIntoLibrary", "target": "creature"} ] }

// After:
{ "effects": [ {"kind": "move_card",
                 "from_zone": "battlefield",
                 "to_zone": "library",
                 "selector": "chosen_creature",
                 "amount": 1,
                 "post": {"shuffle": true}} ] }
```

### 6.11 Wizard Adept — already array-based, uses the shorthand

```js
// Before:
{ "effects": [
    {"kind": "draw", "amount": 1},
    {"kind": "discard", "target": "self", "amount": 1}
  ] }

// After (canonical):
{ "effects": [
    {"kind": "move_card", "from_zone": "library", "to_zone": "hand",
     "selector": "controller_top", "amount": 1},
    {"kind": "move_card", "from_zone": "hand", "to_zone": "graveyard",
     "selector": "controller_chosen", "amount": 1}
  ] }

// After (shorthand — recommended):
{ "effects": [ "draw(1)", "discard(1)" ] }
```

The "loot" idiom becomes two shorthand calls that desugar to `move_card` invocations. Card data stays nearly as compact as before; engine has a single handler for both.

### 6.12 Scarification — compound decomposition (decision 18)

```js
// Before:
{ "effects": [ {"kind": "destroyAndStickerSlot", "target": "creature", "stickerId": "scarified"} ] }

// After:
{ "effects": [
    {"kind": "affect_creature", "severity": "destroy", "target_filter": "chosen"},
    {"kind": "apply_sticker", "sticker_id": "scarified", "target_filter": "same_as_previous"}
  ] }
```

**OPEN QUESTION: `same_as_previous` target reference.** The existing engine model passes one target through the effects array (the cast-time pick). For Scarification, both effects need the same creature target — the creature being destroyed gets the sticker on its slot. The current model handles this implicitly (one cast-time target picked, all effects see it via ctx.targets[0]). Recommended resolution: the engine's already-implicit "shared target" via ctx.targets[0] handles this case naturally — `target_filter: "chosen"` on the second effect reads the same target. No new vocabulary needed. But this works ONLY because the target survives the destroy (Scarification's sticker applies to the slot, not the in-play card, so the in-play card being gone after the destroy doesn't matter). Other compound decompositions might need different chaining — flag this as a design constraint for Phase 6+ compound cards. Reviewer call: keep "shared via ctx.targets[0]" as the implicit chaining mechanism, document explicitly in the new SPEC.md.

### 6.13 Otherworldly Journey — exile_until_eot (needs B4)

```js
// Before:
{ "effects": [ {"kind": "exileUntilEOT", "target": "creature"} ] }

// After (PENDING B4):
{ "effects": [
    {"kind": "move_card", "from_zone": "battlefield", "to_zone": "exile",
     "selector": "chosen_creature", "amount": 1, "post": {"keep_buffs": true}},
    {"kind": "schedule_delayed",
     "trigger": "end_step",
     "effects": [
       {"kind": "move_card", "from_zone": "exile", "to_zone": "battlefield",
        "selector": "previous_target", "amount": 1, "post": {"enter_via_etb": true}}
     ]}
  ] }
```

`schedule_delayed` is the B4 primitive (delayed-trigger machinery). The `previous_target` selector references the card the prior `move_card` operated on — this DOES need a small chaining mechanism (1 line of context-passing in the resolver). Not the same as the open question above; this is a forward reference from one effect to the prior effect's resolved subject. Until B4 lands, `exile_until_eot` stays as its own primitive in both engines and migrates after B4.

`flicker` is the immediate variant: skip `schedule_delayed`, just do the two `move_card` calls back-to-back. So `flicker` can migrate earlier than `exile_until_eot`.

### 6.14 Swords to Plowshares — last-known-information in action (§3.6)

A canonical MTG card: "Exile target creature. Its controller gains life equal to its power." Proto doesn't have this card today, but porting it (and similar designs) requires the last-known-information machinery from §3.6.

```js
// After (illustrative — card not in proto today):
{ "effects": [
    "move_card(battlefield, exile, chosen_creature, 1)",
    {"kind": "gain_life",
     "amount": "<chosen_creature.power>",      // ← references the moved target
     "target": "<controller_of_chosen_creature>"}
  ] }
```

**The mechanism at resolution time**:
1. Cast time: `chosen_creature` locks onto iid=12 (Grizzly Bear, power=2, controlled by opp).
2. First effect: `move_card` exiles iid=12. BEFORE removing from battlefield, engine snapshots `{power: 2, toughness: 2, controller: opp, ...}` into iid=12's `last_known_info` field.
3. Second effect: `gain_life` reads `chosen_creature.power` and `controller_of_chosen_creature`. Engine checks: is iid=12 still on the battlefield? No (it's now in exile). Read from `last_known_info`: power=2, controller=opp. Opp gains 2 life.
4. After the spell's resolution completes, the snapshot can be cleared.

**Why this works**: the spell's targeting locked onto iid=12 at cast time. By the second effect, the in-play card is gone, but the snapshot preserves what the spell needs to know. Matches MTG's "last known information" rule.

**Without last-known-info**: the second effect would either fizzle (no live target to read) or crash (null-deref on the missing card). Neither is correct.

**Cards in the current proto pool that benefit from this**: a quick audit shows `dampingMatrix`, `bleach`, `embargo`, and several lifelink/death-trigger combos rely on similar "the thing I targeted is now elsewhere but I still need to know what it was." The mechanism is general — any multi-effect spell with cross-effect target references benefits.

---

## 7. Migration script discipline

**Proto side:** `reference/html-proto/tools/migrate-effects.js`, modeled on the predicate-plan's `migrate-triggers.js`. Mechanically walks every `cards/*/card.json`, every `effects[]` and `triggers[].effects[]` and `abilities[].effects[]`, and rewrites:

1. **Rename kinds** per the table in §3: `addMana`→`add_mana`, `gainLife`→`gain_life`, etc.
2. **Parameterize target filters**: lift the per-card `target: "any"|"creature"|"creature_or_player"|...` field, map to `target_filter` values per the §3.5 classification.
3. **Decompose compounds**:
   - `destroyAndStickerSlot` → two-effect array.
   - `restrict` → one or two `grant_keyword` effects depending on flags.
4. **Apply redundancy cleanup**:
   - Drop `weaken` in favor of negative `pump`.
   - Drop `addCounter` in favor of `pump` with `duration: permanent`.
   - Drop `pumpAllYours` / `damageAll` / `removeAll` in favor of unified kinds with target_filter.
5. **Rewrite mass-kinds**:
   - `damageAll` → `damage(target_filter=all_creatures)`.
   - `pumpAllYours` → `pump(target_filter=all_yours)`.
   - `removeAll(severity=N, whose=W)` → `affect_creature(severity=<str>, target_filter=<filter>)` where severity ints map to strings and `whose: opp` → `all_opps`, `whose: all` → `all_creatures`.
6. **Handle the duplicate `gainControl`**: doesn't appear in card data (cards just say `kind: "gainControl"`), so no per-card change needed. Engine-side: just delete the dead first definition.
7. **Strip `noop`**: rewrite Stapler's ability to declare `target_slots: 2` and remove the second-effect `noop` entry.

The script writes back the canonical dict form (not the function-call shorthand). The shorthand is for hand-authoring new cards going forward; migrated cards stay in canonical dict for grep-ability.

**Splice duplicate-pathway investigation (decision 8).** A SEPARATE sub-task, NOT folded into the main effects migration. Plan:

1. Diff `RUN.applySplice` (run.js:865) against `EFFECTS.applyInGameSplice` (engine.js:2246). Identify the shared logic (slot mutation, slotIdx fixup, sticker/roll merging) vs the divergent logic (Stapler fires the stapled spell's effects mid-merge; the reward-time path doesn't).
2. Extract the shared logic into a single `applySpliceCore(baseSlotIdx, stapleSlotIdx, opts)` function in `engine.js` (where the helpers already live).
3. Both pathways call `applySpliceCore`. The Stapler path layers its stack-spell-firing logic on top.
4. Add a unit test that splices the same two cards via both pathways and asserts identical end state (slot contents, stickers, rolls).

This sub-task is **scheduled as a follow-up plan after the main effects refactor** — flagged here so the user can decide whether to bundle or sequence separately. Recommendation: **separate follow-up plan**, because the splice pathways live in run.js (roguelike layer), not engine.js, and harmonizing them is more of a "consolidate Stapler with run-state mutation" task than an effects-registry task.

**Godot side:** the 6 templates with effects beyond basic types (pyromaniac, bloodlust_berserker, giant_growth, healing_salve, lightning_bolt, counterspell) get hand-migrated. The Godot pool is small enough that a script isn't worth writing — `Edit` each .tres with the new field names.

---

## 8. Boot validation + evaluator changes

**Effect-kind validation.** Adapt the predicate plan's `validate_all_card_predicates` (Predicates module) to a parallel `validate_all_card_effects` (Effects module). Walks every `on_cast_effects`, every `triggered_abilities[].effects`, every `activated_abilities[].effects`, every nested `schedule_delayed.effects`. For each effect dict:

```gdscript
static func validate_all_card_effects(card_resources: Array) -> void:
    var unknown: Array[String] = []
    var malformed: Array[String] = []
    for card in card_resources:
        for effect in card.on_cast_effects:
            _check_effect(effect, card.card_id, unknown, malformed)
        for ab in card.activated_abilities:
            for effect in ab.get("effects", []):
                _check_effect(effect, card.card_id, unknown, malformed)
        for trig in card.triggered_abilities:
            for effect in trig.get("effects", []):
                _check_effect(effect, card.card_id, unknown, malformed)
    if not unknown.is_empty():
        push_error("Unknown effect kind(s): %s" % ", ".join(unknown))
    if not malformed.is_empty():
        push_error("Malformed effect(s): %s" % ", ".join(malformed))

static func _check_effect(effect, card_id: String, unknown: Array, malformed: Array) -> void:
    if effect is String:
        # Function-call shorthand path
        var parsed: Dictionary = _parse_effect_call(effect)
        if not HANDLERS.has(parsed.name):
            unknown.append("%s.%s" % [card_id, parsed.name])
        # Optionally also validate per-kind required keys via a schema table.
        return
    if effect is Dictionary:
        var kind: String = effect.get("kind", "")
        if kind == "":
            malformed.append("%s.<missing kind>" % card_id)
            return
        if not HANDLERS.has(kind):
            unknown.append("%s.%s" % [card_id, kind])
        # Validate target_filter is a known value (against a static set).
        var tf: String = effect.get("target_filter", "")
        if tf != "" and not _is_valid_target_filter(tf):
            malformed.append("%s.%s.target_filter=%s" % [card_id, kind, tf])
        return
    malformed.append("%s.<non-dict-non-string effect>" % card_id)
```

**Per-kind schema (optional but recommended).** A static dict in `Effects` declares required and optional fields per kind:

```gdscript
const EFFECT_SCHEMA := {
    "damage": {"required": ["amount", "target_filter"], "optional": []},
    "pump":   {"required": ["target_filter"], "optional": ["power", "toughness", "duration"]},
    "move_card": {"required": ["from_zone", "to_zone", "selector"], "optional": ["amount", "post"]},
    # ... etc
}
```

Boot-validator additionally checks required keys are present. Catches card-author typos like `{"kind": "damage", "ammount": 3}` (missing `amount`, extra `ammount`).

**Parser** (the function-call shorthand). The predicate plan's `_parse_call` (predicates.gd) becomes `Effects._parse_effect_call`. Same lexer (whitespace tolerant, quoted strings, type coercion). Extension: keyword args. The arg list contains a mix of positional (`damage(3, chosen)`) and keyword (`damage(amount=3, target_filter=chosen)`) — keyword form is the recommended style for any effect with 3+ params or any boolean param (positional bools are too ambiguous).

**Validation timing.** Both engines run validate-effects at boot, alongside the existing validate-predicates. In Godot: `engine.gd._ready()` calls both. In proto: `tests/_setup.js` calls both after `loadCards()`.

---

## 9. Coordination with other plans

### 9.1 Dependency graph

```
priority-window (B6/B7)
        │
        ▼
zone-change + predicates (E1/E2)   ←─── card_zone_change event vocabulary
        │                                lands here; move_card EFFECT
        │                                emits this event on ETB cases
        ▼
EFFECTS refactor (this plan)        ←─── most of it
        │
        ▼
delayed-trigger machinery (B4)      ←─── needed for the LAST PIECE
        │                                of EFFECTS: exile_until_eot
        ▼
exile_until_eot decomposition
```

### 9.2 What blocks what

- **`move_card` effect needs E1 done.** The `move_card` effect's job is to emit a `card_zone_change` event. The predicate refactor introduces `card_zone_change` as the unified event vocabulary. If EFFECTS lands first, every `move_card` invocation has to emit BOTH the old per-kind events AND the new `card_zone_change` — temporary double-emission. If E1 lands first, `move_card` just emits `card_zone_change` once and listeners (already migrated to use the predicate-composition shape) receive it naturally. **Recommendation: E1 first.**
- **`exile_until_eot` decomposition needs B4.** The "return at end of turn" half requires `schedule_delayed`, which IS the B4 machinery. Until B4 lands, this one effect stays as a primitive in both engines. The rest of the EFFECTS refactor proceeds.
- **The sticker-system audit is complete (§3.8); decision 7 is resolved.** `embargo`/`bleach`/`symmetricize` decompose into `[movement/choice effect] → apply_sticker(specific_kind)`, `applyBalancerOverrides` is deleted, and the sticker pipeline (apply dedup, empower redesign, persistence decoupling, snake_case) is folded into this refactor. The boot validator accepts `apply_sticker` from day one. Two items remain open before execution: the `rip` trigger semantics (§3.4) and the mana-model unification scope (§3.9).
- **B6/B7 (priority-window) is independent.** Touches priority/auto-pass logic, not effect handlers. Land in parallel or earlier.

### 9.3 Adjacent items

- **C5 (killer attribution) is adjacent, not a blocker.** `endomorph_absorb` reads `ctx.event.card` (the dying victim) and `endomorph` itself as the killer. The "killer" identity comes from `card.killedBy = ctx.controller` set inside `removeCreature`/`removeAll`/`destroyAndStickerSlot`. The unified `affect_creature` effect must preserve this — flagged as a step in §10. Godot's port of `affect_creature` will need C5 to work for absorb mechanics, but the effect itself can land before C5 lands as long as `killedBy` is plumbed.
- **D1 (multi-effect target snapshot) is adjacent.** When a single spell has multiple effects all referencing the same target (Scarification post-decomposition is exactly this case), do they all see the same snapshot or live state? Decision: live state per effect (matches Godot's existing behavior, matches MTG canon per D1). Document in SPEC.md.

---

## 10. Sequenced migration plan

Each step leaves both engines in a runnable, test-passing state. Recommend sequencing AFTER `plan-zone-change-and-composable-predicates.md` (E1/E2).

0. **(Proto only) Extract `applySpliceCore(baseSlotIdx, stapleSlotIdx, opts)` helper.** The splice logic is currently duplicated across four sites (`js/engine.js:2246` `EFFECTS.applyInGameSplice`, `js/run.js:872` `RUN.applySplice`, `js/draft.js:239` and `js/run.js:584` pair-enumeration). Extract the shared body (slot mutation, slotIdx fixups, sticker/roll merging) into a single helper in `engine.js`. The Stapler path layers stack-spell-firing logic on top via `opts.fireSpellEffects: true`; reward-time path passes `opts.fireSpellEffects: false`. Unit test: splice the same two cards via Stapler's in-game path AND the reward path; assert identical end state. ~4 hours. Decouples from the refactor's later steps — could land independently if scheduled before the rest.

1. **Add `target_filter` field to `affect_creature` and `pump` and `damage` in BOTH engines, alongside existing per-effect-kind shape.** This is the parameterized-target groundwork. New `target_filter` values (`all_creatures`, `all_yours`, etc.) work in the dispatcher; old per-kind code (`damageAll`, `pumpAllYours`, `removeAll`) still runs. Tests: existing tests pass; new tests for each filter value pass against synthetic effects. Semantic no-op overall.

2. **Add `is_targeted_filter` and route hexproof through it.** Both engines: introduce the function (returns true for `chosen*`, false for `all_*`, `controller`, `opponent`, `self`, etc.). Cast-legality gates target selection on `is_targeted_filter(any_effect_filter)`. Resolution-time hexproof check runs only when true. Add hexproof regression tests (§12). At this point Pyroclasm (still old `damageAll`) and the new `damage(target_filter=all_creatures)` both behave correctly.

3. **Add new atomic effects alongside the legacy ones.** Both engines: register `move_card`, `change_control`, `force_sacrifice`, `apply_sticker`, `pump` (signed/permanent extensions). Old kinds (`draw`, `discard`, `gainControl`, `edict`, `weaken`, etc.) still dispatch correctly. New atomics callable from card data once cards migrate.

4. **Boot-validation rewrite.** Both engines: `validate_all_card_effects` walks all card data. Accepts both old kind names and new ones during cutover. Per-kind schema enforced for the new ones. Tests: malformed effect detected at boot.

5. **Migrate Godot templates** (6 templates with effects: pyromaniac, bloodlust_berserker, giant_growth, healing_salve, lightning_bolt, counterspell — all already use snake_case and `target: "chosen"` shape). The only field rename is `target` → `target_filter`. ~10 minutes of mechanical .tres edits. Add per-template test passes.

6. **Migrate proto cards via `migrate-effects.js`.** Run the script. Run `node tests/run_all.js` (the existing 362 assertions). Spot-check 20 cards across categories. Run `node tests/selfplay_harness.js 500 bughunt` for AI-vs-AI regression.

7. **Delete dead/duplicate code.** Proto: delete the first `gainControl` definition (line 2123). Delete `weaken`, `addCounter`, `damageAll`, `removeAll`, `pumpAllYours`, `edict`, `sacrifice`, `restrict`, `shuffleIntoLibrary`, `returnFromGraveyard`, `searchLandTapped`, `searchCreature`, `discard`, `draw`, `noop` from the EFFECTS dispatch table (all callers now use the new atomics). Update `js/card-text.js` describe-effect helpers in lock-step. Run all tests.

8. **Decompose `flicker` (no B4 dependency).** Replace the single `flicker` effect with `move_card(battlefield, exile)` + `move_card(exile, battlefield)` back-to-back. Test: Cloudshift still works.

9. **(After B4 lands) Decompose `exile_until_eot`.** Replace with `move_card` + `schedule_delayed(move_card)`. Test: Otherworldly Journey still works.

10. **Sticker pipeline (§3.8).** Add the new sticker kinds (`cost_mod` signed, `set_color`, `grant_mana_ability`); decompose `embargo`/`bleach`/`symmetricize` into `[effect] → apply_sticker`; delete `applyBalancerOverrides`; redesign empower (registry-declared params, identity addressing, additive deltas); dedup the two apply functions; decouple persistence from application; snake_case the sticker IDs/kinds. Sequence after the core atomic effects exist (step 3) since `apply_sticker` and `cost_mod`/`add_mana` are registry entries.

11. **Splice duplicate-pathway harmonization** (separate follow-up plan per §7).

12. **Stapler's `noop` removal.** Replace with `target_slots: 2` on the activated ability schema. Delete `noop` from EFFECTS.

13. **Update SPEC.md** to describe the new 19-effect registry, the `target_filter` classification, the function-call shorthand, the per-kind schema. Update DIVERGENCE.md rows D2 (closed by step 3+5), D3 (closed by step 3 if Godot extends `gain_life`), D4 (closed by step 3 across both).

**Which engine first?** Steps 1–4 in parallel across both engines (no card data touched yet). Step 5 (Godot) before step 6 (proto) — Godot's small pool is the low-stakes proving ground for the new dispatcher. Steps 7+ in proto first, then mirror into Godot's dispatcher.

---

## 11. Effort breakdown

Per-engine, per-step. S = an hour or two, M = half a day to a day, L = multi-day. Same rubric as `REFACTOR-NOTES.md`.

| Work | Engine | Effort |
|---|---|---|
| **Step 0**: Extract `applySpliceCore` helper from 4 duplicate sites | Proto | M (~4h) |
| `target_filter` field on `damage`/`pump`/`affect_creature`; old kinds still work | Godot | M (~4h) — `damage.gd` and `pump.gd` extended; new `affect_creature.gd` created |
| `target_filter` field on `damage`/`pump`/`removeCreature`; old kinds still work | Proto | M (~5h) — more handlers, more existing branches |
| `is_targeted_filter` predicate + hexproof routing | Godot | S (~2h) |
| `is_targeted_filter` predicate + hexproof routing | Proto | S (~3h) — multiple gate sites |
| **§3.6 last-known-info snapshot machinery + per-effect resolution-time checks** | both | M (~4h) — one snapshot field, one capture site per zone-exit, one check site per property read |
| **§3.7 iid-mint-on-arrival** in `move_card` for `to_zone=battlefield` | both | S (~2h) — including flicker-beats-removal regression test |
| New atomic effects (`move_card`, `change_control`, `force_sacrifice`, `apply_sticker`) | Godot | L (~8h) — these are mostly new handlers from scratch; `move_card` alone is ~3h |
| New atomic effects (same set, written to match proto's existing semantics) | Proto | M (~6h) — most logic exists, just refactored into the new entry points |
| Shorthand parser extension (curated `draw`/`discard`/`flicker`/etc. names that desugar to `move_card`) | both | S (~3h) — extends the predicate parser |
| Effect-kind boot validation + per-kind schema (accepts both canonical kind names and shorthand) | both | M (~4h) |
| Hand-migrate Godot 6 templates with effects | Godot | S (~30min) |
| `migrate-effects.js` script + manual verification on 258 proto cards | Proto | L (~8h) including golden-output testing and redundancy-cleanup pass |
| Card-text helpers (`describeEffect`, etc.) updated for new kinds + signed pump | Proto | M (~4h) |
| Dead-code purge (duplicate gainControl, weaken, addCounter, etc.) | Proto | S (~2h) |
| `flicker` decomposition + test | both | S (~2h) |
| `exile_until_eot` decomposition (gated on B4) | both | S (~2h) AFTER B4 lands |
| Stapler's `noop` removal + `target_slots: N` ability schema generalized to 6 cards | both | S (~3h) — covers `stapler`, `twinStrike`, `branchingBolt`, `drainLife`, `rootsAndBranches`, `swordAndSorcery` |
| New unit tests for each atomic + hexproof regression suite + last-known-info regression + iid-mint regression + boot-validator tests | both | M (~7h) |
| SPEC.md + DIVERGENCE.md updates (including D1 revision per §3.6) | doc | S (~2h) |

**Total: ~64–69 hours = L** (4.5–5.5 days, sliceable into the steps above). Biggest unknowns: `move_card`'s post-action plumbing (~3h estimated, could be more if zone-emit semantics in Godot diverge from proto's `cardEntersBattlefield` patterns), the `migrate-effects.js` script (~8h estimated, could blow up if the existing card data has format inconsistencies the audit missed), and last-known-info snapshot capture (~4h estimated, depends on how many "card property read" sites there are across effects).

---

## 12. Tests required

### 12.1 Per-atomic unit tests (one block per effect; ~19 blocks)

For each atomic, a Godot `tests/test_effects_<kind>.gd` and a proto `tests/test_effects.js` block:
- Resolves correctly on a normal target.
- Resolves correctly on a `target_filter: chosen` target (where applicable).
- Resolves correctly on mass-filter values (where applicable: `all_creatures`, `all_yours`, `all_opps`).
- Fizzles cleanly when target is gone (the existing fizzle pattern).
- Logs the expected message.

### 12.2 Hexproof regression (CRITICAL)

A `tests/test_hexproof_targeting.gd` (Godot) and `tests/test_hexproof_targeting.js` (proto):
1. Lightning Bolt at hexproof opp creature → no legal target at cast time (cast fails).
2. Lightning Bolt at hexproof OWN creature → legal target, resolves.
3. Pyroclasm with hexproof creatures on both sides → hits everyone.
4. `affect_creature(severity=destroy, target_filter=all_creatures)` with hexproof creatures → destroys all (untargeted).
5. `affect_creature(severity=destroy, target_filter=chosen)` against hexproof opp creature → no legal target.
6. `force_sacrifice(opponent)` when opp's only creature is hexproof → still works (sac doesn't target).
7. `grant_keyword(keyword=flying, target_filter=all_yours)` to your own hexproof creatures → applies normally (your own; not targeting).
8. `damage(target_filter=opponent)` against the opp player with hexproof on creatures (irrelevant; the target is the player) → resolves.

### 12.3 Compound-decomposition tests

- Scarification: `[affect_creature(destroy), apply_sticker(scarified)]` — verify both halves run, sticker applied to the destroyed creature's slot.
- Pacifism: two `grant_keyword` effects — verify both keywords (defender, no_block) applied; verify the targeted creature can't attack AND can't block.
- Wizard Adept: two `move_card` effects (the loot) — verify draw before discard order.

### 12.4 Signed-pump regression

- `pump(power=-2, toughness=-2)` (Sicken) on a 2/2 — creature has 0/0 marked, dies at SBA.
- `pump(power=-2, toughness=0)` (Frostbite Mage) on a 2/2 — creature is 0/2, survives.
- `pump(power=1, toughness=1, duration=permanent)` (Awakener) — `counters["+1/+1"] += 1`.
- `pump(power=1, toughness=1, duration=eot, target_filter=all_yours)` (Horned Herald) — every your-creature gets temp +1/+1.

### 12.5 `gainControl` dedup verification

- Cast Mind Control with `change_control` from Godot port. Compare semantics against proto's (post-refactor) `change_control`. Assert: creature moves to caster's bf, becomes sick (no `haste` param), `tempControlUntilEot` flag clean when `duration: permanent`.
- Threaten variant: `change_control(duration=eot, grant_haste=true, untap_on_take=true)` — creature moves, untapped, hasted, reverts at EOT.
- Steal variant: `change_control(transfer_ownership=true)` — slot transfers (run.js mutation), original instance removed, fresh shuffled into caster's library.
- **Regression specifically for the silent override**: after deleting the dead `gainControl` (engine.js:2123), test all three variants above — none should accidentally hit the dead handler's haste-additive path.

### 12.6 Boot-validator tests

- Add a card with `{"kind": "damagee", "amount": 3}` to a test fixture → boot fails with "Unknown effect kind: damagee".
- Add a card with `{"kind": "damage", "ammount": 3}` (typo) → boot fails with "Malformed effect: damage missing required field 'amount'".
- Add a card with `{"kind": "damage", "amount": 3, "target_filter": "alll_creatures"}` (typo) → boot fails with "Invalid target_filter: alll_creatures".

### 12.7 Function-call shorthand parser tests

Subset of the predicate parser tests, extended for keyword args:
- `"damage(amount=3, target_filter=chosen)"` parses to canonical dict.
- `"damage(3, chosen)"` (positional) parses with the first param interpreted by position.
- `"pump(power=-2, toughness=-2, duration=eot, target_filter=chosen)"` — signed values, multi-arg.
- `"force_sacrifice(player=opponent, count=1, filter=\"creature\")"` — quoted string arg.
- Whitespace tolerance: `"  damage( amount = 3 , target_filter = chosen )  "` parses identically.

### 12.8 Cross-engine semantic-equivalence tests (optional but recommended)

A small harness that builds the same card in both engines from the migrated data, fires the same effect against the same synthetic state, asserts the same end state. Three or four cards in this harness (bolt, pyroclasm, wrath, pacifism) provides high confidence the dispatcher rewiring didn't drift between engines.

### 12.9 Last-known-information regression (§3.6)

Tests that verify the live/snapshot hybrid:
1. **Swords to Plowshares analog** — multi-effect spell where the first effect exiles the target, the second references its (now-gone) power. Snapshot fires correctly; gain_life amount matches pre-exile power.
2. **Self-buff-then-damage** — target stays put across all effects. Live state, post-pump toughness. (Confirms live state is the default.)
3. **Order reversal** — same effects, opposite order. Damage-then-pump uses pre-pump toughness; pump-then-damage uses post-pump. Tests that order genuinely matters per MTG canon.
4. **Cross-effect controller reference** — Vraska-style "exile target creature, you gain life equal to its power." Controller reference still works post-exile because it's read from the snapshot.

### 12.10 iid-mint-on-arrival regression (§3.7)

Tests that verify flicker beats removal:
1. **Lightning Bolt + Cloudshift** — cast Bolt targeting opp's Bear (iid=12). Opp casts Cloudshift in response. Bear exits to exile then returns with new iid (iid=17). Bolt resolves: fizzles (iid=12 no longer exists).
2. **Targeted destruction beaten by flicker** — same pattern with `affect_creature(severity=destroy)` instead of damage.
3. **iid sequence verification** — flicker a creature; assert the returning creature's iid is greater than (not equal to) the exited creature's iid.
4. **Non-flicker zone bounces** — bounce-to-hand-then-replay also gets a fresh iid on re-arrival. Same rule, different mechanic.

### 12.11 Shorthand parser tests (§5.2)

For each shorthand effect name, verify it desugars correctly to its canonical `move_card` form. Plus verify malformed shorthand (e.g., `draw(N=oops)`) fails at boot.

---

## 13. The `rip` effect — compositional approach adopted; remaining trigger-semantics question

**Status: STRUCTURAL DECISION RESOLVED. TRIGGER-SEMANTICS DECISION DEFERRED.**

Previously, this section flagged "the `rip` effect's behavior needs another discussion before refactor." The user resolved the structural question by proposing the compositional decomposition (rip is just the run-layer slot-removal primitive; cards compose `[force_sacrifice, rip(previous_target)]` to get "Vile Edict" semantics). That's now spec'd in §4 and the worked examples.

### What the compositional approach buys us
- No bundled "rip" effect kind. Card data composes two existing/new primitives.
- `force_sacrifice` is reused naturally from Diabolic Edict.
- `rip` is a small focused primitive (~20 lines): take a target, call `RUN.removeSlotByIdx(target.slotIdx)`. That's it.
- The `previous_target` selector is generalized infrastructure useful beyond rip (also serves `flicker`'s second move_card).
- Future cards like "Target player sacrifices a creature, then exile it" become `[force_sacrifice(target_player), exile(previous_target)]` naturally.

### What's still pending: trigger semantics

The structural decomposition does NOT fix the trigger-firing issue:
- `force_sacrifice` calls `sacrificeCard`, which fires `cardDies` and `cardLeavesBattlefield` events.
- So a rip-card-style spell currently fires death + LTB triggers, then the slot is removed.
- The user's "Chaos Orb / Phylactery" mental model was "no triggers fire; card just annihilates."

**Three pending questions for pre-execution decision:**

1. **Is the trigger-firing actually wrong, or just a non-issue today?** Currently no rippable card has a death or LTB trigger. The trigger-firing on rip is a latent bug that doesn't surface in current gameplay. We could defer the decision until a card pool change makes it visible.

2. **If we DO want annihilation semantics**, what's the mechanism? Two options:
   - **(a) Annihilation effect**: a new primitive like `annihilate(target)` that removes the in-play card from its zone without zone-change emit (like Phylactery's body of `ripSlotForPhylactery`). Vile Edict's effects become `[force_sacrifice(opponent, 1, creature), annihilate(previous_target), rip(previous_target)]` — three effects in sequence. Cleanest.
   - **(b) `force_sacrifice` with a flag**: e.g., `force_sacrifice(opponent, 1, creature, suppress_triggers=true)`. Adds a parameter to a common primitive for one edge case. Uglier.
   - Recommend (a) when we decide to fix this.

3. **Composable edicts as a broader pattern**: in MTG, "Choose target player. That player [verb]s [object]." is a decomposable structure. A future refactor could introduce `target_player(filter)` + `player_action(effect)` primitives that let ANY effect run with a different player as the "controller-for-resolution." Out of scope for this refactor; flagged as a future direction.

### Recommended pre-execution decision

Use the compositional approach as currently spec'd. The structural improvement (no bundled rip effect, cards compose primitives) is solid. The trigger-semantics question is deferred until either (a) a new card requires annihilation semantics, or (b) the user decides to retrofit the existing rip-card. Decision (a) above (add `annihilate` primitive) is the cheapest fix when the time comes.

---

## Critical files for implementation

- `/home/user/Magiclike/engine/effects/effects.gd` (dispatch table + `resolve_one`; gains the new atomic kinds and the `is_targeted_filter` helper)
- `/home/user/Magiclike/reference/html-proto/js/engine.js` (the EFFECTS table at line 1366; receives all dispatch changes, dead-code deletions, and the parameterization work)
- `/home/user/Magiclike/data/card_resource.gd` (the `triggered_abilities` / `on_cast_effects` / `activated_abilities` schema fields; gains `target_slots` for Stapler-style multi-target abilities)
- `/home/user/Magiclike/reference/html-proto/tools/migrate-effects.js` (new — the proto card-data migration script, modeled on the predicate plan's `migrate-triggers.js`)
- `/home/user/Magiclike/docs/SPEC.md` §1.4 (effect descriptor schema; rewritten to document the 19-effect registry and the shorthand)
