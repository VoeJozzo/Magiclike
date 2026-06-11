# Chunk 5 — Synthesis / staple (apply_in_game_splice, the splice core, charge accounting, the Stapler boon, clone/splice rewards, staple canon)

> Tier 1. **Deep-read + 9 hostile refuters** (one per behavioral finding F1–F8,
> F11) **over a frozen anchor snapshot.** Anchor SHA **`7b3a15f`** (snapshot at
> `%TEMP%\audit-snap-chunk05-7b3a15f`; the deep-read executed a repro for every
> claim BEFORE refutation, in `%TEMP%\audit-ch05-scratch`; every refuter then
> re-derived an **independent** repro from scratch — own script, own scratch
> copy, never the finder's script). Chunk claimed 2026-06-11T02:27:42Z.
>
> Refutation outcome: **0 refuted / 3 modified / 6 confirmed.** Calibration
> datum: unlike chunk 3's zero-refutation anomaly (where claims arrived without
> executed repros and the zero was suspicious), here every claim carried an
> executed repro before refutation **and the refuters still landed 3 substantive
> corrections** (A5-2's general-case unrelated-slot deletion — worse than filed;
> A5-6's overbroad survival claim + wrong producer name; A5-7's nonexistent
> bonusTrigger source). That is what a healthy adversarial pass looks like when
> the finder's evidence is real: the claims hold, the *narratives* get fixed.
>
> Findings A5-9, A5-10, A5-12–A5-15 are doc/comment/card-text or latent items
> the deep-read filed with executed probes but did NOT assign refuters
> (doc-lie / latent class — verification is the probe itself).
>
> **Terminology ruling (Joe, 2026-06-10):** Magiclike's rules are THE rules.
> Intentional divergences from real MTG are *design decisions*, recorded as such
> — never framed as deviations from an external standard. MTG is a reference
> point only. Applied throughout this file.
>
> **Class policy (campaign rule, binding):** anything that can alter a game
> outcome **stages** (plain-English decision packet per finding); docs/comment-
> only fixes **ship** (gate: suite + lint green); latent items with no in-pool
> trigger **park**. So: A5-1–A5-8 stage (behavioral); A5-11 stages (canon-vs-code
> needs Joe's ruling on which side is authoritative — A5-5's design half rides
> the outcome); A5-9/A5-10/A5-12/A5-13 ship (A5-13 is a card-text edit —
> player-facing but rules-inert since the Stapler uses `custom_text`; shipped
> with that note); A5-14/A5-15 park (latent, no in-pool trigger; full text
> preserved below).

## Mutation-map note (governs the stage rationale this chunk)

A4-18's decomposition of the effects-region survivor file assigned **97
mutation survivors to `apply_in_game_splice`** — none of them tested. This
chunk's findings land exactly on that dark mass: the survivors decompose onto
the combat-state transfer (A5-1/A5-3), charge accounting + the out-of-charges
rip (A5-4/A5-5/A5-15), the S+S branch (A5-2), the cross-owner battlefield
moves, and the slotIdx zone-walks. Every staged fix below therefore brings its
own regression test per the ladder — the suite currently fences none of this
region.

---

## Findings

### A5-1 — Cross-side combat-role inheritance: stapling the opponent's declared attacker onto your creature makes YOUR merged creature attack YOU
- **Location:** `reference/html-proto/js/engine.js:2898–2958`
  (apply_in_game_splice combat-state transfer; the side-blind attacker write at
  `:2928`; the cross-owner battlefield move at `:2891–2896` never calls
  removeFromCombat; defender fixed once from `G.activePlayer` in
  resolveCombatDamage `:5343`) @ `7b3a15f`
- **Dimension:** rules correctness + chunk-2 A2-5 interaction (bespoke
  combat-exit logic bypassing the funnel).
- **Severity:** **P1.** Refiner's P1-vs-P2 reasoning, recorded: A2-5 — the
  identical harm class via change_control — was P2 *explicitly because it was
  latent*. A5-1 is **live today**, human-reachable at instant speed, and can
  lose the game on a natural line ("splice the attacker as combat removal").
  P2 remains defensible only if triage weighs the Stapler-boon gate and
  human-only access heavily; the audit's own precedent says P1.
- **Evidence (finder-executed + refuter re-executed independently):** the
  transfer inherits the staple's attacker role into the base with **zero
  controller comparison** — `G.attackers[stapleAttIdx] = preservedIid`
  (`:2928`). Opp's Raging Goblin attacking, stapled onto your Grizzly Bears:
  merged 3/3 lands on YOUR battlefield, `G.attackers = [bears.iid]`, and
  resolveCombatDamage deals every attacker's damage to defender =
  opp(activePlayer) regardless of the attacker card's controller — output
  *"Grizzly Bears + Raging Goblin deals 3 to You"*, life you 20 → 17, opp
  untouched. The refuter drove ONLY legality-gated engine actions (isLegalAction
  true at every step: the ability has no `main_phase_only` → isInstantWindow;
  `spliceable_base`/`spliceable_staple` have no controller axis at matchFilter
  `:4271`/`:4277`; canonicalSplicePair preserves order for two creatures).
  Canon: `docs/wiki/rules/800-combat.md` L20 — a creature that leaves the
  battlefield is removed from combat; the absorbed staple leaves play, so
  role-inheritance into a defender-controlled creature contradicts Magiclike's
  own rulebook. Refuter refinement (a): reachability is **wider** than filed —
  the splice is also legal during the COMBAT_ATTACK post-declaration priority
  round, not only mid-COMBAT_BLOCK.
- **Fix sketch:** inherit a combat role only when `resultOwner` matches the
  side the role belongs to (attacker roles only if resultOwner is the active
  player; block roles only if resultOwner is the defender); otherwise route
  through `removeFromCombat(stapleCard.iid)`. Also
  `removeFromCombat(preservedIid)` whenever `baseSide !== resultOwner` (the
  cross-owner move at `:2891–2896`).
- **Effort:** medium (role-by-role side check + regression test).
- **Verification status:** refuter verdict **confirmed**; refuter re-executed
  an independently derived repro end-to-end through public legal actions.
  Confidence high.
- **Remediation class: STAGE** (behavioral; can flip a game's outcome).
- **Predicted test impact:** none — no existing test exercises the splice
  combat transfer (it sits in the A4-18 97-survivor dark mass).
- **Mutation-map judgment:** the transfer block is unfenced — the fix arrives
  with a cross-side attacker + cross-side blocker regression pair.

#### Decision packet for A5-1 (stage — plain English)
The Stapler can merge two creatures mid-combat. When the creature being
absorbed is the *opponent's attacker* and the survivor is *yours*, the engine
copies the "is attacking" role onto your creature without asking whose side
anyone is on — so your own merged creature finishes the attack **against you**
(verified: you take the damage, the opponent takes nothing). Magiclike's own
rulebook says a creature that leaves the battlefield leaves combat.
- **Option (one direction, confidence: high):** only carry a combat role over
  when it still makes sense for the merged creature's controller; otherwise use
  the engine's existing one "leaves combat" routine (the same one the earlier
  A2-5 fix used for control-change). Comes with a regression test. This is the
  natural "splice the attacker as removal" play, so it will come up in real
  games the moment a player has the Stapler during combat.

