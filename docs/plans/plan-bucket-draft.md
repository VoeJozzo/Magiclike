# Plan: The Growing Deck & Synergy-Graph Buckets

**Status (2026-06-11):** Design spec, **not yet executed** on either engine. Produced in a design session (Joe + Claude); the core algorithm was **prototyped and validated against the real 289-card proto pool** in-session (prototype scripts: [`bucket-prototype/`](bucket-prototype/)). Proto-first: everything here lands in the html-proto before the Godot port (which is still at Phase 5c; this work slots in around Phases 8–9, draft/roguelike meta).

**Decision provenance.** Items marked ✅ were explicitly agreed in-session; items marked ◇ are proposals awaiting Joe's call. Where this doc and a future implementation disagree, re-read the session transcript or just re-decide — nothing here is sacred except the problem statement.

**Cross-references:** [`../wiki/rules/1400-draft.md`](../wiki/rules/1400-draft.md) (current draft canon — this plan *replaces* much of it when executed), [`../wiki/rules/1500-the-run.md`](../wiki/rules/1500-the-run.md) (reward flow), [`../wiki/rules/1300-stickers.md`](../wiki/rules/1300-stickers.md), [`../wiki/staple-synthesis.md`](../wiki/staple-synthesis.md), `reference/html-proto/js/draft.js` / `run.js` (the code this restructures).

---

## 1. The problem

The current draft is **23 picks of pure deckbuilding before the first second of gameplay**, and then the faucet shuts off — post-draft, deck composition only changes via the rare `transform` reward (weight 2). Two distinct costs:

1. **Front-load:** the run opens with its least exciting stretch — ~69 cards of menuing against zero context. You don't know what you're drafting *against*.
2. **Lock-in:** deck composition is fixed at minute five of a multi-hour run. A mediocre draft is a mediocre run with no redemption arc. (Compare Slay the Spire: a card offer after *every* fight.)

