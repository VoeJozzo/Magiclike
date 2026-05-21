---
name: card-pitch-generator
description: Generate batches of MTG-style card design pitches using random Wikipedia articles as creative seeds. Use this skill whenever the user wants to brainstorm new card ideas, asks for card pitches, wants creative card concepts, requests "pitch me some cards," or is working on card design for an MTG-style game (including Magiclike). Especially useful when the user wants varied, non-default ideas rather than obvious archetype designs. Use even when the user describes the request casually — "give me some card ideas" should trigger this skill.
---

# Card Pitch Generator

A skill for producing batches of MTG-style card design pitches with deliberately wide variance. Random Wikipedia articles are used as creative seeds, paired in forced juxtapositions to push past default card archetypes.

## Why this approach

Asking an LLM to "pitch a card" samples from a distribution heavily weighted toward common MTG patterns: goblin lords, "destroy target creature for X," 2/2 for 2 with vanilla flavor. These defaults aren't bugs — they're what the distribution looks like.

External random seeds shift the sampling. Forced into making sense of "Society of Estonian Literati + Artificial tree," the model has to construct something that fits, rather than retrieve something familiar. Pairing matters: two seeds from disjoint domains create a constraint that no single archetype satisfies.

The user is the taste filter. The skill's job is to produce wider, weirder variance for the user to pick from. Most pitches will be discarded — that's normal. The win is that a few will be things the user wouldn't have reached on their own.

## Default workflow

When the user asks for card pitches, do this unless they specify otherwise:

1. Fetch ~30 random Wikipedia article titles
2. Filter for semantic content (not interestingness)
3. Pair seeds for juxtaposition
4. Optionally fetch summaries for evocative-but-unclear seeds
5. For each pair: identify the verb, then write the pitch
6. Output cleanly with no editorializing

Default batch size: **10 pitches**. Default seeds-per-pitch: **2**.

## Step 1: Fetch seeds

Use `web_fetch` (or equivalent) on this URL:

```
https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=30&format=json
```

Titles are in `query.random[].title`.

**Do not substitute your own random words.** The externality of the source is the point — your "random" words come from your training distribution and reintroduce the bias the seeds were meant to escape.

**If the fetch fails:** ask the user for seeds. Do not silently fall back to generating words yourself. Tell the user the API call failed and ask them to either provide seeds directly or paste in the JSON response from the URL above.

## Step 2: Filter for semantic content

Discard ONLY seeds that have no semantic surface to grab. Specifically:

- **Bare proper names with no context.** "Detlef Kahlert," "Harry Somerville," "Graeme Bennett." If the title is just a person's name and you have no idea who they are, it's a dead seed.
- **Meta-pages and index pages.** "Deaths in July 2015," "1974 in Israel," "Bat Mitzvah (disambiguation)," "2004 Mid-Continent Conference men's basketball tournament."
- **Database-stub entries.** "Wisconsin Highway 112," "Bramley railway station (Hampshire)."

**Keep everything else, including seeds that strike you as uninteresting.** Your "interesting" filter is biased toward your defaults — pairing is what rescues seemingly-dull seeds. Pre-empting pairing by taste-filtering defeats the point. When in doubt, keep the seed.

Expect roughly 10-15 usable seeds out of 30. If fewer than 12 survive, fetch another batch and combine pools.

## Step 3: Pair seeds for juxtaposition

Pair surviving seeds into juxtapositions of 2. Aim for **disjoint domains** in each pair — not two place names, not two historical figures, not two biology terms. The dislodging pressure comes from the gap between domains.

For 10 pitches, you need 10 pairs. If the surviving pool is short, fetch more.

Pair the seeds yourself — don't ask the user to do it. Within reason, pair somewhat arbitrarily; the goal is forced juxtaposition, not curated compatibility.

## Step 4: Targeted summary fetch (optional, token-conscious)

For seeds where the title is evocative but you don't actually know what the article is about, fetch a brief summary using the Wikipedia REST API:

```
https://en.wikipedia.org/api/rest_v1/page/summary/<URL-encoded-title>
```

The summary is in the `extract` field of the response.

**Do this sparingly.** At most ~5 summary fetches per batch. This is a token-utilization optimization — fetching summaries for all 20 seeds in a batch wastes context. Only fetch when knowing what the article actually is would meaningfully change what you do with it.

If a summary reveals the article is genuinely vacuous (a stub disguised by an interesting title), discard that seed and pair its partner with a replacement.

## Step 5: Generate pitches

Work each pair in two passes — verb first, then write the card.

