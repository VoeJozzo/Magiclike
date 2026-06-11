---
type: concept
tags: [magiclike, engine, audit, effects, targeting]
created: 2026-06-10
updated: 2026-06-10
sources: ["docs/audit/chunk-04-effects-targeting.md", "PR #98 verdict rounds (2026-06-10)"]
---

# Effects and targeting (engine internals)

*Audit chunk 4. Page anatomy + durability rules: [[README|engine hub]]. Canon: [[700-casting-and-activating]], [[400-zones]], [[900-keywords]]. The durable design rationale is [[atomic-effects]] + [[targeting-and-hexproof]]; this page is the verified mechanics.*

## What it does

This subsystem is what cards actually *do*: the 31-handler `EFFECTS` dispatch table (damage, pump, bounce, steal, tokens, copies, …), the targeting-legality layer (`getValidTargets` / `targetsForFilter` / `matchFilter`) that decides what a spell or trigger may point at, the three resolution loops that execute locked effects (`resolveTopOfStack` for spells, `runTriggerEffects` for triggers, `doActivateAbility` for abilities), and the zone-routing discipline for cards moving between hand, battlefield, graveyard, exile, and library.

## The flow

- **Dispatch.** `applyEffect` routes each effect descriptor through the `EFFECTS` table; `resolveEffectParams` resolves expressions first. The table's sync problem is *mechanically solved*: `effectCoverageReport` + its test assert handler↔usage exhaustiveness in both directions with a fake-kind canary.
- **The severity ladder** (tap < bounce < destroy < exile) drives `affect_creature`/`affectOneCreature`; indestructible blocks only the destroy rung; exile bypasses it. Exile-as-kill claims trophy credit directly (deliberate — dies never fires for exile).
- **Targeting is one layer.** Every selection path — cast legality, AI enumeration, trigger queue/auto-pick/prompt, the castable glow — routes through `getValidTargets`/`targetsForFilter`, so hexproof is enforced once, structurally (the [[targeting-and-hexproof]] claim, verified at the layer level; textually the gate is three pasted copies, a parked hoist). `chooses()` edicts and mass-scope effects deliberately bypass targeting (they don't target — `docs/PROTOCOL.md` §3.5). `matchFilter` is the composable restriction language (type, subtype, color, stat bounds, keyword…); its key vocabulary is an open tail with no boot validation yet (A4-11, rides the approved validation-extension pattern).
- **Resolution re-validates targets.** Since the re-validation fix, `tsRevalidateTargets` runs once at the start of both `resolveTopOfStack` and `resolveTrigger`, re-running the same per-slot legal sets used at cast/queue time — hexproof gained in response, filter violations (a pumped creature escaping a `max_tough` removal), and zone changes all re-apply. All targeted slots illegal → whole fizzle (untargeted riders skipped, costs stay paid, the fizzled spell owner-routed to the graveyard); some survive → illegal slots nulled, the entry proceeds against survivors. Within resolution, snapshots are **lazy, first-read-per-slot** (`makeSlotTargetGetter` — the hybrid last-known-information model, DIVERGENCE D1); per-effect handlers additionally guard liveness via `resolveTarget`.
- **Self-scope.** `scope:'self'` resolves to the creature for creature-operating kinds and to the *controller* for player-operating kinds (`CREATURE_EFFECT_KINDS` is the contract) — implemented in the spell and trigger resolvers; the ability copy of the fork is a known gap (A4-13).
- **Zone routing.** Cards entering a graveyard go to their **owner's** graveyard everywhere (the stolen-card rationale is comment-documented); the one audited violation is the counter handler (A4-19, open). Battlefield arrivals through `placeCardOnBattlefield` mint a fresh iid (the §3.7 rule) and set summoning sickness; the cast-arrival path keeps the stack object's iid, and `fetchLibraryToBattlefield` bypasses the discipline entirely (land-only today — A4-20). Reanimation from graveyard/exile mints fresh and sets sick (test-pinned). Tokens cease to exist on every leave path.
- **Static lords.** A lord's `static_buff` has two halves with two lifecycle models: the stat half recomputes live per `getStats` call; the keyword half (`applyStaticKeywordGrants`) is event-reconciled and currently **add-only** — grants are revoked on lord leave-play but not when the filter stops matching (steal a buffed creature and it keeps haste/hexproof). The adjudicated fix direction is one shared `lordBuffApplies` predicate + diff-reconcile (A4-2, open; also closes the stat half's missing Creature gate and must dodge the `getStats`↔`matchFilter` recursion crash, A4-14).
- **Boot validation** (`validateAllCardEffects` + `EFFECT_SCHEMA`) checks effect-kind/taxonomy membership for card data; the schema covers a documented 4-kind subset — required-param validation and filter-key validation are the approved extension lane (A4-17, A4-11).

