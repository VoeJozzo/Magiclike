# Duration Architecture — `until(event)` expiry registry (design spec)

**Status:** design-of-record, **deferred build** (pull when the first card needs a
non-EOT duration). Captures the design while context is fresh.

## Context — the problem

"Until end of turn" is not a modular concept today. Several **parallel, hardcoded**
mechanisms each implement one specific duration, each with its own field and its own
cleanup site:

| Temporary effect | Stored as | Reverted where |
|---|---|---|
| Stat buff/debuff (pump) | `card.tempPower` / `card.tempTou` | end-of-turn cleanup loop (engine.js ~5657) |
| Granted keywords (EOT) | `card.eotGrants[]` | same cleanup loop (re-derive keywords) |
| Granted types (EOT) | `card.typeGrants[]` with `eot:true` | same cleanup loop (filter `!g.eot`) |
| Temporary control (Threaten) | `card.tempControlUntilEot` | same cleanup loop (move home) |
| Delayed return (exile-until-eot) | `G.delayedTriggers[]` `fireAt:'endStep'` | end-step delayed-trigger drain |
| Permanent grants (until leave-play) | `card.grantedBy` Map / `card.typeGrants` `eot:false` | `resetInPlayState` / `clearRestrictionsFromSource` |

Adding a new duration ("until your next turn," "until end of combat," "until this
leaves play" for stats) means inventing **another** field + **another** cleanup site.
Every "until X" is bespoke. That's the wart.

## The model — one expiry registry, driven by the event bus

A single list of **expiry records**, each describing *what to undo* and *when*:

```js
G.expiries = [
  {
    id,                 // unique handle (for dedup / manual cancel)
    sourceIid,          // the card/effect that created it (for leave-play cascade)
    when,               // an event predicate (see below)
    revert,             // a closure (or a serializable descriptor — see "Persistence")
  },
  ...
]
```

`when` is an **event predicate**, evaluated against the same events the trigger system
already emits (`emit(evt)`):

- `end_of_turn` — fires at the cleanup step (today's "EOT").
- `this_leaves_play` — fires when `sourceIid` (or the affected card) leaves the battlefield.
- `your_next_turn` / `end_of_combat` / `next_upkeep` — future, free once the bus carries the event.

Reuse the **existing event bus**: the cleanup step and zone-change paths already
`emit(...)`. A new `drainExpiries(evt)` walks `G.expiries`, runs `revert()` for every
record whose `when` matches `evt`, and removes it. This is the *exact same shape* as
`drainTriggers` / the trigger-condition matcher — durations become "listeners" in your
words.

### How the current mechanisms fold in

- **pump EOT** → `applyExpiry({ when:'end_of_turn', revert: () => { card.tempPower -= p; card.tempTou -= t; } })`
  (or keep `tempPower` as the store and have the EOT expiry zero it — either works; the
  point is the *scheduling* is unified, not necessarily the storage).
- **eotGrants / typeGrants(eot)** → `when:'end_of_turn'` expiries that pop the keyword/type tag.
- **permanent grants** → `when:'this_leaves_play'` expiries (replaces the `grantedBy`
  Map walk in `clearRestrictionsFromSource`).
- **Threaten** → `when:'end_of_turn'`, revert = move card home.
- **exile-until-eot** → already a delayed trigger; can stay, or migrate to an
  `end_of_turn` expiry whose revert returns the card.

## Authoring shape

Effects gain a uniform `duration` field parsed into a `when`:

```json
{ "kind": "add_type", "types": ["Creature"], "power": 2, "toughness": 2, "duration": "end_of_turn" }
{ "kind": "pump", "power": 3, "toughness": 3, "duration": "your_next_turn" }
{ "kind": "grant_keyword", "keyword": "flying", "duration": "this_leaves_play" }
```

`duration: "permanent"` (or absent on a permanent-grant) → `this_leaves_play`.
`duration: "eot"` / `"end_of_turn"` → `end_of_turn`. The handler calls a shared
`scheduleExpiry(card, duration, revert)` instead of poking a bespoke field.

## Migration plan (when pulled)

Each step keeps the suite + selfplay green; land incrementally.

1. **Add the registry + drain, no behavior change.** Introduce `G.expiries`,
   `scheduleExpiry`, `drainExpiries(evt)`. Call `drainExpiries` from the existing
   cleanup step (`end_of_turn`) and from `resetInPlayState` / leave-play
   (`this_leaves_play`). Nothing schedules onto it yet → inert.
2. **Migrate one mechanism as proof:** `typeGrants` (newest, smallest blast radius,
   already has the `eot` boolean). Route `add_type`/`set_types` through
   `scheduleExpiry`; delete the bespoke `typeGrants.filter(!g.eot)` line. Verify
   `test_type_change` green.
3. **Migrate keyword grants** (`eotGrants` → `end_of_turn` expiries; `grantedBy` →
   `this_leaves_play` expiries). This is the big one — the keyword re-derivation in
   the cleanup loop becomes per-expiry reverts. Most regression risk; do it alone.
4. **Migrate pump / temp stats** and **temp control**. Verify combat + threaten tests.
5. **Add a new duration to prove the payoff:** a card with `until your next turn`
   (needs the bus to emit a `your_turn_begins` event keyed to the controller).

## Persistence caveat (the one real design risk)

`revert` as a **live closure** does not survive `JSON.stringify` (save/load) or the AI's
`duplicate_deep` snapshots. Two options:

- **(A) Serializable revert descriptors.** Store `revert` as data
  (`{op:'pop_type', tag:'Creature'}` / `{op:'add_stat', power:-2, toughness:-2}`) and a
  small dispatch table applies it. Survives save/load + clone. **Recommended** — matches
  the engine's existing "data on state, behavior on RulesEngine" rule (CLAUDE.md).
- **(B) Closures + rebuild on load.** Simpler to write, but every expiry needs a
  reconstruct path after deserialize. More fragile.

Today's temporaries mostly *don't* persist (EOT effects never cross a save; they're
cleared before any save point), so the registry can start **transient** (rebuilt each
session, like `pendingTriggers`) and only needs descriptors if a *cross-turn-boundary*
persistent duration is ever authored. Start transient; add descriptors when needed.

## Files to touch (when pulled)

- **`js/engine.js`:** add `G.expiries` to state; `scheduleExpiry` / `drainExpiries`
  near `applyGrant`/`applyTypeGrant`; call `drainExpiries('end_of_turn')` in the cleanup
  loop (~5657) and `drainExpiries('this_leaves_play', sourceIid)` in `resetInPlayState`
  / `clearRestrictionsFromSource`. Migrate handlers per step.
- **`js/triggers.js`:** a `parseDuration(str) -> when` helper (mirrors the condition
  parser) if durations get richer than the current enum.
- **Tests:** `test_durations.js` — schedule each `when`, fire the matching event, assert
  revert; assert non-matching events don't revert; a multi-turn `your_next_turn` case.

## Out of scope / explicitly deferred

- Replacing the **delayed-trigger** system (`G.delayedTriggers`) — it's a superset
  (it can *fire new effects* at a time, not just revert). Expiries are the revert-only
  subset; they can share the event bus but stay separate concepts.
- Linked/"as long as" durations (e.g. "as long as you control a Forest") — those are
  continuous re-evaluation (static), not point-in-time expiry. Different mechanism
  (the `applyStaticKeywordGrants` re-run-on-emit pattern already covers that class).
