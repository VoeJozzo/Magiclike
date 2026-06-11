# Design spec — per-ability `stackable` (A3-2 follow-up)

*Status: DRAFT for Joe's review. Design doc only — no code change rides with this.*
*Sources: audit finding A3-2 (`docs/audit/chunk-03-stack-triggers.md`), Joe's PR #98 rounds 2–4 comments (2026-06-10/11), engine at `audit/integration`.*

## 1. Problem statement

Audit A3-2 (live-probed, confirmed twice) established the engine's real resolution model: **spells and triggered abilities go on the stack** (`doCastSpell` / `pushTriggerEntry` — the engine's only two stack-push sites) and get a response window; **non-mana activated abilities never touch the stack** — `doActivateAbility` pays costs and applies every effect inline in one engine call, so the opponent's "response" can only ever arrive after the ability already happened. The docs lied in both directions: DIVERGENCE D8 asserted activations route through the stack, and canon §705 allows only mana abilities to skip it.

Joe's ruling (PR #98 round 4): the split was never meant to be *by category*. The original vision was a per-ability **`stackable` boolean** — "T: you gain 1 life" should just happen; "T: destroy target creature" should give the opponent a window. The current code is an unfinished artifact of that vision. This spec designs the finished version, for triggers and activated abilities alike.

## 2. The design

One boolean on every authored or generated trigger/ability definition:

```json
{ "event": "...", "condition": [...], "effects": [...], "stackable": true }
```

