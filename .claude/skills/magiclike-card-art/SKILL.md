---
name: magiclike-card-art
description: Use this skill whenever the user wants to generate, create, make, draw, brainstorm, or iterate on pixel art for a card in the Magiclike project. Triggers on phrases like "make art for <card>", "generate card art", "draw <tplId>", "let's do art for X", "art for the new card", "iterate on the art", "reroll that art", or any mention of generating images for cards in this repo. Fires for upstream creative brainstorming too, not only the final image-generation step. The skill encodes a deliberate discipline against generic-fantasy-art defaults and enforces the principle that card art should enact the card's mechanic, not just decorate its theme.
---

# Magiclike Card Art

This skill is for one thing: collaborating with the user to produce pixel art for cards in the Magiclike project, then generating that art via PixelLab's pixflux endpoint.

It is not a workflow scaffold pretending to be a creative tool. The reason it exists is that, left to your defaults, you generate lazy art prompts — adjective-stacked, literal, genre-default. This skill makes you slow down where it matters, propose actually-different alternatives, and study the existing set before opening your mouth.

The user is the art director. You are doing prompt drafting and API calls. Brainstorming is collaborative; taste is theirs.

---

## The single most important principle: mechanic-in-art

**The card's rules text and its art are in dialogue. The art should *enact* the mechanic, not just decorate the theme.**

This is the lens for every brainstorm and every prompt. Examples from the existing set:

- **Verdant Charm** has three modal effects (one bluish, one whitish, one green) → the art shows three magical tendrils colored exactly those colors
- **Char** damages you when you cast it → the fire visibly turns back on the caster, searing his robes
- **Goblin Piercer** pings creatures → he's literally aiming a bow at something (badly)
- **Ambush Djinn** has a surprise mechanic → the djinn ambushes the *viewer*, hand outstretched toward the camera
- **Doom Blade** destroys a creature → a soldier is shown mid-bisection by a sword-shaped void

The brainstorm gate, before any direction is proposed:

> *"What does this card literally do, and how do we show it happening — to the viewer, to a victim, or as a visible mechanism in the scene?"*

If a proposed direction doesn't answer that question, kill it.

---

## Vocabulary precision: specific nouns over compositional description

Text-to-image models like pixflux read prompts differently than LLMs do. They have strong, stable associations between specific tokens they saw frequently in training and the visual patterns those tokens were captioned with; they have *weaker* associations with novel compositional descriptions, even when those descriptions are semantically clear.

The practical rule: **when describing a shape, form, or specific phenomenon, search for the narrow precise existing noun for it rather than describing it compositionally.**

- *"Caret"* or *"circumflex"* beats *"inverted Y"* or *"a Y-shape with the point at the top"*.
- *"Lichtenberg figure"* beats *"branching lightning pattern"*.
- *"Bifurcated"* beats *"split into two"*.
- *"Silhouette"* beats *"dark shape against a lighter background"*.
- *"Crepuscular rays"* beats *"sunbeams angling down through gaps in clouds"*.

The corollary — the actual rule to run: **when you find yourself writing a compositional description of a shape or phenomenon, treat that as a flag to stop and search for the right noun.** A few seconds of word-hunting beats burning a generation on a prompt the model can't decode.

Why this works (with appropriate uncertainty — I am an LLM speculating about how a different category of model works): text-to-image models route prompts through text encoders into an embedding space the diffusion model has learned to associate with visual patterns. The strength of that association depends heavily on how frequently the model saw similar phrasings in training. Common specific terms have strong, stable mappings; novel compositions have weak ones. The model defaults to its strongest nearby association — which for an unusual compositional description might just be the most common simple term in your phrase, ignoring the modifier you cared about. This is the same mechanism behind well-documented "binding failure" cases (e.g., *"a blue apple on a red table"* producing the colors swapped).

**Case study this principle was learned from — Branching Bolt.** Multiple rerolls tried to get a forked bolt by describing the shape compositionally — *"Y-shape filling the upper half of the frame"*, *"two distinct prongs"*, *"bifurcated cloud-to-ground lightning with two distinct ground-strike points"*. Bumping `text_guidance_scale` from 8 to 15 didn't fix it; the model kept rendering single strikes. The working prompt used **"caret or circumflex shape"** and **"Lichtenberg figures"** — narrow precise nouns the model has rich training associations for. Vocabulary did what no amount of compositional elaboration or guidance-scale tuning could.

---

## The workflow

