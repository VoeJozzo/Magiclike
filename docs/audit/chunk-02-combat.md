# Chunk 2 — Combat (`engine.js` L5213–5371 damage core + declaration legality, keyword gates, combat-state lifecycle)

> Tier 2. **4-lens Workflow fan-out** (rules correctness, state-mutation discipline,
> structural footguns, test quality) **over a frozen anchor snapshot + adversarial
> verify per finding — 39 agents + 7 verifier re-runs after a usage-wall resume.**
> Anchor SHA **`6327c73`** (frozen snapshot at
> `%TEMP%/audit-anchor-6327c73`; verifiers worked from scratch copies, never the
> snapshot itself). Canon set: `docs/wiki/rules/` (800, 900, 1100 + chunk-1's 500/600/
> 1000 where cited), `docs/PROTOCOL.md`, `docs/DIVERGENCE.md`,
> `reference/html-proto/BACKLOG.md`, plus the existing tests' stated expectations.
> Date 2026-06-10.
>
> Cross-lens duplicates are deduped below; "found independently by N lenses" is noted
> where it applies (it strengthens the finding). The headline trample complex was found
> independently by **all four lenses**. 3 refuted claims in the appendix — all three
> are lens-variants of one canon misreading, which is itself a useful datum.

## Mutation-map note (governs ship gate this chunk)

The mutation map is **COMPLETE for `engine.js` at 45% killed**, and the combat region
is worse than the file average: **200 of 303 regional mutants survived** (66%) in
L4980–5800 (`C:/Users/Joe/.config/magiclike/audit/mutation/engine-combat-region-survivors.txt`).
**Line-number caveat:** the survivor file was generated at the chunk-1 SHA; its line
numbers are a consistent **+28 offset** to anchor `6327c73` (verified at 6 sample
points: map-L5251 `livingBlockers.length === 0` = anchor 5279). Survivor citations
below give both.

Unlike chunk 1, this region's survivors are NOT padded with near-equivalent noise:
the test-quality lens live-ran two mutant batteries at the anchor — **nine of ten
simultaneous behavior-deleting combat mutants left the full suite green (1786/1786)**,
and the single catch is an accidental coupling (A2-13). The suite's entire behavioral
combat coverage is one unblocked 2-power attack (test_seal_thief_courier.js:112).

**Calibration-day policy applied here:** every behavioral fix in this chunk
**stages** — the map shows the touched regions are maximally dark, which per the
autonomy ladder is precisely the demotion condition. **Ship** class is reserved for
docs/comment-only items with zero behavior change (gate: suite + lint green). The
extra weight this chunk: the dark region is the exact code **DIVERGENCE C1/C2 (🔴 BIG)
designates as the spec the Godot port must harmonize to** — coverage here is a
prerequisite for the port work, not just hygiene.

---

## A1-3 upgrade (cross-chunk confirmation) — indestructible at toughness ≤ 0

**Not a new finding** — chunk 2's rules lens independently re-derived chunk-1's
**A1-3** (checkDeaths' indestructible `continue` skips all three death causes,
anchor `engine.js:4747` = chunk-1's 4720–4727) via the combat path, without reading
chunk 1 first. What's new this chunk:

- **In-pool live repro, executed by the verifier:** Iron Statue
  (`cards/iron_statue/card.json`, 0/5, printed indestructible) + 3× Sicken
  (`cards/sicken/card.json`, −2/−2 flash pump; `EFFECTS.pump` accepts negatives) →
  the statue sits at **0/−1 and survives the SBA sweep** — verifier output: *"BUG
  CONFIRMED: Iron Statue still on battlefield at toughness −1."* It then fully heals
  at cleanup when the temp debuff wears off. This hardens A1-3 from "real-pool route
  confirmed" to "live-executed with two printed cards."
- **The canon page lies about itself:** `docs/wiki/rules/1100-state-based-actions.md`'s
  own *"Implementation status: 1101 zero-toughness check: implemented"* line is
  **FALSE** for indestructible creatures — the same page's canon text says they
  "still die at 0 toughness." That doc correction is ship-class → filed as **A2-12**.
- **Interaction with this chunk:** an A1-3 survivor (alive at t ≤ 0) is the second
  reachability route into A2-2's `lethalNeeded === 0` misclassification.
- The verifier confirmed the canonical fix (gate the indestructible skip to the
  damage/deathtouch arms only) leaves test_rules_infra F2 green.

**Disposition unchanged:** A1-3's staged decision packet stands, confidence raised by
independent re-derivation + live in-pool repro. No new ID; A2-12 carries the docs half.

---

## Findings

### A2-1 — Two-pass first-strike damage reads LIVE keywords for the pass-2 filter: a lord dying in pass 1 makes its granted creature deal combat damage in BOTH passes (double damage)
- **Location:** `reference/html-proto/js/engine.js:5240` (pass-2 filter; pass-1 at
  :5236, between-pass sweep at :5237 → :4936) @ `6327c73`
- **Dimension:** 1 (rules correctness) + 3 (combat-state lifecycle)
- **Severity:** P1
- **Evidence (verifier-confirmed; live-executed twice — finder AND verifier wrote
  independent repros):** pass-1 filter `c => c.keywords.includes('first_strike')`
  (:5236) and pass-2 filter `c => !c.keywords.includes('first_strike')` (:5240) are
  evaluated at call time against the mutable `card.keywords` array. Between passes,
  `afterEffectsApplied()` runs checkDeaths; a dying lord's
  `clearRestrictionsFromSource` (:4762 → :4456–4490) splices the granted keyword out
  (:4481–4484) — the survivor re-passes the pass-2 `!first_strike` filter and deals
  damage **again**. Live with the current pool: skyfire_drakelord (3/4 FS, grants
  FS+1/+1 to Dragons) and 7 first-strike cards that can kill it in pass 1. Verifier
  repro (public actions only): Goblin Raider made a Dragon dealt 3 (pass 1, granted
  FS), lord + blocker traded, grant revoked, raider dealt 2 more (pass 2) — defender
  took **5 vs the canon-correct 3**. Inverse corollary (creature *gaining* FS between
  passes deals **zero** combat damage) follows from the same two live filters. The
  grant/revoke machinery itself is correct and pinned (test_lord_keyword_grants.js) —
  only its interaction with the strike-pass filters is broken, and that interaction
  is untested.
- **Canon:** `docs/wiki/rules/800-combat.md` §803 pass-2 bullet — first-strike
  creatures that survived pass 1 "contribute no further damage in our current
  implementation." The repro violates the page's own stated implementation.
- **Fix sketch:** snapshot first-strike membership ONCE in resolveCombatDamage before
  pass 1 (`const fsIids = new Set(...)`), pass `c => fsIids.has(c.iid)` /
  `c => !fsIids.has(c.iid)` to the two dealCombatDamage calls. Fixes both directions.
  Red→green test reproducing the lord-death scenario.
- **Effort:** small + its own regression test.
- **Verification status:** survived adversarial refutation, confidence high (verifier
  built an independent repro from the public API; "CLAIM CONFIRMED").
- **Remediation class: STAGE** (behavioral; dark region).
- **Predicted test impact:** none — no test references resolveCombatDamage/
  dealCombatDamage; test_lord_keyword_grants.js never enters combat.
- **Mutation-map judgment (why stage):** survivor `map-L5212 drop-!` (= anchor 5240)
  — **deleting the pass-2 filter negation outright is invisible to the suite**, and
  the test-quality battery confirmed it live (filter inverted → 1786/1786 green).
  The exact line being edited is unfenced.

#### Decision packet for A2-1 (stage — plain English)
First strike works in two waves: first-strikers hit first, then everyone else hits.
The engine decides who belongs to wave two by checking the keyword **at wave-two
time** — but deaths from wave one are processed in between. So if a "captain" creature
granting first strike to its squad dies in wave one, its squad members lose the
keyword mid-combat and the engine lets them hit **again** in wave two — double damage.
(Mirror bug: a creature that *gains* first strike mid-combat hits zero times.)
- **Option (only one, confidence: high):** take attendance once, before wave one —
  remember who had first strike when damage started and use that list for both waves.
  Small fix, comes with its own test. This is reachable today with Skyfire Drakelord
  and any first-strike blocker; it stages only because the combat code has no test
  coverage at all (the mutation map proves the suite is blind here).

---

### A2-2 — Trample/`lethalNeeded === 0` complex: a blocker already marked to full toughness is classed "unsatisfied" — ALL trample carryover suppressed, and the attacker's whole remainder dumped onto a creature that needs 0 more
- **Location:** `reference/html-proto/js/engine.js:5319` (assignment guard; lethalNeeded
  at :5313–5315, unsatisfied/dump arms at :5329 + :5352–5367) @ `6327c73`
- **Dimension:** 1 (rules correctness) + 2 (default-arm misclassification +
  comment-contradicts-code)
- **Severity:** P1 (the chunk's most-confirmed finding) — **found independently by
  all 4 lenses**, live-reproduced by four separate verifier scripts.
- **Evidence (verifier-confirmed ×4):** `lethalNeeded = Math.max(0, bTou - blk.damage)`
  is 0 for a *living* blocker only when it is indestructible with full-toughness
  damage already marked (checkDeaths kills any non-indestructible at that point; F2
  deliberately retains marked damage on indestructibles) — or an A1-3 t ≤ 0 survivor.
  The satisfied branch requires `remaining >= lethalNeeded && lethalNeeded > 0`, so
  the zero-need blocker lands in `unsatisfied`, which (a) kills the trample-to-player
  branch and (b) receives the **entire** leftover dump. Live repros at anchor: Iron
  Statue (0/5 indestructible) pre-marked to 5 blocking a 6/6 trampler → defender takes
  **0 instead of 6**, log *"piles 6 extra damage onto Iron Statue."* Control runs
  prove it's boundary-only: pre-mark 3 (lethalNeeded 2) carries over correctly.
  Contradicts the code's own comments at :5290 ("Indestructibles … still need
  lethal-equivalent damage to enable trample carryover" — here it's already fully
  marked) and :5347–5351. Reachable today: iron_statue + any burn/ping in the
  COMBAT_BLOCK priority window + any of the pool's 15 trample cards (or the
  first-strike pass of an FS trampler doing the pre-marking itself).