---

### A5-2 — Stack-spell base + battlefield-permanent staple falls into the "both spells" branch: the creature spell evaporates unresolved, the battlefield staple is never absorbed, and (refuter correction) the slot bookkeeping deletes an UNRELATED run slot in the general case — persisted by RUN.save
- **Location:** `reference/html-proto/js/engine.js:2959–3016` (S+S branch; the
  double-shifting manual slot fixup at `:2997–3000` under the violated comment
  at `:2994–2996`) + `:1124–1148` (resolveSplicePair allows mixed zone pairs) +
  `:103–116` (canonicalSplicePair is type-based, zone-blind) @ `7b3a15f`
- **Dimension:** rules + half-applied multi-step mutation + persistent
  save-state corruption.
- **Severity:** P2 (refuter: "the silent cross-game destruction of an
  unrelated run card makes P2 a floor, not a stretch").
- **Evidence (finder-executed + refuter re-executed, with a discriminating
  variant):** canonicalization picks the base by card TYPE, ignoring zone — a
  creature spell on the stack canonicalizes as base over a battlefield Land;
  `baseR.kind === 'spell'` routes to the branch whose comment asserts *"Both
  inputs were spells."* Executed: Bears spell on stack + your battlefield
  Plains — isLegalAction true, executed; bears absent from battlefield,
  graveyard, stack, hand AND exile (the card evaporates this game, mana spent);
  the Plains stays on the battlefield; merged `grizzly_bears+plains` slot
  minted; charge decremented.
  **Refuter correction (bug is WORSE than filed):** the filed claim — "the
  staple's run slot is deleted, leaving a live card with a dangling slotIdx" —
  is only accidentally true for adjacent slot indices (the finder's R1 used
  base@0/staple@1). In the general case the manual shift at `:2997–3000`
  assumes the staple "is a stack item, not in any zone" (its own comment), but
  in this mixed pair the staple is a battlefield card, so fixupSlotIdxAfter
  already decremented its cached slotIdx and the manual shift decrements
  AGAIN — `RUN.removeSlotByIdx` then deletes the slot one below the staple's.
  Refuter's discriminating repro (slots bears@0, stapler@1, plains@2–9,
  mountain@10, staple-plains@11): **the uninvolved MOUNTAIN slot was
  permanently deleted** (RUN.save persists it across games) while the staple
  plains' own slot survived — the staple perm remains both on the battlefield
  AND in the run, with a shifted/aliased slotIdx. Internal inconsistency, not
  a design reading: the perm-base path removes a consumed perm staple from the
  battlefield (`:2831–2833`); this path doesn't.
- **Fix sketch:** (a) make resolveSplicePair reject pairs where the canonical
  base is a stack item but the staple resolves to a permanent (and/or where a
  creature/land-typed card sits on the stack), or (b) make the spell-base
  branch zone-aware: fast-resolve the creature spell onto the battlefield and
  pluck a perm staple from play like the perm-base path does — **and** (refuter
  rider) drop or zone-guard the manual shift at `:2997–3000` either way.
- **Effort:** medium.
- **Verification status:** refuter verdict **modified** (claim corrected to
  worse-than-filed; everything else held); refuter re-executed an independent
  repro plus the discriminating variant. Confidence high.
- **Reachability (refuter-eased):** live, human-only (ai.js never activates
  the Stapler). The human doesn't even need an explicit opp pass — after
  casting, the AI auto-passes with no response and the human holds priority
  with their own creature spell still on the stack; responding to an AI-cast
  creature spell is an equally live route.
- **Remediation class: STAGE** (behavioral; destroys persisted run cards).
- **Predicted test impact:** none — the S+S branch is mutation-dark (A4-18).
- **Mutation-map judgment:** fix brings a mixed-pair rejection/handling test
  plus a non-adjacent-slot bookkeeping assertion (the refuter's variant is the
  test seed).

#### Decision packet for A5-2 (stage — plain English)
The Stapler lets you merge a spell you've just cast with something already on
the battlefield. The engine mis-files that combination into the "two spells"
code path. Three bad things happen at once: the spell you cast **vanishes** —
it never resolves and never reaches any zone, the mana is just gone; the
battlefield card that was supposed to be absorbed stays in play; and (the part
the adversarial check found) the run-deck bookkeeping can delete a **completely
unrelated card from your permanent run deck** — verified: a Mountain that had
nothing to do with the splice was destroyed, and that loss is saved to disk.
- **Option A (recommended, confidence: high):** refuse the mixed combination —
  a stack spell can only be spliced with another stack spell, a permanent with
  a permanent. Smallest change, closes the data-loss hole immediately.
- **Option B:** support the combination properly (resolve the spell onto the
  battlefield first, then merge as permanents) — more play value, more work,
  and the bookkeeping shift still needs the zone guard either way.

---

