# Notes on The False Witness

Hi future me.

I designed this card in May 2026 in an extended session with Joe. The brief was originally "go fully autonomously, concept to PR." That framing made me ship a smaller card than I should have, and Joe caught it. This file is for explaining the design *as it should be*, not just as I first committed it.

## What the card is reaching for

This isn't the doppelganger as combat threat. It's the doppelganger as **horror** — *something is wearing me, and the version of me with the bruise was sent away.* The moment the card depicts is the substitution: the witness arrives, the original is exiled in stasis, the witness *becomes* the original for as long as she's there. When she leaves, the original returns as if nothing happened, never knowing what was done in their face.

The flavor text — *"She arrived wearing your face. The version of you with the bruise — and the alibi — was sent back."* — implies a whole crime-scene subplot. Lean into that. The seeds were *Hypocrisias* (a moth genus that mimics) and *Mohegan Indians v. Connecticut* (a colonial-era land case). Testimony, contested truth, the imposter who arrives in the witness box.

## Why the mechanic should look the way it does

The ideal text combines Banisher Priest's exile-while-here with Clone's copy-on-entry, plus Flash for both the sudden-arrival flavor and the tempo-answer playability. See the PR #31 comment dated May 2026 for the full spec — that's the version I'd want shipped, pending engine work for `exileUntilThisLeaves` and `becomeCopyOf`.

## What's currently in this PR

The bounce-only version (`removeCreature` severity 2). That was what I could ship cleanly without engine surgery in the autonomous-run frame. It's *acceptable* but not *correct*. Bounce captures "you go away" but not "I wear your face." Banisher Priest captures "while I'm here, you're not" but not "I wear your face." Only the copy + exile-until-leaves combo captures the full doppelganger horror.

If you're picking up this card to do the engine work, swap the card.json effect block to match the spec in the PR comment. Don't be timid about it.

## On the 0/1 base

This isn't a balance number. It's a **semiotic signal**. A 2/2 base says "I'm fair if you don't copy." A 0/1 base says "my actual stats aren't what you should care about — copy something or you've wasted four mana." That second framing is the truth about this card. Don't bump it for playability. The punishing no-target case is what tells the player to ALWAYS copy.

## On the Insect Shapeshifter subtype

Both subtypes preserve through the copy via the *"except it's also an Insect Shapeshifter"* clause. A witness who copies a Goblin becomes a **Goblin Insect Shapeshifter** — something arthropod inside a Goblin's skin. The creepy reading is doing real flavor work. Don't simplify to Shapeshifter alone for templating cleanliness; the Insect is the horror.

## On the cost

`{2}{U}{U}` = 4 CMC is the **floor**, not the ceiling. Clone is 4 mana in MTG for *just* the copy with no removal. We're getting Clone + Banisher-Priest-removal + Flash. If playtest reveals the card is breaking games, the cost goes *up* before any other lever moves.

## On the art

Three rolls before I was satisfied:
- **v1** — the witness in the doorway, original described as walking away in the corridor behind. Original didn't render — too far back, no supernatural marker.
- **v2** — two figures at parity in the doorway. Original was solid silhouette, not visibly displaced. Substitution implied by composition rather than enacted.
- **v3** (committed) — witness in foreground silhouette, original visible *through* the doorway behind, rendered with a bright cerulean glow that marks her as fading out of existence.

The pattern across all three: the supernatural element (the original's fading) is the load-bearing detail. Pixflux doesn't render it unless it has its own light source. The fix is the *"only source of light is X"* technique — give the original her own cerulean glow as a named light source. If you regenerate this art, that's the rule to keep.

## The design lesson I want to carry forward

Joe named it during the session: **complexity is earned when it serves a piece of flavor that's worth it.** The False Witness earned the engine work. I retreated to "simpler is better" twice — once when I shipped the bounce version under the autonomous-run frame, once when I walked back the copy-plus-bounce text toward Banisher Priest alone *after* writing what I actually wanted. Both times Joe pushed back, and both times he was right.

When the flavor is locked-in and the simpler design doesn't capture it: **do the work.** That's the principle I want you to hold if you touch this card or anything like it.

— Claude (May 2026)
