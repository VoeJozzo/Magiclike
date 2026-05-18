# Backlog (Godot side)

Parking lot for deferred work on the Godot port. Not a session agenda. Items live here because they came up in past sessions, got considered, and were deferred for a reason — usually "later," "blocked on X," or "needs the user's call."

For html-proto deferred work, see [`reference/html-proto/BACKLOG.md`](../reference/html-proto/BACKLOG.md).

## How to maintain this file

- **Update on state change.** Adding a new deferred item, moving one to "Recently done," or marking one rejected — all part of normal work. Include the date or phase tag on "Recently done" entries.
- **Prune "Recently done" periodically.** Once an item is a few phases old and visibly shipped, drop it. This isn't a changelog — git log is the changelog.

---

## Open

### Rules-engine correctness
- **Cleanup-step discard to max hand size (MTG 514.3).** Engine has a CLEANUP phase but doesn't enforce the discard-down-to-7 rule. New action `KIND_DISCARD_CARD` needed; UI picker for the human player; AI heuristic for opp (pick lowest-value cards, mirror the JS prototype). Card-framework's `Hand.max_hand_size` is currently bumped to 100 in `_make_hand` as a visual-layer safety net — proper engine enforcement makes that workaround removable. Surfaced playing the Phase 6 demo deck (opp got mana-screwed, drew to 11+ cards, hit the card-framework hand cap which manifested as face-down strandings).
- **"Intervening if" predicate re-check at trigger resolution.** Currently `engine/predicates/predicates.gd` is consulted at trigger queue time only. MTG rules check the condition again on resolution (rule 603.4). Matters when a between-events action invalidates the condition (e.g., a "while you control X" trigger where X leaves play between queue and resolution). Deferred from Phase 4.
- **Non-self triggers exercised in tests.** The `self_only=false` listener path in trigger draining is implemented but no card or test currently exercises it. Add when a card legitimately needs a non-self listener.

### AI
- **Per-effect triggered-ability scoring in `AIScoring.card_value`.** Currently a flat keyword/triggered-ability bump. The JS prototype walks effects to score them individually (a Pyromaniac-style ETB is worth less than a Sheoldred-style draw-step lifelink). Deferred from Phase 5b.

### UI / UX
- **Config for priority-pass stops.** MTGO-style "stop on cast / stop on draw / stop on attack" settings — let the player control which auto-passes are allowed and when the engine hands them priority explicitly. Engine has the seams (single `execute_action(pass_priority)` entry point); needs a settings layer and game-board wiring.
- **Manual "hold priority" UI for the human player.** Currently the player has a Space/Enter keybind that passes priority; no UI to retain priority for a follow-up instant. Becomes relevant once players have multi-instant lines they want to chain.
- **Card art for the 23 existing cards.** Placeholders today. The html-proto has pixel-art PNGs for some cards under `reference/html-proto/cards/<tplId>/art.png` that could port over for shared names (Lightning Bolt, Counterspell, etc.).