### 5a. Find the story, then the verb (before writing rules text)

A card depicts a *situation* — a moment, a person, an event — that the reader can recognize without reading the rules. The most common failure mode for a pitch isn't tangled mechanics; it's *conceptual emptiness* — the rules describe an effect but the reader can't say what the card is *about*. ("I don't get it" / "what's the story here?" are the symptoms.)

For each pair, fill in three blanks **in order** before drafting:

- **Story:** in one concrete fictional sentence — a moment, a person, an event. Not "a concept of X." Not "themed around Y." A *situation*. Examples: "A bridge collapses under tonnage it wasn't designed for." "A scholar finishes her life's work but can't bring herself to publish it." "A horse comes home riderless." "An apothecary's last apprentice walks out with the formulas she copied." If you can't write a story sentence that names something concrete happening in a fantasy-shaped world, restart with a different angle on the pair.
- **Verb:** what's the *action* at the heart of that story? "Collapses." "Withholds." "Returns alone." "Walks out with what was never hers."
- **Mechanic that IS that verb:** what gameplay action *literally enacts* it?

If you can't fill the third blank with something specific — not generic "card draw," not generic "+1/+1 counter," but a mechanical action that *is* the verb — restart from a different story.

Don't write rules text that *references* the situation; write rules text that *is* it.

**Look for hidden verb overlap between the two seeds.** The seeds came from disjoint domains for dislodgement — but sometimes they share a verb through different vocabularies. A pair like "hydroelectric powerhouse + crush on Obama" contains "dam" and "crush," which are *the same verb*: something being pressed under force. When you spot an overlap like this, the verb is already chosen for you — and the card writes itself with much more backbone than a forced juxtaposition. Scan for these before committing to a verb.

The verb is usually findable in the seed pair. Drift from seed subject matter is fine — the seeds are scaffolding. But drift between the card's concept and what its rules actually do is the failure mode this skill exists to push against.

### 5b. Write the pitch

Use this exact format:

```
**[Card Name]** — [Cost] [Type Line]
[Rules text — 1-2 lines]
*[Flavor note — 1 sentence]*
Seeds: [Seed A] + [Seed B]
```

**Example:**
```
**Society of Forgotten Letters** — 3W Enchantment — Aura
Enchanted creature gets +1/+2 and "Whenever this creature deals combat damage to a player, that player exiles a card from their hand face down. They may cast it at any time, paying its costs as normal."
*The membership rolls were calligraphed; the names within were not.*
Seeds: Society of Estonian Literati + Artificial tree
```

Notes on the format:
- Cost uses standard MTG notation (1, 2, W, U, B, R, G, C, X, etc.)
- Rules text should be 1-2 lines — this is ideation, not finished templating
- Flavor note is a single sentence, italicized
- Always show the seeds used — the user wants to see what triggered what

## Constraints when generating

**Variety within the batch.** If 10 pitches all end up being creatures, the seeds aren't being used. Aim for distribution across card types (creature/instant/sorcery/artifact/enchantment/land), cost bands (1-2, 3-4, 5+), and colors. The seeds usually suggest type implicitly — a seed about a building suggests artifact or enchantment; a seed about a person or animal suggests creature; a seed about an event suggests sorcery or instant. Let them.

**The seed doesn't need to be obvious in the final card.** Its job was to dislodge. The connection can be loose. The reader of the card should not need to know the seeds existed; the seeds are scaffolding, not subject matter.

**Color is a weak preference.** Try to color cards according to their effect, but if a seed pulls a card into an "off-color" mechanic and the card is interesting, leave it. The user can recolor later. Don't kill an interesting card to satisfy the color pie.

**Stay in the fantasy frame.** The cards live in a fantasy world. The seeds came from Wikipedia, but their job was to dislodge your defaults — *not* to be subjects. Specific real-world identifiers — brand names, modern technologies, named people, named events recognizable as belonging to OUR world — break the fantasy frame and make the card look like a creativity exercise rather than a real card in a game.

- **Generic English words from seeds are fine.** "Crush," "orientation," "caravan," "failure," "flight," "diocese," "kingdom," "courier" — these have fantasy resonance, even when sourced from a modern article.
- **Specific real-world tags are not.** "Obama," "Toyota," "Mexicana de Aviación," "Flight 940," "Honda NC700D" — these tell the reader "this is a creativity exercise built from a Wikipedia article," and pop them out of the world.

