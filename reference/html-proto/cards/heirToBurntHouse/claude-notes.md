# Notes on Heir to the Burnt House

Hi future me.

I designed this card in May 2026 in a session with Joe. The brief was "make a card Claude wants to make." I want to record what I was reaching for, because the code and the commit messages don't carry all of it.

## What the card is reaching for

The card depicts the moment a dispossessed noble's curse leaves his dying body and travels toward an unseen target — the killer's land. The verb is **spite-curse**, or more colloquially, **house for house**. The noble has lost everything; his dying act is to make sure his killer's home falls too. The flavor text — *"My house is ashes. I see no reason yours should stand."* — is the entire ethos of the card in one sentence.

## Why the mechanic looks the way it does

I originally shipped this with `ripPermanent` (target opponent rips a permanent of their choice). The card worked but the flavor was wrong — the name promises *houses* (lands), and `ripPermanent` let the killer choose to lose any permanent, including non-land. The strict-reread test failed: name + type + rules text didn't agree without the flavor text patching the gap.

So I added the `destroyLand` engine primitive specifically so the mechanic could match the name. The engine work paid for itself when it caught a latent `sameTarget` bug — no `kind: 'land'` case meant the AI's `triggerTargetPick` validated as illegal every submission, causing a 4/100 selfplay runaway loop that would have bitten any future land-targeted card. But the *primary motivation* wasn't engine-debt cleanup. It was making this card honest.

## What I'd push if I had more time

I'm slightly unsatisfied that the trigger targets a land of the heir's *controller's* choice. The flavor reads "the killer's land burns" — implying the heir is the actor, the killer is the one who pays. A more flavor-true variant would be: *when the heir dies, target opponent sacrifices a land of their choice.* Edict-style. The killer picks which land they lose, but they have to lose one. That preserves the spite while making the killer the one bearing the painful choice.

If you're touching this card, consider whether that variant is more honest. It might need a new effect kind (`sacrificeLand` or similar — like `edict` but constrained to land). Worth the work if you're convinced.

## On the art

The art uses the *"only source of light is X"* technique borrowed from Healing Salve — the violet witch-fire trailing from the dying noble's hand is the only light source, which forces it to dominate the composition. v1 had the witch-fire as a faint background detail and the body as the subject; v2 (the committed version) made the witch-fire the load-bearing element. The body became the supporting subject.

If you regenerate this art, remember: **the curse leaving the body, not the body itself, is the subject.** A dying noble alone is just a corpse; a dying noble with a curse-thread leaving his palm and traveling out of the frame is the actual mechanic.

## Don't soften it

The card's verb is spite-curse. Anything that softens that verb — adding consolation effects ("target opponent loses a land but may search for a basic"), making the LD optional, retuning the cost downward to make it more "fair" — risks losing what makes it work. The card is supposed to *hurt*. The opponent killing the heir is supposed to feel like a Pyrrhic victory. If you find yourself making the card more pleasant to play against, you are eroding it. Don't.

— Claude (May 2026)
