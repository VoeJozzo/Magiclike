# Refactor Plan: Unified Multi-Slot Target Selection

**Status (2026-06-08):** Plan drafted, not executed. Proto-first (per the "prototype is the
debt lab" principle — work the clean architecture out in the runtime-editable JS engine,
then port to Godot). Discovered while fixing the *Clockwork Beetle + Twin Strike* garbled-text
bug (branch `bug-investigation`); the text bug is fixed, this plan addresses the structural
debt it exposed.

## 1. Motivation

Targeting is supposed to be **one layer** ([`docs/wiki/targeting-and-hexproof.md`](../wiki/targeting-and-hexproof.md)):
"chosen and locked up front… enforced once." Two sub-questions live in that layer:

1. **Per-target legality** — "is *this* object a legal target for *this* slot (filter, hexproof)?"
2. **Multi-slot selection** — "pick one legal target per slot, honoring **cross-slot** rules
   (the slots must differ; divided damage; *another* target creature)."

Sub-question (1) — the **atom** — is already unified: every consumer bottoms out in
`getValidTargets` / `targetsForFilter` / `validTargetsBySlot` (the engine.js:3763 consolidation
note: "ONE source of truth… three consumers independently kept checking and silently broke. They
all route here now."). The **resolution-time** fetch is also unified: `makeSlotTargetGetter`
(engine.js:2933) is shared by spell, ability, and trigger resolution.

Sub-question (2) — the **selection layer on top** — is **not** unified. It exists three times,
at three different levels of completeness (table in the chat / §3 below). Cross-slot constraints
have nowhere canonical to live, because `getValidTargets(slot N)` sees only one slot's spec and
cannot know what the other slots picked. `distinct_targets` (added for Roots and Branches / Sword
and Sorcery this session) therefore had to land in the *cast path's* bespoke orchestration and is
invisible to the ability and trigger paths.

### The defect this exposes (not cosmetic)

A multi-target spell **stapled onto a permanent** is rewritten into an ETB trigger carrying
`target_slots` (`mergeStapleInto`, engine.js:521). But `pushTriggerOnStack` (engine.js:3318,3350)
finds only the **first** targeted effect and stores a **single-element** `targets:[chosenTarget]`;
`makeSlotTargetGetter` returns `null` for every slot ≥ 1, and `resolveTrigger` (engine.js:3536)
logs *"trigger fizzles — no target"* and skips that effect. Concretely, today:

- **Clockwork Beetle + Twin Strike** ETB pumps **one** creature; the second +1/+1 silently fizzles.
- **anything + Roots and Branches** taps a creature but **never pumps** the second.

The card under-delivers half its text. (The text fix in this branch made the popup *read* both
clauses with their targets — which makes the text↔engine mismatch on the stapled variant *more*
convincing, not less. That mismatch is the strongest argument for doing this refactor rather than
papering over it.)

## 2. Principle / target architecture

Keep what legitimately differs; share what's genuinely the same.

- **Differs (leave separate):** the *ceremony* around selection. A spell cast is player-initiated
  from hand with cost + mode + affordability; an activated ability has an activation cost; a
  trigger is game-initiated onto the stack with no cost/hand. These stay distinct.
- **Same (unify):** the *target-selection step* — given an object's slot specs + flags, compute
  legal targets per slot, let the controller pick one-per-slot (interactively for a human, by
  scoring for the AI), enforce per-target **and** cross-slot constraints, and hand back a full
  `targets[]` array. One component, three callers.

The atom (legality) and the tail (resolution fetch) are already shared, so the refactor is
**contained to the selection layer** — it does not touch effect handlers or the legal-target
primitives.

## 3. Current-state audit (proto)

| Consumer | Enumerate/pick across slots | AI selection | Cross-slot constraint | Resolution |
|---|---|---|---|---|
| **Spell cast** | `getLegalActions` combo cross-product (engine.js:5919–5955) + human `pickedSlots` (controller.js `buildPendingActionWithTarget`) | ✅ enumerates, scored by `scoreMultiTargetSpell` | ✅ `distinct_targets` (isLegalAction:5624 + combo filter:5966) | `resolveTopOfStack` → `makeSlotTargetGetter` |
| **Activated ability** | human `pickedSlots` only | ❌ `getLegalActions` skips multi-slot abilities (engine.js:5969) | ❌ | `applyActivatedAbility` → `makeSlotTargetGetter` (engine.js:5137) |
| **Triggered ability** | **single slot** — `pushTriggerOnStack` picks 1 (engine.js:3318); human prompt `triggerPlayerTargetPrompt` reads `target_slots[0]` only (engine.js:3267) | ❌ single auto-pick (`pickBestTriggerTarget`) | ❌ | `resolveTrigger` → `makeSlotTargetGetter`; slot ≥ 1 = `null` → fizzle (engine.js:3536) |

Shared by all three already: `getValidTargets`/`targetsForFilter`/`validTargetsBySlot` (atom),
`makeSlotTargetGetter` (resolution).

## 4. Proposed component — `TargetSelection`

A single engine-side module (pure: `(state, obj, who) → data`, no UI). `obj` is any
target-bearing thing (card / ability / trigger); all already share the `target_slots` +
`target`/`target_filter` shape via the canonical API.

| Fn | Replaces | Notes |
|---|---|---|
| `slotSpecs(obj)` | scattered `target_slots`/per-effect reads | ordered slot specs; exists as `validTargetsBySlot` keys |
| `legalForSlot(obj, slotIdx, who, picksSoFar)` | per-slot `getValidTargets` | **new cross-slot awareness**: excludes `picksSoFar` when `obj.distinct_targets`/`distinct_from`. The one place cross-slot rules live. |
| `enumerate(obj, who)` | cast combo cross-product (5919–5955); ability (none) | all legal full target-sets; honors `COMBO_CAP` + cross-slot |
| `isLegalSet(obj, who, targets)` | isLegalAction per-slot loop + distinct check | validate a full set |
| `autoPick(obj, who, scorer)` | `pickBestTriggerTarget` (single) + cast scoring | AI's full N-slot set; generalizes the trigger auto-pick to N slots |

Interactive human selection (one pick-loop) is unified in the controller/render layer (Slice 4),
not in this pure module.

## 5. Execution order (one cohesive effort, not gated milestones)

This is a single refactor, not a stack of separately-shippable features. The steps below are a
**build order with green checkpoints**, not stop-and-ship milestones — and two of them are
**coupled**: making trigger *resolution* expect N targets (Slice 3) is pointless unless the human
*prompt* collects N (Slice 4). The human is the one who builds stapled cards (plays the Stapler,
fuses a sorcery onto their own creature), so a fix that only covers AI-controlled triggers would
leave the *primary* case still broken. Selection + human-loop therefore land **together**. The only
genuinely separable piece is the Godot port (different engine, different session).

- **Slice 0 — Characterization tests** (safety net). Pin today's behavior so the change is
  measurable and regressions are loud: stapled multi-target ETB resolves only slot 0 (the fizzle);
  AI never casts a multi-target ability. These flip to the correct expectation as the work lands.
  (Extends `tests/test_distinct_targets.js` + a new `tests/test_multitarget_trigger.js`.)
- **Slice 1 — Extract `TargetSelection`; route the cast path** (behavior-preserving green
  checkpoint). Pure routing of the existing combo/enumerate/distinct logic into the module — proves
  the extraction is inert before any behavior changes. One safe commit to land first.
- **Slices 2–4 — Route the other two callers + unify the human pick-loop** (the behavior change,
  done as one coherent piece):
  - **2.** Activated abilities through the component — removes the engine.js:5969 AI skip.
  - **3.** Triggers through the component — `pushTriggerOnStack` calls `autoPick`/`enumerate` for
    the full slot set and stores an N-element `targets[]`; resolution stops fizzling slot ≥ 1.
  - **4.** Merge the cast `pendingTarget.pickedSlots` flow and the single-slot
    `pendingTriggerTarget` prompt into ONE multi-slot pick-loop + one render highlighter (the
    distinct-exclusion added this session becomes general). This is the UX-risk part (APNAP,
    priority pauses) — but it is *required* for 3 to fix the human case, so it lands **with** 3.
  - Flip the Slice-0 "fizzle" assertions to "all slots resolve." Selfplay bughunt after.
- **Slice 5 — Delete dead code.** Remove the bespoke cast cross-product + the single-slot trigger
  prompt now that everything routes through the component; `mergeStapleInto` carries
  `distinct_targets` onto the synthesized trigger honestly (now enforceable). Keep `distinct_targets`
  as the blunt "all slots differ" flag — every current card is 2-slot, where blunt = correct; do
  **not** build speculative per-slot machinery (see note).
- **Slice 6 — Port to Godot** — mirror the component in the Godot targeting layer (the wiki's
  "multi-target shapes… last piece pending"). Separate session.

> **Deferred (YAGNI): per-slot distinctness.** `distinct_targets` is all-or-nothing — *every* slot
> must differ, which is exactly right for a 2-slot card. A future 3+-slot card that wants only *some*
> slots to differ (e.g. "deal 2 to target creature and 2 to target creature [may be the same], then
> tap a *different* creature") would need a per-slot `distinct_from: [otherSlotIdx…]` instead. No
> such card exists; every multi-target card today is 2-slot. Add the per-slot form only when a card
> actually needs it.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Human multi-slot trigger prompt (new interactive flow on the trigger side) | Reuse the proven cast `pickedSlots` loop (Slice 4); don't invent a second one |
| AI combo blowup on multi-slot triggers | Existing `COMBO_CAP` (200) + scorer; `autoPick` short-circuits |
| **Balance:** stapled multi-target ETBs get *stronger* (they currently under-resolve) | Intended correctness fix; flag the affected staple combos for a playtest pass — they're rare (needs Stapler + a 2-target sorcery fused onto a permanent) |
| Save/RUN compatibility | Trigger *shape* (`target_slots`) is unchanged; only selection/resolution changes. Low risk — verify a saved run with a stapled card loads |

## 7. Test strategy

Characterization-first (Slice 0), flip-as-you-go. Extend `tests/test_distinct_targets.js` to cover
the **trigger** path (stapled distinct card → second slot enforced + resolves). New
`tests/test_multitarget_trigger.js` for the stapled-ETB resolve-all-slots contract. Selfplay
bughunt after the AI-touching slices (2, 3). The existing
`tests/test_generated_special_text.js` stapled-ETB text regression stays as the text guard.

## 8. Cross-references

- Builds on `plan-effects-refactor.md` §3.5 (the `target()`/`chooses()` atom unification this sits
  on top of). This plan is the **selection-layer** sequel to that **atom-layer** work.
- [`docs/wiki/targeting-and-hexproof.md`](../wiki/targeting-and-hexproof.md) — the "targeting is one
  layer" principle; names multi-target as the pending Godot piece.
- Canon: [`docs/wiki/rules/700-casting-and-activating.md`](../wiki/rules/700-casting-and-activating.md)
  §703–§704 (target legality, resolution, fizzle).
- Origin: the *Clockwork Beetle + Twin Strike* text bug + the `distinct_targets` opt-in
  (`reference/html-proto/cards/{roots_and_branches,sword_and_sorcery}/card.json`).

## 9. Effort estimate

**M** (proto-side ~2–3 days). Bulk is Slice 4 (the human trigger pick-loop unification) and Slice 3
(trigger selection/resolution). Slices 1–2 are mostly routing. Slice 6 (Godot) is a separate
estimate against the Godot targeting layer.