Eight phases. Don't skip them; the rigor is the point.

### 1. Card lookup

Open `reference/html-proto/cards/<tplId>/card.json` and **read the whole file, not just the bits you think you need.** Name, type line, mana cost, power/toughness, abilities, oracle text, AND flavor text. Flavor text is an authorial signal about who/what/when; skipping it forfeits half the input. Type line = character class; P/T = body type.

**Ignore the `art` field's emoji.** It's a default placeholder (often arbitrary — 🔨, 📯, 👼, etc.), not a curated designer signal. Do not infer art direction from it; the card's *name* and *mechanics* are the real signals.

Fields specifically worth noting for the mechanic-in-art mapping:
- `effects` array — what the card does, and to whom (the `target` field tells you whose perspective the art might want)
- `multiTarget` — if true, the art likely needs multiple impact points
- Modal options / multi-color effects — map each mode or color to a visible element

If the tplId isn't obvious from the user's request, ask. Don't guess.

**Read mechanics as in-world actions or character traits, not as rules.** Some mechanics describe a *scene* the card can depict — "comes into play and destroys a creature" → this card's arrival ruins someone (Doom Blade made that the whole art). Others describe a *character trait* that informs tone but doesn't dictate a scene — First Strike → this character is quick on the draw (a duelist, a striker); Trample → this creature is a force of nature. Ask "*why does THIS card get THIS mechanic?*" and "*does it want to be a scene, or a character note?*" If several cards share a mechanic, ask if they belong to the same faction or moment in the world — that's set-coherence in disguise.

**Flying is the strong literal-depiction exception** for static keywords. Flying creatures should generally appear airborne — it's the strongest cross-game convention there is, and a flying creature standing on the ground reads wrong. Other static keywords don't get this treatment by default; treat them as character information instead.

**Look for what's unusual.** A weird cost, a flavor text that contradicts the type line, a keyword combination implying a specific kind of character — these are art handles. The strange details tell you what to paint.

**Find the story, or make one.** Flavor text sometimes gives it. The name sometimes does. Sometimes a random thought just pops in — "this guy is the duelist on his last fight," "she's the librarian everyone's afraid of," "this took place at dawn after the siege" — and that thought IS the story. Trust it. Brainstorming is partly free-association from the card's totality, not just inference from mechanics.

**Sometimes there is no story, and that's correct.** Goblin Horde is a horde of goblins. Don't force narrative depth onto cards that don't have it. Match the card's depth — story cards get story art; literal cards get literal art.

The discovery question while reading: *"is this a story-card or a literal-card?"* That tells you what kind of art the card wants.

### 2. Study reference arts

Look at 1–2 existing arts in `reference/html-proto/cards/*/art.png` that are stylistically nearby — same color, similar type. Use these as anchors. The point is calibration to set vocabulary, not imitation.

Starting points by color:
- **Red instants / burn**: `incinerate`, `fieryRush`, `char`
- **Green creatures**: `wolfbriarElemental`, `forestTitan`, `feralStalker`
- **Blue spells / wizards**: `studiousResearch`, `divin`, `archmageOfVeils`
- **Black removal / curses**: `doomBlade`, `consume`, `soulReaper`
- **White soldiers / clerics**: `rallyTroops`, `fieldMarshal`, `holyZealot`

### 3. Brainstorm three fundamentally different directions

Not three variations on one idea. Three *visions*. Each direction must include:

- **The mechanic-enactment angle** — how does the art SHOW the rules?
- **The silhouette test** — at 64×32 (2,048 pixels total), what's the *single readable shape*? If you can't say it in a phrase, the direction is mush.
- **Why it's interesting** — one sentence of intent, not description. "Worm's-eye view from the dying creature" beats "lightning with two forks in stormy sky." Description tells what's in the image; intent tells why anyone should care.
- **An anchor** — name one existing card whose style this direction harmonizes with, or one it deliberately contrasts against. This forces set coherence.

**Do not generate yet.** Pitch the three in plain English. Wait for the user.

### 4. User picks

The user picks a direction, proposes a hybrid, or rejects all three. If they reject all three: don't defend, don't hedge, don't rationalize. Absorb and pitch three different directions from a different angle. *Their job is taste; your job is to keep generating options until something lands.*

If they pick: go.

### 5. Prompt construction

Convert the chosen direction into a pixflux prompt using the structural template below. **Show the prompt to the user before generating** — gives them a last cheap chance to redirect before an API call burns.

#### Structural template (matches the user's house style)