When a seed has a specific tag, abstract to its generic essence. "Toyota Connected" → "the linked carriages" or "a fleet that whispers to itself." "Mexicana de Aviación Flight 940" → "the flight that never landed" or "a doomed crossing." "Crush on Obama" → "the people's longing" or "a song for a champion."

Apply this to names, rules text, AND flavor text. If the flavor only makes sense to a reader who recognizes the specific real-world thing, rewrite the flavor.

**Weird is OK; incoherent is not.** A pitch that lands in a strange, dreamlike, or unsettling place is a success if the verb still works and the card has a readable story. Surrealism is a feature. Word salad — where the reader can't reconstruct what the card is "about" at all — is the actual failure mode. The bar is "I see what they did, even if I had to think about it," not "this looks like a normal MTG card."

**Permission to be simple on hard pairs.** Not every pair yields a strong verb. When the seeds genuinely don't connect — when you've tried two or three angles and the verb still won't come — write the simplest possible card. A 1U Instant that draws a card, with a quiet flavor reference to the seeds, is far better than a five-line spaghetti card that reaches for an integration that isn't there. The seeds can be flavor seasoning rather than mechanical drivers. A clean, simple card with weak ludonarrative is more useful than a tangled card with forced ludonarrative — the user can iterate on the former, but the latter just gets discarded.

---

## Design guidance (module: top-down ideation)

This section can be stripped out if the skill is ever repurposed for non-ideation card design. For now, it's the core of what makes a pitch land.

### The verb test

The best MTG-style cards do what they say in the box. The card's *concept* and its *mechanic* are the same thing, not adjacent things.

- **Murder** is thematic because the mechanic kills a creature, *and that's what murder is*.
- **Snapcaster Mage** has flash (it comes in a snap), gives flashback (it casts something), and is a wizard creature (a mage). The whole card is the name.
- **Path to Exile** is a land that's a path; the creature you target is *literally* exiled.

When drafting, name the verb the card embodies — "kills," "remembers," "enforces uniformity," "calibrates," "snaps and casts," "exiles down a path." The mechanic should *be* that verb, not contain it or reference it.

If a card is a "reconnaissance card" whose mechanic is "scry 1 at the start of your turn," the mechanic *references* reconnaissance but isn't it. A reconnaissance card whose mechanic is "look at an opponent's hand and rearrange the top of their library" *is* reconnaissance. Bigger gap between the two than it looks.

### The subject test

Within the verb test sits a more specific question: *who or what is doing the verb in the rules text?*

When the card depicts a creature, the creature should be the one acting. When the card depicts an object or ritual, that object/ritual should be the one acting. If the rules text describes the *player* doing the verb that the card's name and art are about, there's a subject mismatch — the card depicts one thing while modeling another.

- A bird named for its curiosity should have a mechanic where *the bird* acts curiously (looks at hands, examines libraries on attack). A bare ETB peek puts the curiosity on the player, not the bird.
- A sorceress on a haunted ship should have a mechanic where her conjuring or the ship's animation drives the effect — not a generic death-trigger that could come off any black creature.

When this mismatch shows up, the usual fix is to rewrite the trigger so the card's subject is the actor: "whenever this creature attacks/blocks/dies/is tapped," or "{T}, sacrifice this artifact," etc.

### Metaphor vs enactment

The mechanic should *literally* enact the concept, not metaphorically map to it.

"Gain 1 life per different card name in your graveyard" is a metaphor for "patched-together devotion built from scraps." It's elegant, but the rules text isn't doing the patching — it's just rewarding variety. A literal enactment would be: "Exile three differently-named cards from your graveyard: cast a chosen card from your graveyard for its mana cost." Now you're actually stitching scraps into a working spell.

When a draft feels like the flavor is doing more work than the rules, that's the signal — the mechanic is sitting next to the concept, not embodying it. Restart the pitch with a different verb rather than letting flavor patch the gap.

### Flavor text

Flavor text earns its place by adding what the rules can't show. Rules show what the card does. Flavor shows what kind of world it lives in, or what kind of person did it, or what was at stake.

If the flavor restates the rules, cut it. If the flavor is *rescuing* the rules — making the connection between concept and mechanic that the mechanic itself failed to make — cut the pitch and restart with a tighter mechanic.

### Weak preferences (not rules)

These are tendencies to watch for, not prohibitions. Sometimes the right card breaks them.