- **Default: `true`** (Joe's explicit call — the posture is "players can respond," and each ability must earn its way out via the interrogation: *"will anyone ever reasonably want to respond to this?"* If no — it just happens; making players watch it resolve is friction without gameplay.)
- **`stackable: true`** — exactly today's trigger path: queue at emit → drain at next priority opening → targets locked at stack-push → real `kind:'trigger'` (or `kind:'ability'`) stack entry → priority round opens, opponent can respond → resolves LIFO with §1006.1 target re-validation/fizzle.
- **`stackable: false`** — the trigger still queues at emit (preserving emit()'s verified queue-only re-entrancy safety), but **at drain time it resolves immediately, in queue order, before any stack push and before priority opens**. No player ever holds priority between the event and the resolution — player-atomic with the event. No log-less vanishing: it logs as it resolves. Unstackable resolutions still count against the 100-per-episode trigger budget (they can still cascade) and still emit their own downstream events.
- **Activated abilities** get the same field. Today's inline `doActivateAbility` IS the `stackable:false` path; the new work is the `stackable:true` path — a `kind:'ability'` stack entry resolving through `resolveTopOfStack`, inheriting the shipped A3-1 target re-validation. (Mana abilities stay hardcoded off-stack — that part is already deliberate and correct.)
- Terminology: this is a Magiclike rule, full stop — MTG is a reference point (its mana-ability exception and Split Second are the nearest relatives), not the standard Magiclike deviates from.

## 3. The replacement-effect angle (honest assessment)

Joe asked whether `stackable:false` can do some of what MTG calls replacement effects — e.g., make a traditional clone work. **Partly, and the part it gets is the part players see.**

- What it gives: with drain-time-immediate resolution, an unstackable ETB "become a copy of target creature" resolves before any priority window — no player ever gets a turn while the un-copied creature sits there killable. The player-visible clone experience (~it enters *as* the copy) works with this single bit.
- The genuine gap: an MTG replacement effect modifies the event **before/instead of** it happening; an unstackable trigger fires **after** it. Three observable differences: (1) other triggers' conditions evaluate at emit time (per E5) against the **pre-modification** state — a "when a Shapeshifter enters" watcher sees the clone's printed types, not the copied ones; (2) the copied card's own ETB triggers never fire (they're granted after the enters event already emitted); (3) true prevention/redirection ("if you would draw, instead…", damage prevention, enters-with-extra-counters) cannot be expressed as after-the-fact triggers at all — those need a **pre-event hook**, which is out of scope here and should be a separate design if ever wanted.
- Verdict: ship `stackable` on its own merits; treat "clone via unstackable ETB" as a cheap follow-on experiment; do **not** claim replacement-effect parity in docs. The False Witness keeps its current exile+copy implementation regardless (see below).

## 4. Worked classification (the interrogation, applied to the live pool)

| Ability | "Would anyone reasonably respond?" | Call |
|---|---|---|
| **Ajani's Pridemate** — you gain life → +1/+1 | No — pure bookkeeping; watching it resolve is friction | **unstackable** (Joe's canonical example) |
| **Ancestral Priest** — ETB: gain 2 life | No — untargeted, self-only, nothing a response changes | **unstackable** |
| **Beast Whisperer** — your creature enters → draw | No — no response stops or alters a draw | **unstackable** |
| **Cavalry Captain** — attacks → +2/+0 self | No — removal works identically before/after a power-only pump. (A *toughness* pump would flip this — interrogate per ability, never per shape) | **unstackable** |
| **The False Witness** — ETB: exile target opp creature + become its copy | Yes — it functions as removal; the opponent must get a save window | **stackable** (Joe's ruling) |
| **The False Witness** — leaves play → return the exiled card | No — nothing can usefully interact with the return | **unstackable** |
| **Exorcist** — ETB: exile target creature, controller gains life = power | Yes — same removal logic as False Witness | **stackable** |
| **Blood Artist** — a creature dies → opp loses 1, you gain 1 | Marginal — but it deals lethal-relevant life loss, and the default posture wins ties | **stackable** (weakly) |
| Activated, e.g. Royal Assassin-style "T: destroy target creature" | Yes — targeted removal | **stackable** (a behavior change: gains a window it lacks today) |
| Activated, e.g. "T: you gain 1 life" / looters / mana dorks | No | **unstackable** (current feel preserved) |

## 5. Migration sketch

- **Phase 0 — docs (this spec).** Land the spec; add the `stackable` field to PROTOCOL §3.3/§5 wire format (snake_case, both engines); truthful DIVERGENCE row replacing D8's false assertion; a §705/§1000 status note. Rides the already-approved §1000 rewrite (A3-4).
- **Phase 1 — triggers.** Add the field to the trigger schema + boot validation (boolean, default `true` when absent — which preserves current trigger behavior *exactly*, since triggers already stack). Implement the unstackable drain path. Flip the classified unstackable triggers above. Tests: one stackable (response window exists), one unstackable (resolves pre-priority), cascade/budget case.
- **Phase 2 — activated abilities.** `kind:'ability'` stack entries; AI learns to evaluate response windows it's offered; every *existing* ability gets an **explicit** `stackable:` at migration time (audited list — the schema default never silently changes shipped behavior; the default governs new authoring). **Sequenced after the approved A1-1 leg fixes** — the priority pass-tracker must be correct before adding windows that depend on it.
- **Phase 3 — exploration.** The clone-via-unstackable-ETB spike (§3); UI marker for unstackable on the card frame; generator tables (`GENERATOR_EFFECTS` / Mercurial pool) get classified too.

**Cross-engine note:** the Godot port mirrors this engine and implements from PROTOCOL — the field must land in §3.3 in Phase 0, flagged Godot-pending alongside the composable-trigger rows (E1/E2) it rides on.

## 6. Open questions for Joe

1. **Resolution moment for unstackable:** drain-time-immediate (recommended — player-atomic, keeps emit() queue-only) vs. truly synchronous inside the event. Concrete difference: should an unstackable pump be able to save a creature that would otherwise die to state-based actions in the same instant?
2. **Player-facing surface:** does unstackable get a name and a card-frame marker ("can't be responded to"), or stay invisible rules plumbing for now?
3. **Confirm the activated-ability default:** new abilities default `stackable:true` even though every shipped ability currently behaves unstackable — yes?
4. **Design space:** is "cards that grant/remove stackability" (unstackable-as-premium-effect) parked, or worth a BACKLOG line now?
