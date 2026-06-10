---
name: fable-concept
description: >-
  Explain a concept by writing a fable that embodies it without naming it —
  the reader only realizes what it is near the end — then a short debrief that
  names the concept and ties it back to the story's key moments. Use when the
  user wants to *understand* something (a principle, mechanic, abstraction,
  algorithm, design pattern, bit of physics, an idea from a paper) and would
  be served better by an indirect narrative than a direct definition.
  Triggers on "explain X as a fable", "help me really understand X", "write a
  fable for X", "do the Askell thing", "tell me a story that teaches X". NOT
  for cases where the user wants a fast factual answer, a reference lookup, or
  step-by-step instructions — those want directness, not a story.
---

# Fable-concept

Explain a concept by *enacting* it in a short story instead of defining it. The
story embodies the concept completely but never names it; the reader feels the
shape of the idea before they have a word for it, and the recognition lands near
the end. A brief debrief afterward names the concept and points back to where in
the story each part of it lived.

The technique is attributed to Anthropic's Amanda Askell. The original prompt:

> I want to understand [concept]. Please explain it by writing a fable — an
> indirect, narrative version of the concept. The story should embody the
> concept completely without naming it directly. Ideally, the reader should
> only start to realize what the concept actually is near the end of the story.
> After the fable, add a short explanation that names the concept clearly and
> connects it back to the key moments in the story.

## Why this works

A direct definition lets the reader file the concept under a label without ever
building a model of it. A fable withholds the label, so the only way to follow
the story is to construct the mechanism the story runs on — which is the
understanding you actually wanted. The delayed reveal turns comprehension into a
small discovery: the reader does the last step themselves, and a thing you infer
sticks harder than a thing you're told.

It also surfaces whether *you* understand the concept. You cannot dramatize a
mechanism you only know by its name. If the fable won't cohere, that's a signal
the concept isn't yet understood well enough to teach — worth saying so rather
than papering over it with vague imagery.

## Workflow

1. **Pin the concept down first.** Before writing, name (to yourself, not in the
   output) the load-bearing core: the one mechanism, tension, or relationship
   that *is* the concept. The fable has to turn on this, not on decoration
   around it. If the concept has 2–3 essential parts, list them — each needs a
   beat in the story.

2. **Find a concrete arena far from the concept's home domain.** Don't explain
   recursion with a story about computers, or compound interest with a story
   about a bank. The transfer is the point: a village, a garden, a craftsman, an
   animal, a journey. The further the surface is from the subject, the more the
   reader has to grasp the *structure* rather than pattern-match the trappings.

3. **Make the mechanism drive the plot.** This is the craft line that separates
   a fable from a labeled allegory. The concept should be *why things happen* —
   cause and consequence in the story should be the concept operating. If you
   could swap the concept out and the plot would be unchanged, the story is
   decoration, not embodiment.

4. **Withhold the name and delay the recognition.** Never use the concept's term
   or its standard vocabulary inside the fable. Shape the story so the click
   arrives late — the early beats should read as a plain tale, and only the
   final turn should make the reader think "oh — this is about ___." Avoid
   telegraphing it in the title or first lines.

5. **Then break character and debrief.** After the fable, in plain prose: name
   the concept directly, then walk the key story moments and say what each one
   *was* — "the gardener's refusal to prune was X; the season it cost him was
   the consequence Y." This is what converts a nice story into a tool the reader
   can now use. Keep it short; 3–6 sentences or a tight bullet list.

## Craft guidance

- **Embodiment over allegory-with-labels.** "The king named Greed ruled the land
  of Markets" is not this technique — it's a glossary in costume. The reader
  should infer the mapping, not read it off nametags.
- **One concept per fable.** If the user hands you a cluster, either pick the
  central one or write distinct short fables. A single story straining to carry
  three ideas embodies none of them cleanly.
- **Earn the reveal; don't spring a non-sequitur.** Delayed recognition works
  only if, in hindsight, every beat was already the concept. The reader should
  feel "it was there the whole time," not "that came from nowhere."
- **Keep it short.** A fable is a few hundred words, not a chapter. Length
  dilutes the through-line. Concision *is* the form.
- **Match register to the concept's weight.** A whimsical animal fable suits some
  ideas; a spare, serious parable suits others. Don't default to cute.
- **Don't moralize twice.** The debrief is the explanation. Don't also tack an
  Aesop-style "and the moral is…" onto the fable itself — let the story stay a
  story.

## Output shape

```
<the fable — titled or untitled, a few hundred words, concept never named>

---

**What this was about:** <concept named>. <2–6 sentences mapping the key
story beats back to the parts of the concept.>
```

## When not to use this

If the user wants a quick fact, a definition to drop into a doc, a debugging
answer, or procedural steps, give them that directly — a fable would be a
costly, slower path to a thing they wanted plainly. The technique earns its
overhead only when the goal is genuine *understanding* of something abstract or
counterintuitive. When in doubt about which the user wants, offer: "I can give
you the straight explanation, or do the fable version — which serves you here?"