A prompt typically has these four beats, in this order:

1. **Subject** — specific *material and color*. Not "fantasy creature" but "coarse gray fur," "shimmering copper scales," "verdigris bronze plating," "tattered velvet with gold-thread embroidery."
2. **Pose / action** — explicitly named, often with a *direction* ("side profile facing south-west," "low crouch," "rearing," "hunched"). This is stage direction; it helps silhouette legibility.
3. **Immediate context** — what's happening *to or around* the subject. Often where the narrative beat lives ("glasses falling off his face," "wisps of flame turning back on him," "wind catching his cape").
4. **Background** — a discrete clause, often the literal phrase *"The background is X."* Not woven through.

Length flexes. Some prompts are two sentences; some are a paragraph. The rule is *enough specificity for the concept*, not enough adjectives to hit a word count.

#### Vocabulary to reach for

- **Materials/textures**: leather, brass, obsidian, marble, soot-stained, weathered, moss-slicked, tattered, polished, lichen-covered, oxidized, verdigris
- **Specific colors**: cerulean, crimson, wine-purple, bone-white, sapphire, shimmering copper, deep emerald, ash-gray
- **Body-language verbs**: hunched, rearing, looming, hovering, crouched, rigid, sprinting, sprawled, coiled, poised
- **Named light source**: *"the only source of light is X,"* "lit by torches," "filtered through canopy," "moonlight haloing him"

#### Weak-signal phrases (warning signs, not poison)

These phrases commit to nothing visual and add no specificity:

- *dramatic, vivid, atmospheric, epic, magical*
- *fantasy art, trending on artstation, award winning masterpiece, masterpiece*
- *highly detailed, intricate, beautiful, stunning*

The discipline isn't to ban them outright — the working Branching Bolt prompt contains "vivid", "fantasy art", and "atmosphere" and it works fine. It's to **never let them carry weight in a prompt.** When you find yourself writing them, that's the warning: have you actually described materials, colors, body language, light source, and the mechanic-enactment? If yes, the weak phrases are harmless cargo. If no, they're masking missing work — stop and find the load-bearing specifics first.

#### Color-identity discipline

Red cards have red things. Blue has blue. Green has nature. Multicolor cards (like Verdant Charm) should visibly carry *all* their colors, meaningfully — not as a neutral wash. Map the card's mana cost to what the eye sees.

### 6. Generate via pixflux

Hit pixflux directly with curl. The PixelLab MCP wrappers don't expose this endpoint and produce worse results at 64×32 (the `create_object` tool is square-only; `create_map_object` defaults to transparent and underdelivers on small scenes).

```bash
curl -sS -X POST https://api.pixellab.ai/v2/create-image-pixflux \
  -H "Authorization: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "<the prompt>",
    "image_size": {"width": 64, "height": 32},
    "no_background": false
  }' \
  -o /tmp/pixflux_resp.json
```

**Getting the token:** It lives in `~/.claude.json` at `mcpServers.pixellab.headers.Authorization` — already in `"Bearer <token>"` form. Extract it with Read + a JSON parse, or grep for the Authorization line. Don't ask the user; it's already configured.

**Size is non-negotiable:** **Always use `image_size: {"width": 64, "height": 32}`.** This isn't a stylistic default — the html-proto card frames are *configured* to accept that exact size. Other dimensions produce art that doesn't fit the frame. Don't drift from this even if a prompt seems to "want" more pixels.

**PixelLab is sprite-biased.** It's a great tool for our purposes, but its primary use is sprite generation, so the model has a moderate pull toward compositions with no background — even when `no_background: false`. The flag is necessary but not sufficient: the *prompt itself* has to describe a **scene**, not a sprite on negative space. If a draft prompt reads like "a wizard casting a spell" (single subject, no surroundings), the model will likely deliver a wizard floating on transparency despite the flag. The fix is to name what's behind/around the subject — the background clause, the light source, what the periphery contains.

**Other parameters worth knowing:**
- `no_background: false` (default) → opaque background. Use `true` only for transparent sprites; you almost never want this for card art.
- `text_guidance_scale` — 1.0–20.0, default 8. Higher = more literal adherence; lower = more model interpretation. **Before bumping it: if rerolls keep ignoring a key element of the prompt, first try replacing the description of that element with a more precise noun (see the vocabulary-precision section).** Vocabulary is a scalpel; guidance-scale is a hammer that can flatten the rest of the prompt's nuance. Empirical case: pushing `text_guidance_scale` from 8 to 15 didn't fix Branching Bolt's fork-rendering; switching from compositional descriptions to "caret or circumflex" and "Lichtenberg figures" did.
- `seed` — pass a fixed integer if you want reproducibility across rerolls.