- **Canon:** `docs/wiki/rules/800-combat.md` §803 — with trample "the attacker need
  only assign each blocker's *remaining toughness* worth of damage (not more) before
  considering the blocker satisfied"; remaining toughness 0 ⇒ satisfied with 0.
  Matches real MTG 510.1c.
- **Fix sketch:** treat `lethalNeeded === 0` as satisfied — restructure to
  `if (atkDeals && remaining >= lethalNeeded) { if (lethalNeeded > 0) { …assign,
  lifelink, recordDamage… } } else { unsatisfied.push(fb); }` so a zero-need blocker
  neither takes damage nor blocks carryover. (The `> 0` inner guard keeps its
  legitimate job: no 0-damage recordDamage falsely staking a kill claim.) Footguns
  lens also adjudicated the dump branch's missing `dealtDeathtouch` stamp
  (:5357–5361 vs :5322): **unreachable-for-deathtouch both before and after this
  fix** — no change needed there.
- **Effort:** small (one conditional restructure) + regression test.
- **Verification status:** survived adversarial refutation four times, confidence
  high; every verifier executed an independent live repro.
- **Remediation class: STAGE.**
- **Predicted test impact:** none — no test exercises combat trample at all (the only
  trample mentions in tests/ are text-generation and icon-rendering).
- **Mutation-map judgment (why stage):** the exact guard's boundary mutants survive —
  `map-L5291` (= anchor 5319) `>->>=` on `lethalNeeded > 0`, plus the whole
  unsatisfied-arm cluster `map-L5325/L5329` (= anchor 5353/5357) and the carryover
  condition `map-L5252 &&->||` (= anchor 5280). The branch is provably dark.

#### Decision packet for A2-2 (stage — plain English)
Trample means leftover damage rolls over to the player once each blocker has taken
"enough to die." The engine asks "how much more does this blocker need?" — and when
the answer is **zero** (an unkillable Wall that already took a full dose of burn
damage earlier in the turn), it bizarrely treats that as "this blocker isn't handled
yet," cancels ALL rollover to the player, and piles the attacker's entire damage onto
the wall that needed nothing. A 6-power trampler hits for 0 instead of 6.
- **Option (only one, confidence: high):** "needs zero more" counts as handled —
  three-line restructure of one if/else, plus a test (pre-damaged Iron Statue blocking
  a trampler → full rollover). The rulebook, real Magic, and the code's own comments
  all agree on the answer; it stages only because no test anywhere exercises trample.

---

### A2-3 — Ghost attacker via bounce + re-cast: cast arrivals do NOT re-mint iids, so a flash creature bounced and re-cast in the block window re-matches its stale `G.attackers` entry and deals combat damage while sick, untapped, and never re-declared
- **Location:** `reference/html-proto/js/engine.js:5074` (resolveTopOfStack cast
  arrival, :5066–5076; iid mint sites are exactly :694/:822 (makeCard/makeToken) and
  :1873 (placeCardOnBattlefield, move_card path only)) @ `6327c73`
- **Dimension:** 1 (rules correctness)
- **Severity:** P2
- **Evidence (verifier-confirmed by live execution):** bounce (affectOneCreature
  sev 2, :1826–1838) pushes the same object to hand, iid unchanged; the CAST arrival
  path pushes the same object back with its existing iid; `G.attackers` is never
  pruned on leave-play (chunk-1 A1-8); dealCombatDamage's only guard is
  battlefield-scoped findCard (:5263) — which the re-cast creature now satisfies.
  **In-pool line, live-executed:** two Quicklings + 4 mana. Declare Quickling A
  (flash flying 2/1) as attacker; in the COMBAT_BLOCK priority round flash-cast
  Quickling B targeting A with its ETB bounce; re-cast A from hand; pass to damage —
  A (sick=true, untapped, never re-declared this combat) dealt 2 to the defender
  (verifier: life 20→18, "CLAIM CONFIRMED"). Symmetric hole for stale `G.blockers`
  entries. **This is the concrete new consequence of A1-8, and it falsifies chunk-1
  R2's refutation premise** ("iids re-mint on every battlefield arrival") — re-mint
  exists only on the move_card/flicker path, not the cast path. See "Chunk-1 leads
  resolved" below.