A third observation that shaped the solution: the card pool is **synergy-forward** (lords, tribal packages, death-trigger engines — see §4's graph evidence), and single-card rewards dilute synergy. Adding one random card makes the deck *bigger*, rarely more *itself*.

## 2. The decided shape — the Growing Deck

✅ **Direction agreed.** Replace the 23-pick up-front draft with a small start that grows across the run:

| Piece | Spec | Status |
|---|---|---|
| **Run start** | Pick a **banner** (archetype seed), then 2–3 **bucket picks** (§3). Run setup in under a minute. The 10–12-pick mini-draft is the fallback if banners aren't built yet. | ✅ agreed ("yep, absolutely") |
| **Growth** | New reward kind **`addBucket`**: pick 1 of 3 generated buckets. A bucket = **3 spells + 2 lands** (lands colored by the bucket's own pips, largest-remainder). | ✅ agreed (incl. the 3+2 shape) |
| **Growth rate** | `addBucket` weight = `2 × max(0, targetSpells − currentSpellCount)` — dominates the reward table early, fades to zero as the deck fills. One formula gives the run its arc: *building → empowering*. | ◇ proposal |
| **Arithmetic** | Start ~11 spells + 8 lands (keeps the canonical 23:17 ratio); 4 bucket picks ≈ full deck by the first boss. 23 + 16 lands lands one short of canon — the ratio top-up rule or the innate-land offer absorbs it. | ✅ math verified in-session |
| **Opponent symmetry** | `buildOpponentDeck` gets a `numPicks` param (it already loops to `TOTAL_PICKS`, draft.js:189–218); opponent deck size mirrors the player's current spell count. Sticker/staple/clone scaling by `gameNum` unchanged. | ◇ proposal |
| **Small-deck risk** | Early games risk deck-out / dragging at 20 life. Dials, in try-order: lower early life totals (e.g. 12 + 2/game → 20), keep deck-out as live early pressure, graveyard-recycle only if data demands. Tune with `tests/selfplay_harness.js` sweeps (deck size × life → game length, deck-out rate; target <~5% deck-out deaths). | ◇ proposal, **must tune before ship** |
| **Lands / Desert Cube** | Default: automatic land top-up (above). Variant mode: lands ride inside buckets at the desert probability — manabase as informed incremental decisions. The Growing Deck fixes desert cube's information problem (you pick lands knowing what your deck became); ship desert as the "manual transmission" mode. | ✅ direction liked |

**Explicitly rejected / parked:**
- ❌ **Color pivoting as a designed pattern.** Off-color offers pushing players toward 5c piles is a known genre feelsbad; the off-deck-color throttle in `rollPack` is good design. What survives: the **mid-game splash** ✅ — one knowingly-off-color card, player-initiated, supported by land stickers. Adjacent-distance selection (§5) is the natural source.
- 📌 **Crystallization** (sketch slots that crystallize into permanent picks on first draw, generalizing Architect's Codex's `build_on_draw`) — pinned as interesting, out of scope for this plan. Prototype path if revived: a run modifier ("The Unwritten Deck").
- 📌 **Spoils drafting** (loot a beaten opponent's slots, saw-play-gated, stickers carry) and **market/geography nodes** (bazaars trading in deck state; the Gravemarket selling back your ripped slots) — both discussed warmly, both composable with this plan, neither part of it. Spoils note: no special-casing of boss signature cards for now; Steal keeps its trophy-hunter niche.

## 3. Buckets — what and why

A **bucket** is a generated offer of 3 spells + 2 lands sharing a *plan*. The prior art and its lessons:

- **Hearthstone Dungeon Run (2017):** bundles were **hand-curated fixed lists** per class — they played great and required ongoing manual balance patches. (Datamined lists: HearthPwn #4132.)
- **Hearthstone Duels (2020):** "smart buckets" auto-generated from telemetry. When bucket grouping drifted from *strategy* to *expansion*, players got coherence-free buckets and retired runs; community consensus blames this for the mode's decline.

**The lesson is the design constraint: bucket coherence is the entire value proposition, and neither pure hand-curation nor blind statistics delivers it sustainably.** Our pool has something Hearthstone lacked: cards are **structured data** (typed effects, trigger conditions, subtypes, costs) — synergy is *computable from structure*, no telemetry needed.

**Tightness policy** ✅: tiered, with the bar "a player should be able to state the bucket's plan in ≤5 words."

| Tier | Coherence source | Pool depth (audited) | Offer share |
|---|---|---|---|
| Tight (tribal) | literal subtype, payoff + members | Goblin 13/2 payoffs, Spirit 10/1, Cleric 12/1, … (~10 themes pass `count ≥ 6 AND payoff ≥ 1`) | identity slots, when earned |
| Medium (functional) | shared plan via the graph | death-matters ~27, removal 32, card-flow 49, pump 41, fliers 40 | the workhorse majority |
| Loose (Reinforcements) | curve + intrinsic value only | vanillas + orphans (29 cards) | ≤1 slot per offer; always-legal fallback |

Variety lives in the **offer** (2 identity buckets + 1 adjacent), never inside a bucket. A tight bucket in a diverse offer is a gift; as the only option it's a railroad.

## 4. The generator — a labeled producer/consumer synergy graph

**The mental model (the whole idea in one sentence):** a cohesive bucket is a **micro-engine** — something that *produces* a resource and something that *consumes* it — not a pile of similar cards. Blood Artist doesn't want other drain cards; it wants *things that die*.

The algorithm never thinks "I'll build a Goblin bucket." It picks a seed and asks the graph *"who wants to be near this card?"* — the theme is an **output** (read off the dominant edge label), not an input.

### 4.1 Extraction: PROVIDES / WANTS (~15 one-line rules)

One boot-time scan per card derives two weighted resource sets from the card JSON:

| Signal in card.json | Rule |
|---|---|
| `types[]` subtypes | PROVIDES `sub:X` |
| `create_tokens` (+ `token_id` prefix → tribe) | PROVIDES `sub:<tribe>`, `fodder`, `dies`, `wide` |
| `gain_life` amount>0 / `lifelink` | PROVIDES `lifegain` |
| cheap creature (cost ≤2 / ≤1) | PROVIDES `dies` (weak) / `fodder` |
| is Instant/Sorcery | PROVIDES `spellcast` |
| condition `card_has_subtype(X)` / `static_buffs[].subtype` | WANTS `sub:X` (payoff weight) |
| condition `card_moves(battlefield, graveyard)` | WANTS `dies` |
| ability `cost.sacrifice` | WANTS `fodder` **and PROVIDES `dies`** (sac outlets produce deaths) |
| trigger `life_changed` / `spell_cast` | WANTS `lifegain` / `spellcast` |
| global (filterless) `static_buffs` | WANTS `wide` |
| flying / haste·attack-triggers / face-capable damage / removal / `move_card` | weak **plan tags** (homophily): `flying`, `aggro`, `removal`, `cardflow` |

This rule table is the **entire authored surface**. New cards parse automatically; a new *mechanic* (e.g. energy, recursion) costs ~2 new lines (extraction rule + name-table entry). Maintenance contract: **new cards free, new mechanics ~2 lines.**

### 4.2 Edges

`edge(A,B) = Σ_r provides_A(r)·wants_B(r)` (both directions) `+ 0.5·|shared plan tags|`. Complementarity is the strong force; similarity the weak one. **Every edge carries its reason** (`goblin_rabble feeds carrion_feeder [fodder]`) — the debugging tool, the bucket-naming source, and candidate UI copy. 260 non-land cards → ~34k pairs, milliseconds at boot.

### 4.3 Seed-and-grow

```
offer(deck):
  seeds: 2 × identity (strongest total edge INTO the deck)
       + 1 × adjacent (payoff in deck colors at medium distance — §5)
  for each seed:
    bucket = [seed]
    2×: score candidates = Σ edges into bucket + λ·Σ edges into deck
        constraints: bucket ≤ 2 colors, copy cap, curve spread
        pick by SOFTMAX (temperature T) — never argmax
    coherence = Σ internal edges; below floor → discard, fall back to Reinforcements
    name = label table lookup on the dominant edge resource
    lands: +2 basics by the bucket's pips (largest remainder)
```

**Knobs:** `T` (run-to-run variety vs. quality; argmax would make every run's Goblin bucket identical), `λ ≈ 0.25` (courts-your-deck vs. self-contained engine), coherence floor (the anti-Duels gate), rule weights (design opinion, e.g. how strongly "racing" binds goblins to burn).

### 4.4 Validation — what the prototype actually produced (real pool, first run)

- seed `carrion_feeder` → `[carrion_feeder, morticians_assistant, spectral_procession]` (coherence 18.0) — an unauthored Aristocrats engine triangle: Procession makes bodies → Feeder eats them → Mortician pays off deaths.
- seed `goblin_chieftain` → `[chieftain, burnout_shaman, goblin_rabble]` (15.6) — Rabble's `token_id` told the extractor its tokens are Goblins.
- Same seed, deck context: for a mock BR deck, Feeder's bucket swapped its fodder source to `goblin_rabble` — **members adapt to the deck while the plan holds.**
- Top pool pairs sanity check: `spectral_procession ↔ spirit_shepherd` 9.6 (tokens *are* Spirits + lord), `ajanis_pridemate ↔` every lifegain source 9.0.
- **Instructive failures:** `blood_artist` standalone bucket mediocre (5.7) — the "any cheap creature PROVIDES dies" rule is too promiscuous, needs weight tuning. `apex_elder` limped to 3.5 — Beast support is genuinely thin; the coherence floor caught it. Both failures are the system *self-reporting*, which is the point.

## 5. Archetype distance (same graph, aggregated)

Distance between two card groups = **mean cross-edge mass** between their members. Validated in-session: counterspells correctly read as a synergy island (0.05–0.19 to everything — control cards cohere by similarity, not complementarity); death-matters is the pool's gravitational center (internal 4.44); Goblins↔Burn read 0.00 until a one-line rule taught the vocabulary that face-damage is part of the race plan (→ 0.13). The matrix can only see what the rules encode — that's a feature: distance reflects *deliberate* design opinion.

**Four jobs for distance:**
1. **The adjacent offer slot** — rigorously defined: a theme in the medium band (~0.5–1.5) from the deck's profile. The agreed mid-game splash lives here too.
2. **Banner generation** — banners = high-cohesion regions of the matrix, auto-ranked by how supported they are.
3. **Map theming** — if market nodes ever ship, they stock from named graph regions (Library = the spell island, War Camp = the aggro continent).
4. **Pool health dashboard** — a 3-card counterspell island isn't an algorithm bug, it's the pool requesting content. The thin-theme boot report is the card-design TODO list, with severity scores.

## 6. Integration map

| System | Touch | Status |
|---|---|---|
| **Reward table** (`run.js` `REWARD_TYPE_WEIGHTS`) | `addBucket` kind; weight formula §2; existing `transform`/`sticker`/`splice` rewards unchanged and now *relatively* rarer early | ◇ |
| **Run start** (`RUN.start`, draft UI) | banner pick seeds the deck's theme profile; 2–3 bucket picks replace the 23-pick draft; run modifiers unchanged (they inject extras as today) | ✅ direction |
| **Draft module** (`draft.js`) | `rollPack`/`scoreDraftCard`/`weightOf` machinery reused by the generator; `TOTAL_PICKS` → run-config; AI bucket choice = argmax Σ`scoreDraftCard` | ◇ |
| **Stickers** | pre-stickered bucket as rare reward variant ("Veteran Warband"); sticker eligibility/claim-gate untouched | ◇ |
| **Splice/staple** | untouched; splice candidates could someday be ranked by edge weight (natural "these two cards belong together" signal) | idea only |
| **Desert cube** | folds in as bucket-carried lands (§2) | ✅ direction |
| **Opponents/bosses** | deck-size mirroring only; constructed decks and scaling untouched | ◇ |
| **PICKLOG** | log bucket id + dominant resource + offer context per pick → "which themes win runs" | ◇ |
| **Boot reports** | theme-health line alongside the existing supportability scan (`Bucket themes: N eligible, M thin (…)`) | ◇ |
| **Engine** | **zero engine changes** — buckets are a meta-layer system; cards enter slots exactly as today | fact |
| **Godot port** | proto-first; the extraction rules read the shared wire format (`docs/PROTOCOL.md`), so the port is a re-implementation of ~300 lines against identical data (Phases 8–9) | fact |

## 7. Implementation slices (proto)

1. **Audit loop** (½ day): iterate extraction rules against the real pool — fix the burn-target predicate (read PROTOCOL.md's target vocabulary, don't guess), de-promiscuify `dies`, add Artifact-matters + Theft recipes, Human/flash exclusions, tier gates. Exit: coverage ≈ 100% minus deliberate exclusions, top-pairs list passes eyeball review.
2. **`js/buckets.js`** (1 day): extraction + graph + seed-and-grow as an IIFE late-binding into ENGINE/DRAFT (the `stickers.js` pattern), name table next to `KEYWORD_DISPLAY` in `cards.js`. Node tests: graph determinism, coherence floor, constraint compliance. Boot report line.
3. **Reward + UI plumbing** (1 day): `addBucket` reward kind (the `transform` two-phase flow, push instead of replace), land top-up rule, offer rendering (bucket = named group of 3 cards + 2 land pips), PICKLOG extension.
4. **Run-start restructure** (1 day): config-driven `TOTAL_PICKS`, banner pick (can ship after — mini-draft is the interim), opponent `numPicks` mirroring, save-schema migration.
5. **Tuning pass** (1 day): selfplay sweeps (§2 small-deck risk), temperature/λ/floor calibration, then human playtesting.

**Effort: ~4–5 days proto-side.** Slices 1–2 are pure-data and containerizable; 3–5 want browser verification.

## 8. Open questions

- Banner contents: pure theme-seed, or theme-seed + 2–3 guaranteed cards? (Leaning seed-only; let buckets do the work.)
- Does `addBucket` fully replace single-card `transform`, or coexist? (Leaning coexist — transform is *repair*, buckets are *growth*.)
- Early-life scaling: ship with it, or only if selfplay says games drag? 
- Adjacent-slot selector needs one more design iteration (the prototype's filter was too strict and returned empty).
- Where does the loose Reinforcements bucket get its name/flavor variety from? (Cosmetic, but names are half the charm.)

## 9. Sources (Hearthstone research)

- [Dungeon Run — Hearthstone Wiki](https://hearthstone.fandom.com/wiki/Dungeon_Run) (bundle mechanics)
- [All the Possible Options for Dungeon Run Card Bundles by Class — HearthPwn](https://www.hearthpwn.com/news/4132-all-the-possible-options-for-dungeon-run-card) (datamined fixed lists; Feb 2018 hand-patches)
- [Dev Insights: Treasure Pools & Smart Loot Buckets in Duels — Blizzard](https://hearthstone.blizzard.com/en-us/news/23558960/dev-insights-treasure-pools-and-smart-loot-buckets-in-duels) (telemetry-driven generation)
- [Did the bucket system kill Duels? — HS forums](https://us.forums.blizzard.com/en/hearthstone/t/did-the-bucket-system-kill-duels-no-synergy-in-choices/109006) (the coherence failure mode)

## Appendix: prototypes

[`bucket-prototype/`](bucket-prototype/) holds the two in-session validation scripts, runnable from the repo root with plain `node` (no deps):
- `bucket_proto.js` — extraction, graph, seed-and-grow demos, top-pairs sanity check.
- `bucket_distance.js` — the archetype distance matrix (including the goblins↔burn one-line lesson).

They are throwaway-quality but ~70% of a real `buckets.js`; the extraction-rule table is the part worth porting verbatim.

---

# Part II — Scratchpad: the wider vision

*(Everything below is **deliberately unspecced** — an idea dump, invited as such, written with the dial turned to "share the excitement." Nothing here is agreed, sequenced, or even necessarily good. The connective thesis, though, I'll stand behind:)*

**The synergy graph shouldn't be a bucket-generation detail. It should be the game's shared nervous system** — one boot-time data structure that the draft, the map, the opponents, the rewards, the UI, the analytics, and the card-design pipeline all read. The sticker system already proved the pattern: a meta-layer currency that flows both directions between run and game became the game's signature. The graph can do for *structure* what stickers did for *progression*. The pool stops being a list of cards and becomes a **place** — and almost every idea below is some system discovering it can read the map of that place.

## The map

- **The map is a projection of the graph onto geography.** Today map nodes are colored W/U/B/R/G. Instead: nodes are *archetype-affine* — the opponent at a node is seeded from a graph region, so routing reads as "fight through goblin country or cut across the spirit marshes." The distance matrix already knows the continents; the map generator just samples them. Color affinity becomes the special case, not the system.
- **Forecastable routing.** Because node opponents are theme-seeded, map icons can honestly telegraph *plans*, not just colors — "aggro territory ahead" is actionable ("grab the Wall bucket / the lifegain package *now*"). Routing becomes deckbuilding at one remove, which is exactly the StS muscle the map currently doesn't exercise.
- **Themed markets stock from graph regions.** The bazaar ideas from the session (Library, War Camp, Menagerie, Gravemarket) stop needing curated inventories — a market node is a *named region of the graph* with a coherence floor. The Gravemarket stays special: it sells your own ripped slots back, and the graph can *price* them by edge centrality — buying back the card your whole engine missed costs more than buying back filler. The wound that hurt most is the expensive one to heal. That's drama as a pricing function.
- **Sector escalation as graph navigation.** Each new sector's map could deliberately bias toward regions *hostile* to your deck — boss selection in particular: pick the archetype at maximal effective distance from (or maximal counter-leverage against) the player's profile. The Balancer shows up *because* you snowballed wide. Difficulty that reads as the world responding to who you've become, with zero stat inflation.

## Opponents

- **Opponents are built by the bucket generator.** Replace pick-by-pick AI drafting with 7–8 bucket picks from a seed. Opponent decks become *coherent* — they have plans you can read mid-game and play around — and the hand-curated constructed decks (Goblin Aggro, Spirit Tribal…) become merely *famous seeds* rather than maintained lists. Bosses = maximal-coherence decks grown around their signature card as the seed.
- **Difficulty = temperature.** This is the scratchpad idea I'd defend in a knife fight. Scale opponent strength by *generation temperature*: early enemies are built at high T (sloppy, unfocused decks — beatable by fundamentals), bosses approach T→0 (the platonic engine). The difficulty curve becomes "how well is the enemy deck built," which is precisely what difficulty means between human players — and it's one float. No card-quality changes, no HP inflation, no cheating AI. The existing sticker/staple/clone scaling stays as the second axis; coherence becomes the first.
- **A rival.** One persistent NPC per run: a seed + theme profile + temperature that re-appears every sector, its deck growing by the *same* growth rules as yours (buckets, stickers, maybe even spoils of its own from "fights" it notionally wins offscreen). You watch its deck mature in parallel with yours, and the final meeting is two grown decks with histories. The Nemesis system, except the nemesis is a decklist.

## Stickers, splice, and graph surgery

- **The subtype sticker is secretly the most strategic card in the game and nobody knows it yet.** Stickers that change a card's data *literally rewire the graph*: +Goblin on a value creature creates real edges to the chieftain and the drummer; future buckets *follow the new wiring*. Sticker → graph update → the run's growth trajectory bends. The moment buckets ship, subtype/keyword stickers stop being stat-adjacent curiosities and become *steering*. The UI should celebrate this ("new synergies unlocked: …" — the edge labels are the copy, pre-written).
- **Splice candidates ranked by edge weight.** The splice reward UI sorts pairs by their edge: "these two cards have been asking to be stapled." The graph generating *romance* between cards is also just… correct matchmaking — the best splices are producer/consumer pairs collapsed into one card.
- **WANTS-aware sticker offers.** A slot with unmet WANTS biases its own offers: the sac outlet starving for fodder gets offered the token-empower. Rewards that *complete engines* instead of inflating stats — which is the exact medicine for the "+1/+1 spreadsheets" reward-texture critique from the start of this session.

## The deck as a visible organism

- **The constellation view.** Draw the deck as its subgraph: cards as stars, edges as lines, edge weight as brightness. Stickers and splices visibly add lines *while you watch*. The "deck as character" thesis finally gets a *portrait* — and a run's story becomes a time-lapse of a constellation assembling. (The force-directed layout of the full pool is also the meta-codex: archetype space with fog-of-war over regions you've never drafted. Exploration as collection.)
- **Realized synergy.** The engine already emits structured events; cross-reference them against the deck's edges and you can detect when an edge *actually fires in play* (Rabble's tokens died, the Artist drained). Paper synergy vs. realized synergy. Uses stack up fast: celebrate it in the log; gate banner unlocks on it ("earn the Grave Bargains banner by *doing* it," the keyword-claim philosophy extended to structure); and feed it back into rule-weight tuning — the graph *learns which of its own edges are real* from selfplay, which is the Duels telemetry approach finally done right, on top of a structural prior instead of instead of one.
- **Codex & Mercurial point their generators at the graph.** Architect's Codex and Mercurial Adept already roll procedural abilities; let them sample from the deck's *unmet WANTS*. The Codex stops offering random text and starts offering the missing organ. (Endomorph already mutates its own PROVIDES mid-run by eating keywords — there's a whole genre of "graph-live cards" hiding here: cards whose wiring changes as the run plays.)

## Run modifiers & the content pipeline

- **Temperature as a player-facing boon axis.** "The Loom" — all your buckets generate at T→0 (perfect engines) but offers shrink to 2. "The Bazaar of Babel" — high T everywhere, 4-card buckets, chaos drafting. One existing knob, two opposite fantasies.
- **The graph as card-design compass.** The distance matrix is a live dashboard of the pool's gaps: islands that need bridges (counterspells → a spells-matter payoff package), thin tribes with payoffs but no bodies, dead cards with low degree everywhere. The card-pitch workflow can take a *target edge* as its brief: "pitch me cards that connect the counterspell island to the death-matters continent." And low-degree cards can get automatic draftWeight boosts inside the buckets where they *do* fit — the system quietly rehabilitating its own least-loved children.
- **A pre-commit graph diff as content CI.** New card lands → boot scan → "this card adds 14 edges, joins Grave Bargains and Skyborne, bridges nothing, degree percentile 62." A card that adds *zero* edges triggers a gentle warning: it's either deliberately standalone or accidentally inert. The same line that catches design mistakes also describes the card for the changelog.

## What I'd actually chase first (the scratchpad ranked, despite myself)

1. **Difficulty = temperature** (one float, transforms the run's spine).
2. **Opponents built by the generator** (coherent enemies; deletes a curation burden).
3. **Stickers as graph surgery** (zero new code — it's *already true* the moment buckets ship; just needs the UI to say so).
4. **Realized-synergy detection** (the feedback loop that makes everything else self-tuning).
5. **The constellation view** (pure presentation, pure love — ship last, want most).