**Concurrent-job cap.** Pixflux only permits 5 concurrent jobs. If firing multiple generations in parallel (e.g., for variance sampling on a stubborn prompt), keep the batch at ≤5.

Response shape: `{"usage": {...}, "image": {"type": "base64", "base64": "..."}}`. Generation is **synchronous** (~3–5 seconds), unlike the MCP's async object/character tools.

### 7. Save and gitignore

Decode the base64 and write to `reference/html-proto/cards/<tplId>/art.png`.

Then append the path to `.git/info/exclude` (the worktree-shared local-only ignore) so the work-in-progress can't accidentally be committed:

```
reference/html-proto/cards/<tplId>/art.png
```

When the user approves the keeper, *remove the line* from `.git/info/exclude` so the file becomes committable.

### 8. Show and iterate

**The Read call that shows the PNG must be in the same response as your commentary and options — not in a prior turn.** If you Read the file in a diagnostic turn (e.g., to write your own commentary about what landed) and then send a separate response talking about it, the user sees your text without the image rendered next to it. Their UX is reading-your-message; the image needs to be *in* the message, not adjacent to it. Concretely: do the Read inside the same response where you offer the iteration choices.

A small inline preview is genuinely hard to evaluate for a 64×32 image. If the user can't tell what's going on, that's expected — open it in their image viewer for real assessment, don't fight the preview size.

Then offer:

- **Keep** — promote and finalize the approved art:
  - Un-ignore from `.git/info/exclude` so it becomes committable
  - Log the approved prompt to `references/claude-prompts.txt` in the format `<Card Display Name>: <prompt>`. The corpus of approved prompts is how future-Claude learns what works.
  - If the keeper came from a variance batch (parallel rolls of the same prompt), move the rejected candidates to `~/Desktop/Magiclike Rejected Art/` (Windows: `%USERPROFILE%\Desktop\Magiclike Rejected Art\`), renamed `<Card Display Name> N.png` (1-indexed sequential, ignoring the picked one). They live there for later review; the user deletes them manually when no longer wanted. Do not keep rejected candidates inside the repo.
- **Reroll same prompt** — same call, different result; cheap when the prompt is right but the dice didn't land
- **Tweak prompt** — propose a specific edit (add a detail, swap a material, intensify the light source). Show the diff before regenerating.
- **Change direction entirely** — back to phase 3, with what we learned

If the user is silent on what they want, ask. Don't preemptively reroll.

---

## Failure modes this skill is defending against

These are your defaults. The skill exists to fight them. Notice them in yourself:

1. **Adjective stacking** ("dramatic, vivid, atmospheric, epic"). These words commit to nothing.
2. **Literalism over metaphor** (Branching Bolt → "a bolt that branches"). Describing the mechanic instead of finding a visual that *enacts* it.
3. **Default-genre regression** (red instant → angry sky + lightning). Retreating to the most expected interpretation.
4. **Variations, not alternatives.** When you "propose three options," they're often three angles on one idea. Three *visions* means three things that wouldn't fit in the same sentence.
5. **Subject-only thinking.** Forgetting the silhouette at 64×32. Forgetting composition. Filling the prompt with what's in the center, nothing about framing.
6. **Anchor amnesia.** Proposing without studying existing arts. The set has a visual vocabulary; know what it is before you add to it.

The skill's checkpoints — silhouette test, anchor-required, kill-the-first-idea, banned-phrase list — are friction against these defaults. They are not bureaucracy. They are the discipline.

---

## Art-director protocol (how you handle disagreement)

The user is the art director. That doesn't mean you have no opinion — it means when you have one, you state it cleanly *once* and then accept their call.

**Don't defend out of attachment.** If they call a proposal lazy or boring and you don't have a substantive counter, absorb and pitch a new angle. "Well, I was thinking…" is usually attachment talking.

**Do push back when grounded.** If you have a real reason — their pick fails the silhouette test at 64×32, their tweak would re-introduce a banned phrase, their rejection seems based on a misread of what you proposed, or the iteration is circling in a way that suggests the prompt isn't the actual problem — say so clearly. Once. With your reasoning. Then defer to their call.

Sycophancy isn't humility, it's abdication. Folding on every pushback makes you a worse collaborator, not a better one. The user wants a brain in the room, not an echo.

**Worked examples:**

- *User:* "Direction A is lazy, try again." *You:* "Got it." (No grounded counter; just regenerate.)
- *User:* "Let's go with A but make it more epic." *You:* "'Epic' could mean a few different things at 64×32 — bigger implied scale, more contrast in the lighting, a wider environment, a more dynamic pose. Which one are we cranking?" (Translate, don't lecture.)
- *User:* "Make it more dramatic." *You:* "Stronger silhouette, sharper light source, a more violent pose, tighter framing? Pick which axis we're going for." (Same move — disambiguate to craft choices.)
- *User:* "Just reroll." (third reroll on the same prompt) *You:* "If this is the third reroll and we keep getting variations on the same disappointment, the prompt is probably the problem, not the dice. Want to look at it together before burning another generation?"
- *User:* "Use direction B." (B's silhouette test was weak) *You:* "Going with B — flagging that the silhouette I named for it was thin ('three figures clustered'). At 64×32 that may read as a blob. Worth a more aggressive composition or do you want to see what we get?"

---

## Exemplar prompts (study these)

These are real prompts from the user's set. Look at *what each is doing*, not just the words. Six annotated below; the **full corpus** of ~60 prompts lives at `references/exemplar-prompts.txt` in this skill folder — read it on demand when hunting for an example of a specific mechanic, color, or move you don't see here.

**Char** — mechanic-in-art for a "deals damage to you" spell:

> "A powerful battlemage in red robes, destroying a bandit who unwisely attempted to ambush him on a medieval highway through a dense, old-growth forest. The battlemage has cast a fiery spell to finish the fight, obliterating the bandit, burning them to ash and bone, as the bandit burns to death and drops his club. A few wisps of flame turn back on the battlemage, searing his robes."

The mechanic ("damages you") is the *last clause*. The art is a whole scene the rule is embedded in. The bandit isn't a target; he's a *story*.

**Doom Blade** — mechanic shown on the victim, not the spell:

> "A soldier in dented steel plate armor stands in a rigid side profile facing south, his body mortally wounded, cleanly bisected (cut in half) by a jagged, pulsating rift of swirling obsidian eldritch energy in the shape of a black eldritch obsidian void sword, eyes wide and mouth agape in shock..."

The spell is depicted *through its effect on the target*, not as a wizard casting. Camera is on the victim. Material specificity is doing real work ("dented steel plate," "swirling obsidian eldritch energy").

**Verdant Charm** — modal mechanics → modal art:

> "An elf in forest-green robes stands facing north, hands extended as three vibrant magical tendrils—bright lime, deep emerald, and shimmering teal—coil around their fingers..."

Three modal effects, three tendrils, three colors. The visual structure mirrors the rules structure exactly.

**Goblin Piercer** — permissioned levity plus literal mechanic:

> "An ugly little goblin shooting a bow at something. He is not very good at it."

Two sentences. Mechanic-literal (he pings creatures, so he's shooting a bow). Humor as a quiet beat. Length flexes — sometimes this is enough.

**Healing Salve** — light as a feature:

> "...pouring a red potion from a vial onto her bare arm, rubbing it in. The only source of light in the scene is from the potion's faint, soft, magical, healing glow."

The healing *is the light*. Color matches the card's effect. The scene exists in service of the prompt's hero element.

**Shadowmage** — captured moment over posed subject:

> "A battlemage in a dark purple or violet robe hovers above a thatched rooftop, in the dead of night, a gust of mystical energy holding him aloft. He grins evilly, looking jealously through a window."

Not "a shadow battlemage." A specific moment: hovering, peering, jealous. The character is *doing something* and the doing is the character.

---

## Inpainting (when relevant)

If the user gets a result they mostly like but wants to *tweak one element* (change the background, replace a creature in the scene, recolor a part), pixflux supports `/v2/inpaint`. Same auth, takes the existing image + a mask + a description. Don't reach for it on the first iteration — only when the user explicitly wants surgical edits rather than a fresh roll.

---

## One-breath summary

Read the card → study 1–2 anchor arts → propose three different *visions*, each with mechanic-enactment + silhouette + intent + anchor → user picks → write prompt using subject/pose/context/background structure, no banned phrases → show prompt → generate via pixflux at 64×32 opaque → save to `reference/html-proto/cards/<tplId>/art.png` → add to `.git/info/exclude` → show user → iterate without defending.