- **Canon:** `docs/wiki/rules/800-combat.md` §801 (attackers are declared by tapping
  in step 505 — this creature attacks without declaration) + `900-keywords.md` §901.1
  (sick creatures can't attack without haste).
- **Fix sketch (genuine fork):** (a) prune the iid from `G.attackers`/`G.blockers` in
  the leave-battlefield path — targeted, also resolves A1-8's flag-hygiene residue;
  or (b) extend the §3.7 iid-mint-on-arrival rule to the cast path so every
  battlefield arrival is a fresh identity — more uniform, but touches targeting of
  on-stack creatures. Bundle with A2-5 either way (one "remove from combat" concept).
- **Effort:** small–medium; needs a regression test driving the two-Quickling line.
- **Verification status:** survived adversarial refutation, confidence high; full
  working repro executed (`$TEMP/ghost-atk-verify/repro.js`).
- **Remediation class: STAGE** (genuine fork + dark region).
- **Predicted test impact:** none — grep shows no test pins `G.attackers` contents
  (the only hits are a comment and a reset helper).
- **Mutation-map judgment (why stage):** the `G.attackers` lifecycle is unpinned
  end-to-end — `map-L4992 >->>=` (the zero-attackers boundary) and the blocked-map
  classifier `map-L5192 drop-!` (= anchor ~5220) survive, and chunk-1's combat
  flag-lifecycle bool-flips all survive. No assertion anywhere notices a creature
  attacking without being declared.

#### Decision packet for A2-3 (stage — plain English)
The game remembers attackers by ID number. A creature keeps its ID when it's bounced
to your hand and re-cast — so with two Quicklings (cheap flash creatures that bounce
things) you can bounce your own declared attacker mid-combat and replay it: the game
recognizes the returning ID as "still attacking," and it deals combat damage even
though it's freshly summoned (should be sick), untapped, and was never re-declared.
A free rules-breaking pseudo-attack for 4 mana, possible with today's cards.
- **Option A (recommended, confidence: medium-high):** when a creature leaves the
  battlefield, cross it off the attacker/blocker lists right then. Targeted, also
  cleans up chunk-1's A1-8 booby trap, and naturally bundles with A2-5's fix.
- **Option B:** give every arriving creature a brand-new ID even when cast normally
  (today only "blink"-style moves do that). More uniform long-term, but touches how
  spells target creatures on the stack — bigger blast radius.

---

### A2-4 — `declareAttackers` legality accepts duplicate iids: one creature attacks N times — N× combat damage, N× lifelink, N× 'attacks' trigger emissions
- **Location:** `reference/html-proto/js/engine.js:6016` (legality loop, :6013–6021;
  storage at :5557, emission at :5566–5572, damage at :5262) @ `6327c73`
- **Dimension:** 1 (rules correctness) / 2 (structural footgun — hand-synced validator
  pair diverged)
- **Severity:** P2 — **found independently by 3 lenses**, all three verifiers
  live-reproduced it (one 2/2 declared thrice dealt 6; aether_voyager's attacks
  trigger drew 2 cards on a duplicate declare vs 1).
- **Evidence (verifier-confirmed ×3):** the legality case loops per-iid (findCard +
  canCreatureAttack, pure reads — a repeated iid passes every iteration) with **no
  uniqueness check**, in direct contrast to its sibling `declareBlockers` case
  (:6026–6031, `usedBlockers` Set). executeAction gates only on isLegalAction
  (:6687–6693), and the do* handler block documents "they assume the action has been
  validated by isLegalAction()" (:5375) — so the contract violation is the engine's.
  `doDeclareAttackers` stores `cardIids.slice()` verbatim and emits 'attacks' per
  entry; `dealCombatDamage` deals per entry. Latent in practice: the UI toggle
  (controller.js) and AI subset builders emit unique lists — but executeAction is the
  public protocol surface (tests, console, imported actions, future callers).
- **Canon:** `docs/wiki/rules/800-combat.md` §801 step 505 — attackers are declared
  by tapping each; set membership, one attack role per creature.
- **Fix sketch:** mirror the blockers guard — a seen-Set in the declareAttackers
  legality case rejecting re-use (reject, not dedupe, matching the sibling's
  semantics) + a unit test asserting `[X,X]` is rejected.
- **Effort:** 3 lines + test.
- **Verification status:** survived adversarial refutation three times, confidence
  high.
- **Remediation class: STAGE** — the answer is single and unambiguous (normally
  ship-shaped), but the touched region is dark per the map and the fix's test is the
  region's first; calibration-day policy demotes. Smallest packet in the chunk.
- **Predicted test impact:** none — the only declareAttackers caller in tests/
  (test_seal_thief_courier.js:103) uses a single unique iid.
- **Mutation-map judgment (why stage):** the declare-handler cluster survives
  wholesale (`map-L5531–5532` = anchor 5559–5560, including the attacker-tap write —
  see A2-6 sub-point b), and no test passes a duplicate list. Unfenced seam.

#### Decision packet for A2-4 (stage — plain English)
When blocks are declared, the engine checks "no blocker used twice." When attacks are
declared, the matching check was never written — so the raw engine command "attack
with creature #7, #7, #7" is accepted and one creature deals triple damage (and fires
its attack triggers three times). No button in the UI can produce this; it's a hole
in the engine's own rule-checking surface that tests and future code paths drive
directly.
- **Option (only one, confidence: high):** add the same three-line uniqueness check
  the blocker side already has, plus a test. A "yep, ship it" nod — staged only
  because the surrounding code has zero coverage and policy says fixes in dark
  regions arrive with their own tests.

---

### A2-5 — `change_control` does not remove a creature from combat: a mid-combat control change leaves it in `G.attackers`/`G.blockers`, and it deals combat damage TO ITS OWN NEW CONTROLLER (lifelink credited to them too); a stolen vigilance attacker can legally block ITSELF
- **Location:** `reference/html-proto/js/engine.js:2690` (change_control, :2690–2708;
  damage routing at :5215/:5262–5277) @ `6327c73`
- **Dimension:** 2 (structural footgun — the A1-8 ghost-guard contract has a hole for
  stay-on-battlefield relocations) + 1 latent rules correctness
- **Severity:** P2 (latent today; correctness-high the day it goes live) — **found
  independently by 2 lenses**, and independently re-derived by both chunk-1
  lead-resolution analyses (state + testquality). Four verifiers executed simulated
  repros; all confirm.
- **Evidence (verifier-confirmed ×4, live-executed with a seeded mid-combat swap):**
  change_control splices the card between battlefields and touches nothing else —
  the only combat-list surgery anywhere in the file is the staple-remap
  (:2904–2937) and the wholesale resets (:6512/:6650). findCard searches BOTH
  battlefields, so unlike death/bounce/Steal the swapped card still resolves —
  the A1-8 "consumers findCard-guard ghosts" contract is escaped. dealCombatDamage
  fixes `defender = opp(G.activePlayer)` (:5215) but reads `atkCtrl = fa.controller`
  live (:5265): repro showed the defender taking 2 from the creature it now controls
  (20→18) while the original controller took nothing; with lifelink the heal goes to
  the defender too. Self-block legality confirmed: `canCreatureBlock(X, X)` passes
  for an untapped vigilance attacker post-theft. **Latency verified hard:**
  mind_control/threaten are sorcery-window-only; the only flash-speed control changer
  (Steal) is safe *only because* `EFFECTS.steal` re-mints a fresh instance into the
  thief's library (the stale iid then findCard-fails) — switch Steal off the
  `transfer_ownership` path, or land any flash/triggered change_control, and this
  flips live silently. The COMBAT_BLOCK priority window that would expose it already
  exists.
- **Canon:** no rules page defines removal-from-combat on controller change (real MTG
  CR 506.4c) — itself a §800 canon gap worth one sentence when this is fixed.
  Verifier bonus: lifelink/damage attribution uses the NEW controller, widening the
  blast radius beyond damage routing.
- **Fix sketch:** prune the moved iid from `G.attackers` and delete/retarget
  `G.blockers` entries inside change_control, mirroring the staple-remap surgery —
  or fold into A2-3's shared "remove from combat" helper (recommended: one concept,
  one helper, fixes both). Plus the §800 canon sentence and a DIVERGENCE note.
