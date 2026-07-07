# Plan: Pool Interconnection Waves (Wave 1.5 ✅ / Wave 1 protocol agreed)

**Status (2026-07-07):** Wave 1.5 executed and shipped (v2.2.7). Wave 1 protocol
agreed with Joe, NOT yet run. This doc is the session handoff — state, protocol,
measured findings, and decision ledger. Companion: [`plan-bucket-draft.md`](plan-bucket-draft.md)
(the Growing Deck system this all serves), `reference/html-proto/tests/pool_assay.js`
(the metrics instrument — run it before and after any wave).

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
