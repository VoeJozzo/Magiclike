# Board concept: Tapestry Over Stone (draft 1)

A design draft for the in-game board. Each player has their own woven playmat, laid on a rough stone table. The mats give every zone a home and stay low-contrast, so the cards carry the color.

**View it:** open `mockup.html` in a browser. It draws the board live at the native 960×540 grid, using the real card frames and art from `reference/html-proto/`. It has three scenes (mid-combat, turn one, bare mats), numbered callouts, and a working Pass plaque that steps the turn tracker. The design notes, space budget, palette, Godot mapping and open questions are on the same page, below the board.

**Rebuild after editing:** `python3 docs/design/board-tapestry/build.py`. This inlines the frames, art and card data into `mockup.template.html` and writes `mockup.html`. Edit the template, never the built file.

## The idea in brief

- **Two mats, mirrored.** Life and the stack are in the left column, decks and Pass in the right, permanents in the middle. Each mat's woven border picks up its deck's colors.
- **The hem.** Lands sit in a woven band at the back of each mat as 80×48 art strips. Spent lands sink and dim. That saves 58 px per side, which goes to your hand and to breathing room.
- **Objects, not chrome.** Life is on a brass medallion with a verdigris rim, floating mana is wound on spools, turn steps are knots on a ribbon, and Pass is a brass plaque. There is a stitched run tally on your mat.
- **The seam carries the shared things.** The strip of table between the mats holds the stack cascade (left), the day ribbon of ten steps (middle) and the Pass plaque (right).
- **Threads.** A target is a thread in the spell's color, routed through the gaps beside the ribbon and tied off on the target's edge. Blockers are cross-stitched to their attackers.
- **Light pool.** The active player's side is lit, with an ordered-dither falloff that warms toward dusk.

Nothing here is decided. It is a draft for discussion, and the open questions are listed on the page.
