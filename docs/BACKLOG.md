# Backlog (Godot side)

Parking lot for deferred work on the Godot port. Not a session agenda. Items live here because they came up in past sessions, got considered, and were deferred for a reason — usually "later," "blocked on X," or "needs the user's call."

For html-proto deferred work, see [`reference/html-proto/BACKLOG.md`](../reference/html-proto/BACKLOG.md).

## How to maintain this file

- **Update on state change.** Adding a new deferred item, moving one to "Recently done," or marking one rejected — all part of normal work. Include the date or phase tag on "Recently done" entries.
- **Prune "Recently done" periodically.** Once an item is a few phases old and visibly shipped, drop it. This isn't a changelog — git log is the changelog.

---

## Open

### Rules-engine correctness
- **"Intervening if" predicate re-check at trigger resolution.** Currently `engine/predicates/predicates.gd` is consulted at trigger queue time only. MTG rules check the condition again on resolution (rule 603.4). Matters when a between-events action invalidates the condition (e.g., a "while you control X" trigger where X leaves play between queue and resolution). Deferred from Phase 4.
- **Non-self triggers exercised in tests.** The `self_only=false` listener path in trigger draining is implemented but no card or test currently exercises it. Add when a card legitimately needs a non-self listener.
- **Remove `Hand.max_hand_size = 100` workaround.** The engine now enforces MTG 514.3 cleanup-step discard, so the visual-layer cap is redundant. Test that removing it doesn't reintroduce the face-down stranding bug, then drop the override from `_make_hand`.

### AI
- **Per-effect triggered-ability scoring in `AIScoring.card_value`.** Currently a flat keyword/triggered-ability bump. The JS prototype walks effects to score them individually (a Pyromaniac-style ETB is worth less than a Sheoldred-style draw-step lifelink). Deferred from Phase 5b.

### UI / UX
- **Board layout / cramping pass.** Manual playtest at 1856×1044 surfaced several independent issues that compound: battlefield horizontal overflow with 8+ creatures, stack-anchor visual colliding with the top-row land cascade, right-side log bleed into card zones. Joe's directional preferences:
  - **Hover-to-zoom** (or long-press / double-click) on any card to show a full-size version. Standard card-game UX. Pairs with making the default tile smaller — small tiles fit more, hover gives detail on demand.
  - **Adaptive spacing** for both creatures AND lands, modeled on how the existing Hand container squeezes cards together as count grows. Right now `_CREATURE_SPACING` and `_LAND_SPACING` in `BattlefieldZone.gd` are fixed constants.
  - **Multi-row creature layout** when count exceeds a row's capacity.
  - **Stack as expandable popup / tray.** Currently the stack panel sits permanently top-center, colliding with the top-row land cascade. Move it into a tray the player can open/close as needed.
  - **NOT land piling.** Looked promising on paper but Joe's playtest shows lands don't even fill their row — the problem isn't volume, it's spacing and the stack anchor collision.
  Worth a dedicated session — touches `BattlefieldZone`, `_make_battlefield`, `_make_hand`, `card.gd` (for hover-zoom), the stack panel scenes. ~300-500 LOC.
- **Config for priority-pass stops.** MTGO-style "stop on cast / stop on draw / stop on attack" settings — let the player control which auto-passes are allowed and when the engine hands them priority explicitly. Engine has the seams (single `execute_action(pass_priority)` entry point); needs a settings layer and game-board wiring.
- **Manual "hold priority" UI for the human player.** Currently the player has a Space/Enter keybind that passes priority; no UI to retain priority for a follow-up instant. Becomes relevant once players have multi-instant lines they want to chain.
- **Card art for the 23 existing cards.** Placeholders today. The html-proto has pixel-art PNGs for some cards under `reference/html-proto/cards/<tplId>/art.png` that could port over for shared names (Lightning Bolt, Counterspell, etc.).
