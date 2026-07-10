# Plan: Pool Interconnection Waves (1.5 ✅ · 1 ✅ shipped v2.2.8 · 2 ✅ spec-hardened, build pending)

## Wave 2 state (2026-07-10)

Wave 1 SHIPPED as v2.2.8 (8 cards + `another` filter + extraction vocab;
suite 2737 green, selfplay 500 clean; all pairs ≥12 plans for the first
time, zero-hook 43%→35%). Wave 2 ran at 20 designers across GW/WU/GU/RG/RW
(60 pitches → 1 Fable killer → 16 survivors), Joe's verdicts took 23 ships
(11 killer-overrules) + 10 holds, then a 33-agent SPEC-HARDENING pass
produced implementation-ready wire JSON + engine plans for every card
(scratchpad wave2/specs/hardened.json; cut sheet wave2-cutsheet.md).

**Pending Joe:** Bramblefang timing-trap blessing (spell-cast trigger
resolves above the spell — pings the blocker before the pump saves it),
Riverbend Adept direction (architect recommends keeping controlled_by(opp);
"you control" would feed self-bounce, NOT flicker — blink never touches
hand), Skyward Tactician in/out, Tenacious Yearling re-promotion (two-
trigger templating resolved; recruit record 15).

**Engine bill for the 7 gated cards (~60 lines, file-level plans in specs):**
card_has_keyword + opponents_turn + card_has_etb_effect predicates,
ability_activated event, spell_cast target threading + spell_target
selector, describeStaticBuff keyword-filter phrasing. Plus extraction
vocabulary per shipped card, two wart-fixes (landfall false-etb, qualified
spellcast), and the mass-buff wants:wide gap (warchanter et al. mis-measured
today — found by Steadfast Vanguard's architect).

**Pipeline addition (proven this wave):** designers → killer → Joe's cut →
per-card SPEC-HARDENING architects (dossier = pitch + ruling + Joe's notes
as directives + curator flags + graph annotation; repo access, verify-don't-
trust) → warm consolidation → build. Also queued: Joe's extraction-audit
idea — sweep the whole pool for cards deserving want/provide rules
(smite_the_wicked's tapped-want was invisible until Wave 2 measured it).

**Status (2026-07-07):** Wave 1.5 shipped (v2.2.7). Wave 1 executed same day:
12 designer hands → 36 pitches → 1 Fable killer (11 ship / 25 kill) → recruit
annotation → Joe's verdicts via the review-board artifact. 8 cards approved to
ship (3 with Joe's redesigns), 4 held, rest dead. Implementation NOT yet
started. Companion: [`plan-bucket-draft.md`](plan-bucket-draft.md)
(the Growing Deck system this all serves), `reference/html-proto/tests/pool_assay.js`
(the metrics instrument — run it before and after any wave).

## Wave 1 verdicts (Joe, 2026-07-07 — the build list)

**SHIP (8):**
1. **Gloomfang Leech** `1B` Vampire 1/1 — opp loses life → +1/+1 counter on self.
   (10 recruits: the entire burn suite gains its first hook.)
2. **Ironbrand Marshal** `1R` 2/2 — Artifact creatures you control get +1/+1.
   Kept red (blacksmith flavor, brand_of_iron precedent, R sits in both
   plan-poor pairs; colorless rejected: a colorless LORD fits every deck =
   omnipresence/hub risk).
3. **Toll of Secrets** `1B` Human Rogue 1/2 — you discard → opp loses 1.
   (0 recruits but 9 live edges day one; creates the UB discard plan.)
4. **Grim Ferryman** `1B` Zombie 2/2 — {T}, sacrifice a creature: draw a card.
5. **Bloodtithe Collector** `1B` Vampire 1/2 — opp loses life → you gain 1.
   JOE OVERRULE of the killer's one-payoff-per-niche kill: not a duplicate of
   Gloomfang, a BRIDGE (wants opp_loss, provides lifegain → feeds pridemate).
6. **Tideglass Broker** `U` Faerie — flash flier, ETB blink another creature
   you control. JOE OVERRULE of the kill; fixes required: no self-blink loop,
   rate check. Final spec TBD (see open items).
7. **Toll of Silence** — counterspell, its controller loses life. JOE OVERRULE
   with respec: **UUB, lose 2**. (Wire note: rider is gain_life −2 target opp —
   identical in a duel since you never counter your own spell.)
8. **Rakdos Underboss** `1BR` Demon 2/2 — JOE RESPEC: Demons you control get
   **+1/−1**; a Demon dies → drain 1. The respec answers the killer's "stapled
   halves" complaint: the anthem now feeds the drain. Engine handles negative
   buffs (getStats sums signed values; SBAs kill at t≤0). Known interaction:
   your 1-toughness demons die when he enters — feature, very Rakdos.

**HOLD (4, parked):** Reckless Bloodletter (eot pump lands after the two-pass
combat-damage math — unintuitive; counters-version possible later), Charnel
Chorister (Joe leans ship; storm-sage ubiquity worry — idf answer given),
Cinder Ward (not a red card; confirmed busted with elystra_the_immortal's
permanent_eot), Ashclot Zealot (needs 1 new atomic predicate
spell_has_damage_effect, ~15 lines — cheap when wanted).

**Extraction patch scope (trimmed to shipped cards):** opp_loss provides+wants,
discard provides+wants, sub:Artifact provides, life_changed DIRECTION SPLIT
(is_life_loss → self_pain/opp_loss, else lifegain — fixes the 23-false-edge
latent bug found during annotation). DROPPED from the measured 64-line patch:
bounce rules (twins dead), kw:deathtouch (Reckoning dead), reanimation-wants
rule (Memory dead; it was honest for deepseam_quarry but deletions are wins —
re-add when a reanimator ships).

**Open item:** Tideglass Broker final spec (Fable proposes, Joe cuts).

**Instruments:** review-board artifact (verdict buttons + copy-export);
wave1/ scratchpad holds hands, results, annotations, extraction_price.diff,
and the killer audit (24/25 kills verified; 1 wire claim wrong: Chorus of the
Drowned — ancient_hydra combat_damage precedent + mind_rot discard shape).

## Where things stand (engine v2.2.7, branch claude/growing-deck-buckets)

- Growing Deck shipped and iterated to v2.2.7 across this session: bucket draft
  (5 picks), addBucket reward, weights-as-weights sampling everywhere
  (softmax deleted), idf specificity weighting, base seed weight 0.75
  (exploration curriculum), DECK_COUPLING 0.1, GROWTH_SHARPNESS 2, soft third
  color (×0.05/extra color), no copy cap (Joe's call), coverage-first bucket
  lands, Reinforcements excludes owned cards + samples by value.
- Wave 1.5 (flavor audit of 116 zero-hook cards): 16 finder agents (Sonnet 5 +
  Opus, four lenses, every card reviewed twice, Grizzly Bears sentinel in every
  batch — 16/16 clean passes) → 3 Fable judges (76% kill rate) → curation.
  Shipped: ancient_hydra Slith-growth trigger; pyromaniac {R},{T}: ping 1
  (judge-refined); wolfbriar_elemental +Wolf; scrap_hound +Hound. Joe declined
  giant_spider (Insect is a deliberate register choice from the type-
  simplification pass — do not re-flag). Side find: the graph was blind to
  engine SUBTYPE_KEYWORDS (Angel/Dragon fly, Treefolk reach, Wall defends) —
  fixed v2.2.6 via ENGINE.addSubtypeKeywords.
- Assay after Wave 1.5: hub share 44–62% band unchanged (expected — flavor
  fixes bank subtypes, they don't create wanters). Plan-poor pairs currently:
  **UB 10, BR 11** (others ≥12). Zero-hook ~112/268. Banked subtypes awaiting
  payoffs: Wolf, Hydra, Construct, Hound, Spider.

## Wave 1 protocol (agreed, ready to run)

**Goal:** new-niche recruiting payoffs that give plan-poor pairs more viable
plans and hook the vanilla ocean. Target: every pair ≥ 12 plans (assay §2).

**The brief (Goodhart-proofed — agents never hear "payoff" or see the graph):**
deal each designer a HAND of ~8-10 real low-hook cards in the target colors and
ask: *"Design ONE new card that would make a drafter excited to already own
these."* Hands are not pre-screened for has-iness — discovering the latent
value is the designer's job. Full card freedom (cost/stats/effect), modest
roguelike power register, 2-3 pitches per designer, implementable in current
wire format OR names its ≤2-line vocabulary price (new extraction rule).

**Pipeline (inherits Wave 1.5 architecture):**
1. Deal hands: different hand per designer = the entropy source (no Wikipedia
   needed; optional hybrid seed for 1-2 batches via card-pitch-generator skill).
   Target UB and BR first. Sonnet finders (model choice measured: no effect —
   Sonnet 9% vs Opus 9% flag rates in Wave 1.5; brief > model).
2. **ONE fresh-context Fable killer** (Joe: Fables are expensive; also Wave
   1.5's 3-chunk split caused a cross-chunk inconsistency — one killer is
   cheaper AND more consistent). Killer criteria: flavor-truth, power sanity,
   wire legality, no identity duplication, and — softened per the lord-
   experiment re-read below — *prefer new niches; same-tribe payoffs
   acceptable only if strongly differentiated*.
3. Deterministic graph annotator (scratchpad annotate_wave15.js pattern):
   per survivor, recruit count = existing cards gaining their FIRST strong
   edge. This is Wave 1's success number.
4. Warm-context curation doc → Joe cuts → implement one card at a time via
   the magiclike-card-implementation skill, assay rerun after.

**Workflow gotcha:** Workflow args can arrive as a JSON string — scripts must
`typeof args === 'string' ? JSON.parse(args) : args`. Agents read their batch
files from scratchpad paths (args stay small).

## The lord-injection experiment — data + revised conclusion (Joe was right to push)

Injected N Patriarch-shaped wizard lords (identical anthem shape), wizard-
committed deck, ~150 buckets/config:

| Injected lords | Wizard share of offered cards | Patriarch in % of buckets |
|---|---|---|
| 0 | 20% | 21% |
| 1 | 29% | 30% |
| 2 | 37% | 37% |
| 3 | 34% | 37% |

Harmonic duplicate-damping in deck-affinity: no measurable effect (deleted).
Detail run (+2 lords): of 34 Arcanum buckets — 19 Patriarch-only, **11
new-lord-only**, 4 both.

**Caveats Joe raised, accepted:** clones-in-shape only (differentiated payoffs
untested); ±4-5pp sample noise; anchor-diversity wasn't the measured metric.
**Revised conclusion:** same-tribe payoffs do NOT reduce a tribe's total
gravity (share stays/grows), but they DO rotate the anchor (~1/3 of tribal
buckets anchored by the new payoff without the hub). "New niches only" was too
strong; the softened killer rule above is current policy.

## Decision ledger (don't re-litigate without Joe)

- No deck-wide copy cap (4-copy rule was an unauthorized MTG import — removed).
- No owned-card damping multiplier (Joe: aesthetic rejection).
- Third color: soft ×0.05 penalty, never a ban; one hard law: bucket ≤2 colors.
- giant_spider stays Insect (register choice; Joe tracks the smell manually).
- Scripted bosses stay scripted; generator-built opponents plausible for
  non-boss enemies later.
- Fables: use sparingly — one killer per wave unless yield > ~40 proposals.
- Grizzly Bears opens every review batch (the joke IS the calibration probe).

## Artifacts & instruments

- `tests/pool_assay.js` — pool health (hub share / plans-per-pair / hooks / census).
- Claude artifacts: "The Constellation" 🌌 (pool synergy map), "The Depth
  Assay" 🔬 (pool-vs-algorithm verdict + breakpoint experiments).
- Scratchpad (container-lifetime only): wave15/ (batches, results.json,
  survivors.json), annotate_wave15.js, draft_step.js (stepwise draft player).
- Wave 1.5 curation doc delivered to Joe 2026-07-07 (5 recommended, 4 shipped).
