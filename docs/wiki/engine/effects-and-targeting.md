---
type: concept
tags: [magiclike, engine, effects, targeting]
created: 2026-06-10
updated: 2026-07-24
---

# Effects and targeting (engine internals)

*Page anatomy + durability rules: [[README|engine hub]]. Canon: [[700-casting-and-activating]], [[400-zones]], [[900-keywords]]. The durable design rationale is [[atomic-effects]] + [[targeting-and-hexproof]]; this page is the verified mechanics.*

## What it does

This subsystem is what cards actually *do*: the 31-handler `EFFECTS` dispatch table (damage, pump, bounce, steal, tokens, copies, …), the targeting-legality layer (`getValidTargets` / `targetsForFilter` / `matchFilter`) that decides what a spell or trigger may point at, the three resolution loops that execute locked effects (`resolveTopOfStack` for spells, `runTriggerEffects` for triggers, `doActivateAbility` for abilities), and the zone-routing discipline for cards moving between hand, battlefield, graveyard, exile, and library.

## The flow

- **Dispatch.** `applyEffect` routes each effect descriptor through the `EFFECTS` table; `resolveEffectParams` resolves expressions first. The table's sync problem is *mechanically solved*: `effectCoverageReport` + its test assert handler↔usage exhaustiveness in both directions with a fake-kind canary.
- **The severity ladder** (tap < bounce < destroy < exile) drives `affect_creature`/`affectOneCreature`; indestructible blocks only the destroy rung; exile bypasses it. Exile-as-kill claims trophy credit directly (deliberate — dies never fires for exile).
- **Targeting is one layer.** Every selection path — cast legality, AI enumeration, trigger queue/auto-pick/prompt, the castable glow — routes through `getValidTargets`/`targetsForFilter`, so hexproof is enforced once, structurally (the [[targeting-and-hexproof]] claim, verified at the layer level; textually the gate is implemented as three pasted copies). `chooses()` edicts and mass-scope effects deliberately bypass targeting (they don't target — `docs/PROTOCOL.md` §3.5). `matchFilter` is the composable restriction language (type, subtype, color, stat bounds, keyword…); its key vocabulary is boot-validated against the `MATCH_FILTER_KEYS` set.
- **Resolution re-validates targets.** Since the re-validation fix, `tsRevalidateTargets` runs once at the start of both `resolveTopOfStack` and `resolveTrigger`, re-running the same per-slot legal sets used at cast/queue time — hexproof gained in response, filter violations (a pumped creature escaping a `max_tough` removal), and zone changes all re-apply. Battlefield descriptors identify the locked object by `(iid, battlefieldIncarnation)`: `iid` remains the persistent card identity, while every battlefield entry advances the incarnation, so a bounced-and-recast card cannot inherit an old spell target or source/self trigger. All targeted slots illegal → whole fizzle (untargeted riders skipped, costs stay paid, the fizzled spell owner-routed to the graveyard); some survive → illegal slots nulled, the entry proceeds against survivors. Within resolution, snapshots are **lazy, first-read-per-slot** (`makeSlotTargetGetter` — the hybrid last-known-information model, DIVERGENCE D1); per-effect handlers additionally guard liveness via `resolveTarget`.
- **Self-scope.** `scope:'self'` resolves to the creature for creature-operating kinds and to the *controller* for player-operating kinds (`CREATURE_EFFECT_KINDS` is the contract) — implemented across the spell, trigger, and ability resolvers.
- **Zone routing.** Cards entering a graveyard go to their **owner's** graveyard everywhere (the stolen-card rationale is comment-documented). `iid` remains stable where the same runtime card object moves zones; any path that constructs a replacement object mints a fresh one. Independently, every genuine battlefield arrival advances `battlefieldIncarnation`, including normal cast arrival, reanimation, delayed return, land play, and token creation. `placeCardOnBattlefield` and the cast-arrival path also set summoning sickness as appropriate. Tokens cease to exist on every leave path.
- **Static lords.** A lord's `static_buff` has two halves with two lifecycle models: the stat half recomputes live per `getStats` call; the keyword half (`applyStaticKeywordGrants`) is event-reconciled. Both halves share one `lordBuffApplies` predicate and diff-reconcile against the current set of matching creatures, so grants are revoked both on lord leave-play and when the filter stops matching. The shared predicate carries the stat half's Creature gate and is structured to avoid `getStats`↔`matchFilter` recursion.
- **Boot validation** (`validateAllCardEffects` + `EFFECT_SCHEMA`) checks effect-kind/taxonomy membership for card data, runs required-param validation per the schema, and validates filter keys against the `MATCH_FILTER_KEYS` set (unknown keys warn loudly at boot).

## Design rulings

- **Targets re-validate at resolution; partial multi-target fizzles null the dead slots and proceed.** The whole-fizzle case is canon ([[700-casting-and-activating|§704]]); the per-slot partial semantics are a deliberate design ruling and are test-pinned.
- **Exile-as-kill claims trophy credit; bounce does not.** Git-history-verified deliberate design — permanent removal earns the credit, transport doesn't.
- **Edict choices belong to the affected player.** All three resolution loops pause before the `chooses()` handler runs and route the human through the `pendingEdictChoice` prompt (`maybeDeferHumanChooses`); the AI path auto-picks the lowest sac-value creature.
- **Non-combat trample spills from spells, never from a fight.** A trample spell deals lethal to the creature and spills the remainder to its controller; fight damage never spills (`fightDamage` flag, both halves deliberate).
- **Phylactery floors life at 0 and rips a slot per point past 0.** Life loss — whether from damage or a drain — routes through one shared floor/rip helper: the protected player floors at 0 and each point that would have gone below rips a run slot. One price for losing life, mandatory.

## Verified clean

- **Severity-ladder semantics** match PROTOCOL; **tokens never leak** across zones.
- **Owner-routing is correct** on bounce/exile/death/sacrifice/discard/counter/normal resolution — a countered spell goes to its owner's graveyard like every other leave path.
- **D1's hybrid last-known-information model** is implemented as documented for every live card.
- **Mass-scope snapshots its set before iterating** (no mutate-while-iterating).
- **EOT cleanup registration is symmetric** across all five temp systems.
- **Trigger queue and resolution share the same legality component** — queue-vs-resolve targeting cannot drift, and the re-validation gate reuses the same sets.
- **The `PENDING_DECISIONS` freeze genuinely prevents cross-resolution prompt clobbering** (it guards the cross-resolution window; ordering within a single resolution is handled separately).
- **The dispatch-table sync problem is solved mechanically** (two-direction exhaustiveness test with canary).
- **`become_copy_of`'s clone discipline is deep enough** — no in-place template mutations found in the EFFECTS table.

## See also

[[README|Engine hub]] · [[atomic-effects]] · [[targeting-and-hexproof]] · [[triggers-and-stack]] · [[combat]] · [[turn-machine]] · [[type-identity]] · [[procedural-card-text]] · [[700-casting-and-activating]] · [[400-zones]]