## Design rulings

- **Targets re-validate at resolution; partial multi-target fizzles null the dead slots and proceed.** The whole-fizzle case is canon ([[700-casting-and-activating|§704]]); the per-slot partial semantics were decided by the implementing fix and are test-pinned. *(GO ruling, PR #98, 2026-06-10; implemented PR #111.)*
- **Exile-as-kill claims trophy credit; bounce does not.** Git-history-verified deliberate design — permanent removal earns the credit, transport doesn't.
- **Edict choices belong to the affected player.** The spell path ships the human prompt (`pendingEdictChoice`); extending it to the trigger/ability paths is the open A4-7.
- Chunk 4's genuine design forks — non-combat trample spill (A4-9: the spell-half is demonstrably intended via trample stickers; the fight-half reads as collateral) and Phylactery's drain behavior (A4-12: floor is mandatory, the rip price is the ruling) — were filed with decision packets and **await their verdict round**; record the outcomes here when ruled.

## Verified clean

- **Severity-ladder semantics** match PROTOCOL; **tokens never leak** across zones.
- **Owner-routing is correct** on bounce/exile/death/sacrifice/discard/normal resolution — counter is the lone violation.
- **D1's hybrid last-known-information model** is implemented as documented for every live card.
- **Mass-scope snapshots its set before iterating** (no mutate-while-iterating).
- **EOT cleanup registration is symmetric** across all five temp systems.
- **Trigger queue and resolution share the same legality component** — queue-vs-resolve targeting cannot drift, and the re-validation gate reuses the same sets.
- **The `PENDING_DECISIONS` freeze genuinely prevents cross-resolution prompt clobbering** (only the within-one-resolution window is real, and latent).
- **The dispatch-table sync problem is solved mechanically** (two-direction exhaustiveness test with canary).
- **`become_copy_of`'s clone discipline is deep enough** — no in-place template mutations found in the EFFECTS table.

## Open soft spots

Live status: `docs/audit/INDEX.md`. The chunk's open P1s: **A4-2** (add-only lord keyword grants), **A4-3** (fight auto-fill conscripts a friendly replacement when the chosen target dies — friendly fire instead of fizzle; not closed by the re-validation gate, fight has no target slots), **A4-4** (mass destroy/bounce is sequential, not batched — dies-listener counts depend on array order), **A4-5** (the CLEANUP keyword rebuild is copyOf-blind — a False Witness copy loses copied flying), **A4-6** (color filters test only the first pip — "non-Black" removal hits {U}{B} cards). Open P2/P3s include A4-7/8/9/11/12/13/14/15/16/17/19/20/21/22; parked: A4-18 (the coverage decomposition), A4-23 (mid-resolution prompt ordering), A4-24 (hexproof gate hoist + pins).

## Coverage reality

As of the 2026-06-10 morning mutation map (predates that day's test additions): the effects region was the suite's largest dark zone — **698 of 1,274 mutants survived (~55%)**, but decomposed honestly: ~37% is AI valuation heuristics (judgment coefficients, handed to chunk 7), 79 the already-filed mana cluster, 97 in `apply_in_game_splice` (chunk 5's), with the genuinely dark handlers named (steal, grant_keyword, grant_cast_permission, move_card, add_counter, become_copy_of, create_tokens, snapshotTarget…). The targeting region had **64 of 153 survive (~42%)**, including both non-creature hexproof-gate inversions and all five restrict pass-throughs. Counterweight: the five dedicated effects/targeting test files are genuinely behavioral (no green theater — a campaign first), and the 0-survivor handlers match the well-tested core exactly. **Pinned that day:** the resolution re-validation battery (PR #111). The prioritized test consumption list lives in A4-18.

## See also

[[README|Engine hub]] · [[atomic-effects]] · [[targeting-and-hexproof]] · [[triggers-and-stack]] · [[combat]] · [[turn-machine]] · [[type-identity]] · [[procedural-card-text]] · [[700-casting-and-activating]] · [[400-zones]]
