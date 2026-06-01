# Refactor Plan: Unified Effects Registry — Audit, Decompose, and Align

**Status:** Plan complete. **Largely executed on proto** (Godot side untouched). The proto-side Slice 3 work + a follow-up review-cleanup pass have landed — including the full §3.5 targeting decomposition and the all-card field snake_case sweep; the remaining cross-engine pieces (the §3.9 mana deep-clean and Godot adoption) are still open. (Targeting model: the `target()`/`chooses()` decomposition in §3.5 is canonical throughout; the §3 disposition table's `target_filter` signatures are read via the lens note at its head.)

### Review-cleanup follow-up status (proto, as of v2.0.75)

A post-Slice-3 review produced a numbered punch-list (#1–#9 + #18 + #27). Disposition — per-item detail lives in `reference/html-proto/CLAUDE.md`'s version log:

| # | Item | Status |
|---|---|---|
| 1 | `whose` → `scope` rename + dead-branch kills | ✅ Done (v2.0.11) |
| 2 | finish `remove_creature` → `affect_creature` + string severities | ✅ Done (v2.0.12); AI-severity bug caught + fixed (v2.0.13) |
| 3 | dead-branch deletions | ✅ Done (v2.0.11) |
| 4 | stale comments / docs | ✅ Done (across the pass) |
| 5 | three targeting shapes → one `target()`/`chooses()` model | ✅ Done (v2.0.19–v2.0.21) — this *is* the master plan's §3.5 (L/multi-day, all-card + resolution-layer + both engines). |
| 6 | relocate AI valuation engine.js → ai.js | ✅ Done **partially** (v2.0.16) — relocated the pure-AI spell scorer (`spellValue`/`spellValueForEffects`) + `VALUED`/`UNVALUED` sets. **Intentionally kept** `getCardValue`/`sacValueOnBoard`/`abilityValue` in engine.js: `dealCombatDamage`'s blocker damage-assignment order and the edict `chooses()` auto-pick genuinely consume them, so a full relocation would force a combat-behavior change (the engine's coarse `cardValueOrZero` exists for layering-pure picks, but switching combat onto it is out of scope). |
| 7 | symmetricize decomposition (§3.8) | ✅ **Done per §3.8** — verified by reading the handler. symmetricize stays a named effect with a player-choice prompt (`pendingSymmetricizeChoice`/`doSymmetricizeChoice`), which is exactly what §3.8 (this doc, ~line 343) specifies: *"the effect computes its value via its player-choice prompt and calls the shared apply + persistence path."* On resolution it emits **`stat_boost` + `cost_mod` snapshot stickers** through the shared sticker pipeline — no bespoke `symmetrized` slot field; `applyBalancerOverrides`/`symmetrizedTo` deleted (asserted in `tests/test_balancer.js`). The `{kind:"symmetricize"}` surface is plan-consistent (like `chooses` is a named primitive), NOT "monolithic". ⚠️ This row flip-flopped: originally "done" (correct), wrongly flipped to "not done" in v2.0.22 from an audit agent's surface read, then re-verified done by reading the handler+`doSymmetricizeChoice` against §3.8. Leave it as done. |
| 8 | function-call effect-shorthand parser | ✅ Done (v2.0.17) — §5.1 parser + §5.2 movement desugar → `move_card`. `flicker` omitted (needs an unimplemented `previous_target` selector). No card uses shorthand yet (forward seam). |
| 9 | field-name snake_case sweep (`targetSlot`/`multiTarget`/etc.) | ✅ Done (v2.0.18) — touches all 258 card JSONs **and** the wire format the Godot loader reads. |
| 18 | decompose `destroy_and_sticker_slot` (Scarification) | ✅ Done (v2.0.14) |
| 27 | broaden `rip` + decompose Vile Edict | ✅ Done (v2.0.15) — kept "rip a permanent" breadth via `chooses(permanent)`; rip-edict uses `annihilate` (no-trigger), per §13. |

Note: review #6's full §8.1 redesign (scope-aware *and* `target()`-step-aware valuation + boot coverage assertion) is broader than the v2.0.16 relocation — the coverage assertion (§7b) and scope-aware valuation already landed in Slice 3; the `target()`-step-aware reads are gated on #5/§3.5.

**Pre-execution note:** `rip` is a **broad, zone-agnostic** "tear up that card, gone from your deck forever" primitive (§13) — it strips a card's deck-slot regardless of zone and composes after any targeting/removal (`target(player)→chooses(creature)→annihilate→rip` for a creature; `target(spell)→counter→rip` for a spell). Current code is the narrow bundled `ripPermanent` (battlefield-only, fires triggers — the accepted kludge); the broad decomposed form is the decided target. For the creature/edict case specifically it's one verb off an edict (edict uses `sacrifice`; rip-edict uses `annihilate`, built this pass — §13, review OBS 1). No open questions block execution.
**Cross-references:** `docs/DIVERGENCE.md` items D1 (target target-state semantics — see §3.6), D2 (`pump` duration → `addCounter`), D3 (`gain_life` flexibility), D4 (`gain_life` signed delta), B4 (delayed-trigger machinery — required for `exile_until_eot` decomposition), C5 (killer attribution — adjacent), E1/E2 (event vocabulary + composable predicates, prerequisite for the `move_card` effect's destination semantics). `docs/RULES.md` §703 (target legality), §704 (resolution + fizzle), §904 (hexproof). `docs/SPEC.md` §1.4 (effect descriptor schema).
**Effort estimate:** **L** (~6–6.5 days end-to-end across both engines, ~92–97 hours, including card migration, the §3.9 mana deep-clean + full-convergence Godot land-as-ability adoption, the §8.1 AI-valuation lockstep redesign + boot coverage assertion, the human `chooses()` prompt, tests, splice helper extraction, and registry consolidation; this is by far the largest of the planned refactors because it touches all 258 proto cards, all 31 Godot templates, and rewrites the dispatch table itself).

Produced by an Explore/Plan pass against `reference/html-proto/js/engine.js` (EFFECTS table at line 1366, 38 handlers below it), `engine/effects/*.gd` (Godot's 5 handlers), `data/card_resource.gd`, and all 31 Godot templates plus 258 proto card JSONs. The goal is to land the long-term effects design (a small registry of atomic effects, parameterized target filters, decomposed compounds) before Phase 6 card-pool expansion makes mechanical migration expensive.

This refactor is sequenced **after** `plan-zone-change-and-composable-predicates.md` (E1/E2).

> **B4 is NOT a prerequisite for this refactor — read this before flagging it.** Reviewers repeatedly read "needs B4" and conclude the whole refactor is blocked on Godot's delayed-trigger queue (B4, a Phase 7+ item). It is not. B4 gates exactly **one** sub-step — re-expressing `exile_until_eot` in the shared `move_card` + `schedule_delayed` atoms — and that sub-step is *itself* deferred. The refactor **completes without B4**: `exile_until_eot` stays a monolithic handler on both engines (the conscious cross-engine *symmetry* state — review OBS 2, §9.1), `flicker` and everything else proceed normally. So "after B4" applies only to that final decomposition, whenever B4 eventually lands — not to the refactor as a whole. Full rationale at §9.1.

---

## 1. Current effect-kind audit

### Godot — 5 effect kinds

| Name | Source | One-line semantics | Target shape | Params |
|---|---|---|---|---|
| `damage` | `engine/effects/damage.gd` | Deal N damage to a creature OR player. | `chosen` (`ctx.targets[0]` = creature\|player) or constant `controller`\|`opponent`. | `amount: int, target: String` |
| `add_mana` | `engine/effects/add_mana.gd` | Add to `ctx.controller.mana`. | None (always controller). | `amounts: Dict` OR flat `R:1` shorthand |
| `pump` | `engine/effects/pump.gd` | Boost creature P/T; `duration="eot"` → temp, else +1/+1 counters. | `chosen` (must be creature). | `amount_power, amount_toughness, duration, target` |
| `gain_life` | `engine/effects/gain_life.gd` | Add life to controller; refuses non-positive. | None (always controller). | `amount: int` |
| `counter_spell` (canonical: `counter`) | `engine/effects/counter_spell.gd` (→ `counter.gd` on the standardization branch) | Remove a stack entry via `RulesEngine.counter_stack_entry`. | `chosen` (must be `kind:"stack"`). | `target: "chosen"` (constant) |

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
| `counter` | `counter_spell` → `counter` | Both — divergence resolved: standardization renamed Godot to `counter` (canonical) |

All 33 other proto kinds: proto-only. (The Godot side will gain everything below `gain_life` in the audit table when Phase 6 begins porting proto cards.)

#### 1.2 Footnotes on the audit

- **Duplicate `gainControl` (#32 / #34)**: real bug. JS object literals silently override. The first definition (line 2123) handles `params.haste` (string-additive), the second (line 2177) handles `params.grantHaste` (boolean → `applyGrant`). The two have subtly different semantics for the haste-grant path — the first puts the creature out of sickness manually, the second uses the proper grant infrastructure. Fixing this falls out of decision 11 (unify into `change_control`).
- **`noop` (#38) usage** is structural, not semantic — `cards/stapler/card.json` uses `kind: "noop"` to mark the second target slot of the activated ability so the target-validation system requires two targets. The handler body is `{}`. Decision 17 said "investigate; if unused, delete." Audit verdict: it IS used, but not as an effect — it's a target-slot marker. **Recommendation: replace `noop` with a structural property on the ability** (`target_slots: 2`) so the effect-kind registry doesn't have to carry an empty-body marker. Pure handler-side cleanup, no semantic change. Flagged as a step in §10.
- **`target_slots: N` generalization** — beyond Stapler, five other cards use multi-target patterns: `twinStrike`, `branchingBolt`, `drainLife`, `rootsAndBranches`, `swordAndSorcery`. They currently use ad-hoc `targetSlot` indexing per effect. The `target_slots: N` ability-schema field becomes the canonical declaration for ALL multi-target abilities, not just Stapler. Each effect in the array can declare `target_slot: 0` or `target_slot: 1` (etc.) to say which target it operates on. Replaces the `noop` Stapler hack AND unifies the ad-hoc indexing of the other 5 cards.
- **`sacrifice` (#28)** is defined but no card uses `kind: "sacrifice"` as an EFFECT (Carrion Feeder uses `sacrifice: "creature"` as a COST, which is a separate code path in the cost-payment logic). Decision 15: `sacrifice` becomes the atomic removal **verb**, and the edict decomposes to `target(player) → chooses(creature) → sacrifice` (§3.5) — there is no bundled `force_sacrifice` effect.
- **Splice duplicate-pathway**: confirmed at `js/engine.js:124` ("Splice merge math — shared by RUN.applySplice and ENGINE.EFFECTS.applyInGameSplice") and `js/run.js:865`. The two paths share `canonicalSplicePair`, `isSpliceableBase`, `isCompatibleStaplePair`, `remapEmpowerRollForStaple` helpers, but each has its own ~200-line body for slot mutation, slotIdx index fixups, and merged-data assembly. Decision 8 flagged this; §7 makes it an investigation sub-task.
- **`damageAll`'s hexproof note** at engine.js:2010-2014 already documents the correct rule ("Hexproof doesn't protect (this isn't a targeted effect)") and `edict` at engine.js:1957 has the matching note ("no targeting, so hexproof doesn't protect"). Decision 2's hexproof contract is already encoded in the proto behavior; this refactor is making it structural rather than per-kind tribal knowledge.
- **`createTokens` vs `flicker` ETB emit**: both emit `cardEntersBattlefield` for the produced/returning card. After the E1 refactor lands, both will emit `card_zone_change(anywhere→battlefield)` — the `move_card` effect inherits this for free.

### 1.3 Dead code / loose ends surfaced during audit

| Item | Where | Fate |
|---|---|---|
| Duplicate `gainControl` | engine.js:2123 (dead) | Deleted as part of decision 11. |
| `sacrifice` effect | engine.js:2003 (no card uses it) | Becomes the `sacrifice` removal verb; edicts decompose via `target()`/`chooses()` (decision 15, §3.5). |
| `noop` as effect | engine.js:2241 (Stapler's slot marker) | Replaced by `target_slots: 2` on ability schema. |
| `pumpAllYours` distinct from `pump` | engine.js:2203 | Folded into `pump` with mass `scope: all_yours` (decision 2, §3.5). |
| `damageAll` distinct from `damage` | engine.js:2016 | Folded into `damage` with mass `scope: all_creatures` (decision 2, §3.5). |
| `removeAll` distinct from `removeCreature` | engine.js:2042 | Folded into `affect_creature` with mass `scope` (decision 2, §3.5). |
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
| 2 | Single/mass unification | `damage`+`damageAll`, `removeCreature`+`removeAll`, `pump`+`pumpAllYours` | Three pairs collapse to three single effects. The single-target ("chosen") case is expressed by a leading `target()` step (§3.5); the mass case carries an automatic **scope** on the effect (`all_creatures`, `all_yours`, `all_opps`). Hexproof is structural — only effects behind a `target()` step check it; mass-scoped effects never do. |
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
| 12b | `ripPermanent` → `rip` (broadened) | `ripPermanent` | Drop the "Permanent" qualifier and broaden it: `rip` is a **zone-agnostic** slot-strip primitive (§13) that composes after any targeting/removal (`target(player)→chooses(creature)→annihilate→rip`; `target(spell)→counter→rip`). Current code is the narrow bundled `ripPermanent` (battlefield-only, fires triggers — kludge); the broad standalone `rip` is the decided target. |
| 13 | `restrict` → `grant_keyword` | `restrict` | Deleted. `restrict(cantAttack: true)` → `grant_keyword(defender)`. `restrict(cantBlock: true)` → `grant_keyword(no_block)` where `no_block` is a new hidden internal keyword added to the keyword registry. `restrict(cantAttack: true, cantBlock: true)` → an array of two `grant_keyword` effects (the existing array-of-effects machinery handles compounds). |
| 14 | `untap` stays | `untap` | Kept as its own primitive. Not on the severity ladder (it's the inverse of tap, not part of removal). |
| 15 | `edict` + `sacrifice` → decomposed (§3.5) | both | The edict decomposes into `target(player) → chooses(creature) → sacrifice` — **no bundled `force_sacrifice` effect**. `sacrifice` is the atomic removal verb (the chosen creature → graveyard, fires triggers); `annihilate` is its no-trigger sibling (rip, §13). The standalone `sacrifice` effect (no card uses it today) is the same verb. `rip` stays a distinct trailing step because of the slot-loss permanence — see §3.4. |
| 16 | `endomorph_absorb` stays | `endomorphAbsorb` | Kept as-is. Card-specific complex mechanic. |
| 17 | `noop` | `noop` (Stapler's slot marker) | **Audit finding**: not unused. It's structural. Replaced by `target_slots: N` on the ability schema (see §1.2). `noop` effect kind deleted. |
| 18 | Compound decomposition | `destroy_and_sticker_slot` (1 card: Scarification) | Becomes `[affect_creature(severity:destroy), apply_sticker(scarified)]`. Audit found no other compounds masquerading as monolithic kinds — Wizard Adept's `[draw, discard]` pattern is already array-based. So #18 is small in scope: one card. |

---

## 3. Unification + decomposition table (per-kind disposition)

For each of the 38 proto kinds, what happens. Final column shows the new home; "kept" means stays as its own atomic.

> **Targeting lens (§3.5):** where a signature below shows `target_filter`, the *chosen-target* case is now established by a leading **`target()` step**, not an inline per-effect filter; the parameter shown on the effect is the mass/automatic **scope** only (`all_creatures`, `all_yours`, `all_opps`). Read `target_filter` here as "scope when mass; otherwise a `target()` step supplies the target."

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
| 16 | `counter` | kept | `counter(target_filter: spell)` — proto's name; the standardization branch renamed Godot `counter_spell`→`counter` to match, so `counter` is canonical |
| 17 | `addMana` | renamed | `add_mana(amounts)` |
| 18 | `gainLife` | renamed + flex (D3/D4) | `gain_life(amount, target)` — signed delta per D4, optional target per D3 |
| 19 | `draw` | unified (#10) | `move_card(library, hand, controller, N)` |
| 20 | `discard` | unified (#10) | `move_card(hand, graveyard, target_player_selector, N)` |
| 21 | `searchLandTapped` | unified (#10) | `move_card(library, battlefield, library_search(land), 1, {post: tap, shuffle})` |
| 22 | `searchCreature` | unified (#10) | `move_card(library, hand, library_search(creature), 1, {post: shuffle})` |
| 23 | `restrict` | removed (#13) | → `grant_keyword(defender)` and/or `grant_keyword(no_block)` |
| 24 | `grantKeyword` | renamed + unified (#2) | `grant_keyword(keyword, duration, target_filter)` |
| 25 | `createTokens` | renamed | `create_tokens(token_id, count, controller)` |
| 26 | `edict` | decomposed (#15, §3.5) | `target(player) → chooses(creature) → sacrifice` |
| 27 | `ripPermanent` | broadened → `rip` | Zone-agnostic slot-strip (§13). Creature: `target(player) → chooses(creature) → annihilate → rip`. Current code is the narrow bundled kludge. |
| 28 | `sacrifice` | verb (#15) | `sacrifice` (the chosen/target creature; no current card uses it standalone) |
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

### 3.4 Why `rip` is its own step (not part of the removal verb)

Under the targeting decomposition (§3.5), an edict is `target(player) → chooses(creature) → sacrifice`. `rip` is a separate **run-layer** step that strips the chosen creature's deck-slot permanently (run.js bookkeeping, not just engine). Keeping it a distinct step — rather than baking slot-loss into `sacrifice`/`annihilate` — means the removal verbs stay clean (a normal sacrifice doesn't touch the run) and rip-cards just append the `rip` step. Edict and rip-edict then differ by exactly one verb plus the trailing `rip` (see §13).

### 3.5 Targeting model — `target()` / `chooses()` primitives (the critical correctness section)

**DECISION (supersedes the earlier single-`target_filter` + `is_targeted_filter` design).** Targeting is decomposed into explicit atomic steps that precede the effects — matching our decomposition philosophy and MTG's actual structure. A spell/ability declares its targeting up front; effects then operate on what was established. This also supersedes the standardization branch's deferred two-field `target_mode`/`target_filter` plan (their Pass 5) with a cleaner decomposition, built on the same wire/loader foundation they shipped.

**Two targeting primitives:**

| Primitive | Meaning | Who acts | Hexproof? |
|---|---|---|---|
| `target(filter)` | The **caster aims** at something at cast time; locked in, re-validated at resolution (RULES §703/§704). | caster | **Yes — this is the hexproof checkpoint** |
| `chooses(filter)` | A **targeted player selects** one of their own permanents at resolution. NOT targeting. | the targeted player | **No** |

`filter` values are the **closed** legal-object taxonomy — this is the exact membership set the boot validator (§8) checks `target()`/`chooses()` filters against; there is no open tail. Adding a filter means adding it here **and** to the validator's set in the same change:

`creature`, `player`, `creature_or_player`, `spell`, `permanent`, `your_creature`, `opp_creature`, `graveyard_creature`.

(`creature_or_player` is the canonical spelling of proto's `"any"`; `chooses()` uses the same taxonomy but only the permanent-typed members are meaningful for it.)

Effects after a targeting step operate on **"the target"** (or "the chosen") via the resolution context — no per-effect target field needed for the chosen case.

**Automatic / mass effects have NO targeting step.** They carry their own scope directly on the effect: `controller`, `opponent`, `self`, `all_creatures`, `all_yours`, `all_opps`, `each_player`. These never prompt and never check hexproof. (`library_search(filter)` is also untargeted — the controller picks from their own library at resolution; MTG "choose," not "target.")

**"Is this targeted?" is now structural, not a value lookup.** The question "does hexproof apply / does the caster pick / does it fizzle if the thing leaves" has one answer: **did the spell have a `target()` step?** This retires the `is_targeted_filter(value)` helper — the structure carries the answer, so there's nothing to classify.

**Why the `target`/`chooses` split is correct, not just clean — the edict case.** Diabolic Edict is "target player sacrifices a creature." It targets the *player*; the creature is *chosen by that player*, not targeted. That's exactly why an edict kills a hexproof creature in MTG — hexproof only blocks targeting, and the creature was never targeted. The decomposition encodes this for free:

```
Diabolic Edict:  target(player) → chooses(creature) → sacrifice
```

Only `target(player)` is a targeting step. The `chooses(creature)` step is selection-by-the-targeted-player, so creature-hexproof is irrelevant — correct. A flat "this effect targets a creature" model would wrongly let hexproof block the edict.

**Worked shapes:**

| Card | Targeting | Effects (operate on the target/chosen unless scoped) |
|---|---|---|
| Lightning Bolt | `target(creature_or_player)` | `damage(3)` |
| Pyroclasm | *(none)* | `damage(2, all_creatures)` |
| Wrath of God | *(none)* | `affect_creature(destroy, all_creatures)` |
| Diabolic Edict | `target(player)` | `chooses(creature)`, `sacrifice` |
| Scarification | `target(creature)` | `affect_creature(destroy)`, `apply_sticker(scarified)` |
| Mind Control | `target(creature)` | `change_control` |
| Healing Salve | *(none)* | `gain_life(3, controller)` |

**Multi-target spells: shared default for one target, explicit `target_slot` for two-plus.** The two rules compose; they are not alternatives:
- **One `target()` step → shared default.** All effects operate on that single target; no per-effect field. This retires the `same_as_previous` / `target: "chosen"`-on-every-effect boilerplate the earlier design needed (and simplifies the §6.12 Scarification example).
- **Two-plus `target()` steps → explicit `target_slot: N` binding** (the §1.2 mechanism). Each *targeted* effect declares which slot it consumes; effects that carry a `scope` or hit `self` carry no slot. The per-effect index does **not** go away for genuine multi-target — positional "effect *i* → target *i*" cannot express the real cards (see Drain Life below). Worth stating plainly because an earlier draft of this section claimed N `target()` steps *replace* the index; they don't — they replace it only in the one-target case.

The five multi-target cards in the pool, worked (all currently use inline `target` + `targetSlot` + a `multiTarget` flag — verified against their `card.json`):

| Card | Targeting steps | Effects (with slot binding) |
|---|---|---|
| Twin Strike | `target(creature)` ×2 | `pump(+1/+1, slot 0)`, `pump(+1/+1, slot 1)` |
| Branching Bolt | `target(creature)` ×2 | `damage(2, slot 0)`, `damage(2, slot 1)` |
| Roots and Branches | `target(creature)` ×2 | `affect_creature(tap, slot 0)`, `pump(+1/+1, slot 1)` |
| Sword and Sorcery | `target(creature)` ×2 | `pump(+2/+2, slot 0)`, `affect_creature(tap, slot 1)` |
| **Drain Life** | `target(creature)`, `target(player)` | `damage(2, slot 0)`, `damage(2, slot 1)`, `gain_life(4, self)` |

Drain Life is the proof the index is mandatory: three effects, two targets of **different** filters (a creature and a player), and one untargeted effect (`gain_life(self)`). No positional scheme expresses it — the slots must be named, and the untargeted effect must opt out of slotting.

**`chooses()` needs a human-facing prompt (scope — review GAP 2). ✅ DONE on proto (v2.0.31; DOM browser-verify pending).** `chooses(creature)` = "the targeted player selects one of their own permanents." For the AI it's an auto-pick; for the **human** it needed a choose-your-creature prompt that didn't exist — the old handler auto-selected even when the human was the sacrificing player. **Implemented:** `resolveTopOfStack`'s chooses-branch defers when the chooser is `'you'` — it stashes the trailing chosen-dependent effects on a new `pendingEdictChoice` modal (registered in `PENDING_DECISIONS`, so `step()`/`anyoneOwesDecision` pause for the pick) and the spell still resolves to the graveyard; the human submits an `edictChoice` action and `doEdictChoice` replays the trailing effects with the pick as `ctx.chosen`, then `drainTriggers()`. The AI path is unchanged (handler auto-picks; `AI.decide` resolves its own `pendingEdictChoice` so selfplay stays clean). `pendingRipSelect`/`doRipSelect` no longer exist (deleted v2.0.15), so the prompt was built from the `pendingSymmetricizeChoice` pattern, not rip's. Engine contract covered by `tests/test_edict_human_choice.js`; the DOM modal (`#edictChoiceModal`, mirrors the symmetricize modal) needs a **browser check** (DOM not covered by Node). **Godot mirror** still builds the prompt from scratch against the same contract.

**Resolution-model change (scope note).** This moves both engines to "resolution first establishes targets/choices, then runs effects against them," rather than each effect independently reading `ctx.targets[i]`. It's a resolution-layer change — it touches the target-pick flow, hexproof gating, and every targeted card — not just a card-data rename. Worth it during this pass: targeting touches every targeted card, so doing it now means touching cards once, not twice.

**Test obligation.** §12 includes: Pyroclasm hits hexproof creatures (no target step); Lightning Bolt cannot `target()` a hexproof opp creature; an edict (`target(player) → chooses(creature)`) sacrifices a hexproof creature (the creature is never targeted); multi-`target()` spells pick distinct targets.

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

**Worked example — Self-buff-then-damage**: `target(creature)` then `[pump(+2/+2), grant_keyword(lifelink), damage(amount=its_toughness)]` — one target, three effects. The creature stays on battlefield throughout. Live state applies: damage = post-pump toughness. **Order matters**: if the spell text were "deal damage = toughness, then +2/+2 and lifelink," the damage uses pre-pump toughness because that's the live state at THAT effect's resolution.

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

**The actual proto state (verified by reading the handlers — do not "fix" the wrong path).** `flicker` (engine.js:2098) **already mints a fresh iid** on return (`card.iid = nextIid++`, engine.js:2112, with an in-code comment calling it the defensive point of flicker), so the Cloudshift scenario above already works today. The divergent path is `exileUntilEOT` (engine.js:2154): it plucks the card and holds the **same object** on a delayed trigger (`G.delayedTriggers`, engine.js:2163), then returns it at end step (engine.js:5319–5345) **with its original iid** — no re-mint. The refactor's rule (mint on *every* battlefield-arrival, applied inside `move_card` for `to_zone=battlefield`) closes the `exileUntilEOT` path; flicker already complies. **Implication for the regression test:** point it at `exileUntilEOT` (Otherworldly Journey), not flicker — a flicker test would pass before the fix and never exercise it (§12.10).

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
3. Collapse `doTapLandForMana`'s land/non-land branch into one ability path (proto).
4. Update `landProducibleColors` consumers — AI mana planning (`canPayPotential`), the tap action, auto-tap-for-cost (engine.js:1277–1308).
5. Rewrite the land+creature staple-merge logic (engine.js:391–441) that reads `extraManaColors`.
6. UI: color-choice tap prompt + mana-pip rendering read the ability's color set.
7. **Godot adopts the model internally (option 3 — see note below):** `JsonCardLoader` produces the tap-ability onto `CardResource` (retiring its `mana_produced`/`extraManaColors` read at `json_card_loader.gd:209–217`); Godot's mana resolution runs the tap-for-mana ability path; the priority-window `KIND_TAP_LAND_FOR_MANA` generalizes to `is_mana_ability`.

**Sequencing:** done as an **adjacent step within this same coordinated pass**, sequenced *after* the effects+sticker core is passing tests — so a mana regression has a clean diagnostic surface and can't be confused with an effect/sticker regression during bring-up. (Architectural detail; the "what" is settled, the exact step ordering is at the implementer's discretion.)

**Godot coordination — FULL CONVERGENCE this pass (DECIDED — option 3; closes review GAP 1).** Both engines adopt the land-as-ability model *internally*, not just the shared wire shape. In the **same slice** that rewrites lands to the ability shape and retires `extraManaColors`:
- Godot's `JsonCardLoader` produces the tap-for-mana ability onto the `CardResource` — replacing the legacy `mana`/`extraManaColors` read at `json_card_loader.gd:209–217` — and Godot's mana resolution runs the ability path (the same one a Llanowar-style dork would use), collapsing the land/non-land branch exactly as proto's `doTapLandForMana` does.
- The priority-window plan's `KIND_TAP_LAND_FOR_MANA` generalizes to a structural `is_mana_ability` classification (produces mana, no target) so the auto-pass meaningfulness check and stack fast-path cover land taps *and* creature mana dorks uniformly. This is **committed to this pass**, not a deferred "when Godot adopts it" note (see `plan-priority-window-refactor.md` §3).

This makes the engines' mana handling structurally identical (wire **and** internals) — the point of the coordinated pass. It also dissolves review GAP 1 **by construction**: Godot consumes the ability shape natively, so there's no translation bridge and no window where lands tap for zero. Sequencing detail: card-data Slice 1 keeps the current `extraManaColors` basics working (Godot still reads them then); the JSON rewrite *and* Godot's ability-model adoption land **together** in this slice (Slice 3), so there is no intermediate break.

> **No open questions block execution.** (`rip`: `annihilate` is built this pass so rip-edict uses the correct no-trigger verb — no kludge — §13 / review OBS 1. The mana-model scope is decided — deep clean, above.)

### 3.10 Staple template-synthesis cleanup

`synthesizeStapledTemplate` + `mergeStapleInto` (engine.js:270–454) merge a base and staple card into one template. The refactor already touches this function (mana-model rewrite §3.9 step 5, `target_slots` §1.2, empower remap §3.8); since it's being edited anyway, fold in three structural fixes — proto-side cleanup, and design-from-scratch guidance for the Godot port (which has no staple system yet).

**The merge is a triangular matrix, not a square one — leverage the canonicalization hierarchy.** `canonicalSplicePair` (engine.js:90–103) already picks the base by a type *priority*: Creature(0) > Artifact(1) > Land(2) > Spell(3), lower wins the base slot. That guarantee makes most of the 3×3 grid unreachable: a Land base can never have a Creature staple (the creature would have won the base slot), and a Spell base can only ever pair with a Spell staple. **Six reachable cells, not seven:**

| Base ↓ \ Staple → | Creature | Land | Spell |
|---|---|---|---|
| **Creature** | Cr+Cr (body merge) | Cr+Ld ({T}:add_mana ability) | Cr+Sp (spell → ETB trigger) |
| **Land** | — creature would be base | Ld+Ld (mana merges) | Ld+Sp (spell → ETB trigger) |
| **Spell** | — | **— land would be base (Sp+Ld is DEAD CODE)** | Sp+Sp (effects concat, multiTarget) |

The current `else if (stapleTpl.type === 'Land')` branch (engine.js:435, "spell gains add_mana on resolve") **cannot be reached** through canonicalization — a Spell+Land pair always stores Land as base (Land=2 beats Spell=3). **Confirmed dead code (user verified the reward was unreachable and unmissed) — delete it.**

> **Ld+Sp rebalance is out of scope here.** The surviving Ld+Sp behavior (spell → *free* ETB trigger) is recognized as too strong, but the fix — an *optional, paid* ETB — is new design work requiring optional-trigger + pay-on-resolution machinery the engine lacks. Tracked in `reference/html-proto/BACKLOG.md` ("Optional paid ETB for Land+Spell staples"); this refactor only cleans up the existing free version.

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

Target count: **~22 atomic effects** down from proto's 38 (roughly half). The figure grew past the original "19" headline because the §3.5 targeting decomposition added two primitives (`target`/`chooses`) and `annihilate` is now built (review OBS 1) — the per-category table below is authoritative. Grouped by category. All take `(effect: Dictionary, ctx: Dictionary)` per the existing Godot `Effects.resolve_one` contract.

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

> All effects below operate on **"the target"** when behind a `target()` step (§3.5), or carry an optional mass **`scope`** (`all_creatures`/`all_yours`/`all_opps`/`controller`/`opponent`/`self`) for the automatic case. No per-effect `target_filter`.

**Damage (1)**
- `damage(amount, scope?)` — replaces proto's `damage` + `damageAll`. Targeted (`target(creature_or_player)` + `damage`) or mass (`scope: all_creatures`).

**Stat-modify (3)**
- `pump(power, toughness, duration, scope?)` — replaces `pump` + `weaken` + `addCounter` + `pumpAllYours`. Signed deltas; `duration: eot|permanent`; targeted via `target()`, or mass via `scope: all_yours`/`all_creatures`.
- `grant_keyword(keyword, duration, scope?)` — replaces `grantKeyword` + `restrict`. Hidden internal keyword `no_block` for restrict's `cantBlock` path.
- `untap` — kept primitive (targeted via a `target()` step).

**Removal (1)**
- `affect_creature(severity, scope?)` — replaces `removeCreature` + `removeAll`. Severity: `tap|bounce|destroy|exile`. Targeted via `target(creature)`, or mass via `scope: all_creatures`/`all_opps`.

**Card-movement (1)**
- `move_card(from_zone, to_zone, selector, amount, post?)` — replaces `draw`, `discard`, `shuffle_into_library`, `return_from_graveyard`, `search_land_tapped`, `search_creature`, `flicker`*, `exile_until_eot`*. Selector vocab: `controller`, `target_player`, `chosen_creature`, `library_search(filter)`, `self`. (* See decision 9 — these need delayed-effect machinery for the return half; the OUTGOING move uses `move_card`.)

**Control (1)**
- `change_control(target, duration, grant_haste, untap_on_take, transfer_ownership)` — replaces `gainControl` (both defs) + `steal`. Steal sets `transfer_ownership: true` plus an internal "shuffle into library" follow-up.

**Mana / life (2)**
- `add_mana(amounts)` — kept; accepts flat shorthand per D5.
- `gain_life(amount, target)` — kept; signed per D4, optional target per D3.

**Counter / stack (1)**
- `counter` — proto's name, kept canonical (the standardization branch renamed Godot's `counter_spell`→`counter` to match). Targeted via a `target(spell)` step.

**Tokens (1)**
- `create_tokens(token_id, count, controller)` — kept.

**Targeting (2)** — see §3.5
- `target(filter)` — caster aims at something at cast time (the hexproof checkpoint). Effects after it operate on "the target."
- `chooses(filter)` — the targeted player selects one of their own permanents at resolution (NOT targeting; no hexproof).

**Sacrifice / removal verbs (2)**
- `sacrifice` — the chosen/target creature is sacrificed by its controller (→ graveyard, fires death/LTB triggers). The edict (formerly the bundled `force_sacrifice`/`edict`) decomposes to `target(player) → chooses(creature) → sacrifice`; there is no longer a bundled `force_sacrifice` effect. (Targeted removal the *caster* aims — destroy/exile/bounce/tap — stays under `affect_creature`.)
- `annihilate` — rip's no-trigger sibling: like `sacrifice` but the creature ceases to exist — no graveyard, no death/leave triggers. **Built this pass** (review OBS 1): it's `sacrificeCard` (engine.js:3258) minus the graveyard push and the `cardDies`/`emitLeavesBattlefield` emits (~10–15 lines, mirroring `ripSlotForPhylactery`'s pluck-with-no-emit body at engine.js:3652). Rip-edict uses `annihilate` — the `sacrifice` kludge is not shipped.

**Stickers (1)**
- `apply_sticker(kind, target, ...params)` — the generic persistent-modification primitive. Carries a sticker `kind` (`stat_boost`, `cost_mod`, `set_color`, `grant_mana_ability`, `scarified`, keyword kinds, etc.) plus that kind's params. Replaces the `embargo`/`bleach`/`symmetricize` bespoke channel: each is now `[movement/choice effect] → apply_sticker(specific_kind)` and `applyBalancerOverrides` is deleted. Full design in §3.8.

**Specials — card-bespoke (5)**
- `endomorph_absorb` — Endomorph.
- `bargain_sticker_self` — Archdemon ETB.
- `bargain_sticker_other` — Archdemon LTB.
- `fight_target` — Beast's Fury (targeted via a `target(creature)` step).
- `apply_in_game_splice(target_pair)` — Stapler.

**Run-layer primitives (1)**
- `rip` — a **broad, zone-agnostic** run-layer primitive: strip the targeted card's deck-slot from the run permanently (`RUN.removeSlotByIdx`). It doesn't care what zone the card is in — it composes after whatever targeting/removal preceded it. Creature: `target(player) → chooses(creature) → annihilate → rip`. Spell: `target(spell) → counter → rip`. Same `rip` step; the slot machinery keys off a `slotIdx` that any deck-originated card carries. **Current code is the narrow, bundled `ripPermanent`** (battlefield-permanents only, player-targeted, uses `sacrifice`-style removal that fires triggers — the kludge). The broad standalone `rip` is the decided target; see §13.

| Category | Count |
|---|---|
| Targeting (`target`, `chooses`) | 2 |
| Damage | 1 |
| Stat-modify | 3 |
| Removal (`affect_creature`) | 1 |
| Card-movement | 1 |
| Control | 1 |
| Mana / life | 2 |
| Counter | 1 |
| Tokens | 1 |
| Sacrifice / removal verbs (`sacrifice`, `annihilate`) | 2 |
| Stickers | 1 |
| Specials (card-bespoke) | 5 |
| Run-layer (`rip`) | 1 |
| **Total** | **~22** |

Roughly half of proto's 38, now including the two targeting primitives. The headline "fewer, sharper primitives" holds; the targeting decomposition added two atoms while dissolving the bundled `force_sacrifice`/`edict`/per-effect-`target` shapes into composable steps.

---

## 5. Card-data format

A card with targeting declares a leading `target` (the `target()` step, §3.5); its `effects` then operate on "the target." Effects appear in three places: `on_cast_effects`, `activated_abilities[i].effects`, `triggered_abilities[i].effects`. Each effect is a `Dictionary` keyed by `"kind"` plus per-kind fields (plus an optional `scope` for mass/automatic effects).

**Two surface shapes, matching the predicate plan's convention:**

| Shape | Example | When to use |
|---|---|---|
| Canonical dict | `{"target": "creature_or_player", "effects": [{"kind": "damage", "amount": 3}]}` | Always works in both engines. The evaluator's internal form. |
| Function-call shorthand | `target(creature_or_player); damage(3)` | Concise authoring; parses to the canonical dict. |

The function-call shorthand is the same parser introduced in the predicate plan (§4.x of `plan-zone-change-and-composable-predicates.md`), generalized to keyword-style args. Parser rules:

- Bare identifiers are positional and ordered (`damage(3)`); keyword args use `name=value` (`damage(amount=3)`). Mix is allowed: positional args precede keyword args.
- Arg coercion: integer → int, float → float, `true`/`false` → bool, quoted string → string, bare identifier → string. Identical to the predicate parser.
- Whitespace-tolerant.
- Single-arg or no-arg works: `chooses(creature)`, `bargain_sticker_self()`.

**Targeting is a step, not a per-effect field (§3.5).** The proto field `target` was overloaded (a target-shape selector AND a controller-relative hint like `"any"`/`"self"`). It's replaced by: a leading `target(filter)` / `chooses(filter)` step for the chosen case, and an optional `scope` on the effect for the automatic/mass case. Migration maps the old per-effect `target` to whichever applies (`"any"`/`"creature"`/… → a `target()` step; `"controller"`/`"self"`/mass → an effect `scope`).

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

**Effect on registry size**: from a card-author perspective, the effective vocabulary is ~32 effects (~22 canonical atomic + ~10 shorthand names for movement). From an engine perspective, still ~22 handlers. Best of both worlds.

**Boot validation**: validator accepts shorthand names AND canonical names. Card data is normalized to canonical form at parse time. Grep-ability is preserved on both sides.

---

## 6. Worked migration examples

Twelve representative cards across categories. Each block shows the proto JSON before, the canonical dict after, AND the function-call shorthand.

### 6.1 Lightning Bolt — basic targeted damage

```js
// Before (cards/bolt/card.json):
{ "effects": [ {"kind": "damage", "target": "any", "amount": 3} ] }

// After (targeting decomposition — §3.5):
{ "target": "creature_or_player", "effects": [ {"kind": "damage", "amount": 3} ] }
// Shorthand: target(creature_or_player); damage(3)
```

The leading `target()` step carries the legal-target filter (`creature_or_player`) and is the hexproof checkpoint; the `damage` effect just operates on "the target." No per-effect target field — targeting is its own step (§3.5).

### 6.2 Pyroclasm — mass damage (hexproof case)

```js
// Before:
{ "effects": [ {"kind": "damageAll", "amount": 2} ] }

// After (no target() step — mass scope on the effect):
{ "effects": [ {"kind": "damage", "amount": 2, "scope": "all_creatures"} ] }
// Shorthand: damage(2, scope=all_creatures)
```

Pyroclasm has **no `target()` step** (its damage carries the mass scope `all_creatures`), so there's no cast-time prompt and no hexproof gate — it hits every creature including hexproof ones (§3.5). Behavior matches MTG canon.

### 6.3 Sicken — weaken via signed pump

```js
// Before:
{ "effects": [ {"kind": "weaken", "target": "creature", "power": 2, "toughness": 2} ] }

// After (targeting decomposition — §3.5):
{ "target": "creature", "effects": [ {"kind": "pump", "power": -2, "toughness": -2, "duration": "eot"} ] }
// Shorthand: target(creature); pump(power=-2, toughness=-2, duration=eot)
```

`weaken` is dead. Signed deltas read naturally; card text rendering ("Target creature gets -2/-2 EOT") is a card-text helper that watches for negative values.

### 6.4 Awakener — addCounter folds into pump

```js
// Before:
{ "effects": [ {"kind": "addCounter", "target": "creature", "power": 1, "toughness": 1, "filter": {"controller": "self"}} ] }

// After (targeting decomposition — §3.5):
{ "target": "your_creature", "effects": [ {"kind": "pump", "power": 1, "toughness": 1, "duration": "permanent"} ] }
// Shorthand: target(your_creature); pump(power=1, toughness=1, duration=permanent)
```

The old `filter: {controller: "self"}` becomes the `target()` step's filter (`your_creature`); the `pump` effect just operates on the target.

### 6.5 Horned Herald — pumpAllYours folds in

```js
// Before:
{ "effects": [ {"kind": "pumpAllYours", "power": 1, "toughness": 1} ] }

// After (no target() step — mass scope on the effect):
{ "effects": [ {"kind": "pump", "power": 1, "toughness": 1, "duration": "eot", "scope": "all_yours"} ] }
// Shorthand: pump(power=1, toughness=1, duration=eot, scope=all_yours)
```

### 6.6 Pacifism — restrict decomposes into grant_keyword

```js
// Before:
{ "effects": [ {"kind": "restrict", "target": "creature", "cantAttack": true, "cantBlock": true} ] }

// After (targeting decomposition — §3.5; one target() step, two effects share it):
{
  "target": "creature",
  "effects": [
    {"kind": "grant_keyword", "keyword": "defender", "duration": "permanent"},
    {"kind": "grant_keyword", "keyword": "no_block",  "duration": "permanent"}
  ]
}
// Shorthand: target(creature); grant_keyword(defender, permanent); grant_keyword(no_block, permanent)
```

One `target()` step, two effects — both apply to the one target (shared by default, §3.5). One prompt at cast time; no per-effect target field.

### 6.7 Wrath of God — removeAll folds in

```js
// Before:
{ "effects": [ {"kind": "removeAll", "severity": 3} ] }

// After (no target() step — mass scope):
{ "effects": [ {"kind": "affect_creature", "severity": "destroy", "scope": "all_creatures"} ] }
// Shorthand: affect_creature(severity=destroy, scope=all_creatures)
```

### 6.8 Diabolic Edict — decomposes into target → chooses → sacrifice (§3.5)

```js
// Before:
{ "effects": [ {"kind": "edict"} ] }

// After (targeting decomposition — §3.5):
{
  "target": "player",                       // caster targets a player (the hexproof checkpoint)
  "effects": [
    {"kind": "chooses", "filter": "creature"},  // that targeted player picks one of THEIR creatures (not targeted → hexproof irrelevant)
    {"kind": "sacrifice"}                        // the chosen creature is sacrificed
  ]
}
// Shorthand: target(player); chooses(creature); sacrifice
```

This is *why* an edict kills a hexproof creature: only `target(player)` is a targeting step; the creature is *chosen*, never targeted. (The old `force_sacrifice(opponent, 1, creature)` bundle is gone — it was this decomposition collapsed into one effect, which hid the target-vs-choose distinction.)

### 6.9 Mind Control + Steal — both fold into change_control

```js
// Mind Control before:
{ "effects": [ {"kind": "gainControl", "target": "creature", "filter": {"controller": "opp"}} ] }
// After (targeting decomposition — §3.5):
{ "target": "creature", "effects": [ {"kind": "change_control", "duration": "permanent"} ] }

// Steal before:
{ "effects": [ {"kind": "steal", "target": "permanentOrSpell", "filter": {"notToken": true}} ] }
// After:
{ "target": "permanent", "effects": [ {"kind": "change_control", "duration": "permanent",
                "transfer_ownership": true} ] }
```

`transfer_ownership: true` triggers the run-slot transfer logic (the proto `steal` body that appends a slot and shuffles a fresh instance into library). Counter-spell path for `steal` (when target is a stack entry) is handled by `change_control` recognizing the target shape — the handler routes through the `counter` half automatically.

### 6.10 Oblation — shuffleIntoLibrary becomes move_card

```js
// Before:
{ "effects": [ {"kind": "shuffleIntoLibrary", "target": "creature"} ] }

// After (target() supplies the moved card — selector "target" §5.x):
{ "target": "creature",
  "effects": [ {"kind": "move_card",
                 "from_zone": "battlefield",
                 "to_zone": "library",
                 "selector": "target",
                 "amount": 1,
                 "post": {"shuffle": true}} ] }
```

When `move_card` acts on the *chosen* card, its `selector` is `"target"` — "the card the leading `target()`/`chooses()` step established." Non-targeted selectors (`controller_top`, `library_search(...)`, etc.) stay for the automatic cases.

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

// After (targeting decomposition — §3.5; one target, two effects share it):
{ "target": "creature",
  "effects": [
    {"kind": "affect_creature", "severity": "destroy"},
    {"kind": "apply_sticker", "sticker_id": "scarified"}
  ] }
```

Both effects operate on the one targeted creature — no `same_as_previous` vocabulary needed (the shared-target default, §3.5). The sticker applies to the slot, so the destroy removing the body first doesn't matter. (This subsumes the old "shared via `ctx.targets[0]`" mechanism: "the target" is whatever the `target()` step established.)

### 6.13 Otherworldly Journey — exile_until_eot (needs B4)

```js
// Before:
{ "effects": [ {"kind": "exileUntilEOT", "target": "creature"} ] }

// After (PENDING B4):
{ "target": "creature",
  "effects": [
    {"kind": "move_card", "from_zone": "battlefield", "to_zone": "exile",
     "selector": "target", "amount": 1, "post": {"keep_buffs": true}},
    {"kind": "schedule_delayed",
     "trigger": "end_step",
     "effects": [
       {"kind": "move_card", "from_zone": "exile", "to_zone": "battlefield",
        "selector": "previous_target", "amount": 1, "post": {"enter_via_etb": true}}
     ]}
  ] }
```

`schedule_delayed` is the B4 primitive (delayed-trigger machinery). The `previous_target` selector references the card the prior `move_card` operated on. Distinct from the **shared-target default** (where several effects use the one `target()` step, §3.5/§6.12, also what StP uses): `previous_target` chains to the *output of the immediately-prior effect*, which need not be a `target()` at all (e.g., "exile the top creature of your library, then return it" has no targeting). Until B4 lands, `exile_until_eot` stays as its own primitive in both engines and migrates after B4.

**`previous_target` resolver spec** (the "small chaining mechanism"; one sensible shape — no open design choice). During a single spell/ability resolution, the effect loop carries one extra context field, `ctx.previous_subject_iid`. After each effect resolves, the resolver sets it to the iid of the card that effect acted on or produced (for `move_card`, the moved card's current iid — note that for a battlefield *arrival* this is the freshly-minted iid per §3.7, but for the exile-then-return chain the second move reads the still-current exile-zone iid set by the first move). The selector value `previous_target` resolves to `state.find_instance(ctx.previous_subject_iid)`. Scope is the immediately-prior effect only; the field resets at the start of each resolution. Multi-step back-references ("two effects ago") are out of scope until a card needs them. Naming (`previous_target` vs `previous_subject`, selector-string vs ctx-field) is implementer's discretion.

`flicker` is the immediate variant: skip `schedule_delayed`, just do the two `move_card` calls back-to-back. So `flicker` can migrate earlier than `exile_until_eot`.

### 6.14 Swords to Plowshares — last-known-information in action (§3.6)

A canonical MTG card: "Exile target creature. Its controller gains life equal to its power." Proto doesn't have this card today, but porting it (and similar designs) requires the last-known-information machinery from §3.6.

```js
// After (illustrative — card not in proto today):
{ "target": "creature",
  "effects": [
    "move_card(battlefield, exile, target, 1)",
    {"kind": "gain_life",
     "amount": "<target.power>",                 // ← references the targeted creature
     "target_player": "<controller_of_target>"}
  ] }
```

**The mechanism at resolution time**:
1. Cast time: the `target(creature)` step locks onto iid=12 (Grizzly Bear, power=2, controlled by opp).
2. First effect: `move_card` exiles iid=12. BEFORE removing from battlefield, engine snapshots `{power: 2, toughness: 2, controller: opp, ...}` into iid=12's `last_known_info` field.
3. Second effect: `gain_life` reads `target.power` and `controller_of_target`. Engine checks: is iid=12 still on the battlefield? No (it's now in exile). Read from `last_known_info`: power=2, controller=opp. Opp gains 2 life.
4. After the spell's resolution completes, the snapshot can be cleared.

**Why this works**: the spell's targeting locked onto iid=12 at cast time. By the second effect, the in-play card is gone, but the snapshot preserves what the spell needs to know. Matches MTG's "last known information" rule.

**Without last-known-info**: the second effect would either fizzle (no live target to read) or crash (null-deref on the missing card). Neither is correct.

**Cards in the current proto pool that benefit from this**: a quick audit shows `dampingMatrix`, `bleach`, `embargo`, and several lifelink/death-trigger combos rely on similar "the thing I targeted is now elsewhere but I still need to know what it was." The mechanism is general — any multi-effect spell with cross-effect target references benefits.

---

## 7. Migration script discipline

**Proto side:** `reference/html-proto/tools/migrate-effects.js`, modeled on the predicate-plan's `migrate-triggers.js`. Mechanically walks every `cards/*/card.json`, every `effects[]` and `triggers[].effects[]` and `abilities[].effects[]`, and rewrites:

1. **Rename kinds** per the table in §3: `addMana`→`add_mana`, `gainLife`→`gain_life`, etc.
2. **Lift targeting into steps (§3.5)**: convert the per-card `target: "any"|"creature"|"creature_or_player"|...` field into a leading `target()`/`chooses()` step (chosen case) or an effect `scope` (automatic/mass case).
3. **Decompose compounds**:
   - `destroyAndStickerSlot` → two-effect array.
   - `restrict` → one or two `grant_keyword` effects depending on flags.
4. **Apply redundancy cleanup**:
   - Drop `weaken` in favor of negative `pump`.
   - Drop `addCounter` in favor of `pump` with `duration: permanent`.
   - Drop `pumpAllYours` / `damageAll` / `removeAll` in favor of unified kinds with a mass `scope`.
5. **Rewrite mass-kinds**:
   - `damageAll` → `damage(scope=all_creatures)`.
   - `pumpAllYours` → `pump(scope=all_yours)`.
   - `removeAll(severity=N, whose=W)` → `affect_creature(severity=<str>, scope=<all_creatures|all_opps>)` where severity ints map to strings and `whose: opp` → `all_opps`, `whose: all` → `all_creatures`.
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
        # Validate the mass `scope` value (if present) against a static set.
        var sc: String = effect.get("scope", "")
        if sc != "" and not _is_valid_scope(sc):
            malformed.append("%s.%s.scope=%s" % [card_id, kind, sc])
        return
    # (Targeting steps `target(filter)` / `chooses(filter)` are validated
    #  separately — their `filter` must be in the CLOSED legal-object
    #  taxonomy enumerated in §3.5 — 8 members, no open tail.)
    malformed.append("%s.<non-dict-non-string effect>" % card_id)
```

**Per-kind schema (optional but recommended).** A static dict in `Effects` declares required and optional fields per kind:

```gdscript
const EFFECT_SCHEMA := {
    "damage": {"required": ["amount"], "optional": ["scope"]},
    "pump":   {"required": [], "optional": ["power", "toughness", "duration", "scope"]},
    "move_card": {"required": ["from_zone", "to_zone", "selector"], "optional": ["amount", "post"]},
    # ... etc  (targeting lives in the leading target()/chooses() step, not on the effect)
}
```

Boot-validator additionally checks required keys are present. Catches card-author typos like `{"kind": "damage", "ammount": 3}` (missing `amount`, extra `ammount`).

**Parser** (the function-call shorthand). The predicate plan's `_parse_call` (predicates.gd) becomes `Effects._parse_effect_call`. Same lexer (whitespace tolerant, quoted strings, type coercion). Extension: keyword args. The arg list contains a mix of positional (`damage(3)`) and keyword (`damage(amount=3)`) — keyword form is the recommended style for any effect with 3+ params or any boolean param (positional bools are too ambiguous). The same parser handles the `target(...)` / `chooses(...)` steps.

**Validation timing.** Both engines run validate-effects at boot, alongside the existing validate-predicates. In Godot: `engine.gd._ready()` calls both. In proto: `tests/_setup.js` calls both after `loadCards()`.

### 8.1 AI valuation + decision is a lockstep migration site — the silent-regression class (review #1)

**The class of bug.** The effect dispatch table (`EFFECTS` / `HANDLERS`) is the *owner* of the effect vocabulary and is obviously migrated. But every *other* site that reads an effect's `kind` / `target` / `whose` / `duration` as a raw string is a hidden consumer — and a string match that stops hitting doesn't error, it silently falls through to `default`/`0`. The rename+collapse touches the entire vocabulary, so all such consumers must move in lockstep. The plan already names one consumer cluster — card-text (`describeEffect` / oracle text). It did **not** name the AI, which is the larger one. This regression ships **green**: the gate is selfplay (crashes/legality) + the 482 rules assertions; neither asserts AI valuation quality. A pool that scores wrong plays dumber, not illegal.

**The read-site map (traced both engines, excluding the dispatch tables):**

| Cluster | Proto | Godot | In plan before? |
|---|---|---|---|
| AI spell/effect valuation | `spellValueForEffects`, `getCardValue`, `scoreMultiTargetSpell` (`ai.js` ~1035–1071), mode-select (`ai.js:150–153`), instant-response relevance (`ai.js:458–461`), self-damage discard (`ai.js:955`) | `scoring.gd:45` (`"damage"` flat), `burn.gd:21` (`kind != "damage"`) | **No — this is the gap** |
| AI / UI target selection | `ai.js` target picking, `eff.targetSlot` (`ai.js:989`) | `ai.gd:221` (`match spell.target_filter`), `game_board.gd` target-pick mode (reads `target_filter`) | **No** |
| Card text / oracle | `card-text.js` (24 reads) | `card.gd` oracle overlay | Yes (describeEffect row) |
| Stickers, loader, render | `stickers.js`, `render.js`, `controller.js` | `json_card_loader.gd` | Touched by §3.8 / §3.9 anyway |

**Why it's a redesign, not a rename.** The collapse *erases distinctions the AI priced*: `damage` (+6) vs `damageAll` (+8+amount×2); `removeCreature` vs `removeAll`; `gainControl`-eot/permanent vs `steal`. Post-collapse those are `damage`+`scope`, `affect_creature`+`scope`, `change_control`. So the AI must learn to **read `scope`** to recover the single-vs-mass valuation split — a mechanical rename of the branch keys would collapse Lightning Bolt and Pyroclasm to the same score. Separately, the §3.5 targeting decomposition **removes `effect.target` and relocates `target_filter` into a `target()` step** — so `burn.gd`'s face-damage test (which keys on `effect.target == "opponent"/"chosen"` + `spell.target_filter`) stops recognizing single-target burn *at all* and the AI stops finding burn lethals. Both engines' AI target/valuation reads must move to: "is there a `target()` step + what filter" and "what `scope` does the effect carry."

**The generalizable defense — make the class loud, not silent.** Grepping the read sites fixes *this* migration; it doesn't stop the next renamed/added kind from silently scoring 0. So add a **coverage assertion** to boot validation: every kind registered in `HANDLERS` must also have (a) a valuation branch and (b) a card-text branch — a missing branch is a `push_error` at startup, not a runtime 0. This converts the entire "stringly-typed consumer drifted out of sync" class from silent to caught-at-boot, and is the real answer to "how do we find the next one." Implement as a static coverage set the AI/card-text modules register their handled kinds into, checked against `HANDLERS.keys()` at boot.

**Scope.** Add (1) the scope-aware valuation redesign on both engines, (2) the AI target-read migration to the `target()`-step model, (3) the boot coverage assertion. Effort rows in §11; regression gate in §12.12.

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
- **`exile_until_eot` decomposition needs B4 — but the deferral is a conscious *symmetry* choice, not a proto-side technical block (review OBS 2).** The effect itself works fine and keeps working as a monolithic handler throughout; what's deferred is *re-expressing it in the shared atomic vocabulary* (`move_card` + `schedule_delayed`). That re-expression needs `schedule_delayed` to exist on **both** engines, because card definitions are a single shared JSON — you can only author a card in atomics both engines can execute. Godot has no delayed-trigger queue (B4, Phase 7+), so it can't run `schedule_delayed` yet. Proto, by contrast, *does* already have the raw mechanism — `G.delayedTriggers`, used by `exileUntilEOT` itself at engine.js:2163 — it just isn't generalized into a `schedule_delayed` *effect*. So proto **could** decompose alone, but doing so would make the same shared card decompose on proto and stay monolithic on Godot — re-introducing exactly the cross-engine divergence this refactor exists to kill. We therefore hold both engines at the monolithic form until B4 lands, then decompose once for both. **This is why `exile_until_eot` is different from the ordinary "proto has effect X, Godot doesn't" cases** (e.g. `destroyLand`): those are just un-ported monolithic handlers, not in scope for atomization; `exile_until_eot` *is* in scope, and its target atom is the single one Godot structurally can't run yet. The rest of the EFFECTS refactor proceeds.
- **The sticker-system audit is complete (§3.8); decision 7 is resolved.** `embargo`/`bleach`/`symmetricize` decompose into `[movement/choice effect] → apply_sticker(specific_kind)`, `applyBalancerOverrides` is deleted, and the sticker pipeline (apply dedup, empower redesign, persistence decoupling, snake_case) is folded into this refactor. The boot validator accepts `apply_sticker` from day one. No items block execution: `rip` builds `annihilate` this pass so the rip-edict uses the correct no-trigger verb (§13 / review OBS 1), and the mana-model unification scope is decided (deep clean, §3.9).
- **B6/B7 (priority-window) is independent.** Touches priority/auto-pass logic, not effect handlers. Land in parallel or earlier.

### 9.3 Adjacent items

- **C5 (killer attribution) is adjacent, not a blocker.** `endomorph_absorb` reads `ctx.event.card` (the dying victim) and `endomorph` itself as the killer. The "killer" identity comes from `card.killedBy = ctx.controller` set inside `removeCreature`/`removeAll`/`destroyAndStickerSlot`. The unified `affect_creature` effect must preserve this — flagged as a step in §10. Godot's port of `affect_creature` will need C5 to work for absorb mechanics, but the effect itself can land before C5 lands as long as `killedBy` is plumbed.
- **D1 (multi-effect target snapshot) is adjacent.** When a single spell has multiple effects all referencing the same target (Scarification post-decomposition is exactly this case), do they all see the same snapshot or live state? Decision: live state per effect (matches Godot's existing behavior, matches MTG canon per D1). Document in SPEC.md.

---

## 10. Sequenced migration plan

Each step leaves both engines in a runnable, test-passing state. Recommend sequencing AFTER `plan-zone-change-and-composable-predicates.md` (E1/E2).

0. **(Proto only) Extract `applySpliceCore(baseSlotIdx, stapleSlotIdx, opts)` helper.** The splice logic is currently duplicated across four sites (`js/engine.js:2246` `EFFECTS.applyInGameSplice`, `js/run.js:872` `RUN.applySplice`, `js/draft.js:239` and `js/run.js:584` pair-enumeration). Extract the shared body (slot mutation, slotIdx fixups, sticker/roll merging) into a single helper in `engine.js`. The Stapler path layers stack-spell-firing logic on top via `opts.fireSpellEffects: true`; reward-time path passes `opts.fireSpellEffects: false`. Unit test: splice the same two cards via Stapler's in-game path AND the reward path; assert identical end state. ~4 hours. Decouples from the refactor's later steps — could land independently if scheduled before the rest.

1. **Add the mass `scope` field to `affect_creature`/`pump`/`damage` in BOTH engines, alongside the existing per-kind shape.** This is the single/mass-unification groundwork (decision 2). New `scope` values (`all_creatures`, `all_yours`, `all_opps`) work in the dispatcher; old per-kind code (`damageAll`, `pumpAllYours`, `removeAll`) still runs. Tests: existing tests pass; new tests per scope value pass against synthetic effects. Semantic no-op overall. (The chosen-target case lands in step 2 via the `target()`/`chooses()` steps.)

2. **Add `target()` / `chooses()` targeting steps and route hexproof through them (§3.5).** Both engines: introduce the leading targeting primitives. "Is it targeted?" becomes structural — a spell has a `target()` step or it doesn't — replacing the earlier `is_targeted_filter(value)` helper. Hexproof is checked at `target()` steps only; `chooses()` and mass/automatic-scoped effects (`all_creatures`, `controller`, …) never check it. Add hexproof regression tests (§12), including the edict case (`target(player) → chooses(creature)` sacrifices a hexproof creature).

3. **Add new atomic effects alongside the legacy ones.** Both engines: register `move_card`, `change_control`, the `target`/`chooses` targeting steps, the `sacrifice` verb, `annihilate` (its no-trigger sibling — `sacrificeCard` minus graveyard/`cardDies`/`emitLeavesBattlefield`, ~10–15 lines, review OBS 1), `apply_sticker`, `pump` (signed/permanent extensions). Old kinds (`draw`, `discard`, `gainControl`, `edict`, `weaken`, etc.) still dispatch correctly. New atomics callable from card data once cards migrate.

4. **Boot-validation rewrite.** Both engines: `validate_all_card_effects` walks all card data. Accepts both old kind names and new ones during cutover. Per-kind schema enforced for the new ones. Tests: malformed effect detected at boot.

5. **Migrate Godot templates** (6 templates with effects: pyromaniac, bloodlust_berserker, giant_growth, healing_salve, lightning_bolt, counterspell — all already snake_case). Convert each effect's `target: "chosen"` into a leading `target()` step (and `counter_spell`→`counter`). ~15 minutes of mechanical .tres edits. Add per-template test passes.

6. **Migrate proto cards via `migrate-effects.js`.** Run the script. Run `node tests/run_all.js` (the existing 482 assertions). Spot-check 20 cards across categories. Run `node tests/selfplay_harness.js 500 bughunt` for AI-vs-AI regression.

7. **Delete dead/duplicate code.** Proto: delete the first `gainControl` definition (line 2123). Delete `weaken`, `addCounter`, `damageAll`, `removeAll`, `pumpAllYours`, `edict`, `sacrifice`, `restrict`, `shuffleIntoLibrary`, `returnFromGraveyard`, `searchLandTapped`, `searchCreature`, `discard`, `draw`, `noop` from the EFFECTS dispatch table (all callers now use the new atomics). Update **all lock-step consumers** (§8.1): `js/card-text.js` describe-effect helpers, **and the AI valuation/target reads** — proto `spellValueForEffects`/`getCardValue`/`scoreMultiTargetSpell`, Godot `scoring.gd`/`burn.gd`/`ai.gd`. These must become scope-aware (read `scope` to keep the single-vs-mass valuation split) and `target()`-step-aware (burn's face-damage test moves off `effect.target`/`target_filter`). Run all tests.

7b. **Add the boot coverage assertion (§8.1).** Every kind in `HANDLERS` must register a valuation branch and a card-text branch; a missing branch is a boot `push_error`. Turns the silent-regression class loud — this is what catches the *next* renamed/added kind, not just this migration.

8. **Decompose `flicker` (no B4 dependency).** Replace the single `flicker` effect with `move_card(battlefield, exile)` + `move_card(exile, battlefield)` back-to-back. Test: Cloudshift still works.

9. **(After B4 lands) Decompose `exile_until_eot`.** Replace with `move_card` + `schedule_delayed(move_card)`. Test: Otherworldly Journey still works.

10. **Sticker pipeline (§3.8).** Add the new sticker kinds (`cost_mod` signed, `set_color`, `grant_mana_ability`); decompose `embargo`/`bleach`/`symmetricize` into `[effect] → apply_sticker`; delete `applyBalancerOverrides`; redesign empower (registry-declared params, identity addressing, additive deltas); dedup the two apply functions; decouple persistence from application; snake_case the sticker IDs/kinds. Sequence after the core atomic effects exist (step 3) since `apply_sticker` and `cost_mod`/`add_mana` are registry entries.

11. **Splice duplicate-pathway harmonization** (separate follow-up plan per §7).

12. **Stapler's `noop` removal.** Replace with `target_slots: 2` on the activated ability schema. Delete `noop` from EFFECTS.

13. **Update SPEC.md** to describe the new registry, the `target()`/`chooses()` targeting model + mass `scope` (§3.5), the function-call shorthand, the per-kind schema. Update DIVERGENCE.md rows D2 (closed by step 3+5), D3 (closed by step 3 if Godot extends `gain_life`), D4 (closed by step 3 across both).

**Which engine first?** Steps 1–4 in parallel across both engines (no card data touched yet). Step 5 (Godot) before step 6 (proto) — Godot's small pool is the low-stakes proving ground for the new dispatcher. Steps 7+ in proto first, then mirror into Godot's dispatcher.

---

## 11. Effort breakdown

Per-engine, per-step. S = an hour or two, M = half a day to a day, L = multi-day. Same rubric as `REFACTOR-NOTES.md`.

| Work | Engine | Effort |
|---|---|---|
| **Step 0**: Extract `applySpliceCore` helper from 4 duplicate sites | Proto | M (~4h) |
| Mass `scope` field on `damage`/`pump`/`affect_creature`; old kinds still work | Godot | M (~4h) — `damage.gd` and `pump.gd` extended; new `affect_creature.gd` created |
| Mass `scope` field on `damage`/`pump`/`removeCreature`; old kinds still work | Proto | M (~5h) — more handlers, more existing branches |
| `target()`/`chooses()` steps + structural hexproof routing | Godot | S (~2h) |
| `target()`/`chooses()` steps + structural hexproof routing | Proto | S (~3h) — multiple gate sites |
| **§3.6 last-known-info snapshot machinery + per-effect resolution-time checks** | both | M (~4h) — one snapshot field, one capture site per zone-exit, one check site per property read |
| **§3.7 iid-mint-on-arrival** in `move_card` for `to_zone=battlefield` | both | S (~2h) — including the `exileUntilEOT` (exile-return) iid regression test |
| **Human `chooses()` prompt** (review GAP 2) — choose-your-creature UI for edicts; reuse `pendingRipSelect`/`doRipSelect` (proto), build from scratch (Godot) | both | S (~3h) — proto reuses rip-select infra; Godot wires a new selection mode |
| New atomic effects (`move_card`, `change_control`, `target`/`chooses`, `sacrifice`, `apply_sticker`) | Godot | L (~8h) — these are mostly new handlers from scratch; `move_card` alone is ~3h |
| New atomic effects (same set, written to match proto's existing semantics) | Proto | M (~6h) — most logic exists, just refactored into the new entry points |
| Shorthand parser extension (curated `draw`/`discard`/`flicker`/etc. names that desugar to `move_card`) | both | S (~3h) — extends the predicate parser |
| Effect-kind boot validation + per-kind schema (accepts both canonical kind names and shorthand) | both | M (~4h) |
| Hand-migrate Godot 6 templates with effects | Godot | S (~30min) |
| `migrate-effects.js` script + manual verification on 258 proto cards | Proto | L (~8h) including golden-output testing and redundancy-cleanup pass |
| Card-text helpers (`describeEffect`, etc.) updated for new kinds + signed pump | Proto | M (~4h) |
| **§8.1 AI valuation redesign** — scope-aware single-vs-mass scoring + `target()`-step-aware face-damage/target reads (`spellValueForEffects`, `getCardValue`, `scoreMultiTargetSpell`, mode/instant-response sites) | Proto | M (~5h) — not a rename; the collapsed kinds need scope-reading to recover the valuation split |
| **§8.1 AI valuation redesign** — `scoring.gd` scope-aware, `burn.gd` lethal-recognition off `target()`-step, `ai.gd` target_filter→target-step read | Godot | M (~4h) |
| **§8.1 boot coverage assertion** — every `HANDLERS` kind must have a valuation + card-text branch, else boot error | both | S (~3h) — registration sets + boot check in `engine.gd._ready()` / `tests/_setup.js` |
| Dead-code purge (duplicate gainControl, weaken, addCounter, etc.) | Proto | S (~2h) |
| **§3.9 mana deep-clean** — `add_mana` color-choice form, migrate all land `card.json` to ability shape, collapse `doTapLandForMana`, update `landProducibleColors` consumers + staple-merge + tap UI | Proto | L (~8h) — foundational, every game turn one; heavy test coverage |
| **§3.9 Godot land-as-ability adoption (option 3 — full convergence)** — `JsonCardLoader` emits the tap-ability onto `CardResource`, mana resolution runs the ability path, `KIND_TAP_LAND_FOR_MANA`→`is_mana_ability` (couples with priority-window plan) | Godot | M (~5h) |
| `flicker` decomposition + test | both | S (~2h) |
| `exile_until_eot` decomposition (gated on B4) | both | S (~2h) AFTER B4 lands |
| Stapler's `noop` removal + `target_slots: N` ability schema generalized to 6 cards | both | S (~3h) — covers `stapler`, `twinStrike`, `branchingBolt`, `drainLife`, `rootsAndBranches`, `swordAndSorcery` |
| New unit tests for each atomic + hexproof regression suite + last-known-info regression + iid-mint regression + boot-validator tests | both | M (~7h) |
| SPEC.md + DIVERGENCE.md updates (including D1 revision per §3.6) | doc | S (~2h) |

**Total: ~92–97 hours = L** (~6–6.5 days, sliceable into the steps above). Up from the original ~64–69h: the §3.9 mana deep-clean was never line-itemed (+~8h proto), full-convergence option 3 adds Godot land-as-ability adoption (+~5h), the human `chooses()` prompt (review GAP 2) adds ~3h, and the §8.1 AI-valuation lockstep redesign + boot coverage assertion (review #1) adds ~12h across both engines. Biggest unknowns: `move_card`'s post-action plumbing (~3h estimated, could be more if zone-emit semantics in Godot diverge from proto's `cardEntersBattlefield` patterns), the `migrate-effects.js` script (~8h estimated, could blow up if the existing card data has format inconsistencies the audit missed), and last-known-info snapshot capture (~4h estimated, depends on how many "card property read" sites there are across effects).

---

## 12. Tests required

### 12.1 Per-atomic unit tests (one block per effect; ~22 blocks)

For each atomic, a Godot `tests/test_effects_<kind>.gd` and a proto `tests/test_effects.js` block:
- Resolves correctly on a normal target.
- Resolves correctly on a `target()`-chosen target (where applicable).
- Resolves correctly on mass-filter values (where applicable: `all_creatures`, `all_yours`, `all_opps`).
- Fizzles cleanly when target is gone (the existing fizzle pattern).
- Logs the expected message.

### 12.2 Hexproof regression (CRITICAL)

A `tests/test_hexproof_targeting.gd` (Godot) and `tests/test_hexproof_targeting.js` (proto):
1. Lightning Bolt at hexproof opp creature → no legal target at cast time (cast fails).
2. Lightning Bolt at hexproof OWN creature → legal target, resolves.
3. Pyroclasm with hexproof creatures on both sides → hits everyone.
4. `affect_creature(severity=destroy, scope=all_creatures)` (no `target()` step) with hexproof creatures → destroys all.
5. `target(creature)` + `affect_creature(severity=destroy)` aimed at a hexproof opp creature → no legal target.
6. An edict (`target(player) → chooses(creature)`) when opp's only creature is hexproof → still sacrifices it (the creature is *chosen*, not targeted).
7. `grant_keyword(keyword=flying, scope=all_yours)` to your own hexproof creatures → applies normally (no `target()` step).
8. `damage(scope=opponent)` against the opp player with hexproof on creatures (irrelevant; no creature targeted) → resolves.

### 12.3 Compound-decomposition tests

- Scarification: `[affect_creature(destroy), apply_sticker(scarified)]` — verify both halves run, sticker applied to the destroyed creature's slot.
- Pacifism: two `grant_keyword` effects — verify both keywords (defender, no_block) applied; verify the targeted creature can't attack AND can't block.
- Wizard Adept: two `move_card` effects (the loot) — verify draw before discard order.

### 12.4 Signed-pump regression

- `pump(power=-2, toughness=-2)` (Sicken) on a 2/2 — creature has 0/0 marked, dies at SBA.
- `pump(power=-2, toughness=0)` (Frostbite Mage) on a 2/2 — creature is 0/2, survives.
- `pump(power=1, toughness=1, duration=permanent)` (Awakener) — `counters["+1/+1"] += 1`.
- `pump(power=1, toughness=1, duration=eot, scope=all_yours)` (Horned Herald) — every your-creature gets temp +1/+1.

### 12.5 `gainControl` dedup verification

- Cast Mind Control with `change_control` from Godot port. Compare semantics against proto's (post-refactor) `change_control`. Assert: creature moves to caster's bf, becomes sick (no `haste` param), `tempControlUntilEot` flag clean when `duration: permanent`.
- Threaten variant: `change_control(duration=eot, grant_haste=true, untap_on_take=true)` — creature moves, untapped, hasted, reverts at EOT.
- Steal variant: `change_control(transfer_ownership=true)` — slot transfers (run.js mutation), original instance removed, fresh shuffled into caster's library.
- **Regression specifically for the silent override**: after deleting the dead `gainControl` (engine.js:2123), test all three variants above — none should accidentally hit the dead handler's haste-additive path.

### 12.6 Boot-validator tests

- Add a card with `{"kind": "damagee", "amount": 3}` to a test fixture → boot fails with "Unknown effect kind: damagee".
- Add a card with `{"kind": "damage", "ammount": 3}` (typo) → boot fails with "Malformed effect: damage missing required field 'amount'".
- Add a card with `{"kind": "damage", "amount": 3, "scope": "alll_creatures"}` (typo) → boot fails with "Invalid scope: alll_creatures".

### 12.7 Function-call shorthand parser tests

Subset of the predicate parser tests, extended for keyword args:
- `"damage(amount=3)"` parses to canonical dict (targeting is a separate `target()` step).
- `"damage(3, chosen)"` (positional) parses with the first param interpreted by position.
- `"pump(power=-2, toughness=-2, duration=eot)"` — signed values, multi-arg.
- `"chooses(filter=\"creature\")"` — quoted string arg.
- Whitespace tolerance: `"  damage( amount = 3 )  "` parses identically.

### 12.8 Cross-engine semantic-equivalence tests (optional but recommended)

A small harness that builds the same card in both engines from the migrated data, fires the same effect against the same synthetic state, asserts the same end state. Three or four cards in this harness (bolt, pyroclasm, wrath, pacifism) provides high confidence the dispatcher rewiring didn't drift between engines.

### 12.9 Last-known-information regression (§3.6)

Tests that verify the live/snapshot hybrid:
1. **Swords to Plowshares analog** — multi-effect spell where the first effect exiles the target, the second references its (now-gone) power. Snapshot fires correctly; gain_life amount matches pre-exile power.
2. **Self-buff-then-damage** — target stays put across all effects. Live state, post-pump toughness. (Confirms live state is the default.)
3. **Order reversal** — same effects, opposite order. Damage-then-pump uses pre-pump toughness; pump-then-damage uses post-pump. Tests that order genuinely matters per MTG canon.
4. **Cross-effect controller reference** — Vraska-style "exile target creature, you gain life equal to its power." Controller reference still works post-exile because it's read from the snapshot.

### 12.10 iid-mint-on-arrival regression (§3.7)

Tests that verify a returning creature is a fresh game object. **Both mechanics are covered** — `exileUntilEOT` (the path the fix corrects) and `flicker` (already correct; guarded against regression) — they're separate handlers and each needs its own coverage:
1. **Otherworldly Journey (`exileUntilEOT`) — exercises the fix.** Cast Bolt targeting opp's Bear (iid=12). Opp exiles-until-EOT its own Bear in response. At end step the Bear returns; assert its iid is fresh (≠ 12) and that the Bolt still pointing at iid=12 fizzles. This path reuses the iid today (engine.js:2154–2173 / 5319–5345), so it must FAIL before the fix and PASS after.
2. **Lightning Bolt + Cloudshift (`flicker`) — regression guard.** Same pattern via Cloudshift. flicker already mints a fresh iid (engine.js:2112), so this is green before and after; it guards against a future regression rather than exercising the fix.
3. **Targeted destruction beaten by re-entry — run for BOTH mechanics.** Same as #1/#2 with `affect_creature(severity=destroy)` instead of damage: one case via flicker, one via exile-until-EOT.
4. **iid sequence verification — BOTH mechanics.** flicker a creature, and separately exile-and-return one; in each case assert the returning creature's iid is greater than (not equal to) the exited creature's iid.
5. **Non-flicker zone bounces** — bounce-to-hand-then-replay also gets a fresh iid on re-arrival. Same rule, different mechanic.

### 12.11 Shorthand parser tests (§5.2)

For each shorthand effect name, verify it desugars correctly to its canonical `move_card` form. Plus verify malformed shorthand (e.g., `draw(N=oops)`) fails at boot.

### 12.12 AI-valuation regression — the gate the existing one misses (§8.1, review #1)

Selfplay + the rules assertions can't catch a silently-dumber AI, so this regression is mandatory on **both** engines:
1. **Single ≠ mass.** A single-target damage spell (Lightning Bolt) and a mass one (Pyroclasm) must score **differently** — asserts the AI reads `scope` rather than valuing both as bare `damage`. Same for `affect_creature` single vs `all_creatures`, and `change_control` permanent vs the `steal`-equivalent.
2. **Burn lethal still recognized.** With a known lethal burn line in hand (e.g. Bolt to the face at 3 life), `has_lethal` / `face_damage_in_hand` must return true **after** the targeting decomposition — guards the `burn.gd` regression where `effect.target` removal makes single-target burn invisible (the AI stops going for the kill). Must pass with the migrated `target()`-step card shape, not just the old inline-`target` shape.
3. **Multi-target slot scoring.** `scoreMultiTargetSpell` over a migrated Drain Life / Branching Bolt picks distinct targets and prices both slots — guards `eff.targetSlot` (ai.js:989) against the §3.5 binding change.
4. **Coverage assertion fires.** Register a throwaway `HANDLERS` kind with no valuation branch in a test build; assert boot `push_error`. Proves the §8.1 coverage net actually catches an unhandled kind.

These should FAIL if the scope/target-aware reads are stubbed out, confirming they exercise the real surface.

---

## 13. The `rip` effect — a broad, zone-agnostic "tear it up" primitive

**Design intent.** `rip` is the digital interpretation of reaching across the table and tearing up your opponent's card — *it does not care what zone the card is in.* It's a small, broad run-layer primitive: take whatever card the preceding steps put in your sights, and **strip its deck-slot from the run permanently** (`RUN.removeSlotByIdx`). It composes after *any* targeting/removal, so the same `rip` step ends "rip that creature," "rip that spell," etc.

**Status (updated per review OBS 1):** build `annihilate` and ship the correct removal verb this pass — **no kludge.** Confirmed cheap by reading the code: `annihilate` = `sacrificeCard` (engine.js:3258) minus the graveyard push, the `cardDies` emit, and the `emitLeavesBattlefield` emit (it mirrors `ripSlotForPhylactery`'s body at engine.js:3652, which plucks with no leave-play emit) — ~10–15 lines. Shipping `sacrifice` would knowingly fire wrong death/LTB triggers when the card should cease to exist; since we have the tools, we ship it right. Nothing here blocks execution.

### `rip` composes across zones (the point)
```
Rip a creature (edict-style):  target(player) → chooses(creature) → annihilate → rip
Rip a spell on the stack:      target(spell)  → counter            → rip
```
Same `rip` slot-strip at the end; the front half differs only in how the card got targeted and removed from its current zone. The slot machinery works on a `slotIdx`, which any deck-originated card carries regardless of zone — so `rip` is genuinely zone-agnostic by construction. (Other zones — a card in hand, in the graveyard — compose the same way: target/identify it, optionally remove it from that zone, then `rip` the slot.)

### Why the edict case is "one verb off"
For the creature case, edict and rip-edict are nearly identical recipes:
```
Diabolic Edict:           target(player) → chooses(creature) → sacrifice
Rip-edict (TARGET):       target(player) → chooses(creature) → annihilate → rip
Rip-edict (OLD code, replaced): target(player) → chooses(creature) → sacrifice  → rip
```
The first two steps are shared (the player is *targeted*; the creature is *chosen*, so hexproof doesn't protect it — §3.5). The only differences are the removal verb (`sacrifice` → graveyard + triggers, vs `annihilate` → ceases to exist, no triggers) and the trailing `rip`.

### Current implementation — bundled and battlefield-only (the gap)
Today `rip` is **not** the clean standalone slot-strip above. It's the monolithic `ripPermanent` (engine.js:1979), used only by Vile Edict: it targets a **player**, opens `pendingRipSelect` so that player picks one of **their battlefield permanents**, then removes it + strips the slot — all welded together. So today:
- It only reaches **battlefield permanents** — there is no path to `rip` a spell, a hand card, or a graveyard card.
- The slot-strip isn't separable from the target-player/choose-permanent flow.
- It uses `sacrifice`-style removal → fires death/LTB triggers (**off-target** — the wrong behavior this pass replaces by building `annihilate`, review OBS 1).

### Decomposition target (DECIDED)
Split `ripPermanent` into the composable steps: a standalone `rip` slot-strip + the targeting (`target`/`chooses`, §3.5) + the removal verb. Then:
- The creature card swaps its removal verb `sacrifice` → `annihilate` (creature ceases to exist, no triggers — matches Phylactery's `ripSlotForPhylactery` body, which plucks with no zone-change emit).
- A future "rip target spell" card is just `target(spell) → counter → rip` — no new rip machinery, because `rip` is zone-agnostic.

Do the creature-verb swap **this pass** (review OBS 1 — we have the tools; the ~10–15-line `annihilate` is cheap, and shipping `sacrifice` would knowingly fire wrong death/LTB triggers). The broad `rip` decomposition lands with the targeting work (§3.5) since they share the same composable shape; `annihilate` is the small addition that lets rip-edict use the correct verb from day one.

---

## Critical files for implementation

- `/home/user/Magiclike/engine/effects/effects.gd` (dispatch table + `resolve_one`; gains the new atomic kinds and the `target()`/`chooses()` targeting steps — §3.5)
- `/home/user/Magiclike/reference/html-proto/js/engine.js` (the EFFECTS table at line 1366; receives all dispatch changes, dead-code deletions, and the parameterization work)
- `/home/user/Magiclike/data/card_resource.gd` (the `triggered_abilities` / `on_cast_effects` / `activated_abilities` schema fields; gains `target_slots` for Stapler-style multi-target abilities)
- `/home/user/Magiclike/reference/html-proto/tools/migrate-effects.js` (new — the proto card-data migration script, modeled on the predicate plan's `migrate-triggers.js`)
- `/home/user/Magiclike/docs/SPEC.md` §1.4 (effect descriptor schema; rewritten to document the 19-effect registry and the shorthand)