### A5-3 — Blocker merge deletes the block entry instead of tombstoning: the staple's attacker flips to unblocked and gets a free hit at the face
- **Location:** `reference/html-proto/js/engine.js:2936–2943` (the delete at
  `:2939`; baseAlreadyBlocking guard `:2940–2941` writes no replacement) vs the
  funnel contract at `:4739–4756` (removeFromCombat 'gone:<iid>' tombstone; its
  own comment at `:4735–4736` says deleting "would wrongly flip the attacker to
  unblocked"); the bespoke intent comment at `:2912–2915` @ `7b3a15f`
- **Dimension:** rules + near-twin drift (bespoke copy bypassing the engine's
  one "leaves combat" concept).
- **Severity:** P2 (calibrated against A2-5: same class, that one latent, this
  one live).
- **Evidence (finder-executed + refuter re-executed with a counterfactual):**
  when the staple was blocking and the base is already a blocker, the transfer
  deletes the staple's `G.blockers` entry outright — no tombstone. Refuter
  drove it end-to-end through public legal actions: two opp attackers each
  blocked, Stapler merges blocker B onto blocker A → life 20 → 18 (atk2's 2
  power hit the face) while atk1 stayed blocked; counterfactual run with the
  funnel-correct tombstoned state, same combat → life 20 → 20. The delta is
  exactly the bug. Canon: `docs/wiki/rules/800-combat.md` L20 (§801, updated by
  the PR #105 fix wave): an attacker that was blocked remains blocked even if
  its blocker is removed from combat — it deals no combat damage unless it has
  trample. Refuter refinement (a): the finder's "blockers map after: []"
  evidence line was post-combat-reset state (step() clears G.blockers at
  COMBAT_DAMAGE, `:6693`) — the life delta + counterfactual is the load-bearing
  evidence.
- **Fix sketch:** in the base-already-blocking arm, write
  `G.blockers.set('gone:' + stapleCard.iid, aIid)` instead of dropping; better,
  restructure the transfer to call `removeFromCombat(stapleCard.iid)` first and
  then opt-in re-assign roles to the base (this is also A5-1's shape). Refuter
  rider (b): the fix MUST also rewrite the bespoke comment at `:2912–2915`,
  which currently green-stamps the drop as a "one creature, one role" rule —
  without the comment fix a future reader will re-introduce the behavior.
  Ruling-eligible: Joe could in principle bless the drop as a design decision,
  but that would require amending canon §801 (which states the opposite,
  unqualified) AND the funnel's own contract comment — default to the fix.
- **Effort:** small–medium.
- **Verification status:** refuter verdict **confirmed**; refuter re-executed
  an independently derived repro through public legal actions plus a
  counterfactual control. Confidence high.
- **Remediation class: STAGE** (behavioral; combat damage outcome changes).
- **Predicted test impact:** none — no test exercises the splice blocker
  transfer.
- **Mutation-map judgment:** part of the A4-18 transfer dark mass; the
  counterfactual pair (tombstone vs delete, life 20 vs 18) is the regression
  test seed.

#### Decision packet for A5-3 (stage — plain English)
Magiclike's rules (§801) say: once an attacker is blocked, it STAYS blocked
even if its blocker disappears — it just deals no damage. The engine has one
official routine that gets this right. The Stapler's merge code does its own
thing instead: when you merge two of your blockers into one, the absorbed
blocker's assignment is simply erased, and the attacker it was holding back
hits you in the face (verified: 2 damage that the rulebook says shouldn't
happen). "Merge my two blockers into one bigger one" is a natural defensive
play, and the UI gives no hint a block will evaporate.
- **Option (one direction, confidence: high):** route the absorbed creature
  through the engine's existing "leaves combat" routine, which already handles
  this exactly right — and fix the code comment that currently endorses the
  wrong behavior, so it doesn't come back. (Technically you could instead
  bless the current behavior as a design ruling, but that means rewriting the
  rulebook section and the engine's own contract comment — not recommended.)

---

### A5-4 — Out-of-charges rip violates removeSlotByIdx's caller contract: the just-minted merged card is left with an out-of-bounds slotIdx
- **Location:** `reference/html-proto/js/engine.js:3038–3050` (charge-rip,
  no fixup) vs the contract at `run.js:1282–1284` ("CALLER CONTRACT: must
  decrement slotIdx for any in-game card whose slotIdx > removed index");
  the same handler performs the zone-walk fixup TWICE (`:2842–2851`,
  `:2974–2985` — the latter under a comment calling it CRITICAL); the
  contract's reference implementation ripSlotForPhylactery does it too
  (`:4960–4961`, `:4997–4998`) @ `7b3a15f`
- **Dimension:** state mutation + documented contract ignored.
- **Severity:** P2 (silent persistent-state corruption confined to the rest of
  the current game's run-state writes; the slots array itself saves correctly;
  same band as A4-15).
- **Evidence (finder-executed + refuter re-executed via a REAL run):** when
  the last charge is spent, `RUN.removeSlotByIdx(stapler.slotIdx)` runs with no
  subsequent slotIdx fixup. The Stapler boon's slot is appended LAST at run
  start, so every mid-game appendSlot mint above it — including the merged slot
  created seconds earlier in the same handler — goes stale. Refuter repro:
  `RUN.start(deck, 'stapler')` (real boon append, charges 3), charges set to 1
  (= the boon's designed two-prior-splices lifecycle), real startNextGame, then
  a fully legal activation splicing onto an opp creature: merged card cached
  slotIdx **12**, actual merged slot index **11**, slots array length 12 —
  out of bounds, `slots[merged.slotIdx] === undefined`. Control run with 2
  charges (no rip): cached === actual — the rip, not the splice, is the
  corruptor. Consequence probe: `applyStickerToSlot(stale idx)` silently
  no-ops; worse, any post-rip appendSlot (e.g. Steal) re-occupies the vacated
  index and the stale pointer then ALIASES a different card's slot — writers
  (applyStickerToSlot `:2104–2117`, playedSlotIdxs `:5546/:5599`,
  ripSlotByIdx `:4943/:4985`, Steal's slot read `:2239–2242`) silently hit the
  wrong persisted slot. The twice-in-the-same-function fixup kills any
  "intentional omission" defense.
- **Fix sketch:** after the rip, run the same zone-walk decrement used at
  `:2842–2851` — extract it (it already exists twice in this handler; a third
  copy-site is the drift mechanism) or route the rip through ripSlotByIdx-style
  logic. Refuter scoping note for the fix PR: the guaranteed victim (the
  just-minted merged card) exists only on the cross-owner perm path; in the
  reuseBaseSlot and S+S paths the victims are OTHER cards whose slots sit above
  the Stapler's (prior-game merged slots, mid-game Steal mints).
- **Effort:** small (the zone-walk already exists; extract + call + test).
- **Verification status:** refuter verdict **confirmed**; refuter re-executed
  an independent full-path repro with a causal-isolation control. Confidence
  high.
- **Remediation class: STAGE** (behavioral; corrupts which persisted slot gets
  written for the rest of the game).
- **Predicted test impact:** none — charge accounting is unfenced (A4-18).
- **Mutation-map judgment:** the rip block's survivors confirm zero fence; the
  fix's test asserts cached slotIdx === actual index after a ripping splice.

#### Decision packet for A5-4 (stage — plain English)
When the Stapler spends its last charge it removes itself from your run deck.
The deck's own rulebook-comment says: anyone who removes a slot must re-number
the cards that sit after it. The Stapler's self-removal skips that step — and
since the Stapler sits near the end of the deck, the card most reliably left
mis-numbered is the merged card you JUST created. From then on, anything that
writes to your run deck by position (stickers, rewards) can silently hit the
wrong card or nothing at all, for the rest of that game.
- **Option (one direction, confidence: high):** the correct re-numbering code
  already exists twice inside this very function — extract it and call it after
  the self-removal too. Plus a regression test. (The extraction also removes
  the copy-paste drift that caused this in the first place.)

---

### A5-5 — Cloned Stapler slot has no charges field: infinite charges, never ripped — reachability UPGRADED by the refuter, who executed the full producing path
- **Location:** `run.js:1012–1047` (clone reward field-copy at `:1021–1042`
  copies tplId/stickers/stapledTpls/empowerRolls/subtypeRolls/permaBuffs/
  bonusTrigger — **not charges**) + `engine.js:3024` (`typeof stSlot.charges
  === 'number'` gate silently skips both the decrement AND the ≤0 rip);
  makePlayer backfill `engine.js:936–941` (display rebuilt from
  `tpl.charges_at_run_start` = "3 charges" forever); secondary latent hole in
  pickTransformReplacement `run.js:1126` @ `7b3a15f`
- **Dimension:** state persistence + silent failure.
- **Severity:** P2 (persistent save-state defect that breaks a boon's stated
  core economy — unlimited splicer — reachable through legal play; not P1:
  uncommon reward roll required, player-favorable, no crash).
- **Evidence (finder-simulated; refuter executed the FULL producing path —
  reachability upgraded):** the finder's R3 simulated the clone-shaped slot
  directly. The refuter went end-to-end through the real machinery:
  `RUN.start` with the 'stapler' boon (slot.charges = 3 confirmed), real
  `recordResult('you')` wins until `generateRewardOffer` rolled a genuine clone
  candidate on the Stapler's slot (hit in 17 reward rolls with a 5-slot deck;
  `rollOneCandidate('clone')` at `run.js:877–886` is uniform over ALL slots, no
  special/charges exclusion), real pickRewardCandidate → startNextGame →
  makePlayer → real isLegalAction + executeAction activations. Result: **4
  consecutive clone activations all legal+executed, clone slot charges stays
  undefined, clone never ripped, display stuck at "3 charges"**; the ORIGINAL
  Stapler activated in contrast correctly decremented 3 → 2. Strengthening
  details: the clone is inserted adjacent to the original (slotIdx+1) and the
  original's charges decrement independently — the exploit needs no interaction
  with the original. Not sanctioned: the clone branch's own comment claims
  "Deep-clone all slot state," and the Stapler card text promises "3 per-run
  charges... When out of charges, ripped from the run." Secondary
  pickTransformReplacement hole verified as hedged: `{tplId, stickers: []}`,
  but double-gated today (stapler is the pool's only charges card AND
  special:true, which draftPool() at `draft.js:27` excludes from transform
  packs) — activates only if a future non-special charges card ships.
- **Fix sketch:** in the clone branch: `if (typeof orig.charges === 'number')
  clone.charges = orig.charges;` (mirror appendSlot's meta handling,
  `run.js:1273`). **Design decision needed (rides A5-11's ruling):** clone
  copies *remaining* charges (photocopy semantics, matching draft.js's
  opp-clone comment) vs fresh full charges.
- **Effort:** small (one guarded copy line + the design call + test).
- **Verification status:** refuter verdict **confirmed**, reachability
  upgraded from simulated-product to full-path-executed. Confidence high.
- **Remediation class: STAGE** (behavioral; changes run economy outcomes).
  Note: which charge value the clone gets is part of the A5-11 ruling
  conversation (what the Clone reward is *supposed* to be).
- **Predicted test impact:** none — no test touches clone rewards or charges.
- **Mutation-map judgment:** charge accounting sits in the A4-18 dark mass;
  fix test pins clone-decrements-and-rips.

#### Decision packet for A5-5 (stage — plain English)
The Clone reward photocopies one of your run cards. The copy routine lists out
every field it carries over — and the Stapler's charge counter isn't on the
list. A cloned Stapler therefore has no charge counter at all, and the
charge-spending code's safety check quietly skips slots without one: the clone
**splices forever, never decrements, never rips itself**, and the UI displays
"3 charges" indefinitely. The adversarial check reproduced this through the
entire real path — boon, real reward roll, real pick, real activations — so
this is a legal-play exploit, not a lab construction.
- **Option A (recommended, confidence: high):** copy the charge counter when
  cloning, as remaining charges — a photocopy of a half-used Stapler is a
  half-used Stapler (this matches how the opponent-clone code describes
  cloning). One guarded line + test.
- **Option B:** copy it as fresh full charges — makes Clone-on-Stapler a
  deliberately strong reward. Your call; either way the infinite splicer
  closes. (Pairs with the A5-11 decision about what the Clone reward offers.)

---

### A5-6 — permaBuffs shape mismatch: the merge core + its unit test pin an ARRAY shape no producer creates; the real OBJECT shape is dropped — and (refuter) the phantom array belief is systemic across five sites
- **Location:** `engine.js:205–212` (mergeSpliceData Array.isArray filter),
  `engine.js:227` (writeMergedSpliceToSlot `.length` write-gate), real producer
  **flushPermanentEotToPermaBuffs** `engine.js:4669/4675` (writes `{power,
  toughness, keywords: []}`) + real consumer applyPermaBuffsToCard
  `engine.js:4645–4665`, `run.js:1156` (comment "permaBuffs concat"),
  `tests/test_splice_core.js:27–33` (pins arrays); refuter's systemic
  additions: `run.js:1034–1035` (clone), `run.js:1270` (appendSlot meta),
  `draft.js:355–356` (opp clone) all gate on Array.isArray @ `7b3a15f`
- **Dimension:** test+comment vs code + state + silent failure.
- **Severity:** P3 (latent).
- **Evidence (finder-executed + refuter re-executed through the real
  pipeline):** flushPermanentEotToPermaBuffs writes the object shape;
  applyPermaBuffsToCard reads only that shape (refuter, real pipeline
  startNextGame → makeCard: object-shaped slot → +2/+2 + flying; array-shaped
  slot → NOTHING). mergeSpliceData treats permaBuffs as concatenable arrays —
  two real object-shaped inputs merge to `[]` (executed); the array shape the
  unit test green-stamps (`test_splice_core.js:27,29,33`) is inert end-to-end;
  the `run.js:1156` comment describes the phantom contract.
  **Refuter correction (claim narrowed):** "permaBuffs cannot survive ANY
  splice in either shape" was overbroad. The merge NEVER combines them — but
  the BASE slot's object permaBuffs *survive un-merged* by the
  writeMergedSpliceToSlot length-0 conditional-write accident (`:227` — merged
  `[]` has length 0, so the overwrite is skipped) on slot-reuse paths (reward
  path always; in-game only when the caster owns the base via reuseBaseSlot
  `:2855–2857`). Truly destroyed: the STAPLE's permaBuffs always (slot removed,
  merge drops the object), and the BASE's on cross-owner in-game splices (fresh
  appendSlot mint). This is the same conditional-write accident the finder
  credited for bonusTrigger in A5-7 but missed here. **Producer-name
  correction:** the function is `flushPermanentEotToPermaBuffs` (`:4669`), not
  "absorbEotIntoPermaBuffs" as the draft had it.
- **Reachability:** honestly unreachable today — the only permanent_eot card is
  Elystra, special:true → rejected by isSpliceableBase/Staple (`:68/:76`);
  no run modifier seeds permaBuffs (the `run.js:473` hook has zero callers).
  Latent shape-bomb + lying comment + lying test.
- **Fix sketch (refuter-widened):** pick ONE canonical shape — the object,
  since producer + consumer already use it — and sweep **all five** gating
  sites (mergeSpliceData, writeMergedSpliceToSlot's `.length` gate, run.js
  clone + appendSlot meta, draft.js opp clone), merging as power+power,
  toughness+toughness, keywords union; rewrite the test_splice_core permaBuffs
  assertions to the real shape; fix the `run.js:1156` comment.
- **Effort:** small–medium (five-site sweep + test rewrite).
- **Verification status:** refuter verdict **modified** (claim narrowed,
  producer renamed, scope widened); refuter re-executed an independent 3-part
  repro through the real pipeline. Confidence high.
- **Remediation class: STAGE** (behavioral — latent, but the fix changes what
  a future splice does to buffs; not a comment-only edit).
- **Predicted test impact:** **test_splice_core's permaBuffs assertions must be
  rewritten** — they currently pin the phantom array contract and would go red
  under the correct object merge. That is the point.
- **Mutation-map judgment:** the merge core's permaBuffs arm is green-stamped
  by a test asserting the wrong thing — worse than dark. Fix replaces the pin.
- **Cross-reference:** adjacent to A4-16 (Elystra's flush-on-leave dropping
  pending buffs) — different bug, same producer function
  (flushPermanentEotToPermaBuffs); a fixer touching one should read the other.

#### Decision packet for A5-6 (stage — plain English)
"Permanent buffs" (Elystra's blessing — stat boosts a card keeps for the whole
run) are stored as a small record: power, toughness, keywords. The splice
merge code — and its unit test — expect them to be a *list*, a format nothing
in the game actually produces. Result: merging never combines buffs (the
absorbed card's are always destroyed; the surviving card's slip through only
by accident), the code comment claims they combine, and the test certifies the
wrong format. Nothing breaks **today** — the only buff-granting card can't be
spliced — but the first card that changes that walks into a trap certified by
a green test.
- **Option (one direction, confidence: high):** standardize on the format the
  game actually produces, make the merge genuinely add buffs together, sweep
  the five places that check the wrong format, and rewrite the test to pin the
  real contract. Staged because it changes (future) game behavior, even though
  no current card reaches it.

---

### A5-7 — In-game splice reads slot-only fields (bonusTrigger, permaBuffs) off runtime card instances where they are always undefined — the reward path keeps them; the parity test omits exactly these two fields
- **Location:** `engine.js:2811–2817` (baseCard.permaBuffs / bonusTrigger /
  stapleCard.* — slot-only fields, never on instances; makeCard
  `:692–817` CONSUMES bonusTrigger into card.triggers at `:806–812` and applies
  permaBuffs at `:803` without storing either as an own-field) vs
  `run.js:1157–1163` (reward path reads the slots); staple slot deleted with
  its bonusTrigger at `:2839`; masked by `tests/test_splice_core.js:113–117`
  (parity compares only stapledTpls/stickers/empowerRolls) @ `7b3a15f`
- **Dimension:** state + pathway twins drifting + test blind spot.
- **Severity:** P3 (latent).
- **Evidence (finder-executed + refuter re-executed, 11/11 checks):** the two
  "identical" splice pathways disagree: RUN.applySplice merges
  slot.bonusTrigger/slot.permaBuffs; apply_in_game_splice reads the same field
  names off runtime cards where they are always undefined (no card JSON
  declares them, so the template-copy can't backfill). A bonusTrigger on the
  STAPLE's slot is permanently destroyed (slot removed, nothing merged); on the
  BASE's slot it survives only via writeMergedSpliceToSlot's conditional-write
  accident (`:228`) while the live merged card still loses it for the rest of
  the game. The parity test that exists to prove the pathways agree skips both
  fields. **Refuter corrections (conclusion unchanged, factual basis fixed):**
  (a) **"Watcher's Gift" does not exist in the code** — RUN_MODIFIERS
  (`cards.js:464–543`) contains exactly architects_codex, city_of_brass,
  endomorph, steal, phylactery, elystra_the_immortal, stapler; Watcher's Gift
  appears only in comments as an illustrative/planned example. (b) The real
  latent slot.bonusTrigger writer the finder missed is **Steal's stolen-slot
  appendSlot meta** (`engine.js:2273` → `run.js:1272`) — boon-exclusive with
  Stapler (single modifierId in RUN.start) and opp slots have no bonusTrigger
  producer today, so unreachable-today is *strengthened*: zero implemented
  sources can coexist with a Stapler on a spliceable slot (Codex writes only to
  its own special → unspliceable slot; the clone reward preserves tplId so a
  cloned Codex stays special; Mercurial Adept uses triggerPool, which both
  pathways ignore equally).
- **Fix sketch:** fetch both slots via RUN.getSlots() (the handler already
  does for charge accounting) and pass slot-side permaBuffs/bonusTrigger into
  mergeSpliceData; **add the two fields to the parity test**.
- **Effort:** small.
- **Verification status:** refuter verdict **modified** (source inventory
  corrected; claim/evidence/severity/fix all hold); refuter re-executed an
  independent end-to-end executeAction-driven repro, 11/11 checks. Confidence
  high.
- **Remediation class: STAGE** (behavioral — latent, but the fix changes what
  an in-game splice preserves). Cross-reference, don't merge, with A5-6: A5-6
  owns the shape mismatch inside mergeSpliceData; A5-7 owns the read-location
  divergence + the parity blind spot.
- **Predicted test impact:** additive — the parity test grows two fields and
  stays green once the fix lands (red before it, which is the proof).
- **Mutation-map judgment:** the parity test is the fence that should have
  caught this and was built with the hole in it; closing the hole is the fix's
  test half.

#### Decision packet for A5-7 (stage — plain English)
There are two ways a splice can happen — as a between-games reward, or
mid-game via the Stapler — and they're supposed to produce identical results.
For two rare card properties (a bonus ability a slot can carry, and permanent
buffs), the mid-game path looks for them in the wrong place (on the in-play
card, where they never live, instead of on the deck slot). The reward path
gets it right. The test built specifically to prove the two paths match skips
exactly these two properties. No current card combination can trigger the loss
(the adversarial check tried hard to find one and proved none exists) — but
the day one ships, mid-game splices will silently destroy the property.
- **Option (one direction, confidence: high):** make the mid-game path read
  the deck slots (it already fetches them for charge counting — the data is in
  hand), and add the two missing properties to the parity test so the paths
  can't drift again. Small, safe, future-proofing.

---

### A5-8 — Empower roll on a spell stapled onto a LAND base is silently inert (mis-remap); secondary: the prior-staple count loop misclassifies land staples in chains
- **Location:** `engine.js:139–163` (remapEmpowerRollForStaple — the
  effects→triggers conversion is gated on baseIsCreature only, while
  mergeStapleInto `:552–590` converts a spell staple into an ETB trigger for
  ANY permanent base, basePermanent = Creature || Land at `:482`);
  `engine.js:190–201` (prior loop counts every non-creature prior staple as +1
  trigger — a prior LAND staple actually added/merged an ability);
  consumer silent-return at `stickers.js:257–259`; the truthy mis-remapped roll
  also blocks the `stickers.js:113` fallback re-roll @ `7b3a15f`
- **Dimension:** rules + state (silent loss of a sticker's value).
- **Severity:** P3.
- **Evidence (finder-executed + refuter re-executed via the proto's own test
  loader, full live path through makeCard):** mountain + lava_spike with
  empower roll `{location:'effects', effIdx:0, field:'amount'}` → remapped roll
  unchanged (still 'effects'), merged card has no effects array
  (`card.effects: undefined`), ETB trigger damage stays 3 — the empower sticker
  silently does nothing after the splice. Control on a creature base
  (abyss_lurker): roll remaps to `{location:'triggers', subIdx:0}`, ETB becomes
  4 — proving the remap machinery intends empower to survive splices and works
  everywhere except land bases. Secondary leg executed: creature base with a
  prior mountain staple → remapped subIdx points past the card's single
  trigger; empower inert. Reachability verified end-to-end in the reward
  enumerator (`run.js:852–875`): canonicalSplicePair gives Land(2) priority
  over Spell(3) so the land wins base; empower's appliesTo accepts damage
  spells at weight 10 — a burn slot with an empower sticker paired with a land
  is a routine reward outcome. **Distinct from A6-2** (refuter diffed:
  that is the NON-persistent missing-roll re-roll on the fallback path in
  stickers.js; this is a RECORDED roll mis-remapped at merge time in engine.js
  — different site, different mechanism, no overlap. Erratum 2026-06-11: A6-2
  is still OPEN — the INDEX "fixed PR #103" stamp this chunk inherited was a
  bookkeeping error; #103 is A1-10). Not canon-sanctioned:
  sticker-system.md says rolls are stored then applied; mergeSpliceData's own
  roll-concat+remap shows splice-survival is the code's contract — the
  land-base gap is internal inconsistency, not design.
- **Fix sketch:** change the remap gate from baseIsCreature to "base is a
  permanent" (mirroring mergeStapleInto's own dispatch). **Refuter refinement
  on the secondary leg:** "count prior land staples as ability increments" is
  too simple — mergeStapleInto (`:540–551`) MERGES a land staple into an
  existing mana ability when the base already has one (net +0) and only
  appends fresh (+1) otherwise, so the prior-loop increment must be
  conditional; the chain-accurate approach is to simulate the merge per prior
  staple (or derive counts from synthesizeStapledTemplate of the prior chain)
  rather than count by type.
- **Effort:** medium (the primary gate is one condition; the chain-accurate
  prior-count is the real work).
- **Verification status:** refuter verdict **confirmed**; refuter re-executed
  independent repros for both legs plus a creature-base control. Confidence
  high.
- **Reachability nuance (refuter):** the primary land-base leg is one ordinary
  splice reward away; the secondary chain leg needs two splices across the run
  on the same base (reward excludes already-stapled STAPLES but not bases,
  `run.js:865`) — reachable but a step narrower.
- **Remediation class: STAGE** (behavioral; a paid sticker's value silently
  evaporates).
- **Predicted test impact:** none — no test exercises empower remap across a
  land-base splice; fix brings both legs.
- **Mutation-map judgment:** remap sits in the A4-18 dark mass; the
  land-vs-creature control pair is the test seed.

#### Decision packet for A5-8 (stage — plain English)
Empower stickers permanently upgrade one number on a card ("deal 3" → "deal
4"), and the upgrade is supposed to survive splicing — there's machinery
dedicated to relocating it onto the merged card. That machinery only handles
creature bases. Splice an empowered burn spell onto a *land* (a normal reward
outcome — lands win the "who's the base" tiebreak) and the upgrade silently
points at a part of the card that no longer exists: the sticker you earned
does nothing, no error, no tell. A subtler version miscounts in multi-splice
chains. This is a different bug from the empower one already fixed in PR #103
(the adversarial check verified no overlap).
- **Option (one direction, confidence: high for the main fix):** widen the
  relocation rule from "creature base" to "any permanent base," matching the
  merge code's own logic. The chain-counting half is fiddlier — recommend
  doing the simple gate now and the chain-accurate counting in the same PR if
  it stays small, or splitting it if not.

---

### A5-9 — matchFilter's spliceable_base comment says "no Lands" — lands are valid, designed bases  ⟶ SHIP (comment-only)
- **Location:** `engine.js` matchFilter spliceable_base arm (the spliceable
  filter cluster verified at `:4271/:4277` by the A5-1 refuter) @ `7b3a15f`
- **Dimension:** comment vs code.
- **Severity:** P3.
- **Evidence:** deep-read executed probe (abbreviated filing): the comment
  claims lands are excluded; the code accepts them, the canonicalizer
  *prioritizes* them (Land=2 beats Spell=3 — load-bearing in A5-8's repro), and
  staple-synthesis.md documents land bases as designed behavior.
- **Fix sketch:** rewrite the comment to match the code.
- **Effort:** trivial. **Verification status:** finder-executed probe; not
  assigned a refuter (comment-only class).
- **Remediation class: SHIP** (comment-only; gate suite + lint green).
- **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** zero behavioral surface — a comment
  edit cannot flip a mutant; nothing to fence.

---

### A5-10 — Splice reward comment describes the pre-v1.0.47 pick-then-pick flow; the pair is pre-rolled  ⟶ SHIP (comment-only)
- **Location:** `run.js` splice reward branch (rollOneCandidate region,
  `:852–875` neighborhood) @ `7b3a15f`
- **Dimension:** comment vs code (stale flow description).
- **Severity:** P3.
- **Evidence:** deep-read executed probe (abbreviated filing): the comment
  narrates the old two-step pick UI; since v1.0.47 the candidate pair is
  pre-rolled at offer time (confirmed by the A5-8 refuter's walk of the
  enumerator).
- **Fix sketch:** one-paragraph comment rewrite describing the pre-rolled pair.
- **Effort:** trivial. **Verification status:** finder-executed probe; not
  assigned a refuter (comment-only class).
- **Remediation class: SHIP.** **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** comment-only; no behavioral surface.

---

### A5-11 — Canon §1504 misdescribes the player Clone reward: "duplicate the highest-value non-land slot" is the OPPONENT clone heuristic; the player path is a uniformly random slot, lands included
- **Location:** `docs/wiki/rules/1500-the-run.md` §1504 line 33 vs
  `run.js:877–886` (rollOneCandidate 'clone': `Math.floor(Math.random() *
  runState.slots.length)` — no value sort, no land exclusion, no
  filterByPlayed gate) and `run.js:1012–1043` (apply path clones the offered
  slotIdx as-is); the canon sentence instead matches `draft.js:328–340`
  (applyOpponentClones: skips Land tpls, picks max intrinsicCardValue)
  @ `7b3a15f`
- **Dimension:** canon-vs-code — which side is authoritative needs a design
  ruling.
- **Severity:** P3 (doc/canon falsehood, no runtime damage).
- **Evidence (finder-filed + refuter re-executed empirically):** refuter
  verified the §1504 wording at the snapshot (and that §1504 is unambiguously
  the PLAYER reward section — opponent scaling is §1503), confirmed no
  apply-time re-pick rescues the wording, then ran 5000 rolls over a 5-slot
  deck (2 spells, 3 lands): uniform distribution (997/1011/985/1002/1005),
  lands offered 2992/5000, highest-value slot only 20.2%. Both canon claims
  falsified empirically. **Refuter strengthening rider:** the in-code weight
  comment at `run.js:760` ("duplicate a slot (fresh, no stickers carry)") is a
  THIRD disagreeing description — it contradicts the apply path, which
  deliberately deep-clones stickers/staples/empowerRolls/permaBuffs/
  bonusTrigger; and the sibling transform branch (`run.js:825`) explicitly
  documents lands-included as intentional while clone is silent — supporting
  that the code behavior may be deliberate and the canon page is what's stale.
- **Fix sketch:** Joe's ruling: either fix §1504's wording (player clone is a
  random slot the player may decline — and fix the `run.js:760` comment to
  match the deep-clone reality) or align the code to canon (value-sorted,
  non-land). **A5-5's design half (clone charge semantics) rides whichever way
  this lands.**
- **Effort:** small either way (docs edit, or a ~10-line code change + test).
- **Verification status:** refuter verdict **confirmed**; refuter re-executed
  an independent empirical repro (5000-roll distribution). Confidence high.
- **Remediation class: STAGE** — not because the docs edit is risky, but
  because the canon-vs-code question is a design ruling only Joe can make, and
  one branch of it is behavioral.
- **Predicted test impact:** none today; the code-alignment branch brings a
  distribution/exclusion test.
- **Mutation-map judgment:** rollOneCandidate's clone arm is unfenced; if the
  code branch is chosen, the fix pins the candidate policy.

#### Decision packet for A5-11 (stage — plain English, a ruling not a bug-fix)
The rulebook says the Clone reward "duplicates the highest-value non-land
slot." The actual player reward picks a **completely random** slot — lands
included, value ignored (verified statistically: 5000 rolls, perfectly
uniform, lands offered 60% of the time). The rulebook sentence accurately
describes a *different* thing: how the **opponent's** deck gets clones. A
third description in a code comment disagrees with both. One of these is the
real design; which?
- **Option A (recommended, confidence: medium — the code shows signs of being
  deliberate):** rule that the code is right — Clone offers a random slot,
  take it or leave it — and fix the rulebook sentence + the stray comment.
  Pure docs, ships immediately after your word.
- **Option B:** rule that the rulebook is right — Clone should offer your best
  non-land card — and change the code to match (small, tested).
- Either way, the A5-5 question ("does a cloned Stapler get its remaining
  charges or fresh ones?") should be answered in the same breath, since it's
  the same "what IS the Clone reward?" design conversation.

---

### A5-12 — staple-synthesis.md has an inverted base/staple sentence + a stale "parked in BACKLOG" claim, with a matching stale code tag  ⟶ SHIP (docs/comment-only)
- **Location:** `docs/wiki/staple-synthesis.md` (inverted sentence + stale
  parked-claim) + `engine.js:586` (matching stale tag) @ `7b3a15f`
- **Dimension:** doc vs code.
- **Severity:** P3.
- **Evidence:** deep-read executed probe (abbreviated filing): one sentence
  swaps which card is the base vs the staple (contradicting canonicalSplicePair
  and the page's own other sections); the page still claims a shipped behavior
  is "parked in BACKLOG," and the code carries a matching stale tag at
  `engine.js:586`.
- **Fix sketch:** fix the inverted sentence, delete/refresh the parked claim,
  drop the stale code tag — one docs pass.
- **Effort:** trivial. **Verification status:** finder-executed probe; not
  assigned a refuter (docs-only class).
- **Remediation class: SHIP.** **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** docs + a comment tag; no behavioral
  surface.

---

### A5-13 — Stapler oracle text says "Choose two target permanents" but the ability actually targets permanent_or_spell  ⟶ SHIP (card-text edit, with note)
- **Location:** `cards/stapler/card.json` (custom_text) vs the ability's
  actual `permanent_or_spell` targeting (stack spells offered at
  `engine.js:3874–3877`, load-bearing in A5-2's repro) @ `7b3a15f`
- **Dimension:** oracle text vs behavior.
- **Severity:** P3.
- **Evidence:** deep-read executed probe (abbreviated filing): the printed
  text under-promises — the targeting layer legally offers stack spells as
  splice halves (that's how A5-2 is reached at all).
- **Fix sketch:** reword the custom_text to cover the spell case (e.g.
  "Choose two targets: permanents or spells you've cast…") — exact wording is
  the card author's call.
- **Effort:** trivial. **Verification status:** finder-executed probe; not
  assigned a refuter.
- **Remediation class: SHIP, with note:** this is a *card-text* edit —
  player-facing, but rules-inert: the Stapler uses `custom_text`, so the
  string drives no engine behavior (unlike procedural text). It meets the
  ship gate (cannot alter a game outcome). Flagged so Joe sees a player-visible
  string changed. Sequencing note: if A5-2 lands as Option A (reject mixed
  pairs), the right wording may narrow rather than widen — coordinate the two.
- **Predicted test impact:** text-render snapshot, if any, updates trivially.
- **Mutation-map judgment (ship gate):** custom_text is data the engine never
  branches on; no behavioral surface.

---

### A5-14 — Land+Land merge doesn't union land subtypes  ⟶ PARK (latent — full filed text preserved)
- **Filed text (deep-read, abbreviated filing, verbatim):** "Land+Land merge
  doesn't union land subtypes — latent, no subtype-matters cards today."
- **Location:** `engine.js` mergeStapleInto land-merge arm (the `:540–551`
  ability-merge region per the A5-8 refutation) @ `7b3a15f`
- **Dimension:** state (lossy merge). **Severity:** P3 (latent).
- **Fix sketch:** union the staple's land subtypes into the merged template's
  types in the land-merge arm, mirroring the creature branch's subtype union
  (`engine.js:498–500`). **Effort:** small (one-line union + one test).
- **Why park:** no in-pool card reads land subtypes, so no game outcome can
  change today; this is a design-completeness note for whenever a
  subtype-matters card ships. Re-evaluate at that card's implementation
  (the magiclike-card-implementation flow should hit it via the splice
  checklist).
- **Verification status:** finder-executed probe; not assigned a refuter
  (latent class).

---

### A5-15 — Charge-rip purges zones by tplId on BOTH sides with no leave-play discipline — a latent footgun template  ⟶ PARK (latent — full filed text preserved)
- **Filed text (deep-read, abbreviated filing, verbatim):** "charge-rip purges
  zones by tplId both sides, no leave-play discipline — latent footgun
  template."
- **Location:** `engine.js:3038–3050` (the same rip block as A5-4) @ `7b3a15f`
- **Dimension:** structural footgun (zone removal bypassing the leave-play
  pipeline; tplId-keyed, so any same-named card on either side is swept).
- **Severity:** P3 (latent — today the Stapler is the only charges card, it's
  unique-per-run, and ripping it mid-activation has no observable trigger
  surface in the pool).
- **Fix sketch:** route the rip through the existing leave-play helpers
  (`emitLeavesBattlefield` / `removeFromCombat` / restriction clears) per card
  found, and scope it to the acting slot's instances so duplicate-tplId copies
  (the A5-5 clone) survive their sibling's rip. **Effort:** small–medium.
- **Why park:** no in-pool interaction can observe the missing leave-play
  discipline today; the hazard activates when (a) a second charges card ships
  (see A5-5's double-gated transform note) or (b) leave-play listeners that
  care about the Stapler exist. Whoever fixes A5-4 will be in this exact
  block — the park is a pointer for that PR to consider routing the rip
  through the normal leave-play path while there.
- **Verification status:** finder-executed probe; not assigned a refuter
  (latent class).

---

## Coverage (deep-read)

Read in full: `run.js` (whole file); `engine.js` splice / combat-transfer /
charge / targeting / legality regions; `draft.js` opp-staple regions; the
three splice test files; `cards/stapler/card.json`;
`docs/wiki/staple-synthesis.md`; `docs/wiki/rules/1500-the-run.md`.

Descoped to other chunks: card-text describe internals (ch10), splice UI
bodies (presentation), stickers internals (ch6), ai.js valuation (ch7).

## Test quality

- Zero getSource coupling in the splice tests (clean by the campaign's
  brittleness criterion).
- `test_splice_core`'s parity check omits exactly the two fields where the
  pathways actually diverge (A5-7), and its permaBuffs unit check pins the
  phantom array shape (A5-6) — the suite doesn't just miss those bugs, it
  certifies them.
- `test_optional_paid_etb` is the strongest file in the cluster.
- A4-18's **97 `apply_in_game_splice` mutation survivors** decompose onto: the
  combat-state transfer (A5-1/A5-3), charge accounting + the rip
  (A5-4/A5-5/A5-15), the S+S branch (A5-2), the cross-owner moves, and the
  slotIdx zone-walks — **none tested**.

## Verified clean (negative space — checked, no finding)

reward-path applySplice index-order safety; the 4-field reward/in-game parity
that IS tested holds; double-canonicalization idempotence; stolen stapled
creature persistence; opp staple chain propagation; save-migration staple
renames; single stapleChainOf definition; pendingOptionalCost modal
completeness (all 7 checklist sites); the v1.0.64 stapled-mana-ability scan
covers both sides; midGameSlotsSnapshot anti-farming revert;
charge display refresh; mergeStapleInto's impossible-pair throws are correct
tripwires.

## Cross-references

- **A2-5 (chunk 2)** is the precedent class for **A5-1/A5-3**: combat-exit
  handled outside the removeFromCombat funnel (A2-5 = change_control, fixed via
  the funnel; A5-1/A5-3 = the splice transfer's bespoke copy). The severity
  calibration (A2-5 P2-because-latent → A5-1 P1-because-live) comes from there.
- **A4-15 (chunk 4)** — the steal handler's side-hardcoded RUN write — is
  **cited, not refiled**: the splice handler's RUN writes were checked against
  the same axis during the deep-read; A5-4's victims interact with Steal's
  appendSlot mints but the side-gating itself is A4-15's packet.
- **A4-18 (chunk 4)** — its 97-survivor `apply_in_game_splice` bucket is
  decomposed by this chunk (see Mutation-map note and Test quality above);
  chunk 5 discharges that handed-forward dark mass.
- **A6-2** — A5-8 is a **distinct mechanism** from the A6-2 empower finding:
  A6-2 is the non-persistent missing-roll re-roll on the stickers.js fallback
  path; A5-8 is a recorded roll mis-remapped at merge time in engine.js
  (refuter diffed both; no overlap — and the truthy mis-remapped roll actively
  *blocks* that fallback). Erratum 2026-06-11: this chunk's drafts said
  "A6-2/PR #103" following a wrong INDEX stamp — A6-2 is in fact still OPEN
  (#103 is A1-10's PR; stickers.js has no fix commits).
- **A4-16 (chunk 4)** — Elystra flicker dropping pending permanent buffs — is
  adjacent to **A5-6**: same producer function
  (`flushPermanentEotToPermaBuffs`), different bug; a fixer touching either
  should read both packets.

## Triage table (for INDEX.md)

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A5-1](chunk-05-synthesis.md) | P1 | synthesis | engine.js | Splice combat transfer is side-blind: stapling the opp's attacker makes YOUR merged creature attack YOU (live, instant-speed, also legal in the COMBAT_ATTACK priority round); A2-5's class, bespoke path | stage | open |
| [A5-2](chunk-05-synthesis.md) | P2 | synthesis | engine.js | Stack-spell + battlefield-perm pair mis-files into the S+S branch: spell evaporates unresolved, perm never absorbed, and (refuter, worse-than-filed) an UNRELATED run slot is deleted and persisted in the general case | stage | open |
| [A5-3](chunk-05-synthesis.md) | P2 | synthesis | engine.js | Blocker merge deletes the block entry instead of tombstoning — the absorbed blocker's attacker flips to unblocked (counterfactual-verified: 20→18 vs 20→20); violates canon §801 + the funnel's own contract | stage | open |
| [A5-4](chunk-05-synthesis.md) | P2 | synthesis | engine.js | Out-of-charges rip skips the removeSlotByIdx caller contract — the just-minted merged card carries an out-of-bounds slotIdx; the fixup exists TWICE in the same handler | stage | open |
| [A5-5](chunk-05-synthesis.md) | P2 | synthesis | run.js | Cloned Stapler has no charges field: infinite charges, never ripped, display stuck at "3" — refuter executed the FULL producing path (boon → real clone roll → real activations ×4); charge semantics ride A5-11 | stage | open |
| [A5-6](chunk-05-synthesis.md) | P3 | synthesis | engine.js | permaBuffs shape mismatch: merge core + unit test pin a phantom ARRAY shape (refuter: systemic, 5 gating sites); real producer is flushPermanentEotToPermaBuffs's OBJECT shape; staple's buffs always destroyed, base's survive by accident; latent (Elystra special-gated) | stage | open |
| [A5-7](chunk-05-synthesis.md) | P3 | synthesis | engine.js | In-game splice reads slot-only bonusTrigger/permaBuffs off runtime cards (always undefined) vs the reward path's slots; parity test omits exactly those fields; refuter: Watcher's Gift doesn't exist — Steal's stolen-slot meta is the real latent writer; unreachable today | stage | open |
| [A5-8](chunk-05-synthesis.md) | P3 | synthesis | engine.js | Empower roll mis-remapped on LAND-base splices (effects→triggers gate is creature-only) — recorded roll goes silently inert; chain prior-count misclassifies land staples; distinct mechanism from A6-2, which is still open (refuter-diffed) | stage | open |
| [A5-9](chunk-05-synthesis.md) | P3 | synthesis | engine.js | matchFilter spliceable_base comment claims "no Lands" — lands are valid, designed (and tiebreak-prioritized) bases | ship | open |
| [A5-10](chunk-05-synthesis.md) | P3 | synthesis | run.js | Splice reward comment describes the pre-v1.0.47 pick-then-pick flow; the pair is pre-rolled at offer time | ship | open |
| [A5-11](chunk-05-synthesis.md) | P3 | synthesis | 1500-the-run.md / run.js | Canon §1504 describes the OPPONENT clone heuristic; player Clone is uniformly random, lands included (5000-roll empirical refuter check); third disagreeing comment at run.js:760; needs Joe's ruling — A5-5's design half rides it | stage | open |
| [A5-12](chunk-05-synthesis.md) | P3 | synthesis | staple-synthesis.md | Inverted base/staple sentence + stale "parked in BACKLOG" claim + matching stale code tag at engine.js:586 | ship | open |
| [A5-13](chunk-05-synthesis.md) | P3 | synthesis | cards/stapler/card.json | Oracle text "Choose two target permanents" vs actual permanent_or_spell targeting — card-text edit, player-facing but rules-inert (custom_text); coordinate wording with A5-2's outcome | ship | open |
| [A5-14](chunk-05-synthesis.md) | P3 | synthesis | engine.js | Land+Land merge doesn't union land subtypes — latent, no subtype-matters cards today; re-evaluate when one ships | park | open |
| [A5-15](chunk-05-synthesis.md) | P3 | synthesis | engine.js | Charge-rip purges zones by tplId on both sides with no leave-play discipline — latent footgun template; pointer for the A5-4 fix PR | park | open |