- **Effort:** small, best bundled with A2-3.
- **Verification status:** survived adversarial refutation four times, confidence
  high (every verifier's checklist fully passed, e.g. 6/6 and 7/7).
- **Remediation class: STAGE** (behavioral; bundles with A2-3's fork).
- **Predicted test impact:** none — test_change_control.js has zero combat coverage.
- **Mutation-map judgment (why stage):** the unblocked-damage arm's operator mutants
  survive (`map-L5244` = anchor 5272 cluster) and nothing pins damage routing vs
  controller; change_control itself (L2690) sits outside the combat extract but its
  combat consequence lands squarely in the dark region.

#### Decision packet for A2-5 (stage — plain English)
"Take control of a creature" effects move the creature to your side but never tell
the combat bookkeeping. If that ever happens mid-combat, the stolen attacker keeps
attacking — and since "the defender" was decided at the start of combat, it deals its
damage to **you, its new owner** (and its lifelink heals you for hurting yourself).
It could even be assigned to block itself. No card today can do this mid-combat
(the steal spells are main-phase-only, and the one flash steal happens to dodge it
by a quirk), but the first flash-speed or triggered steal makes it live with zero
warning.
- **Option (recommended, confidence: high):** when a creature changes sides, remove
  it from combat — a few lines, the same pattern an existing subsystem (staple-merge)
  already uses. Bundle it with A2-3's fix so "leaving combat" lives in one helper,
  and add one sentence to the rulebook saying control change removes from combat.
- **Cheaper alternative:** a damage-time guard (skip attackers whose controller is
  now the defender). Works, but leaves the stale bookkeeping in place for the next
  consumer to trip on.

---

### A2-6 — Combat coverage darkness (dimension 5, merged): the entire combat-damage core, keyword layer, and declaration legality are provably invisible to the 1786-assertion suite — the exact region DIVERGENCE C1/C2 designates as the Godot port's spec
- **Location:** `reference/html-proto/js/engine.js:5251` (dealCombatDamage; sub-points
  below) + `reference/html-proto/tests/` @ `6327c73`
- **Dimension:** 5 (test-coverage gap)
- **Severity:** P2 — **found independently by 4 lenses** (one finding each from rules,
  state, footguns; two from testquality), merged here. Every sub-point was verified
  by *actually running the mutants* against the full suite.
- **Evidence (verifier-replicated live mutant batteries at the anchor):**
  1. **Blocked combat deletable wholesale:** four simultaneous mutants — blocked
     attackers assign zero damage, blockers never strike back, menace lone-block
     rejection deleted, flying/reach block gate deleted — **suite 1786/1786 green.**
  2. **Keyword layer lobotomized:** five simultaneous mutants — attackers never tap
     (vigilance meaningless), combat deathtouch never marks, combat lifelink deleted,
     trample spill deleted, first-strike pass-2 filter **inverted** — **1786/1786
     green.** (Verifier nuance: the FS mutant is likely unreached rather than
     unasserted — no test stages an FS combat at all; the other four sit on
     live-but-unasserted paths.)
  3. **The one pin, honestly stated:** the bare unblocked-attacker→player damage
     amount IS pinned, incidentally, by test_seal_thief_courier.js:112 (a life check
     inside a trigger test) — `if (false)`-ing the unblocked branch fails 7
     assertions. Everything else in the core is dark; "ZERO coverage" claims carry
     this one carve-out.
  4. **Survivor clustering (testquality's read of the 200):** ~85 in
     dealCombatDamage's blocked path + keywords (sub-points 1–2, findings A2-1/2),
     ~25 in the declare handlers incl. the attacker-tap write (A2-4), ~30 in
     doPass/whoHasPriority combat gates (chunk-1 A1-23's full-turn-test territory —
     cited, not re-filed), ~60 in non-combat code interleaved in the region
     (resolveTopOfStack rip/modal/mana — chunks 3/4, noted not filed).
  5. **Why it outranks ordinary test debt:** §802–803's blocked-combat algorithm is
     canon-pinned prose with no executable spec, and DIVERGENCE C1/C2 (🔴 BIG) tells
     the Godot port to harmonize to this code. Any regression introduced while
     porting or refactoring is invisible.
- **Fix sketch:** one `tests/test_combat_damage.js` driving the real machine
  (declareAttackers/declareBlockers/pass via executeAction; the chunk's repro scripts
  are ready seeds): unblocked/blocked/multi-block kill-value ordering, FS two-pass
  incl. the lord-death pin (A2-1), trample boundaries incl. lethalNeeded 0/partial
  (A2-2), deathtouch threshold + dealtDeathtouch SBA pickup, lifelink totals + the
  life_changed emission (A2-8), menace lone-block rejection (A2-15), vigilance
  no-tap, dup-attacker rejection (A2-4), sick-attacker rejection (A2-13). Estimated
  to kill 60+ of the 200 survivors. Land BEFORE any C1 harmonization reads this code
  as spec.
- **Effort:** medium (one test file, ~30 assertions; harness patterns exist in
  test_lord_keyword_grants.js / test_seal_thief_courier.js).
- **Verification status:** survived adversarial refutation (every battery
  independently re-run by verifiers), confidence high.
- **Remediation class: PARK (test additions)** — the ladder allows landing new tests
  anytime; the staged A2 fixes each bring their own red→green slice of this battery,
  and the remainder is the recommended consumption.
- **Predicted test impact:** additive only.

---

### A2-7 — Deathtouch's lethal-damage threshold carves out indestructible blockers (full remaining toughness instead of 1) — code comment asserts it as deliberate; canon states the rule unqualified. Code-vs-canon fork needing adjudication
- **Location:** `reference/html-proto/js/engine.js:5313` (ternary + comment at
  :5310–5312) @ `6327c73`
- **Dimension:** 1 (rules correctness fork, deliberate-looking)
- **Severity:** P3 — **found independently by 2 lenses.**
- **Evidence (verifier-confirmed with live repros):** `lethalNeeded = (atkDeathtouch
  && !indestructible) ? Math.min(1, …) : Math.max(0, bTou - blk.damage)`. Canon
  (`800-combat.md` §803 "drops to 1 damage per blocker"; `900-keywords.md` §902.3)
  has no indestructible exception; §903.1 scopes indestructible to the destruction
  outcome only. Real MTG (702.19g / 510.1c) sides with canon. **Verifier upgraded
  observability:** no printed card has deathtouch+trample, but the sticker pool makes
  the combo reachable in a real run — executed: deathtouch attacker with sticker
  trample vs Iron Statue tramples **0 under current code vs 2 under canon** (a direct
  defender-life fork), and a deathtouch+lifelink attacker gains 3 vs canon's 1.
  The canon-patched engine passes the full suite 1786/1786 — nothing pins the
  carve-out. **Cross-chunk coupling:** `ai.js:778` mirrors the identical carve-out —
  engine and AI must change together (chunk-7 note).
- **Canon:** `800-combat.md` §803 L38/L42 + `900-keywords.md` §902.3 vs the in-code
  comment.
- **Fix sketch (the fork is the work):** (a) follow canon/real-MTG — drop
  `!indestructible` from the ternary (+ ai.js:778) — or (b) keep the house rule and
  write the carve-out sentence into §803/§902.3 + a DIVERGENCE row. The rules-lens
  verifier recommends (a); the state lens finds (b) defensible (prevents deathtouch
  trivially satisfying trample against unkillable walls). Genuinely Joe's call.
- **Effort:** tiny either way; the decision is the work.
- **Verification status:** survived adversarial refutation twice, confidence high.
- **Remediation class: STAGE** (canonical genuine fork).
- **Predicted test impact:** none — no test file contains "deathtouch" at all;
  verified the canon-patched engine stays 1786/1786.
- **Mutation-map judgment:** the ternary's cluster (`map-L5285–5291` = anchor
  5313–5319) survives wholesale.

#### Decision packet for A2-7 (stage — plain English)
Deathtouch normally means "1 damage counts as a lethal dose" when splitting combat
damage. The code makes an exception: against an unkillable (indestructible) blocker,
a deathtouch attacker must still assign the blocker's FULL toughness before anything
tramples over. The comment says this is on purpose; the rulebook never mentions the
exception, and real Magic doesn't have it. With stickers this is reachable in a real
run and changes actual life totals.
- **Option A (recommended by the verifier, confidence: medium-high):** follow the
  rulebook and real Magic — deathtouch counts as 1 even vs indestructible. One-token
  code change (in two files — the AI mirrors the math), tests stay green.
- **Option B:** keep the house rule (it does stop deathtouch from trivially bypassing
  unkillable walls — a defensible design taste) and write the exception INTO the
  rulebook so canon and code agree.
Either way one sentence somewhere changes; what's not okay is the current silent fork.

---

### A2-8 — Combat lifelink's `life_changed` emission omits `source_iid`, unlike both siblings — and a real consumer exists today (noSelfCascade + Codex-built "you gain life" triggers behave inconsistently)
- **Location:** `reference/html-proto/js/engine.js:5260` (applyLifelink emit; siblings
  at :1751 and :2344) @ `6327c73`
- **Dimension:** 2 (copy-paste divergence / event-shape inconsistency)
- **Severity:** P3
- **Evidence (verifier-confirmed, live-executed):** the emit passes
  `{type:'life_changed', who, delta}` while applyDamageFrom and gain_life both attach
  `source_iid: ctx.sourceIid`; the event-shape doc (triggers.js:7) declares the field.
  **Verifier strengthened the finder:** "no current consumer" is wrong — the
  noSelfCascade guard (triggers.js:360–362) reads `evt.source_iid` for every event,
  and Codex-built `youGainLife` triggers are assembled with `noSelfCascade: true`. A
  lifelink creature carrying such a trigger is self-suppressed for spell-lifelink/
  gain_life gains but **fires off its own combat-lifelink gain** — reachable today
  via built triggers, not merely a future hazard (still niche, no loop).
- **Fix sketch:** add `source_iid: source.iid` to the :5260 emit. One line,
  behavior-invisible to all other current listeners.
- **Effort:** tiny.
- **Verification status:** survived adversarial refutation, confidence high
  (captured-event repro: gain event arrived with `source_iid` undefined).
- **Remediation class: STAGE** (behavioral one-liner in a dark region per policy —
  the same shape as chunk-1's A1-9; a one-nod approval, can ride any combat fix PR).
- **Predicted test impact:** none — no test references source_iid anywhere.
- **Mutation-map judgment:** the lifelink site's whole cluster survives
  (`map-L5225` ×4 = anchor 5253) — including outright guard inversion.

#### Decision packet for A2-8 (stage — plain English)
Events that say "someone's life total changed" are supposed to carry a tag naming
which card caused it. The combat-lifelink path forgets the tag (its two sibling paths
include it). One subtle real effect today: auto-generated "whenever you gain life"
abilities are built to ignore their *own* card's gains — but the missing tag means
they can't recognize combat-lifelink gains as their own, so they fire anyway.
- **Option (only one, confidence: high):** add the tag — a one-line fix matching the
  other two sites. Stages only by dark-region policy; bundle into any combat fix PR.

---

### A2-9 — "Which lords affect which creatures" is one fact in two hand-synced loops with divergent gates: the stat loop buffs ANY permanent (no Creature check), the keyword loop gates correctly; two lifecycle models for halves of one ability
- **Location:** `reference/html-proto/js/engine.js:1173` (getStats stat-buff loop,
  :1180–1188; keyword loop at :3303–3318 with the gate at :3309) @ `6327c73`
- **Dimension:** 2 (structural footgun — duplicated fact, divergent gating, naming lie)
- **Severity:** P3
- **Evidence (verifier-confirmed, divergence executed):** both loops iterate the
  battlefield, skip self, call matchFilter + buff.subtype — but only the keyword loop
  has `hasType(target,'Creature')`; matchFilter has no implicit creature gate. The
  verifier ran a lord with a subtype-free `{controller:'self'}` static_buff next to a
  Mountain: **getStats(mountain) = [1,1]** while the keyword loop correctly left
  `land.keywords = []` — same buff, two answers. Lifecycle divergence: stats
  recomputed live per getStats call vs keywords event-reconciled into card.keywords
  with grantedBy cleanup. `allCreatures` (:1176) actually holds every permanent
  including lands. **Behaviorally inert today** — all 10 in-pool static_buffs are
  subtype-scoped (verifier dumped them) — but matchFilter's min/max power/tough reads
  call getStats on arbitrary permanents, so the stat leak could affect targeting
  legality the day a loose-filter lord lands.
- **Fix sketch:** hoist one shared `lordBuffApplies(lord, lordCtrl, target, tgtCtrl,
  buff)` predicate (with the Creature gate) used by both loops; rename `allCreatures`
  → `allPermanents`.
- **Effort:** small–medium (shared predicate + behavior-preservation check).
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: PARK** — chunk-4 structural overlap: the rules lens
  independently flagged that the keyword half's reconciliation is **lazy/add-only**
  (grants go stale if a lord's filter stops matching without a leave-play event) —
  that's chunk-4 territory, and the right fix moment is when that structure is on the
  table. Natural companion to BACKLOG's duration-dedupe item (which owns the adjacent
  lifecycle duplication, explicitly not this filter duplication).
- **Predicted test impact:** none — test_lord_keyword_grants.js pins the keyword half
  only, and no in-pool card can expose the stat half's missing gate.

---

### A2-10 — `dealtDeathtouch` is an inverted name on a death-deciding flag: it marks the creature that was DEALT deathtouch damage (the victim), but reads as "this creature dealt deathtouch"  ⟶ SHIP (comment-only)
- **Location:** `reference/html-proto/js/engine.js:5322` (exemplar set site; also
  :5337, :1741; consumer :4745; whitelist/reset :672/:750/:840/:2434/:4295/:6580;
  +4 mirror sites in `js/ai.js` :696/:733/:783/:791) @ `6327c73`
- **Dimension:** 2 (comment hygiene / misleading identifier)
- **Severity:** P3
- **Evidence (verifier-confirmed):** `:5337 if (blk.keywords.includes('deathtouch'))
  atk.dealtDeathtouch = true;` — the BLOCKER has deathtouch, the ATTACKER gets the
  flag. A future reader pattern-matching the name (e.g. a "creatures that dealt
  deathtouch damage this turn" trigger) gets it exactly backwards. The Godot port
  already renamed the same concept `lethal_marked` (card_instance.gd:28) — the
  project's own adjudication that the name confuses. Verifier corrected scope: the
  mechanical rename is 14 sites (10 in engine.js + 4 in ai.js, the lines cited
  above), not ~9.
- **Fix (comment-only, per chunk policy):** add a clarifying comment at the field's
  whitelist entry and the three set sites ("victim-side lethality mark — the creature
  that RECEIVED deathtouch damage; Godot calls this lethal_marked"). **The mechanical
  rename itself would be trivia/stage** — flagged as a candidate for a chunk-2 trivia
  PR or to ride the A2-2 fix, not done as part of this ship.
- **Effort:** tiny. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: SHIP (comment-only)** — zero behavior change; gate is suite +
  lint green.
- **Predicted test impact:** none (no test references the field).

---

### A2-11 — Rulebook §800/§802 carry false implementation-status claims about the proto (each false sentence listed)  ⟶ SHIP (docs-only)
- **Location:** `docs/wiki/rules/800-combat.md:26,52` + `docs/wiki/rules/900-keywords.md:33`
  + stale cites in `docs/DIVERGENCE.md` C1/C3 @ `6327c73`
- **Dimension:** 2 (doc contradicts code; the docs are the lying side — code behavior
  verified correct or deliberate in every case)
- **Severity:** P3 — the L52 sentence found independently by **3 lenses**, the L26
  parenthetical by **2**; merged into one docs fix.
- **The false sentences, each verified against the code (and live-executed where
  noted):**
  1. **800-combat.md:52** — *"Currently the order is fixed at block declaration time
     (the order the defender declared them in) in both implementations."* False for
     the proto: dealCombatDamage re-sorts living blockers by the kill-value heuristic
     with indestructibles last (:5294–5299, deliberate per the comments at :5287–5290
     and :1427–1430). Live repro: a 1/1 declared FIRST survived while the 2/2 declared
     second died — kill-value order, not declaration order. Contradicts **line 49 of
     the same page** and DIVERGENCE C1 (both correct). The bullet's lead point (no MTG
     508.6 attacker-chosen ordering in either engine) is true; only the parenthetical
     mechanism is wrong — and it's the sentence a Godot porter doing C1 harmonization
     would read. Accurate for Godot (blockers[0]), so scope per engine.
  2. **800-combat.md:26** — the §802 parenthetical claiming a *"damage-time fallback
     that treats a lone-blocked menace attacker as unblocked is retained as a safety
     net"* — stated engine-neutrally, present tense. The proto has **zero menace
     logic in dealCombatDamage** (exhaustive grep); the fallback exists only in Godot
     (engine.gd:1087–1097), as the same page's own L50 and DIVERGENCE C3 correctly
     state. The "stale state" it describes IS reachable in the proto (kill the second
     blocker in the block window — verifier executed it, 10/10 checks): the proto
     resolves it as a **normal block**, which matches real MTG and beats the
     documented fallback — when harmonizing, proto's behavior is the better canon.
  3. **900-keywords.md:33** — the identical parenthetical verbatim; same fix.
  4. **Stale line cites:** DIVERGENCE C3 cites "engine.js:4842" (an unrelated slotIdx
     decrement at anchor; the menace check lives at :6038–6047); DIVERGENCE C1 cites
     "engine.js:4062–4153" (~1200 lines stale; actual :5251–5371).
  5. **Optional rider (residue from the three refuted claims):** §803's two *"Death
     triggers drain."* pass sentences are internally inconsistent with §605/§1004/
     §801.3 (no priority opens inside step 507, and drain ≠ resolve) — reword to
     "queued death triggers drain and resolve when priority next opens (MAIN2)."
- **Fix sketch:** scope L52's parenthetical per engine (proto: kill-value sort,
  indestructibles last; Godot: declaration order via blockers[0] until C1
  harmonization); scope the L26/L33 fallback parentheticals to Godot (and note the
  proto resolves the stale lone-block as a normal block — keep code, fix docs);
  refresh the two DIVERGENCE line cites; apply the §803 wording rider.
- **Effort:** small (a handful of doc lines). **Verification status:** every sentence
  survived adversarial refutation with code-read + live-execution evidence,
  confidence high.
- **Remediation class: SHIP (docs-only)** — recording reality changes no behavior;
  same precedent as chunk-1's A1-13/A1-18 (Godot details written as engine-neutral
  canon).
- **Predicted test impact:** none.

---

### A2-12 — Canon §1100's "Implementation status: 1101 zero-toughness check: implemented" is FALSE for indestructible creatures  ⟶ SHIP (docs-only)
- **Location:** `docs/wiki/rules/1100-state-based-actions.md` (Implementation status
  line) @ `6327c73`
- **Dimension:** 2 (doc-contradicts-code; the underlying behavior is chunk-1's A1-3)
- **Severity:** P3 (the ledger fix; the bug itself is A1-3's staged P1 packet)
- **Evidence:** carried by the A1-3 upgrade above — the same page's canon text says
  indestructible creatures "still die at 0 toughness," its status line claims the
  check is implemented, and the live-executed Iron Statue + Sicken repro proves it
  is not (for indestructibles). The status line must state today's truth now and gets
  a one-line update again when A1-3's staged fix lands.
- **Fix sketch:** qualify the status line — "1101 zero-toughness check: implemented
  for non-indestructible creatures; indestructibles are currently (incorrectly)
  exempted — see audit A1-3 (staged)."
- **Effort:** trivial. **Verification status:** carried by A1-3 + this chunk's
  verifier execution, confidence high.
- **Remediation class: SHIP (docs-only).** **Predicted test impact:** none.

---

### A2-13 — Summoning sickness is fenced by exactly ONE accidental, choreography-coupled assertion in 1786 — and that accidental fence sits on the A1-7 remediation path  ⟶ park (test addition)
- **Location:** `reference/html-proto/js/engine.js:885` (canCreatureAttack sick gate);
  accidental fence at `tests/test_rules_infra.js:132` @ `6327c73`
- **Dimension:** 4 + 5 (brittleness + coverage gap)
- **Severity:** P3
- **Evidence (verifier-replicated isolation run):** deleting the sick-check yields
  exactly **1785/1786** — the sole failure is F2's *indestructible-marked-damage*
  check, which trips via combat-skip choreography desync (the now-eligible fixture
  creature stops the no-attacker auto-skip at :6423 firing, and the test's
  advanceOnePhase loop desyncs from the SBA sweep it depends on) — not via any
  sickness assertion. No test asserts a sick creature can't attack or that haste
  overrides. The fence is likely to vanish or false-red under chunk-1 A1-7's
  decision packet (option B reworks exactly the empty-combat skip it rides on) or any
  combat-skip refactor.
- **Fix sketch:** three direct assertions — canCreatureAttack false for sick, true
  for sick+haste; isLegalAction declareAttackers rejection for a sick creature. Make
  the fence intentional **before** A1-7 remediation lands.
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high (mechanism traced live).
- **Remediation class: PARK (test addition;** fold into the A2-6 battery, sequenced
  ahead of the A1-7 packet).
- **Predicted test impact:** additive only.

---

### A2-14 — test_ui_targeting.js pins block legality by regex-matching controller.js SOURCE TEXT — false-reds on behavior-preserving renames while providing zero behavioral protection  ⟶ park
- **Location:** `reference/html-proto/tests/test_ui_targeting.js:90` @ `6327c73`
- **Dimension:** 4 (test brittleness — over-assertion of incidentals)
- **Severity:** P3
- **Evidence (verifier-confirmed, both failure modes executed):**
  `/ENGINE\.canCreatureBlock\(blkCard,\s*card\)/.test(SRC)` asserts variable names,
  not behavior. (a) Behavior-preserving rename `blkCard→blockerCard` → false-red
  (15/16). (b) Deleting the flying gate inside canCreatureBlock → full suite green,
  this test included. It is the suite's only canCreatureBlock reference of any kind.
  Mitigating intent: it doubles as an architectural delegation pin (with the L92–93
  anti-duplication regex), so a fix should replace, not delete.
- **Fix sketch:** behavioral controller-driven replacement (flying attacker → only
  the reach blocker is offerable / non-reach click refused), or at minimum direct
  canCreatureBlock unit gates — keeping the delegation intent guarded.
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: PARK** — same family as chunk-1's A1-4 (internals-coupled
  tests), distinct sub-class (source-regex); feeds the parked refactors'
  false-red/silent-green noise list and the A2-6 battery.
- **Predicted test impact:** the replacement removes a known false-red landmine.

---

### A2-15 — Menace enforcement has zero regression coverage at a site whose own comment documents a prior silent-failure bug of exactly this shape  ⟶ park (test addition)
- **Location:** `reference/html-proto/js/engine.js:6044` (check; the historical-bug
  comment at :6038–6043) @ `6327c73`
- **Dimension:** 5 (test-coverage gap with documented recurrence risk)
- **Severity:** P3
- **Evidence (verifier-replicated):** the comment records the Object.entries
  string-key coercion bug that once made this check "silently short-circuit —
  letting single-blocker-on-menace through," and the Number() fix. Deleting the
  entire check today → **1786/1786 green** (verified). tests/ mentions menace only in
  icon rendering. The proto has no damage-time fallback (that's Godot — see A2-11
  #2), so this single untested line is the proto's only menace enforcement point; a
  refactor reintroducing string keys would land green, repeating a documented bite.
- **Fix sketch:** two assertions in the A2-6 battery — lone block on a menace
  attacker rejected (and mutates nothing), 2-blocker assignment accepted.
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high. **Current code is correct** — this is recurrence-fencing, not a
  live defect.
- **Remediation class: PARK (test addition;** rides the A2-6 battery).
- **Predicted test impact:** additive only.

---

## Chunk-1 leads resolved

Both leads chunk 1 handed to this chunk were run to ground, by three lenses
independently, with converging answers:

1. **"Does dealCombatDamage handle stale/vanished combatant iids?" — YES for zone
   changes.** findCard is battlefield-only (:1046–1052), so dead, bounced, exiled,
   and Steal-stolen attackers/blockers are correctly skipped at damage time (attacker
   guard :5263, livingBlockers filter :5268, hasFirstStrike scans :5227/:5230), and
   the resulting behaviors (dead attackers deal nothing; blocked-with-dead-blockers
   needs trample) are canon-consistent per §803. Steal's flash-speed theft is safe
   specifically because `EFFECTS.steal` re-mints a fresh instance (makeCard ~:2291)
   into the thief's library — the stale iid then findCard-fails.
   **Correction to chunk-1 R2's refutation premise:** R2 said "iids re-mint on every
   battlefield arrival," making the bounced-then-recast variant structurally
   impossible. That premise is **falsified**: re-minting happens only on the
   move_card/flicker arrival path (placeCardOnBattlefield :1873); **cast arrivals
   (resolveTopOfStack :5066–5076) reuse the same object and iid.** R2's verdict
   stands for what it actually refuted (the documented-skip framing), but its
   side-claim is wrong and the live consequence is **A2-3**.
2. **"Is the resolveCombatDamage guard (~L5185 at chunk-1 time) sufficient?"** Maps to
   anchor :5214/:5227/:5263 — same verdict: **sufficient for nonexistence, blind to
   relocation.** The two residual holes are exactly this chunk's A2-3 (same-iid
   battlefield re-entry via bounce+recast — LIVE today) and A2-5 (controller change
   without zone change — unreachable today, verified hard).
3. **Chunk-1's cross-chunk lead** ("dealCombatDamage internals have heavy survivor
   density — the C1 'smart distribution' algorithm is largely untested") is upgraded
   from lead to verified finding: **A2-6**, with live mutant batteries as proof.

---

## Verified clean (negative space — checked against canon, no finding)

The rules lens read the combat core line-by-line against canon and explicitly clears
the following (valuable for the C1/C2 harmonization read):

- **Vigilance no-tap** at declaration (:5560) — §901.2.
- **Defender attack ban + haste/sick gate** (canCreatureAttack :880–887) — §901.7/§901.1.
- **Flying/reach/unblockable block gates** (canCreatureBlock :889–899) — §901.3–5.
- **Menace 2+ declaration check** incl. the Number-coercion fix (:6044–6047) — §901.6
  (the *coverage* of that line is A2-15; the code is right).
- **Tapped-blocker ban; one-attacker-per-blocker** (Map shape + usedBlockers).
- **First-strike two-pass structure** — SBA sweep + gameOver check between passes
  (:5234–5245) — §902.1 (modulo A2-1's live-filter timing).
- **Blocked attacker with all-dead blockers deals no damage unless trample**
  (:5279–5286) — §803.
- **Trample leftover math** for the normal satisfied/unsatisfied cases (A2-2 is the
  ==0 boundary only).
- **Deathtouch threshold-1 vs killable blockers; deathtouch marking from blockers**
  (:5337) — §902.3 (A2-7 is the indestructible carve-out only).
- **Lifelink on all five combat-damage sites** incl. dump and trample spill — §902.4
  (A2-8 is the event field only).
- **Indestructible damage retention** — DIVERGENCE F2 aligned.
- **End-of-combat and end-of-turn cleanup** (:6512–6514, :6573–6604, :6650–6652) —
  damage/dealtDeathtouch/eotGrants/attackers/blockers all cleared.
- **Static-lord grants reach combat correctly in practice** (applyStaticKeywordGrants
  runs in every emit(); declare-attackers emits) — with the lazy/add-only
  reconciliation caveat flagged to chunk 4 (see A2-9).

---

## Cross-chunk leads (one line each, for later finders)

- (chunk 3) §803's "Death triggers drain" pass sentences are a doc-internal wording
  contradiction with §605/§1004 — fixed by the A2-11 rider; if chunk 3's drain reading
  differs, re-open there (drainTriggers semantics are chunk 3's to own).
- (chunk 3) A2-4's duplicate-declare emits 'attacks' N times — any attacks-trigger
  card multi-triggers; the legality fix closes it, but trigger-side idempotency is
  worth a glance.
- (chunk 4) change_control needs the A2-5 prune (or the shared remove-from-combat
  helper); check the handler when chunk 4 sweeps effects.
- (chunk 4) static keyword-grant reconciliation is lazy/add-only — grants go stale if
  a lord's filter stops matching without a leave-play event; pairs with A2-9's shared
  lord predicate.
- (chunk 7) `ai.js:870–885` temp-mutates the LIVE card's tempPower/tempTou during
  scoring with try/finally restore — verify every simulateCombat caller restores on
  all paths and the sim never writes real card.damage.
- (chunk 7) engine damage-assignment ORDER depends on the AI heuristic getCardValue
  (acknowledged at :1427–1430) — retuning kill-values silently changes RULES behavior
  (which blocker dies first). Any chunk-7 scoring change needs an A2-6-battery pin
  first.
- (chunk 7) `ai.js:778` mirrors A2-7's deathtouch carve-out — engine and AI must
  change together whichever way A2-7 is adjudicated.

---

## Refuted-claims appendix (3 — survived nothing; kept for the record)

All three are lens-variants of one claim; that three finders independently misread
the same §803 sentences the same way is itself the best argument for the A2-11 rider.

| # | Lens | Claim (one line) | Why refuted (one line) |
|---|---|---|---|
| R1 | rules | Death triggers must DRAIN between the first-strike and normal damage passes per §803; the code never does | Misreads canon: §605/§1004/§801.3/§500-row-507 all mandate exactly the implemented behavior (step 507 has no priority window; triggers queue until priority next opens = MAIN2); and drain ≠ resolve, so even a literal between-pass drain would change nothing observable — residue is the §803 wording nit (A2-11 rider) |
| R2 | state | Same, plus: a pass-1 dies-trigger pump/removal "resolves too late" and combat-state-reading triggers see an already-reset board (A1-21 consequence) | Same canon refutation; the consequence leg requires between-pass RESOLUTION, which no canon text prescribes (true of real MTG only — the canon deliberately diverges); the reset-timing leg is latent (no predicate reads G.attackers) and MAIN2-time resolution is itself the canon-prescribed timing |
| R3 | footguns | Same, framed as "a first-strike-pass death trigger can never affect normal-pass damage — observably different from what §803 promises" | Canon never promises mid-combat resolution; its own structure forbids it; the only deltas of a mid-step drain (target-pick timing, APNAP stack order) are promised nowhere — one-line rulebook edit, not an engine bug |

---

## Coverage

Union of the four lenses' declared reads (deduplicated); notRead lists only what
**no** lens read.

- **engine.js (read):** 630–930 (SUBTYPE_KEYWORDS, makeCard/makeToken,
  intrinsicKeywords, canCreatureAttack/canCreatureBlock, makePlayer head), 1040–1300
  (findCard/findCardAnyZone/resolveTarget, getStats incl. static lords, getCardValue),
  1713–1753 (applyDamageFrom), 1806–1894 (severity ladder, affectOneCreature,
  placeCardOnBattlefield iid re-mint), 1997–2030 (pump), 2221–2330 (EFFECTS.steal),
  2660–2750 (schedule_delayed, change_control, fight, untap), 2870–2941 (staple
  combat-state transfer), 3290–3350 (applyStaticKeywordGrants, emit), 4156–4205
  (matchFilter), 4234–4304 (resetInPlayState), 4394–4490 (applyGrant/applyTypeGrant,
  clearRestrictionsFromSource), 4690–4936 (recordDamage/claimKeywords/checkDeaths/
  checkLifeTotals/damagePlayer/emitCombatDamageToPlayer/afterEffectsApplied),
  4980–5400 (setPhase → resolveTopOfStack → **resolveCombatDamage + dealCombatDamage
  read line-by-line by all four lenses** → doPlayLand), 5440–5635 (doCastSpell tail,
  doActivateAbility, doDeclareAttackers/doDeclareBlockers + pending-choice handlers),
  5795–5930 (doPass/doEndTurn, isInstantWindow/isMainPhaseWindow, legality head),
  5885–6128 (isLegalAction in full, all combat arms), 6390–6660 (step() combat
  routing, COMBAT_DAMAGE reset, EOT cleanup, control revert), 6687–6712
  (executeAction gating).
- **engine.js (NOT read):** module head/CARDS loading (1–630 beyond grep), 1300–1484
  and the spell-damage path beyond applyDamageFrom (chunk 4), trigger drain/resolve
  internals 3494+ (chunk 3), effects dispatch 3600–4156 (chunk 4), staple-splice
  pruning beyond the combat block (chunk 5), 2400–2480 EOT-revert details beyond
  grep hits.
- **Other js:** ai.js — simulateCombat header + temp-mutation site (678–895
  excerpts), declareAttackers call shape, kill-value/deathtouch mirror sites
  (lead-scoped only; decision logic NOT read — chunk 7); controller.js — uiAtk
  toggle construction + the test_ui_targeting regex target (combat rendering NOT
  read); **triggers.js/trigger-generator.js** — life_changed condition table +
  noSelfCascade guard + change_control greps only (chunk 3);
  **render.js/card-text.js/run.js save-load NOT read.**
- **Canon/docs read:** rules 800 (full, all four lenses), 900 (full), 1100 (full);
  600/500/1000 targeted re-reads for the refutations; DIVERGENCE.md combat rows
  B7/C1–C6/D4/F1–F2; html-proto BACKLOG.md (combat-relevant); PROTOCOL.md events
  rows (full doc NOT read — combat wire shape untouched by findings);
  chunk-01-turn-machine.md (full, dedupe + leads); chunk-06-stickers.md headings;
  plan-proto-audit.md contract sections.
- **Cards:** quickling, iron_statue, sicken, mind_control, threaten, steal, apex_elder
  + all 10 static_buff lords read; programmatic sweeps for first-strike/trample/
  deathtouch/menace/change_control co-occurrence. **The 250+ other card JSONs NOT
  read** (chunk 11).
- **Tests:** directory census ×4 lenses; selfplay_harness.js + test_seal_thief_courier.js
  (full); run_all.js CATEGORY_A; test_rules_infra.js F2 region; test_change_control.js;
  test_ui_targeting.js targeted; all 74 files grep-classified for combat symbols —
  **~60 test bodies without combat hits classified by grep, not read.**
- **Mutation artifacts:** `engine-combat-region-survivors.txt` — header + all 200
  survivor lines read across the lenses; **the +28 anchor offset verified at 6
  sample points** and recorded above. (Chunk-1's step-region file cited only.)
- **Live execution:** 20+ node repros/batteries this session across finders and
  verifiers — every behavioral finding (A2-1 through A2-5, A2-7, A2-8) AND the A1-3
  upgrade carries a live-executed repro; A2-6's batteries were run twice (finder +
  verifier). All against scratch copies of the frozen anchor snapshot (the chunk-1
  live-mutation lesson applied). One repro-discipline note: the state lens's first
  script produced two FALSE "BUG CONFIRMED" verdicts from a driver bug (pass-loop
  overran block declaration; one block was illegal vs subtype-implied flying) — it
  discarded them and re-derived with validated drivers; the verifiers then
  reproduced independently. The pipeline's skepticism is working.
- **Dedupe:** A1-3 (upgraded, not re-filed), A1-7, A1-8 (extended by A2-3/A2-5),
  A1-21, A1-23, DIVERGENCE C1–C5/F1/F2, BACKLOG duration-dedupe — cited, not
  re-filed.
- **Overall confidence:** high on everything filed — every confirmed finding carries
  an adversarial verdict at high confidence, all behavioral ones with live repros.
  Soft spots: ai.js combat decisions and trigger internals were deliberately deferred
  (chunks 7/3), and ~60 test bodies were classified rather than read.

---

## Triage table (for INDEX.md)

| ID | Sev | Class | One-line |
|---|---|---|---|
| A1-3↑ | P1 | (stage, ch.1) | Cross-chunk confirmation: indestructible t≤0 re-derived via combat, live in-pool repro (Iron Statue + 3× Sicken, executed); §1100's own status line false → A2-12 |
| A2-1 | P1 | stage | First-strike pass-2 filter reads LIVE keywords — lord dies in pass 1, its granted creature deals damage in BOTH passes (5 vs canon 3, executed); inverse: gaining FS = zero damage |
| A2-2 | P1 | stage | lethalNeeded==0 blocker (fully-marked indestructible, or A1-3 survivor) classed "unsatisfied" — all trample carryover suppressed + whole remainder dumped on it (found by all 4 lenses, 4 live repros) |
| A2-3 | P2 | stage | Ghost attacker: cast arrivals don't re-mint iids — bounce + re-cast (two Quicklings, 4 mana) re-matches the stale G.attackers entry; attacks while sick/untapped/undeclared; falsifies chunk-1 R2's premise |
| A2-4 | P2 | stage | declareAttackers legality accepts duplicate iids (blockers side has the Set) — one creature attacks N times, N× damage + N× 'attacks' triggers; engine API surface only |
| A2-5 | P2 | stage | change_control never removes from combat — stolen attacker damages its OWN new controller (+ lifelink to them, self-block legal); latent today, live with the first flash/triggered steal; bundle with A2-3 |
| A2-6 | P2 | park | Combat coverage darkness: 200/303 mutants survive; 9 of 10 behavior-deleting mutants invisible (batteries executed twice); the region IS the C1/C2 spec Godot harmonizes to — one test_combat_damage.js battery |
| A2-7 | P3 | stage | Deathtouch lethal-threshold carves out indestructible blockers — deliberate per comment, absent from canon; sticker-reachable defender-life fork; decision: follow canon (rec.) or write the house rule in; ai.js:778 mirrors |
| A2-8 | P3 | stage | Combat lifelink's life_changed omits source_iid (both siblings attach it) — noSelfCascade + Codex-built gain-life triggers misbehave today; one-line fix |
| A2-9 | P3 | park | Lord-buff predicate duplicated in two divergent loops — stat loop buffs ANY permanent (no Creature gate, executed: lands get +1/+1), keyword loop gates; inert today; chunk-4 structural overlap |
| A2-10 | P3 | ship | dealtDeathtouch names the VICTIM (Godot already renamed it lethal_marked) — clarifying comments ship; mechanical 14-site rename is a trivia candidate |
| A2-11 | P3 | ship | Rulebook §800/§802 false claims (docs-only, merged): L52 declaration-order "in both implementations," L26 + 900-keywords L33 menace-fallback parentheticals (Godot-only), stale DIVERGENCE C1/C3 cites, §803 "drain" wording rider |
| A2-12 | P3 | ship | §1100 status line "zero-toughness check: implemented" false for indestructibles — qualify it, reference A1-3's staged packet |
| A2-13 | P3 | park | Summoning sickness fenced by ONE accidental choreography-coupled assertion (1785/1786 isolation run) — three direct assertions, land before the A1-7 packet |
| A2-14 | P3 | park | test_ui_targeting pins block legality by source-text regex — false-reds on rename, green under flying-gate deletion (both executed); replace with behavioral check, keep the delegation pin |
| A2-15 | P3 | park | Menace enforcement: zero coverage at a site whose comment documents a prior silent-failure bug of this exact shape — check deletable, suite green; two assertions in the A2-6 battery |
