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
- **Board layout / cramping pass.** Manual playtest at 1856×1044 surfaced several independent issues that compound: battlefield horizontal overflow with 8+ creatures, stack-anchor visual colliding with the top-row land cascade, right-side log bleed into card zones, and "land tap legality" green-glow saturation across all your untapped lands at once. Independent levers:
  - Tighter creature cascade (`_CREATURE_SPACING` in `scenes/zones/battlefield_zone.gd` from 165 → 120)
  - Land piling (collapse untapped lands of same color into a single click-target with a count badge; expand on hover or right-click)
  - Multi-row creature wrap when count > N
  - Stack anchor relocation off-center (currently sits in the same y-band as opp's land cascade)
  - Log panel resize/clip and/or move out of the card area
  - Card-size shrink (150×210 → smaller) if oracle text can still survive
  Worth a dedicated session — touches `_make_battlefield`, `_make_hand`, `BattlefieldZone`, and layout constants. ~200-400 LOC.
- **Config for priority-pass stops.** MTGO-style "stop on cast / stop on draw / stop on attack" settings — let the player control which auto-passes are allowed and when the engine hands them priority explicitly. Engine has the seams (single `execute_action(pass_priority)` entry point); needs a settings layer and game-board wiring.
- **Manual "hold priority" UI for the human player.** Currently the player has a Space/Enter keybind that passes priority; no UI to retain priority for a follow-up instant. Becomes relevant once players have multi-instant lines they want to chain.
- **Card art for the 23 existing cards.** Placeholders today. The html-proto has pixel-art PNGs for some cards under `reference/html-proto/cards/<tplId>/art.png` that could port over for shared names (Lightning Bolt, Counterspell, etc.).