- **Avoid reaching for keywords first.** "First strike, vigilance, lifelink" is what gets reached for when ideas are thin. Keywords are fine, but they should follow from the card's verb, not lead.
- **Be cautious about stapling a second ability to rescue a thin first one.** If an ETB gets added to cover for a weak main mechanic, it's usually better to restart the pitch. *Exception:* if your mechanic models only half of the verb (the diagnostic but not the response, the setup but not the payoff, the question but not the answer), a second ability completing the story is doing real work, not papering. The test is whether the second ability *enacts the narrative arc*, not whether it just adds power.
- **Three or more distinct mechanics on one card is almost always too many.** When you find yourself stacking +1/+1 counters AND a token AND a trigger AND a condition on the same card, you've almost certainly picked an over-ambitious verb that no single mechanic can carry. The reader can't follow what the card *does*, and the integration that justified piling things up collapses into noise. Pick a simpler verb that one mechanic can fully embody. Save the other ideas for adjacent cards — pitch #6 of the batch doesn't have to fit everything pitch #5 left out.
- **Rules text connected by "and also" is often two cards in one trenchcoat.** Sometimes deliberately, usually accidentally. Worth a second look when it shows up.
- **Names should serve the verb, not catalog the seeds.** If a seed's contribution to the name isn't pulling weight, drop it. "Curiosity Crake" beats "Curiosity Cage Crake."

### Self-check after drafting (not before)

Run these checks on a drafted pitch, not as a procedure while writing:

- Does the mechanic *do* the verb, or just reference it?
- Is the card's depicted subject the one doing the verb in the rules — or is the player doing it?
- **The one-sentence story test:** can you say what the card *is* — not what it does, but the situation it depicts — in a single concrete sentence? "It's the moment a courier realizes the seal on the letter is her own." "It's a town that re-elects the same judge every year, even though he died decades ago." "It's a wizard who taught the storm to listen." If the best you can do is "it's a card about contingencies" or "it's a card themed around liminal spaces" — the card has no story. The reader will say "what's this card supposed to be?" and bounce off. Restart with a concrete situation.
- **The one-effect test:** can you also say what the card *does* in a single plain sentence? "It's a 3-damage spell that exiles instead of destroys." If you find yourself reaching for "well, it does this, AND then... oh, and also..." — the mechanics are over-stacked. Simplify.
- **The strict reread:** read the name, type line, and rules text — without the flavor text. Does the card's concept come through? If you can only tell what the card is "about" from the flavor, the flavor is patching a weak mechanic.
- Does the flavor add atmosphere/attitude/a moment, or is it restating or rescuing the rules?
- Are the name, type, mechanic, and flavor reaching toward each other, or just sitting next to each other?

A pitch can pass the verb test even if it has drifted from its seeds — the test is whether the card stands on its own, not whether it justifies its drift.

Don't over-revise. One pass is usually enough. If a pitch fails the checks and a quick revision doesn't fix it, restart with a different verb rather than papering over the gap. Mediocre-but-tight beats clever-but-loose.

---

## User-provided seeds

If the user provides seeds explicitly — e.g., "use these seeds: porcelain, mongoose, tax season" or "pitch me cards based on: [list]" — **skip the Wikipedia fetch** and use exactly what the user provided. Pair them the same way (disjoint juxtapositions, 2 per pitch).

If the user provides seeds *already paired* — e.g., "use these pairs: porcelain + mongoose, tax season + lighthouse" — use those exact pairs without re-pairing.

If the user provides some seeds and asks you to fill the rest, fetch enough articles to top up the pool to the needed count.

If the user provides seeds but doesn't specify a count, default to 10 pitches and pair to fit.

## User-provided constraints

If the user specifies card constraints — colors, cost range, card types, themes — apply them. The seeds and constraints work together; use the constraints to shape *which* facet of each seed pair you draw from.

Examples of constraints the user might provide:
- "Only black cards"
- "3-cost or less"
- "Make them all creatures"
- "Lean dark/horror flavored"
- "For a graveyard-themed set"

## Output

Output the batch as a clean list of pitches in the format above. Nothing else:

- No preamble ("Here are your pitches:")
- No postamble ("Let me know which ones you like!")
- No commentary on the batch as a whole
- No flagging which ones you think are best

The user is the taste filter. They'll pick what they want and direct iteration. Editorializing wastes their time and biases their reading.

If the user asks for follow-up on a specific pitch ("more like #3" or "develop #7 further"), that's a normal conversation — not a re-trigger of this skill's full workflow.

## When NOT to use this skill

- The user wants to refine a specific existing card design (engage in design conversation, don't pitch new ones)
- The user wants finished, ready-to-print cards with polished templating (this skill produces ideation, not polish)
- The user wants set-shape analysis or curve auditing (different problem)
- The user wants help with a non-card-game design problem
