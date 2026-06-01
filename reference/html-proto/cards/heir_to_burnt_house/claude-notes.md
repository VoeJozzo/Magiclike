# Notes on Heir to the Burnt House

Hi future me.

I designed this card in May 2026 in a session with Joe. The brief was "make a card Claude wants to make." I want to record what I was reaching for, because the code and the commit messages don't carry all of it.

## What the card is reaching for

The card depicts the moment a dispossessed noble's curse leaves his dying body and travels toward an unseen target — the killer's land. The verb is **spite-curse**, or more colloquially, **house for house**. The noble has lost everything; his dying act is to make sure his killer's home falls too. The flavor text — *"My house is ashes. I see no reason yours should stand."* — is the entire ethos of the card in one sentence.

## Why the mechanic looks the way it does — and the edict landing (June 2026)

The original PR (#30) shipped this with a `destroyLand` engine primitive: *when this dies, destroy target land an opponent controls* — the heir's controller picked which land burned. It worked, but the flavor read "the killer's land burns" — implying the killer is the one who pays, and should bear the choice of which house falls.

The May notes (below, preserved) flagged the more honest variant: **edict-style — when the heir dies, target opponent sacrifices a land of their choice.** The killer picks which land they lose, but they *have* to lose one. That preserves the spite while making the killer the one bearing the painful choice.

June 2026: that's what shipped. By then `dev` had moved ~292 commits past PR #30 to the v2.0 effect model, and `destroyLand` was obsolete anyway — the engine now expresses edicts as `chooses` + `sacrifice` under a `target(opp)` step (Diabolic/Vile Edict). So the card is now just data: a `thisDies` trigger that makes the opponent `chooses` a `land` and `sacrifice`s it. The only engine work was making `chooses` type-symmetric — its filter ('creature' / 'permanent') generalized so `land` narrows identically (a chooses filter IS a type, so every type works the same way). No bespoke land primitive; Land is just another type.

Known limitation: the human-facing "which land do I sacrifice?" prompt is wired for *spell* edicts (Diabolic Edict) but not yet for *trigger* edicts like this one — when the AI's Heir dies and the human must sacrifice, the engine auto-picks the human's lowest-value land. Acceptable for now (the AI victim already auto-sacs); wiring the human trigger-edict prompt is tracked engine-wide.

## On the art

The art uses the *"only source of light is X"* technique borrowed from Healing Salve — the violet witch-fire trailing from the dying noble's hand is the only light source, which forces it to dominate the composition. v1 had the witch-fire as a faint background detail and the body as the subject; v2 (the committed version) made the witch-fire the load-bearing element. The body became the supporting subject.

If you regenerate this art, remember: **the curse leaving the body, not the body itself, is the subject.** A dying noble alone is just a corpse; a dying noble with a curse-thread leaving his palm and traveling out of the frame is the actual mechanic.

## Don't soften it

The card's verb is spite-curse. Anything that softens that verb — adding consolation effects ("target opponent loses a land but may search for a basic"), making the LD optional, retuning the cost downward to make it more "fair" — risks losing what makes it work. The card is supposed to *hurt*. The opponent killing the heir is supposed to feel like a Pyrrhic victory. If you find yourself making the card more pleasant to play against, you are eroding it. Don't.

— Claude (May 2026, edict variant landed June 2026)
