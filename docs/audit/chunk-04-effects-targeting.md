# Chunk 4 — Effects dispatch + targeting legality (the 31-handler EFFECTS table, getValidTargets/matchFilter/hexproof layer, the three resolution loops, zone routing)

> Tier 2. **4-lens Workflow fan-out** (rules correctness, state-mutation discipline,
> structural footguns, test quality) **over a frozen anchor snapshot + adversarial
> verify per finding — 68 agents.** Anchor SHA **`4d739ad`** (frozen snapshot at
> `%TEMP%/audit-anchor-4d739ad`; finders and verifiers worked from scratch copies,
> never the snapshot itself). Suite at the anchor: **78 files / 1842 assertions
> green.** Canon set: `docs/wiki/rules/` (400, 700, 900, 1100, 1200 + chunk-1/2/3
> pages where cited), `docs/PROTOCOL.md`, `docs/DIVERGENCE.md`, the cards' own
> oracle text (`cards/*/card.json`), `reference/html-proto/BACKLOG.md`, plus the
> existing tests' stated expectations. Date 2026-06-10.
>
> Cross-lens duplicates are deduped below; "found independently by N lenses" is
> noted where it applies. Two findings converged across **all four lenses** (the
> lord-grant staleness A4-2 and the counter owner-routing A4-19); the restrict-drop
> (A4-8) drew three. The refuted appendix carries **13 entries** — calibration
> normalized after chunk 3's anomalous zero, discussed at the bottom.
>
> **Terminology ruling (Joe, 2026-06-10):** Magiclike's rules are THE rules.
> Intentional divergences from real MTG are *design decisions*, recorded as such
> ("deliberate design," "design ruling") — never framed as deviations from an
> external standard. Applied throughout this file.
>
> **Class policy + authorized-pattern riders:** per the calibration-day policy
> (chunk-2/3 precedent) every **behavioral** fix below **stages**; **ship** is
> reserved for docs/comment-only edits (gate: suite + lint green); coverage/test
> groups **park**. Joe's verdict round 3 (2026-06-10) already green-lit several
> sibling-class fixes, so packets below cross-reference the authorized pattern
> where the fix obviously rides one: **boot-validation gaps ride A3-5's GO**
> (A4-11, A4-17, A4-20); **silent-default arms ride the A1-6/A3-14 pattern**;
> **payload/log one-liners ride the A2-8/A3-11/A3-12 lane** (shipped as PRs
> #108/#109) (A4-16, A4-19, A4-21, A4-22).

## Mutation-map note (governs ship gate this chunk)

Two survivor files govern this chunk (both in
`C:/Users/Joe/.config/magiclike/audit/mutation/`):

- **`engine-effects-region-survivors.txt`** — the effects dispatch region
  (map L1130–3290) had **698 of 1,274 mutants survive (~55%)** — the suite's
  largest dark zone. The grouped finding A4-18 decomposes it: ~37% (257) is
  by-design-untestable AI valuation heuristics, 79 is the already-filed A1-2 mana
  cluster, 97 sits in `apply_in_game_splice` (chunk 5's), and the remainder names
  specific dark handlers (steal 18, grant_keyword 16, grant_cast_permission 11…).
  The 0-survivor handlers (creaturesInScope, affect_creature dispatch,
  add/set_types, sacrifice, annihilate, discard, resolveEffectParams/applyEffect)
  show the well-tested core is genuinely fenced.
- **`engine-targeting-region-survivors.txt`** — the targeting region (map
  L3700–4130) had **64 of 153 survive (~42%)**, including both non-creature
  hexproof-gate inversions (A4-24) and all five `restrict || undefined`
  pass-throughs (A4-8).

**Line-drift caveat:** both files were generated at the mutation-run SHA
(`bb8ea9f`); their line numbers run a consistent **~30–60 lines below** anchor
`4d739ad` (verified by content match at every cited point — e.g. map-L3770/L3812
hexproof inversions = anchor :3812/:3854; map-L1717/L1719 trample arithmetic =
anchor :1739/:1741). Survivor citations below give both where it matters. A
testquality verifier independently **re-executed** the headline mutants against
the anchor suite rather than trusting the stale file — every cited survivor
genuinely survives 1842/1842, and the file proved line-accurate (mutating the two
pass-throughs it does NOT list as survivors produced exactly 2 failures).

---

## A4-1 — Spell resolution performs NO target-legality re-validation — **CLOSED IN FLIGHT (PR #111)**

**The handed lead (chunk 3 → chunk 4, A3-1's spell-side twin), filed P1 at the
anchor and verified there in full — then closed by remediation before this file
was drafted.** The anchor `4d739ad` **predates PR #111**, which landed the A3-1
fix on the workshop after the chunk's agents ran.

**What the finder/verifier established at the anchor (kept as the evidentiary
record):** `resolveTopOfStack` (:5120–5274) ran its effect loop against locked
targets with no legality re-check — the only guard was the per-effect
`resolveTarget` liveness check (:1086–1091). Canon
`docs/wiki/rules/700-casting-and-activating.md` L39 (§704) requires the re-check
and whole-fizzle, and `targeting-and-hexproof.md` L15 + `plan-effects-refactor.md`
L222 agree. **Verifier reachability correction:** the headline hexproof scenario
was unreachable at the anchor (no instant-speed hexproof grant exists in the
pool), but the identical defect was live via **target_filter violations** —
executed with 100% real cards and legal actions: Ravenous Plague
(`max_tough:3`) on a 2/2 Grizzly Bears, defender responds with flash Giant Growth
→ bear is 5/5 at resolution → "Ravenous Plague destroys Grizzly Bears" anyway.
Same class: flash Steal flipping controller under a `your_creature`/`opp_creature`
filter.

**Verification against the CURRENT workshop tip (`a08d8a1`, merge of PR #111;
fix commit `14021df`, v2.1.28, Joe-approved per PR #98 round 2):** the fix
**fully covers this finding, both sides.** New `tsRevalidateTargets` runs once at
resolution start in BOTH `resolveTrigger` (§1006.1) and `resolveTopOfStack`
(§704.1). It re-runs the SAME per-slot legal sets used at cast/queue time
(`tsLegalBySlot` → `getValidTargets`/`targetsForFilter`), so **hexproof, filters,
and zone changes all re-apply** — the verifier's Ravenous Plague filter route is
covered, not just the hexproof headline. Sub-claims checked: whole-fizzle skips
untargeted riders (§704.1 whole-object fizzle — the dead-sole-target half);
the fizzled spell is **owner-routed** to the graveyard (`G[card.owner ||
item.controller]` — does not re-introduce A4-19's bug); costs stay paid; the
per-slot partial-illegality question the finder flagged as undecided ("canon only
specifies the all-illegal case") was *decided by the fix* — illegal slots are
nulled in place and multi-target entries proceed against survivors — and is now
test-pinned. `tests/test_resolution_revalidation.js` landed red→green (6 red
pre-fix → 16 green post-fix), covering spell-side whole-fizzle + rider skip,
multi-target partial fizzle, and the unchanged happy path. Suite at the tip: 82
files / 1889 green (copied from the verified commit message).

**Residuals #111 did NOT cover (re-homed, not re-filed):**
1. **PROTOCOL.md §3.5 :251–252** still says target legality is checked *"once,
   at the target() step (cast time)"* — already contradicting the rulebook at the
   anchor, now also contradicting shipped behavior. Folded into **A4-10** (the
   PROTOCOL docs ship).
2. The dead `sharedTarget`/`sharedSnap` locals and the stale eager-snapshot
   comment in `resolveTopOfStack` survived the fix untouched (the fix moved
   `activeEffects` above the new gate but left the dead pair). Folded into
   **A4-25**.

**Disposition: CLOSED IN FLIGHT.** No packet. Severity at the anchor: P1;
dimension 1; verification: survived adversarial refutation at the anchor AND the
closing fix was independently re-read at the current tip for this file.

---

## A1-2 upgrade (cross-chunk confirmation) — the doOptionalCost consequence map, delivered

**Not a new finding** — A1-2 (chunk 1, staged) already enumerates the optional
trigger cost as a payMana call site; one lens's attempt to file it fresh was
correctly refuted as a duplicate (refuted appendix R11). What's new for the
staged packet, verifier-executed at the anchor:

- **The consequence, live:** `resolveTrigger` gates the optional cost on
  backtracking `canPayPotential` (:3662), `doOptionalCost` re-checks with the
  same function (:3752), **nulls `G.pendingOptionalCost` (:3745)**, then pays via
  greedy `payMana` (:3757). Executed repro (Land+Sword-and-Sorcery staple on a
  Forest base, two partial-dual choose sources): both gates pass, payMana taps
  the W/U dual for W, then **throws `'Mana payment failed (color): U'`** — the
  exception escapes `executeAction` (no containing try/catch), **the trigger is
  irrecoverably lost** (effects never ran, the pending slot already nulled), and
  the dual sits tapped with its mana consumed. Low frequency (needs the staple
  meta + partial-dual choose sources in a greedy-misassignable order; the played
  staple land's own mana ability rescues many configurations), high impact.
- **Clean sweep (negative space):** no OTHER legality-vs-execution pairs exist in
  the effects layer — splice double-checks via the same `resolveSplicePair`;
  trigger queue and resolution share `tsAutoPick`/`tsLegalBySlot` exactly, so
  queue-vs-resolve targeting cannot drift.

**Disposition unchanged:** A1-2's staged packet stands; its fix must cover
`doOptionalCost` (and the repro above is the test seed for that caller).

---

## Findings

### A4-2 — Static lord KEYWORD grants are add-only and never revoke while the lord stays on the battlefield: a stolen creature keeps the old lord's haste/first-strike/hexproof forever while the STAT half of the same buff drops instantly — adjudicates parked A2-9
- **Location:** `reference/html-proto/js/engine.js:3314` (applyStaticKeywordGrants,
  add-only body :3314–3339; the only revoke path `clearRestrictionsFromSource`
  :4473–4507 fires on lord LEAVE-PLAY only; live stat half at getStats
  :1184–1193; change_control :2698–2726 touches no grants) @ `4d739ad`
- **Dimension:** 1 (rules correctness) + 2 (structural — one ability, two
  divergent lifecycle models)
- **Severity:** P1 — **found independently by all 4 lenses**, live-reproduced by
  four independent repros (three verifier-re-executed).
- **Evidence (verifier-confirmed ×4, live-executed):** `applyStaticKeywordGrants`
  only ever ADDS (`grantedBy.set` / `keywords.push` — no removal arm anywhere);
  `getStats` re-evaluates `matchFilter` per call. So after Mind Control steals a
  Goblin from under Goblin Chieftain: stats correctly drop 3/2 → 2/1, **keywords
  still contain haste and `grantedBy` still maps it to the lord — forever**
  (mind_control has no duration; the EOT keyword rebuild re-adds from the stale
  map without re-validating). Combat reads `card.keywords` directly (haste gate
  :889, first-strike ordering :5296–5304), so the staleness is rules-visible.
  Verifier-mapped blast radius: **6 keyword-granting lords** (goblin_chieftain
  haste, skyfire_drakelord, field_marshal/knight_commander vigilance, apex_elder
  trample, spirit_shepherd hexproof — all `{controller:'self'}` filters) × **3
  control-change cards** (mind_control, threaten, steal). **Verifier severity
  texture:** the headline haste case is nearly inert (change_control never
  re-marks the stolen card sick), so the material impact is stale **hexproof**
  (the rightful owner can't target their own stolen creature), first_strike,
  vigilance, trample — and the lord-steal direction leaves **both** sides
  granted. One finder's repro card (bloodlust_berserker) had intrinsic haste —
  non-probative; the verifiers re-ran with clean cards (goblin_raider,
  burnout_shaman, aether_drake) and confirmed. Subtype loss (`set_types`) and
  copy reversion hit the same hole (asserted, partially verified).
- **Canon:** the rendered duration of lord grants — card-text.js:313 renders
  *"as long as this is on the battlefield"*, which the kept keyword violates;
  the internal incoherence (two halves of ONE `static_buff`, one continuous, one
  permanent); `test_lord_keyword_grants.js`'s stated expectation that grants
  track the lord (it pins death/bounce revocation — filter-falsification is the
  untested third leg). **A2-9** (chunk 2, parked) documents the duplicated
  predicate this fix unifies.
- **Fix sketch — the adjudication chunk 4 was assigned (A2-9's fix direction):**
  (1) hoist **ONE shared `lordBuffApplies(lord, lordCtrl, buff, target,
  tgtCtrl)`** predicate (static_buffs gate + iid self-exclusion +
  `hasType(target,'Creature')` + matchFilter + buff.subtype) consumed by BOTH
  `getStats` and `applyStaticKeywordGrants` — this simultaneously closes A2-9's
  missing Creature gate in the stat loop (today the stat loop buffs
  non-creatures); (2) make `applyStaticKeywordGrants` a true **diff-reconcile**:
  after the add pass, walk each creature's `grantedBy` entries whose source iid
  resolves to a battlefield lord and REVOKE pairs the shared predicate no longer
  accepts (reusing clearRestrictionsFromSource's strip logic per source);
  spell-sourced grants (srcIid not resolving to a static_buff lord) keep their
  existing leave-play contract. **Rejected alternative:** live-computed keywords
  (Godot's `effective_keywords()` shape) — right for the port, wrong for the
  proto (`card.keywords` is read at ~50 sites); park that for port-parity time.
- **Effort:** medium (~40 lines + tests).
- **Verification status:** survived adversarial refutation four times,
  confidence high.
- **Remediation class: STAGE** (behavioral; structural adjudication explicitly
  requested by the A2-9 park).
- **Predicted test impact:** none — `test_lord_keyword_grants.js` stays green
  (leave-play paths unchanged; verified it has no control-change case);
  `test_change_control.js` has no lord case. Fix must bring a change_control
  regression test (steal a buffed creature → keyword AND stats both drop; your
  own lord picks the stolen creature up).
- **Mutation-map judgment (why stage):** the effects region is 55% dark and the
  applyStaticKeywordGrants cluster is unfenced for the control-change leg —
  bring-your-own-test per the ladder.

#### Decision packet for A4-2 (stage — plain English)
Lord creatures ("other Goblins you control get +1/+1 and have haste") grant two
things, and the engine tracks them in two different ways. The stat bonus is
recomputed live, so when a buffed creature is stolen, the +1/+1 correctly
disappears. The keyword (haste, vigilance, hexproof…) is written down once and
only erased when the lord *leaves play* — stealing the creature, changing its
type, anything that makes the lord's condition stop matching, leaves the keyword
stuck on it permanently. Visible in real games with shipped cards: steal a
creature from under Spirit Shepherd and its owner can never target it again.
- **Option (one direction, confidence: high — this is the unification chunk 2's
  parked A2-9 asked chunk 4 to adjudicate):** extract one shared "does this
  lord's buff apply to this creature?" check used by both halves, and make the
  keyword layer reconcile both ways (add what's missing, revoke what stopped
  matching). This also fixes A2-9's other bug for free (the stat loop currently
  buffs non-creatures). Comes with a steal-a-buffed-creature regression test.
- The bigger rewrite (compute keywords live, like the Godot port does) is the
  long-term shape but touches ~50 read sites — recommend parking it for
  port-parity, not bundling it here.

---

### A4-3 — Fight effects RETARGET around removal: when a fight's chosen target is killed in response, the fallback pass silently conscripts the caster's own highest-power creature as the replacement combatant — friendly fire instead of fizzle
- **Location:** `reference/html-proto/js/engine.js:1778` (resolveFightOperands
  second pass :1778–1787; pass 1 fizzle at :1771–1777; the select-only intent
  comment at :1761–1766; the handler's own fizzle arm at :2734) @ `4d739ad`
- **Dimension:** 1 (rules correctness) + 2 (the comment proves the fallback was
  meant for `{select}` operands only)
- **Severity:** P1 — **found independently by 2 lenses**, both verifiers
  re-executed it END-TO-END through only legal actions.
- **Evidence (verifier-confirmed ×2, live-executed via the real action layer):**
  pass 1 resolves `{slot:N}` operands via `resolveTarget` (null + a "fizzles —
  target gone" log when dead); pass 2 fills EVERY null slot — `if (out[i])
  return;` — with the controller's highest-power unused creature, never
  distinguishing a `{select}` computed pick from a FAILED slot reference. So:
  cast Prey Upon (your 2/2 fights their 3/2), opponent responds with flash Shock
  killing their own targeted creature (an enumerated legal action — verified via
  `getLegalActions`), Prey Upon resolves → **the fizzle log prints, then your
  2/2 and your innocent 4/4 fight each other** (executed: 4/4 took 2, 2/2 died).
  Live in all 4 shipped fight cards (predate, prey_upon `{slot},{slot}`;
  apex_hunter, beasts_fury `{select},{slot}` — the dead slot-1 case recruits a
  second friendly the same way). Note PR #111's resolution re-validation does
  NOT close this: `effectNeedsTarget` is false for `fight` (no `eff.target` /
  `target_slot`), so the new gate never inspects fight operands — verified by
  one verifier tracing the dispatch. Needs ≥2 caster creatures (with one, the
  handler's `!a||!b` guard fizzles correctly).
- **Canon:** the engine's own fizzle contract (`resolveTarget` header
  :1083–1091); the fallback's own intent comment (:1761–1766 — exists so "a
  {select} avoids picking the other combatant"); predate/prey_upon oracle text
  ("creature an opponent controls").
- **Fix sketch:** one-word-class guard — pass 2 fills only operands that declare
  `op.select` (`if (out[i] || (op && op.slot != null)) return;`); a fight with a
  fizzled slot operand then hits the existing `!a||!b` fizzle. Regression test:
  locked targets, remove one in response, assert zero damage; `{select}`
  fallback still works.
- **Effort:** small (one conditional + test).
- **Verification status:** survived adversarial refutation twice (both verdicts
  independently executed full legal-line repros), confidence high.
- **Remediation class: STAGE** (behavioral fix in a dark region —
  `resolveFightOperands` fallback survivors at map L1757–1761 confirm zero fence;
  `test_predate_fight_d1.js` is happy-path only).
- **Predicted test impact:** none — no test exercises a fight fizzle path.

#### Decision packet for A4-3 (stage — plain English)
"Fight" cards make two specific creatures punch each other. If the opponent's
creature is killed in response (the standard counterplay), the spell should just
fizzle. Instead, the engine's auto-fill — written for cards like "your strongest
creature fights…" — quietly substitutes a replacement: YOUR next-biggest
creature. Result: removing the fight target makes the caster's two creatures
fight *each other*. The game even prints the fizzle message first, then does the
friendly fire anyway. Reachable with all four shipped fight cards, and a human
opponent can trigger it deliberately against the AI.
- **Option (only one, confidence: high):** a one-line guard so the auto-fill only
  applies to "pick my strongest" operands, never to a chosen target that died.
  The existing fizzle check then does the right thing. Comes with a regression
  test. Staged only because the whole fight path is mutation-dark — per policy
  it arrives with its own test and your nod.

---

### A4-4 — Mass removal is SEQUENTIAL, not simultaneous: Day of Reckoning kills one creature at a time, so a dies-listener destroyed early in iteration order misses every later death — the same three deaths fire different trigger counts depending on which wrath killed them and on battlefield array position
- **Location:** `reference/html-proto/js/engine.js:2127` (affect_creature scope
  loop :2127–2131 → affectOneCreature sev 3 :1846–1855 → moveToGraveyard
  :4327–4361, per-card emit with extraSources = [itself] :4731–4732; the batch
  contract it violates at checkDeaths :4831–4838 and emitLeavesBattlefield's own
  header :4726–4730) @ `4d739ad`
- **Dimension:** 1 (rules correctness — order-dependence) + 2 (the code's own
  intent layer prescribes batch semantics the mass path doesn't deliver)
- **Severity:** P1 — **found independently by 2 lenses** (one filed P2; the P1
  verdict survived adversarial verification: "order-dependent, life-total-
  affecting, reachable with common in-pool cards").
- **Evidence (verifier-confirmed ×2, executed through the real settle loop):**
  Blood Artist + 2 Goblin Raiders, opp casts Day of Reckoning (scope destroy):
  **Blood Artist drains 1** (it died first in iteration order and is invisible
  to the later deaths). The same three deaths via Pyroclasm/Anger of the Gods
  (lethal mass damage → checkDeaths SBA batch): **drains 3**. Moving the artist
  last in the battlefield array makes Day of Reckoning drain 3 — order
  dependence confirmed *within* the mass-destroy path. checkDeaths splices the
  whole batch first then emits each death with the full `dying` batch as
  extraSources, with an explicit simultaneity comment; the mass path contradicts
  the engine's own documented contract, not just MTG intuition. Same hole
  applies to mass **bounce/exile** (devastation_tide all_opps, wash_away
  all_creatures) for any leave-play listener. Exposure: 4 mass-removal/bounce
  sources × ~25 in-pool `card_moves(battlefield, graveyard)` listeners.
  `test_effects_scope.js` deliberately uses a trigger-free creature, so no test
  observes trigger counts.
- **Canon:** checkDeaths' own batch-emit design + emitLeavesBattlefield's stated
  parity contract (:4726–4730).
- **Fix sketch:** restructure the mass branch of affect_creature (sev ≥ 2) to
  mirror checkDeaths: first pass plucks/splices all affected cards (collecting
  {card, controller, dest}), second pass pushes zones + emits each with the
  whole batch as extraSources. Regression test: Blood Artist + 2 vanillas, mass
  destroy → exactly 3 firings / −3 life, plus an order-independence assertion
  (artist first vs last).
- **Effort:** small–medium (one handler restructure; careful with the sev-2/4
  token "ceases to exist" arms).
- **Verification status:** survived adversarial refutation twice (both repros
  independently re-executed, life totals matched exactly), confidence high.
- **Remediation class: STAGE** (behavioral, dark region — the affect_creature
  scope cluster sits in the 55%-dark effects region).
- **Predicted test impact:** none — no test asserts mass-removal trigger counts.

#### Decision packet for A4-4 (stage — plain English)
Board wipes are supposed to kill everything *at once* — a creature that triggers
on deaths ("whenever a creature dies, drain 1") should see all the deaths,
including the sweep that kills it too. The damage-based wipes get this right
(verified: drain ×3). The destroy-based wipe (Day of Reckoning) kills one at a
time, so the listener only "hears" deaths that happen before its own — and the
count literally depends on the hidden order creatures sit in an internal array
(1 vs 3, executed both ways). Same machinery, different life totals.
- **Option (only one, confidence: high):** make the destroy/bounce/exile sweep
  collect-then-batch exactly like the damage path already does (the code even
  has a comment explaining the batch is the intended design). Regression test
  pins 3 firings and order independence.

---

### A4-5 — The CLEANUP eotGrants keyword rebuild erases a copy's materialized keywords (and resurrects the base template's): a False Witness copying a flyer loses flying — and wrongly regains flash — at the first end of turn that touches it with any EOT grant, while remaining the copy in name, stats, and triggers
- **Location:** `reference/html-proto/js/engine.js:6676` (cleanup rebuild
  :6670–6683); root cause `intrinsicKeywords` :861–880 (copyOf-blind — handles
  stapledFrom, ignores copyOf); same hole in clearRestrictionsFromSource's
  intrinsic test :4498; trophy-rule corruption via claimableKeywords :4770–4772
  @ `4d739ad`
- **Dimension:** 1 (rules correctness — oracle text contradicted) + 2 (one
  re-derive path forgot what its siblings know)
- **Severity:** P1 — **found independently by 2 lenses** (one filed P2),
  executed end-to-end through the real CLEANUP both times; **the AI triggered it
  autonomously in one repro** (it cast Predator's Speed on the copy itself).
- **Evidence (verifier-confirmed ×2, live-executed):** `become_copy_of`
  (:2624–2665) materializes the copied template's keywords onto the instance;
  the cleanup rebuild re-derives `c.keywords = intrinsicKeywords(c) + grantedBy
  survivors` whenever eotGrants is nonempty; `intrinsicKeywords` reads
  `CARDS[card.tplId]` — never `card.copyOf`. Executed: witness copies Abyss
  Lurker/Air Elemental (flying) → any EOT keyword grant lands on it → real
  endTurn CLEANUP → **keywords = ["flash"]** while name/stats/copyOf stay
  copied. Two-directional corruption: copied flying LOST, base flash WRONGLY
  RESURRECTED — combat-legality-visible both ways (canCreatureAttack/Block read
  `card.keywords`). The leave-play path (`resetInPlayState` :4291–4311) is
  copyOf-aware — this one rebuild site forgot. **Secondary leg (verified):**
  `claimableKeywords` = intrinsicKeywords(corpse), so a dying copy offers the
  BASE template's keywords to Endomorph absorb / kill-trophy claims instead of
  the copied identity's. Reachable: false_witness + 16 EOT-keyword-grant cards
  in the pool; Abyss Lurker's flying is template-level (no subtype rescue).
- **Canon:** `cards/false_witness/card.json` oracle text (becomes a copy taking
  printed characteristics incl. keywords); become_copy_of's own contract comment
  :2616–2623 (copy reverts on LEAVE-PLAY, not at EOT).
- **Fix sketch (single unambiguous answer, oracle-anchored):** make
  `intrinsicKeywords` copy-aware — when `card.copyOf` is set, derive the
  template half from `CARDS[card.copyOf]` (keep sticker/subtype unions),
  mirroring its existing stapledFrom branch. One small function change fixes the
  cleanup rebuild, clearRestrictionsFromSource's intrinsic check,
  claimableKeywords on copy victims, and Endomorph novelty vs copies in one
  move.
- **Effort:** small. **Verification status:** survived adversarial refutation
  twice, confidence high.
- **Remediation class: STAGE** (behavioral; the region is mutation-dark —
  brings its own regression test per the ladder, despite the answer being
  unambiguous).
- **Predicted test impact:** none — `false_witness_test.js` never crosses a
  cleanup with an EOT grant on a live copy; `test_endomorph_absorb.js` has no
  copy victims.

#### Decision packet for A4-5 (stage — plain English)
False Witness can become a copy of another creature, keywords included. But the
end-of-turn cleanup that unwinds temporary keyword grants rebuilds a creature's
keywords from its ORIGINAL card — it doesn't know about copies. So a Witness
copying a flying Demon, touched by any "gains haste until end of turn" effect,
ends the turn as a copy of the Demon *that can't fly but has flash* — the worst
of both identities. The repro didn't even need contrivance: the AI cast the
pump spell itself. The same blind spot makes a dying copy hand out the WRONG
trophy keywords to Endomorph.
- **Option (only one, confidence: high):** teach the one forgetful function
  (`intrinsicKeywords`) about copies, the same way it already handles stapled
  cards. One change fixes all four symptom sites; comes with a
  copy-plus-EOT-grant regression test.

---

### A4-6 — color/not_color target filters test only the FIRST colored pip: Doom Blade ("Destroy target non-Black creature" — its own rendered oracle text) legally destroys the {U}{B} Seal-Thief Courier
- **Location:** `reference/html-proto/js/engine.js:4176` (matchFilter
  `card.color === filter.not_color` / `!==filter.color` at :4176–4177;
  `card.color` derived as colors[0] in cards.js :37–46; the multicolor-aware
  accessor `colorsOfCard` already exists at :1497–1505 and is unused here)
  @ `4d739ad`
- **Dimension:** 3 (oracle-text vs behavior) + 1
- **Severity:** P1 (raised from P2 by self-QA recommendation, accepted by runner: live + executed + both cards co-occur in draft pools — the scale reserves P2 for latent) — **found independently by 2 lenses** (one filed P1;
  verifiers trimmed: live blast radius is one card pairing today). Executed
  through the real cast-legality path (`isLegalAction` returns true for the
  forbidden target; a mono-black control is correctly rejected).
- **Evidence (verifier-confirmed ×2, executed):** seal_thief_courier ({U}{B})
  carries `color:'U'`, `colors:['U','B']`; `describeCardText(doom_blade)`
  renders "Destroy target non-Black creature." — the text promises blackness
  exclusion, the engine checks first-pip equality. The positive `color:` filter
  direction shares the bug (a W/U card would fail `{color:'U'}`). Two multicolor
  cards ship today (courier, sword_and_sorcery W/U); both co-occur with
  doom_blade in draft pools. No canon defense found: §200 never defines card
  color as first-pip; PROTOCOL treats colors as the derived plural; matchFilter's
  own header asserts the text-matches-behavior principle this violates. No test
  pins the multicolor case (mono-color fixtures only).
- **Canon:** `cards/doom_blade/card.json` + its rendered oracle text;
  `colorsOfCard` as the existing in-engine truth for multicolor.
- **Fix sketch:** route both checks through the colors ARRAY — `not_color`:
  reject if `colorsOfCard(card)` includes it; `color`: require inclusion. Verify
  the token path in the fix test (makeToken sets colors undefined;
  colorsOfCard falls back to cost-derivation).
- **Effort:** small. **Verification status:** survived adversarial refutation
  twice, confidence high.
- **Remediation class: STAGE** (behavioral one-liner-per-branch in a dark
  region; oracle-anchored single answer — the smallest-friction packet in the
  chunk).
- **Predicted test impact:** none — `test_target_restrictions.js`'s Doom Blade
  pin uses a mono-black creature and stays green; fix adds a multicolor case to
  `test_filter_parity.js`.

#### Decision packet for A4-6 (stage — plain English)
The engine stores one "primary color" per card (the first colored mana symbol)
and color restrictions check only that. So Doom Blade, whose own card text says
"non-Black," can destroy a blue-AND-black creature because its first pip is
blue. Only one such pairing exists today, but every future multicolor card
inherits the hole, in both directions ("target blue creature" would also miss
blue-white cards).
- **Option (only one, confidence: high):** check the full color list (the
  helper already exists for mana purposes) instead of the first pip. Two lines,
  plus a multicolor regression case.

---

### A4-7 — Trigger-path (and ability-path) chooses() never routes to the human prompt: Heir to the Burnt House's dies-trigger silently sacrifices a land of the ENGINE's choosing when the human is the chooser — the choose-your-own prompt contract exists only in the spell resolver
- **Location:** `reference/html-proto/js/engine.js:3704` (runTriggerEffects
  :3703–3707 and doActivateAbility :5588–5591 call applyEffect(chooses)
  directly; `pendingEdictChoice` is written at exactly ONE site —
  resolveTopOfStack :5204; the stale "deferred" comment at :2593–2595)
  @ `4d739ad`
- **Dimension:** 1 (rules correctness / player agency) + 2 (copy-paste
  divergence + comment-vs-code: the comment says the human prompt is deferred,
  but the spell path shipped it)
- **Severity:** P2 — single lens (state), verifier-confirmed with a dynamic
  repro (mild-but-real agency loss filed honestly).
- **Evidence (verifier-confirmed, live-executed):** AI-controlled Heir dies →
  trigger target 'opp' resolves to the human → `EFFECTS.chooses` auto-picks and
  **the human's Forest is silently sacrificed**; `pendingEdictChoice` is never
  set (repro: "prompt never set, 1 of 2 lands remain"). The stated contract
  (`test_edict_human_choice.js` header: "when the chooser is the human,
  resolution pauses with pendingEdictChoice set") is only exercised via
  castSpell; `heir_edict_test.js` only ever puts Heir under 'you', so the human
  branch is untested. heir_to_burnt_house is draftable into AI decks (no
  `special` flag). The ability-path leg is latent (no pool ability uses
  chooses today).
- **Canon:** test_edict_human_choice.js's stated engine contract; Heir oracle
  text ("that player sacrifices a land" — chooser's choice); GAP 2 of
  plan-effects-refactor.md §3.5 (cited in code).
- **Fix sketch:** extract the spell resolver's human-prompt branch (:5192–5218 —
  pool check → pendingEdictChoice with trailingEffects → defer) into a shared
  helper consumed by all three resolution loops; runTriggerEffects already has
  the curTgt/trailing-effects shape needed. Fix the :2593–2595 comment either
  way. Test: a trigger-path twin of test_edict_human_choice.
- **Effort:** medium. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: STAGE** (behavioral; human-agency surface).
- **Predicted test impact:** none — nothing pins the trigger-path chooser.

#### Decision packet for A4-7 (stage — plain English)
"Edict" effects ("that player sacrifices a creature/land") are supposed to let
the affected player choose what to give up — and when a SPELL does it to you,
the game correctly pauses and asks. When a TRIGGER does it (Heir to the Burnt
House dying on the opponent's side), the engine just picks for you, silently.
Today that means a land — low stakes, but it can cost you the wrong color, and
the choice is yours by the card's own text.
- **Option (only one, confidence: high):** reuse the already-shipped spell-path
  prompt machinery for triggers (and abilities, preemptively) via one shared
  helper, and fix the comment that still claims the prompt doesn't exist.
  Rises in importance automatically the day a creature-edict trigger ships.

---

### A4-8 — getValidTargets silently DROPS the target_filter for the creature_or_player / player / opp / spell kinds while its own header (and PROTOCOL §3.5) claim the restriction is honored — the first "deal 3 to any target with flying" or filtered counterspell ships silently unrestricted
- **Location:** `reference/html-proto/js/engine.js:3887` (targetsForFilter
  passes `filter: restrict` into every arm :3886–3894 under the :3881–3885
  honor-it comment; the dropping arms: creature_or_player :3787–3792,
  player/opp :3793–3800, spell :3843–3846 — contrast permanent_or_spell's
  matchFilterSpell at :3859) @ `4d739ad`
- **Dimension:** 2 (structural footgun + comment contradicts code + canon
  contract violated)
- **Severity:** P2 — **found independently by 3 lenses** (+ the spell arm
  separately by a 4th); verifiers split P2/P3 on latency — kept P2 on the
  contract-violation + convergence strength.
- **Evidence (verifier-confirmed ×3, executed):**
  `targetsForFilter('creature_or_player','you',{subtype:'Dragon'})` still offers
  a Goblin (and both players); the same restrict on kind 'creature' returns [].
  The 'spell' arm ignores `{not_token:true}` while permanent_or_spell's stack
  half enforces it. `primaryLegalTargets` — the real cast-time checkpoint —
  inherits the drop; no downstream layer rescues (render's highlight and the
  :5695 pick sanity-check validate membership in the SAME unfiltered set).
  **Latency verified independently three times:** every target_filter pairing
  in the full card pool sits on an arm that DOES filter — zero current
  misbehavior. **Scope trim (verifier):** the player/opp drops are near-vacuous
  (matchFilter's vocabulary is card-axes); the live hazard is
  `creature_or_player` and `spell` — exactly the documented composition points
  for future cards. Mutation corroboration: all five `restrict || undefined`
  pass-throughs survive deletion (map L3845–3851 = anchor :3887–3894).
- **Canon:** PROTOCOL.md §3.5 ("Optional target_filter… Enforced at the same
  cast-time target() checkpoint" — no per-kind carve-out); the function's own
  header comment; the codebase's own precedent that silently-dropped filters
  are a bug class (engine.js:4209's fix comment).
- **Fix sketch:** apply matchFilter to the creature half of creature_or_player
  and matchFilterSpell to the 'spell' arm (note: matchFilterSpell only supports
  spliceable_*/not_token today — type/color counterspell filters need an axis
  extension, a separate decision); for player/opp either document that card
  filters don't apply to players or boot-reject the pairing via
  validateAllCardEffects. Fix or scope the header comment either way. Regression
  test per arm.
- **Effort:** small + per-arm tests. **Verification status:** survived
  adversarial refutation three times, confidence high.
- **Remediation class: STAGE** (behavioral enforcement addition; latent).
- **Predicted test impact:** none — no existing test exercises these combos.

#### Decision packet for A4-8 (stage — plain English)
Card authors can attach a restriction to a target ("…with flying", "non-token").
For four of the ten target categories, the engine accepts the restriction and
then silently ignores it — while the code comment and the protocol doc both
promise it's enforced. No shipped card falls in the trap yet (verified three
times over the whole pool), but the two dangerous categories ("any target" and
"target spell") are exactly where the next interesting card would use one — and
the oracle text would happily print the restriction the engine isn't applying.
- **Option A (recommended, confidence: high):** wire the existing filter checks
  into the two meaningful arms, and for player-targets either document or
  boot-reject the nonsensical pairing. Comes with a per-arm test.
- **Option B (cheaper stopgap):** boot-reject `target_filter` on the four kinds
  until the arms are wired — converts the silent trap into a loud authoring
  error. Either way the lying header comment gets fixed.

---

### A4-9 — Non-combat "trample" spills excess damage to the controller from ANY effect damage (fight included), a mechanic canon doesn't define, card text doesn't promise, and the engine's own reminder text contradicts — plus the spill math ignores the deathtouch threshold the combat path honors
- **Location:** `reference/html-proto/js/engine.js:1736` (applyDamageFrom spill
  branch :1733–1752; fight per-combatant ctx :2732–2744; the deliberate-design
  comment at :1733; combat's deathtouch-aware lethalNeeded contrast at
  :5377–5379) @ `4d739ad`
- **Dimension:** 1 (code-vs-canon fork, the A2-7 mold) + 3 (oracle text)
- **Severity:** P2 — single lens (rules) for the fork; the coverage half found
  independently by testquality (mutation-executed).
- **Evidence (verifier-confirmed, live-executed):** Forest Titan (5-power
  trampler) fights Savannah Lions (2/1) via Prey Upon → opp life 20 → 16 — 4
  spilled to the chump's controller from a *fight* whose card text promises only
  mutual power damage. Canon §902.2 (`900-keywords.md` L43–44) defines trample
  exclusively for an attacking, blocked creature. **The codebase disagrees with
  itself three ways (verifier):** the player-facing reminder text (cards.js:327)
  says "COMBAT damage beyond what would destroy its blockers…"; card-text.js
  :987–991 calls combat keywords on spells "nonsensical" and filters Trample
  from spell preambles; yet cards.js:375–385 + controller.js deliberately offer
  trample stickers to damaging sorceries — which only do anything via this
  spill branch, so the SPELL-damage spill is demonstrably intended design while
  the FIGHT-path spill reads as collateral (the fight handler's own intent
  comment :2730 lists deathtouch/lifelink and conspicuously omits trample).
  Sub-claim verified: the spill's lethalNeeded math (:1738) has no deathtouch
  threshold-1 adjustment; the combat path does. **Coverage (testquality,
  mutation-executed):** deleting the spill condition outright AND making the
  deathtouch victim-mark dead code both pass 1842/1842 — the whole non-combat
  keyword-rider block is unfenced. 16 trample cards × 4 fight cards co-occur
  naturally in green drafts.
- **Canon:** `900-keywords.md` §902.2 + `800-combat.md` L40; A2-7 (same fork
  shape — comment asserts intent, canon states the rule unqualified, the UI
  reminder text sides with canon).
- **Fix sketch (genuine fork, A2-7 style):** **(a)** restrict the spill to
  combat damage or at minimum gate it out of `fight` (matches canon, card text,
  and the engine's own reminder text; spell-trample stickers then need a design
  answer); **(b)** keep proto-trample as deliberate design — then canon §902
  gains the non-combat clause, the reminder text and spell-preamble filter get
  fixed to match, card-text renders the rider, and the deathtouch threshold is
  honored for consistency. Either choice brings the currently-absent tests
  (deathtouch fight kill; spill assertion).
- **Effort:** small (a) / medium (b). **Verification status:** survived
  adversarial refutation, confidence high.
- **Remediation class: STAGE** (genuine design fork; mutation-dark either way).
- **Predicted test impact:** none — no test exercises the non-combat spill or
  the fight-deathtouch path.

#### Decision packet for A4-9 (stage — plain English)
Trample ("excess damage carries over to the player") is a combat rule. This
engine also applies it to NON-combat damage: a trampler that *fights* leaks the
excess into the defending player's face — something the fight card's text never
says, the rulebook doesn't define, and the game's own trample reminder text
("combat damage beyond…") contradicts. Meanwhile the trample-sticker-on-sorcery
feature shows the spell-damage half IS intended design. So the question is
where you want the line:
- **Option A (recommended, confidence: medium-high):** keep spell-trample as the
  deliberate design it clearly is, but gate the spill out of *fight* (fight's
  own code comment omits trample; deathtouch/lifelink stay). Fix the reminder
  text either way.
- **Option B:** embrace the full extension — write it into the rulebook §902,
  the reminder text, and the rendered card text, and make the spill math honor
  deathtouch like combat does.
- Either option finally puts a test on this block — currently you could delete
  the whole spill and the suite stays green.

---

### A4-10 — PROTOCOL.md's effects/targeting catalogs (§3.2/§3.5) misdocument the wire they canonize, five-plus ways — including a worked example whose key the engine silently ignores  ⟶ SHIP (docs-only)
- **Location:** `docs/PROTOCOL.md:269–291` (§3.5 camelCase filter axes +
  examples), `:131–160` (§3.2 catalog rows), `:251–252` (the §3.5 cast-time-only
  legality sentence) @ `4d739ad`
- **Dimension:** 2 (the cross-engine spec lies about the working engine — the
  exact rows the Godot port would transcribe)
- **Severity:** P2 — **found independently by 2 lenses**; every cell verified
  against code + card data + live execution.
- **The corrections, each verified (and live-executed where noted):**
  1. **§3.5 lists every target_filter axis in camelCase** (`notColor`,
     `hasKeyword`, `notKeyword`, `maxTough`/`minTough`, `maxPower`/`minPower`,
     `notToken`) with the worked example `{notColor: "B"}` — the engine matches
     **snake_case only and silently ignores unknown keys** (live repro:
     `{notColor:'B'}` accepts a black creature, `{not_color:'B'}` rejects it);
     the shipped doom_blade card uses `not_color`; §3.2's own naming-rule
     paragraph (:165–179) says target filters were snake_cased — the doc
     self-contradicts. A card authored from this doc fails open, no error.
  2. **Phantom kind `fight_target`** (:148) — the real kind is `fight` with an
     `operands` array ({slot}/{select} descriptors, 4 cards); the row's
     semantics describe only the `{select:'highest_power_yours'}` variant.
  3. **grant_keyword row documents phantom param `whose: "allYours"/"all"`** —
     the handler reads `scope: 'all_yours'|'all_creatures'` (:2488); `whose`
     appears nowhere in code or cards.
  4. **create_tokens row says `tokenId`** — code reads `token_id` (:2521); the
     `controller` param is undocumented.
  5. **The "full catalog" omits live kinds:** `become_copy_of` (false_witness),
     `grant_cast_permission` (seal_thief_courier — it even has an EFFECT_SCHEMA
     validator), the named-counter form of `add_counter` (used in card data by
     hymnwright — the doc actively says add_counter "was" retired into pump),
     and `steal` (semi-defensible as a runtime-internal per ai.js's note — note
     it rather than fully row it); `move_card`'s selector list omits
     `copy_source`.
  6. **Rider from A4-1's closure:** §3.5 :251–252 ("checked once, at the
     target() step (cast time)") now contradicts both the rulebook §704 AND the
     shipped PR #111 behavior (re-validated at resolution) — align the sentence
     with the four agreeing sources.
- **Canon:** self-referential — PROTOCOL is corrected against the code + shipped
  card data, which agree (test_filter_parity pins snake_case as canon); A3-8 /
  A1-12 established this exact ship lane for §3.3/§3.6.
- **Fix sketch:** one docs pass — snake_case the §3.5 axis list + examples;
  fight_target → fight + operands; whose → scope; token_id + controller; add
  the missing catalog rows + copy_source; fix the :251–252 legality sentence;
  consider a §3.2 line noting the catalog is hand-synced and pointing at
  `effectCoverageReport` for the machine-checked layer.
- **Effort:** small. **Verification status:** every cell survived adversarial
  refutation with grep + live-execution evidence, confidence high.
- **Remediation class: SHIP (docs-only)** — recording reality changes no
  behavior; gate is suite + lint green.
- **Predicted test impact:** none.

---

### A4-11 — matchFilter's key vocabulary is an open tail with no boot validation: a typo'd or camelCase target_filter key is silently ignored and the card targets MORE than its designer intended — the validator gap that turns A4-10's doc bug into live mis-targeting
- **Location:** `reference/html-proto/js/engine.js:4173` (matchFilter — fixed
  if-chain, unknown keys fall through to `return true`); validateAllCardEffects
  :3223–3253 checks taxonomy names only, never filter KEYS @ `4d739ad`
- **Dimension:** 2 (silent-failure path on the legality-critical surface; the
  A1-6/A3-14/A3-5 class)
- **Severity:** P2 — single lens (footguns), verifier-confirmed with execution.
- **Evidence (verifier-confirmed, executed):** `{hasKeyword:'flying'}` (the
  PROTOCOL spelling) and `{max_tuogh:2}` both boot clean
  (`validateAllCardEffects` → all-empty), pass `test_effect_validation`, and
  over-target at runtime with zero signal. **Verifier deepener:** procedural
  card text (withFilter) drops the same unknown keys, so the rendered text stays
  consistent with the broken behavior — no visual tell either; the lie is
  engine-vs-designer-intent. Current pool verified clean (every used key is
  consumed). TARGET_FILTERS' own header brags "there is no open tail" for the
  adjacent taxonomy — the restriction vocabulary has exactly the open tail the
  taxonomy closed. test_filter_parity's CASES list is hand-synced ("Keep this
  list in sync with matchFilter") and detects nothing unknown.
- **Canon:** the project's boot-validation discipline (CLAUDE.md
  predicate-registry pattern: surface typos at boot); PROTOCOL §3.5's
  closed-axis presentation.
- **Fix sketch:** define `MATCH_FILTER_KEYS` next to matchFilter;
  validateAllCardEffects walks every target_filter / buff.filter / effect.filter
  and flags unknown keys (same shape as unknownFilters). **Implementer caveat
  (verifier):** the whitelist must union matchFilter keys + matchFilterSpell
  keys + the graveyard_card axes (`graveyards`, `select`) or it false-positives
  on deepseam_quarry/seal_thief_courier. Test fixture with a typo'd key.
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: STAGE — rides A3-5's GO (verdict round 3):** same
  boot-validation-extension class Joe already approved for the generator
  tables; this packet is the card-data filter-vocabulary sibling.
- **Predicted test impact:** additive only.

#### Decision packet for A4-11 (stage — rides the A3-5 pattern, plain English)
Startup validation checks that every ability a card references exists — but not
the *keys inside target restrictions*. Misspell one (or copy the protocol doc's
wrong spelling, A4-10) and the restriction silently doesn't enforce; even the
auto-generated card text hides it. Nothing is broken today; this adds the
missing net. Same shape as the generator-table check you already approved
(A3-5) — extend the startup sweep + one test. One care point: the valid-key
list must include the graveyard-search axes or two real cards false-positive.

---

### A4-12 — Phylactery's unconditional "Your life can't go below 0" is violated by life-LOSS effects: drains subtract directly with no floor and no rip, leaving the protected player alive at negative life indefinitely — and the next damage then RESETS them to 0 (a net gain from being hit) while ripping full-amount slots
- **Location:** `reference/html-proto/js/engine.js:2343` (gain_life negative
  branch :2336–2351 — raw `G[who].life += amount`, no Phylactery branch);
  damagePlayer's floor+rip contrast :4962–4988; checkLifeTotals deferral :4847
  @ `4d739ad`
- **Dimension:** 1 (rules correctness — the boon's own oracle text violated) +
  2 (one rule, two implementations)
- **Severity:** P2 — **found independently by 2 lenses** (one filed P3 weighting
  player-favorability; kept P2 on the unconditional-text violation + the
  incoherent-state follow-on).
- **Evidence (verifier-confirmed ×2, live-executed through real card paths):**
  with Phylactery live and life 1, a real drain-2/3 (Blood Priest's ETB; the
  ~14-card negative-gain_life drain family, several in opp deck pools) takes
  life to **−1/−2, rips 0 slots, gameOver=false**; the contrast leg (Lightning
  Bolt 3 at life 1) floors at 0 and rips 2. **Verifier follow-on:** at negative
  life, the next damagePlayer computes `max(0, neg − amount)` → life RESETS UP
  to 0 while ripping `amount` slots — taking damage at −5 is a net life gain.
  No test pins the phylactery×life-loss interaction (only text-rendering tests
  mention the card).
- **Canon:** `cards/phylactery/card.json` oracle text — clause 1 ("Your life
  can't go below 0") is unconditional and violated; clause 2 ("Damage past 0 —
  and each would-be overdraw — rips") is **damage-scoped by its own wording**,
  so whether drains should also rip is a design ruling, not a bug.
- **Fix sketch:** extract a shared `losePlayerLife(who, n)` used by both
  damagePlayer's post-absorb path and gain_life's negative branch — floor at 0
  under protection, identical lifeLostThisTurn/life_changed emission. **The
  decision to surface:** (a) drains past 0 also rip (consistent price for the
  same life loss; amend the card text to "life lost past 0"), or (b) drains
  floor free (strict reading of the printed rip clause — strictly
  player-favorable vs damage). The floor itself is non-optional either way.
- **Effort:** small (code is tiny; the rip question is the work).
  **Verification status:** survived adversarial refutation twice, confidence
  high.
- **Remediation class: STAGE** (genuine design wrinkle on top of an unambiguous
  floor fix).
- **Predicted test impact:** none — test_signed_life/test_drain_lifeloss run
  without Phylactery slots and stay green.

#### Decision packet for A4-12 (stage — plain English)
Phylactery's first printed rule is absolute: "Your life can't go below 0."
Burn damage respects it (floors at 0, rips deck slots for the overflow). Life
DRAIN ignores it — verified at −2 life with zero slots paid, and the game then
behaves incoherently (taking damage at negative life snaps you back UP to 0).
The floor fix is unambiguous. The open question is the price:
- **Option A (recommended, confidence: medium):** drains past 0 rip slots too —
  one consistent price for losing life, with a one-word card-text amendment
  ("damage" → "life lost").
- **Option B:** drains floor at 0 for free — the literal reading of the printed
  rip clause, but it makes drains strictly weaker than burn against the boon.
- Either way: shared floor helper + the first behavioral Phylactery test.

---

### A4-13 — doActivateAbility's scope:'self' branch lacks the creature-vs-player fork BOTH sibling resolvers have: the third hand-synced copy of the v0.99.29 Final Strike fix, divergent — the first "T: deal 1 to you" ability damages the creature instead
- **Location:** `reference/html-proto/js/engine.js:5593` (unconditional
  `tgt = {kind:'creature', iid: card.iid}`); the fixed siblings with the
  documented bug class: resolveTopOfStack :5225–5240, runTriggerEffects
  :3716–3727; the contract at CREATURE_EFFECT_KINDS :3257–3263 @ `4d739ad`
- **Dimension:** 2 (copy-paste divergence, one fact in three hand-synced
  copies) + 1 (latent)
- **Severity:** P2 — **found independently by 2 lenses**; verifiers downgraded
  to latent (every live self-effect survives via handler controller-fallbacks)
  but confirmed the misroute by execution (synthetic damage-self ability hit the
  creature; controller life unchanged).
- **Evidence (verifier-confirmed ×2, executed):** the 6 live ability-level
  scope:'self' effects all coincidentally land right — pump ×3 (correctly
  creature), gain_life (patient_saint) + move_card ×2 (looter/scrying_wizard)
  only via handlers' ctx.controller fallbacks. A damage-kind self ability passes
  boot validation and silently misbehaves. **Fix-design caveat (verifier find):**
  `artifice_triumphant` grants an activated ability with `add_type
  scope:'self'`, and add_type is NOT in CREATURE_EFFECT_KINDS — naively copying
  the siblings' branch would break that card; the fix must also add add_type to
  the set.
- **Canon:** CREATURE_EFFECT_KINDS contract comment ("damage/gain_life/draw/
  discard/add_mana resolve self → controller"); the v0.99.29 bug note in the
  spell resolver.
- **Fix sketch:** extract one `resolveSelfTarget(eff, sourceIid, sourceName,
  controller)` helper returning the creature-or-player descriptor, used by all
  three resolution loops (shrinks the triplication); add add_type to
  CREATURE_EFFECT_KINDS in the same change; unit test pinning ability-self for
  a player-operating kind.
- **Effort:** small. **Verification status:** survived adversarial refutation
  twice, confidence high.
- **Remediation class: STAGE** (behavioral for hypothetical future cards;
  existing 6 self-effects produce identical results).
- **Predicted test impact:** none — suite green (verified; test_scope_self_and_
  subtype's patient_saint pin passes via the fallback either way).

#### Decision packet for A4-13 (stage — plain English)
"This effect applies to itself" means the creature for some effects (pump) and
the *controller* for others (damage = "you lose N", draw, gain life). That rule
is implemented three times — spells, triggers, abilities — and the ability copy
is missing the fork, the exact bug fixed in v0.99.29 for the other two. Today's
cards survive by lucky fallbacks; the first "tap: deal 1 to yourself" ability
silently burns the creature instead. One shared helper fixes it and de-dupes
the three copies — with one trap the fix must dodge (a shipped card depends on
add_type staying creature-routed).

---

### A4-14 — getStats ↔ matchFilter mutual recursion: any lord static_buff filter using a stat bound (max/min power/toughness) hard-crashes every getStats call with RangeError — one ordinary-looking card.json edit away, invisible to boot validation
- **Location:** `reference/html-proto/js/engine.js:1188` (getStats lord loop
  calls matchFilter per lord) + :4180–4198 (matchFilter's four stat-bound axes
  each call getStats back — no recursion guard); second entry point
  applyStaticKeywordGrants :3327 @ `4d739ad`
- **Dimension:** 2 (latent footgun — crash class)
- **Severity:** P2 — single lens (state), verifier-confirmed empirically
  (RangeError reproduced with a data-only buff edit; stock filter control fine).
- **Evidence (verifier-confirmed, executed):** all 10 shipped lords use
  `{controller:'self'}`+subtype filters, so the cycle is open today — but the
  matchFilter→getStats direction is ALREADY exercised live (reaper_shade
  `max_tough:2`), and "creatures with power 2 or less get +1/+1" is a natural
  future lord. Boot validation can't catch it (validateAllCardEffects never
  inspects static_buffs), and `describeStaticBuff` can't render stat bounds —
  so procedural text would silently omit the restriction too. getStats is
  called pervasively (AI scoring, SBAs, render, combat sims): one matching
  creature = hard crash of the game. **Verifier bonus:** applyStaticKeywordGrants
  is a second crash entry point, firing from emit() pre-trigger.
- **Canon:** matchFilter is documented as the generic composable filter
  language shared by static buffs — the combination looks intended.
- **Fix sketch:** in the lord loops, evaluate filters against a stats-free view
  (a `matchFilterNoStats` skipping the four bound axes — thresholding on
  pre-lord stats is also the only non-circular semantics), OR boot-reject stat
  bounds inside static_buffs until supported. Pairs naturally with A4-2's
  shared-predicate extraction — **adjudicate in the same sitting**.
- **Effort:** small–medium. **Verification status:** survived adversarial
  refutation, confidence high.
- **Remediation class: STAGE** (latent crash; couples to the staged A4-2).
- **Predicted test impact:** none — additive test only.

#### Decision packet for A4-14 (stage — plain English)
Two functions call each other: "what are this creature's stats?" asks "does the
lord's buff apply?", which for buffs like "creatures with power 2 or less" asks
"what are this creature's stats?" — forever, crash. No shipped card closes the
loop yet, but it's one normal-looking card edit away, startup validation
wouldn't catch it, and the crash takes the whole game down (AI, rendering,
everything reads stats). Decide alongside A4-2's shared-predicate work:
- **Option A (recommended, confidence: medium-high):** lord filters evaluate
  stat bounds against pre-buff stats (the only non-circular meaning) via a
  guard in the shared predicate.
- **Option B:** ban stat bounds in lord buffs at startup until someone designs
  the semantics deliberately.

---

### A4-15 — The steal handler writes the HUMAN's run state for ANY controller: an opponent-cast Steal appends the stolen slot to the VICTIM's persisted run deck (localStorage) — the lone RUN-writing handler without the 'you' gate every sibling has
- **Location:** `reference/html-proto/js/engine.js:2292` (ungated
  `RUN.appendSlot(...)`; gated siblings: endomorph_absorb :2103–2105,
  apply_sticker :2185, rip :2584; the handler's own controller-aware READ at
  :2238 makes the write the lone exception) @ `4d739ad`
- **Dimension:** 2 (handler state discipline — out-of-contract global write)
- **Severity:** P2 — single lens (state), verifier-confirmed by execution
  (opp-controlled `change_control{transfer_ownership:true}` → human's run went
  12 → 13 slots, duplicate of its own card, persisted via save(); victim's
  original slot kept; the fresh opp card's slotIdx points INTO the human's
  slots, so later persistence writes would compound).
- **Evidence:** latent today — steal/card.json is `special:true` (excluded from
  drafts) and no opp deck carries it — but **the codebase actively maintains
  opp-side casting support** (test_boss_removal_ai pins that the AI casts
  steal; ai.js values transfer_ownership), so the moment any thief boss ships,
  the corruption fires into the player's save.
- **Canon:** the sibling handlers' uniform 'you'-gate convention; steal's own
  :2238 branch.
- **Fix sketch:** gate the appendSlot/getSlots block on `ctx.controller ===
  'you'`; for an opp thief, skip the slot mint (fresh card into opp's in-game
  library only) and decide explicitly whether the victim's slot is removed
  (probably not — in-game-only theft). Note for the same sitting: the missing
  `removeSlotByIdx` means victim-loses-the-slot semantics has no implementation
  at all (same root).
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: STAGE** (behavioral; save-corrupting landmine —
  must-fix-before-any-thief-boss).
- **Predicted test impact:** none — no test exercises opp-controlled steal
  resolution.

#### Decision packet for A4-15 (stage — plain English)
"Steal" permanently moves a card into the thief's run deck. The code that
writes the run deck doesn't check WHO the thief is — and there's only one run
deck: yours. So the day an enemy gets a steal effect, stealing YOUR card would
*add a duplicate of your own card to your saved run* (corrupting the save file)
while the enemy gets its copy too. Unreachable today (no enemy carries it), but
the AI already knows how to cast it, so it's a landmine under any future thief
boss. One-line gate + an explicit decision on what an enemy steal should do to
your deck (recommendation: nothing permanent — in-game theft only).

---

### A4-16 — move_card's battlefield-leave path never flushes Elystra's "last forever" buffs: `post.keep_buffs` is a dead parameter the refactor plan specified but no card ever got, so Cloudshift/Otherworldly Journey/Oblation silently discard her pending permanent buffs while every other leave path flushes
- **Location:** `reference/html-proto/js/engine.js:2412` (the dead
  `post.keep_buffs` fork — sole reference repo-wide; the else branch wipes
  without flushPermanentEotToPermaBuffs); the false header at
  leavesPlayPreservingBuffs :4655–4656 ("Used by bounce, exile, flicker" —
  false for every move_card-based one) @ `4d739ad`
- **Dimension:** 3 (oracle-vs-behavior) + 2 (incomplete migration — the plan
  specified the flag, the cards never got it)
- **Severity:** P2 — single lens (state), verifier-confirmed by execution
  (pumped Elystra +2/+2, real Cloudshift cast → permaBuffs undefined, returns
  1/1; the affect_creature bounce control correctly banks {power:2,toughness:2}).
- **Evidence:** plan-effects-refactor.md :548/:769 explicitly specifies flicker
  as `move_card` with `post:{keep_buffs:true}` — the migration shipped without
  the flag (incomplete migration, not intent). All other leave paths flush
  (checkDeaths, moveToGraveyard, sacrificeCard, affectOneCreature bounce/exile,
  cleanup). **Scope trim (verifier):** previously-banked permaBuffs survive
  (resetInPlayState re-applies from the slot); only the CURRENT turn's pending
  temp buffs/EOT grants are silently lost — which is exactly what Elystra's
  oracle says lasts forever.
- **Canon:** `cards/elystra_the_immortal/card.json` oracle text;
  plan-effects-refactor.md's stated flicker spec.
- **Fix sketch:** call `flushPermanentEotToPermaBuffs(card)` unconditionally
  before the reset in the battlefield-leave branch (it self-gates on
  `tpl.permanent_eot` — a no-op for everything else; the safer fix vs adding
  the flag to three card JSONs), delete the dead keep_buffs fork, fix the stale
  header. Test: pump Elystra → move_card bf→exile → assert slot.permaBuffs grew.
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: STAGE** (behavioral one-spot fix; rides the
  small-payload-fix lane the A2-8/A3-11 PRs established).
- **Predicted test impact:** none — test_flicker/test_move_card never assert on
  permaBuffs.

#### Decision packet for A4-16 (stage — plain English)
Elystra's whole gimmick is that temporary buffs on her become permanent at end
of turn. Every way she can leave the battlefield banks her pending buffs first
— except the "flicker/exile/bounce" effects routed through one particular code
path, which was supposed to get a "keep the buffs" flag per the refactor plan
and never did. So a Cloudshift on a pumped-up Elystra silently eats this turn's
gains. Recommended fix is the unconditional one (the banking function already
no-ops for every other card), plus deleting the dead flag and fixing a comment
that claims the safe path is used when it isn't.

---

### A4-17 — Missing-target / missing-param failure modes in the handlers are an uncaught TypeError or NaN corruption, not the documented fizzle — and EFFECT_SCHEMA's 4-of-31-kind coverage (a documented scope choice) leaves required numeric params unvalidated, so the misauthored card boots clean and breaks mid-resolution leaving half-applied state
- **Location:** `reference/html-proto/js/engine.js:1086` (resolveTarget
  null-deref under a "fizzle-on-missing-target" header that only covers the
  stale-target case), :1717–1744 (applyDamageFrom — `undefined <= 0` is false →
  `damage += undefined` = NaN), :2327 (add_mana TypeError on missing amounts),
  EFFECT_SCHEMA :3199–3221 @ `4d739ad`
- **Dimension:** 2 (silent-default / loud-crash family — the A1-6/A3-14 class
  on the resolution path; legality-vs-execution divergence of the A1-2 shape)
- **Severity:** P2 — **found by 3 lenses in overlapping pieces** (footguns:
  TypeError + limbo state; testquality: NaN + schema; state: the
  NaN/grant_keyword/apply_sticker sweep). Verifiers trimmed every piece to
  *latent* (full-pool + generator scan: zero reachable producers) — kept P2 as
  the merged hardening packet because the failure mode is mid-mutation state
  corruption, not a clean error.
- **Evidence (verifier-confirmed ×3, executed end-to-end):** a Sorcery authored
  `{kind:'damage', amount:2}` with no target **boots clean, passes
  isLegalAction, then throws TypeError out of executeAction mid-resolution —
  the spell ends in NO zone** (popped from hand and stack, never reached the
  graveyard push). A damage effect missing `amount` boots clean and writes
  `damage = NaN` — the creature is immune to ALL damage for the turn (NaN+2 =
  NaN; a normally-lethal follow-up Shock verified non-lethal), until cleanup
  resets damage. `add_mana` missing both amounts/choose throws raw TypeError.
  EFFECT_SCHEMA's 4-kind scope is a **documented decision** (:3186–3189 "only
  the new kinds are checked"), so this is filed as the gap between that scope
  and the validator's stated typo-catching mission, not as an oversight.
  Grep: exactly one `try {` in all of engine.js (a coverage probe) — nothing
  contains the throw.
- **Canon:** validateAllCardEffects' own header ("Surfaces typos at boot rather
  than at resolution"); resolveTarget's fizzle-contract header; A1-2's filed
  verdict that uncaught mid-action throws + half-applied state are a defect
  class.
- **Fix sketch:** (1) two-line guard in resolveTarget (`if (!target ||
  target.iid == null) { log fizzle; return null; }`) + a player/creature guard
  at applyDamageFrom's head (`params.amount || 0`, matching the mass arm);
  (2) extend EFFECT_SCHEMA: damage/gain_life/draw/discard require numeric
  amount or {from:…}; add_mana requires amounts|choose; grant_keyword requires
  keyword; create_tokens requires known token_id; plus "targeted kinds require
  target/scope/target-step at the card level". Additive entries in
  test_effect_validation.
- **Effort:** small–medium. **Verification status:** survived adversarial
  refutation three times (each verifier independently re-executed), confidence
  high.
- **Remediation class: STAGE — rides A3-5's GO (validation-extension class)
  with the A1-6/A3-14 silent-default precedent** for the guard halves.
- **Predicted test impact:** additive only (full pool verified well-formed —
  the new schema entries flag nothing shipped).

#### Decision packet for A4-17 (stage — rides the A3-5/A1-6 patterns, plain English)
If a future card is authored with a required piece missing (no target, no
damage amount), startup validation waves it through and the failure surfaces
mid-game in the worst ways we found: an uncaught crash that leaves the spell in
NO zone, or "NaN damage" that makes a creature unkillable by damage for a turn.
Nothing shipped is malformed (checked the whole pool and every generator); this
is the same authoring-safety-net class you already approved twice (A3-5's
startup sweep, A1-6's loud-instead-of-silent default). Two small guards + a
handful of schema entries + tests.

---

### A4-18 — Effects/targeting coverage darkness decomposed + test-quality cluster (dimensions 4/5, grouped): 698/1274 effects-region and 64/153 targeting-region survivors bucketed by function, with named dark handlers, brittleness flags, and the verified-clean negative space  ⟶ park (grouped, A1-23/A3-9-style)
- **Location:** `C:/Users/Joe/.config/magiclike/audit/mutation/
  engine-effects-region-survivors.txt` + `engine-targeting-region-survivors.txt`
  (map @ `bb8ea9f`, +30–60 line drift vs anchor — content-matched) @ `4d739ad`
- **Dimension:** 4 + 5
- **Severity:** P2 — the decomposition was **independently re-derived by the
  verifier** (function-boundary bucketing re-run from scratch; per-mutant
  status cross-checked against results.json), and the headline mutants were
  re-executed live against the 1842-assertion suite.
- **The decomposition (verifier-exact):**
  1. **257/698 (≈37%) is AI valuation heuristics** (getCardValue 131 +
     sacValueOnBoard 51 + abilityValue 75) — judgment coefficients with no
     canonical right answer; recommend excluding from the rules-coverage
     denominator and **handing to chunk 7**; annotate the map so future runs
     don't re-litigate.
  2. **79 is the A1-2 mana cluster** (canPayFromPool/canPayPotential/payMana/
     deductFromPool/tapSourceProducing) — already filed/staged.
  3. **97 sits in `apply_in_game_splice`** — the single darkest handler;
     **chunk 5 owns it** (lead handed forward, incl. the observation that its
     combat-state transfer does NOT use the PR #103/104 removeFromCombat
     funnel — bespoke logic, flagged).
  4. **Dark handlers needing real fences:** steal 18 (slot/meta copy side),
     grant_keyword 16 (scope + already-had arms), grant_cast_permission 11
     (every mutant of the dedup/replace filter survived), move_card 9
     (**verifier-corrected:** the copy_source guard, two zone-pair conditions,
     and the on-exit state-reset flips — owner routing is FENCED by
     test_move_card; keep_buffs generated no mutants), add_counter 9
     (**corrected:** spans BOTH the named-counter arm and the +X/+X
     permanent-counter arm), endomorph_absorb 8, affectOneCreature bounce/exile
     arms 8, become_copy_of 7, create_tokens 7 (**corrected:** TOKEN_ALIAS map /
     count default / log pluralization — the controller:'opp' arm is killed by
     test_optional_paid_etb), placeCardOnBattlefield posts 7, snapshotTarget 7
     (the REAL auto-snapshot path — the D1 tests hand-build snapshots, so
     makeSlotTargetGetter's pipeline is implementation-bypassed), validation
     region 25.
  5. **Targeting region:** biggest cluster is the slot-classification plumbing
     (tsSlotValueEff/tsSlotTargetType/tsIsImplicitTargetType = 18), plus
     tsEnumerate's TS_COMBO_CAP boundary, the two hexproof inversions (A4-24),
     and the five restrict pass-throughs (A4-8). The `s.kind !== 'trigger'`
     stack-filter inversions also survive ("counterspells can only target
     triggers" passes green).
  6. **Verified-strong negative space:** the five dedicated effects/targeting
     test files are genuinely behavioral (no green theater found — a first for
     the campaign's test-quality lens); the 0-survivor handlers match
     test_effects_scope/test_add_type exactly; **the dispatch-table sync
     problem is mechanically SOLVED** (effectCoverageReport + test_effect_
     coverage assert exhaustiveness in both directions with a fake-kind
     canary) — the two unfenced sync surfaces are exactly A4-10 (PROTOCOL,
     hand-synced) and A4-11 (matchFilter keys, open tail).
  7. **Brittleness flags:** test_lord_keyword_grants pins "exactly these six
     lords" (intentional tripwire — will read as a false regression on the
     next lord); test_filter_parity's hand-synced CASES dict silently
     un-covers any new matchFilter key (introspect the key list instead).
  8. **Equivalent-mutant caveat (verifier):** a minority of survivors are
     equivalent (e.g. gain_life `>0`→`>=0` unreachable at 0), so ~55% slightly
     overstates true darkness — the named dark spots were all verified real
     killable-but-unkilled.
- **Fix sketch (park — test additions, prioritized):** 1) grant_cast_permission
  dedup/duration; 2) steal's slot/meta copy (RUN-layer mock); 3) grant_keyword
  scope arms; 4) snapshotTarget via the real makeSlotTargetGetter pipeline;
  5) fetchLibraryToBattlefield library-integrity assertion; 6) hexproof
  permanent/permanent_or_spell pins (A4-24's two assertions); 7) the
  deathtouch-fight + trample-spill pins (A4-9). The staged A4 fixes each bring
  their own red→green slice; this list is the remainder.
- **Effort:** medium (tests only, parallelizable). **Verification status:**
  survived adversarial refutation with the full decomposition re-derived,
  confidence high; three bucket parentheticals corrected by the verifier (noted
  inline above).
- **Remediation class: PARK** (test additions + map hygiene; the ladder allows
  landing new tests anytime).
- **Predicted test impact:** additive only.

---

### A4-19 — A countered spell is routed to its CONTROLLER's graveyard, not its OWNER's — the only zone-routing site in the engine that breaks the owner rule, live via Seal-Thief Courier's cast-permission flow
- **Location:** `reference/html-proto/js/engine.js:2313` (EFFECTS.counter
  `G[removed.controller].graveyard.push(...)`; owner-routed siblings:
  resolveTopOfStack :5266/:5271, moveToGraveyard :4339 with its "matters when
  the dying card was stolen" rationale, sacrificeCard, checkDeaths, both
  move_card branches) @ `4d739ad`
- **Dimension:** 1 (zone-routing rules) + 2 (copy-paste divergence — the lone
  outlier among ~7 sibling sites)
- **Severity:** P3 — **found independently by all 4 lenses** (one filed P2;
  verifiers uniformly trimmed for the narrow trigger window). Kept P3 on the
  chunk-3 A3-11 precedent (four-lens convergence at honest latency).
- **Evidence (verifier-confirmed ×4, executed end-to-end with legal actions):**
  Seal-Thief Courier exiles an opp-owned card + grants a cast permission;
  doCastSpell never re-stamps owner; counter it (counterspell/arcane_denial/
  tide_charm live) → **the opponent's card lands permanently in YOUR graveyard**
  (wrong side's recursion/graveyard-scoped targeting sees it). Canon is
  explicit: `700-casting-and-activating.md` §706 L51 — a countered spell goes
  "to its owner's graveyard"; and the project's own test pins owner-routing for
  the *resolution* of this exact flow (test_seal_thief_courier /
  test_cast_from_exile_ui), making counter the lone divergent site.
- **Canon:** §706; `400-zones.md` L29; the moveToGraveyard rationale comment.
- **Fix sketch:** one line — `G[removed.card.owner ||
  removed.controller].graveyard.push(removed.card)` — matching every sibling.
  Regression test: counter a permission-cast opp-owned card.
- **Effort:** trivial. **Verification status:** survived adversarial refutation
  four times, confidence high.
- **Remediation class: STAGE** (behavioral one-liner in a dark region — the
  owner-routing survivors map-L1814/L2159 = anchor :1838/:2183 show the class
  is unfenced; rides the A2-8/A3-11 one-liner lane, PR #108 precedent).
- **Predicted test impact:** none — no test pins counter's graveyard
  destination.

#### Decision packet for A4-19 (stage — plain English)
Everywhere else in the engine, a card that ends up in a graveyard goes to its
OWNER's graveyard — there's even a comment explaining why (stolen cards). The
counterspell handler is the one exception: it files the countered card under
whoever was *casting* it. With Seal-Thief Courier you can cast the opponent's
own card; counter that, and their card lives in your graveyard for the rest of
the game, visible to your recursion and invisible to theirs. Rulebook §706 and
the engine's own test for this flow both say owner. One-line fix, found
independently by all four review lenses, rides the same one-nod lane as the
shipped A2-8/A3-11 one-liners.

---

### A4-20 — fetchLibraryToBattlefield bypasses the placeCardOnBattlefield arrival discipline: no §3.7 iid re-mint, no summoning sickness, no post handling — latent (all five users are land-only) but the schema, PROTOCOL, and the plan contract all bless the creature-fetch authoring that trips it silently
- **Location:** `reference/html-proto/js/engine.js:1968` (raw splice →
  optional tap → battlefield.push → emit; contrast placeCardOnBattlefield
  :1877–1900 — iid mint per §3.7, `sick = !hasHaste`, post handling); move_card
  routes EVERY library→battlefield here (:2374–2377); isSupportedMoveCardPair
  :3191 blesses the pair generically @ `4d739ad`
- **Dimension:** 2 (two arrival paths, one discipline — the A2-3 stale-iid
  class) + 1 (latent §901.1 violation)
- **Severity:** P3 — **found independently by 2 lenses** (one filed P2; both
  verifiers confirmed P3-latent is right: all five users — ancient_treant,
  forest_forager, great_herder, rampant_growth, verdant_outrider — filter
  `{type:'Land'}`).
- **Evidence (verifier-confirmed ×2, executed):** a creature fetched
  library→battlefield arrives `sick:false` (makeCard's init — attack-legal the
  turn it arrives; no other path ever sets sick on it) with its mint-time iid
  preserved (§3.7 violated; plan-effects-refactor §3.7 L314 states the mint
  rule unconditionally). test_move_card pins fresh-iid+sick for the graveyard
  and exile arrivals but only arrival+type for the library one.
- **Canon:** plan-effects-refactor.md §3.7; placeCardOnBattlefield's header;
  rules §901.1 (summoning sickness).
- **Fix sketch:** route the arrival through `placeCardOnBattlefield(ctx, card,
  'library', post)` (it already accepts post.tap), deleting the bespoke
  push+emit. Behavior delta for lands is nil-to-harmless (mirror
  resolveTopOfStack's defensive sick=false for non-creatures if desired). Test:
  fetch a creature → sick + fresh iid.
- **Effort:** small. **Verification status:** survived adversarial refutation
  twice, confidence high.
- **Remediation class: STAGE** (behavioral; latent — brings its own test).
- **Predicted test impact:** none — test_move_card's land-fetch pins (arrived,
  tapped) stay green; fix adds the creature-fetch pin.

#### Decision packet for A4-20 (stage — plain English)
There are two doors onto the battlefield. The main one stamps every arrival
properly (fresh internal ID, summoning sickness unless hasty). The
"fetch from your library" door skips all of it — fine today because only lands
use it, but the first "put a creature from your library onto the battlefield"
card would arrive attack-ready when it shouldn't be, and every layer that
should warn an author about this (startup schema, protocol doc, the refactor
plan) actively says the generic capability is supported. Fix: make the library
door use the main door's arrival code (it already accepts the tap option).

---

### A4-21 — move_card's boot schema validates (from,to) PAIRS but the handler dispatches on (from,to,selector) TRIPLES — schema-clean combos silently no-op at runtime; and the hand→graveyard arm ignores `selector` entirely, so the "you discard" vs "target player discards" shorthands execute identically (the discarder decided by whatever player target is in scope)
- **Location:** `reference/html-proto/js/engine.js:2363` (handler dispatch
  :2363–2451; the warn-and-no-op fallthrough :2396–2404/:2449; EFFECT_SCHEMA.
  move_card :3200–3206 — zones + pair only; discardWho :1962–1964 keys off the
  target descriptor alone; the shorthand desugars at triggers.js:134–135)
  @ `4d739ad`
- **Dimension:** 2 (validation/dispatch vocabulary mismatch — A1-2's
  legality-vs-execution family on the effects surface)
- **Severity:** P3 — single lens (footguns), verifier-confirmed by execution
  (both legs).
- **Evidence (verifier-confirmed, executed):** `{library→hand,
  selector:'target'}` passes validateAllCardEffects then no-ops with only a
  console.warn — contradicting the validator's stated purpose. And `discard(1)`
  (the §5.2-spec'd "controller discards" shorthand) with an opp player target
  in scope **made the OPPONENT discard**, identical to
  `target_player_discards(1)` — authoring intent is not honored from the effect
  itself. Zero pool cards use the shorthands or bad triples (latent);
  CHANGELOG v2.0.17 claims both discard shorthands "verified executable" while
  the shorthand test pins desugar shape only.
- **Canon:** EFFECT_SCHEMA's stated purpose; plan-effects-refactor §5.2's
  shorthand semantics table.
- **Fix sketch:** extend EFFECT_SCHEMA.move_card with a per-pair
  allowed-selector table (one fact, derived from the handler's real dispatch);
  make the hand→graveyard arm honor selector ('controller_chosen' → always
  ctx.controller; 'target_player_chosen' → require a player target else
  fizzle-log).
- **Effort:** small–medium. **Verification status:** survived adversarial
  refutation, confidence high.
- **Remediation class: STAGE — rides A3-5's GO** (validation extension) for the
  schema half; the selector-honoring half is a small behavioral fix for
  not-yet-authored cards.
- **Predicted test impact:** additive only. (Chunk-10/11 lead: card-text
  decides the discarder from a different signal than the engine — flagged.)

#### Decision packet for A4-21 (stage — rides the A3-5 pattern, plain English)
The startup check for "move a card between zones" effects validates the zones
but not the HOW (the selector) — so a combination the engine can't actually
execute boots clean and silently does nothing mid-game. Separately, the two
discard shorthands ("you discard" vs "target player discards") compile to
identical behavior, with the actual discarder picked by accident of what's in
scope. Both are authoring traps with zero shipped victims. Same startup-sweep
class as A3-5: one selector table in the schema + make the discard arm read
the intent it's given.

---

### A4-22 — Reanimation leaves `killedBy` stale: the move_card graveyard→battlefield branch hand-rolls a partial resetInPlayState (7 fields) and missed it — a revived creature carries its original killer's credit into its next death
- **Location:** `reference/html-proto/js/engine.js:2436` (the hand-rolled reset
  :2436–2440 — clears tapped/sick/damage/temps/damagedBySources/dealtDeathtouch,
  omits killedBy; the contract at makeCard :755–759 "Cleared by
  resetInPlayState when a card returns fresh" — this path never calls it)
  @ `4d739ad`
- **Dimension:** 2 (copy-paste divergence / incomplete state reset) + 1 (wrong
  reward credit, narrow corner)
- **Severity:** P3 — single lens (footguns); **verifier materially narrowed the
  consequence:** in the common scenario the stale re-claim is a Set-idempotent
  no-op (the killer already claimed those keywords at the first death);
  observable mis-credit needs the 3-condition corner — self-kill first death
  (claim deliberately skipped), Deepseam Quarry cross-player take_control
  reanimation, then a non-damage second death — which the verifier reproduced
  (you credited 'flying' for a death the opponent's sacrifice caused; the
  reward screen reads that Set).
- **Canon:** makeCard's killedBy contract comment; resetInPlayState's own doc
  ("Death paths set true; revival paths false").
- **Fix sketch:** call `resetInPlayState(card)` in the :2437–2440 branch and
  delete the hand-rolled field list (the revival path is exactly the
  preserveDeathState=false case the function documents) — fixes the divergence
  class, not just the field.
- **Effort:** trivial. **Verification status:** survived adversarial refutation
  (with the consequence correction), confidence high.
- **Remediation class: STAGE** (behavioral one-liner; rides the A2-8/A3-11
  one-liner lane).
- **Predicted test impact:** none — no test pins killedBy-after-reanimation.

#### Decision packet for A4-22 (stage — plain English)
When a creature is reanimated from a graveyard, the engine resets its state by
hand — and the hand-written list missed one field: who killed it last time. In
a narrow corner (verified executable) that gives the wrong player end-of-game
trophy credit for a death they had nothing to do with. The real fix is to stop
hand-rolling the list and call the existing reset function, which the code's
own comments say is the contract — that closes the whole "forgot a field"
class, not just this field.

---

### A4-23 — Mid-resolution prompts: tutors/discards let the REST of the spell resolve before the human's pick (AI resolves inline, in authored order — human and AI execute the same card in different orders), and two prompt-raising effects in ONE resolution blind-overwrite each other's pending slot  ⟶ park (design-flavored, latent)
- **Location:** `reference/html-proto/js/engine.js:1927` (searchLibraryToHand
  sets pendingSearch and returns — the resolveTopOfStack loop keeps applying
  later effects), :1948–1951 (forcedDiscard `{remaining:n}` REPLACES, never
  adds); contrast the chooses arm :5192–5223, which stashes trailingEffects and
  breaks (the GAP-2 treatment the other prompts never received) @ `4d739ad`
- **Dimension:** 2 (structural — singleton modal slots + asymmetric human/AI
  resolution ordering)
- **Severity:** P3 — single lens (footguns), verifier-confirmed both legs by
  execution: demonic_tutor (a LIVE card with a trailing effect) drops the
  caster's life to 18 *while the search prompt is still open* (outcome-
  equivalent today only because life loss is order-independent of the pick);
  a synthetic two-discard sorcery made the human discard 1 where the AI
  discards 2 (second prompt overwrote the first, silently). **Scope note:** the
  CROSS-resolution clobber variant was independently refuted (appendix R5 —
  the PENDING_DECISIONS gate freezes all actions while a prompt is open, so no
  second resolution can run); only the within-one-resolution window is real,
  and no shipped card has two prompts in one effects array.
- **Canon:** the chooses/pendingEdictChoice implementation is the in-repo
  precedent for the correct shape (defer trailing effects until the pick).
- **Fix sketch:** generalize the GAP-2 stash — when a handler opens a human
  prompt mid-resolution, stash the remaining effect list + ctx on the pending
  object and replay on answer (one shared helper, which is also what A4-7's
  fix wants); minimum hardening: `forcedDiscard.remaining += n` and overwrite
  warns.
- **Effort:** medium (shared defer) / tiny (the += and warns).
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: PARK** (design-flavored, latent; revisit when A4-7's
  shared prompt helper is built — same machinery).
- **Predicted test impact:** none.

---

### A4-24 — The hexproof checkpoint is structurally ONE layer (the wiki claim holds) but textually THREE pasted gates with guard drift — and the permanent and permanent_or_spell copies are mutation-dark: inverting either survives the full 1842-assertion suite  ⟶ park (test additions + trivia hoist)
- **Location:** `reference/html-proto/js/engine.js:3785` (allCreatures copy —
  lacks the `x.card.keywords &&` null-guard the other two carry), `:3812`
  (permanent), `:3854` (permanent_or_spell) @ `4d739ad`
- **Dimension:** 2 (one fact, three hand-synced copies) + 5 (2/3 copies dark)
- **Severity:** P3 — **found independently by 3 lenses**; the survivors were
  **re-executed live** (not trusted from the file): flipping :3812 or :3854
  passes 1842/1842; flipping :3785 fails the suite (the creature copy is
  pinned). The dark branches are live with real cards (veiled_serpent /
  spirit_shepherd / ingenuity_unbounded hexproof × encase_in_amber /
  sudden_vines / steal permanent-targeting), so a regression here would be a
  player-visible rules bug shipped green. Adjacent dark mutants: the
  `s.kind !== 'trigger'` stack-filter inversions also survive.
- **Evidence/answer to the chunk's handed question:** every selection path
  (cast legality, AI enumeration, trigger queue/auto-pick/prompt,
  probe/castable-glow) routes through getValidTargets/targetsForFilter — the
  "enforced once" claim in `docs/wiki/targeting-and-hexproof.md` is verified at
  the layer level; chooses()/mass-scope correctly bypass per PROTOCOL §3.5.
- **Fix sketch:** hoist one `hexproofBlocks(card, ctrl, caster)` predicate used
  by all three branches (kills the guard drift — trivia-PR grade), and add the
  two missing assertions to test_targeting.js (a hexproof permanent vs
  targetsForFilter('permanent') and the stack case) — kills both survivors.
- **Effort:** small. **Verification status:** survived adversarial refutation
  three times (mutation-executed), confidence high.
- **Remediation class: PARK** (behavior-preserving refactor + test additions —
  the test half can land anytime per the ladder; the hoist is a trivia
  candidate).
- **Predicted test impact:** additive only.

---

### A4-25 — Comment/trivia hygiene sweep (merged): dead LKI locals under a stale snapshot comment, retired-kind comments, a dead registry entry, and two player-facing mass-arm log strings  ⟶ SHIP (comment/docs halves) + trivia riders
- **Location:** four sites @ `4d739ad` (one re-verified at the current tip)
- **Dimension:** 2 (comment hygiene + dead code + log truthfulness)
- **Severity:** P3 — items found by 1–2 lenses each; merged into one sweep
  (A3-16 precedent).
- **The items, each verified:**
  - **(a) resolveTopOfStack's dead `sharedTarget`/`sharedSnap` (:5149–5150)** —
    zero reads repo-wide; the 6-line "snapshot BEFORE any effect runs / last
    known information" comment above them describes machinery that moved to
    `makeSlotTargetGetter` (which snapshots lazily at FIRST READ per slot, not
    eagerly — :3055's header and DIVERGENCE D1's "snapshots ALL targets
    pre-resolution" wording carry the same drift). **Re-verified at the current
    workshop tip:** PR #111 moved `activeEffects` above its new gate but left
    the dead pair and the comment in place. Verifier-confirmed the drift is
    behaviorally unreachable for every live card (target-step cards get an
    eager slot-0 fetch; only a hypothetical legacy per-effect-target card
    reading `target_*` expressions after an immediate-removal effect diverges —
    executed with a synthetic card: gained 0 vs the promised 3). Fix: delete
    the two dead lines (trivia rider — behavior-invisible), reword the three
    comment sites to first-read-per-slot (ship), and note the eager-prime
    alternative for the D1 contract as a one-line triage question.
  - **(b) change_control's header (:2696–2697) + test_change_control.js:5 both
    claim "gainControl/steal remain until card migration retires them"** — the
    migration is done: no gainControl handler exists (effect_migration_test
    pins both kinds in its GONE list), and steal remains *permanently by
    design* (change_control delegates transfer_ownership to it). Rewrite both
    comments (ship). `CREATURE_EFFECT_KINDS` still carries the dead
    'gainControl' entry — a kind that can never dispatch; dropping it (and the
    judgment call of adding 'change_control') is a trivia rider, not shipped
    here.
  - **(c) EFFECTS.pump's mass arm logs dev-speak to the player** ("gives +3/+3
    EOT **to each creature in scope**" — reachable via 8 real all_yours cards,
    executed); EFFECTS.damage's mass arm logs a scope-blind "deals N to each
    creature." (latent — every shipped mass damage is all_creatures, for which
    the line is exactly correct; the all_opps/all_yours misreport was refuted
    as unreachable, appendix R1). Scope-aware wording emitted after the
    recipient list is known — log strings touch no rules; trivia rider on any
    staged effects PR.
  - **(d) targetsForFilter's header (:3881–3885)** is fixed-or-scoped as part
    of A4-8 either way — cited, not duplicated here.
- **Effort:** tiny. **Verification status:** every sentence survived
  adversarial refutation with grep/execution evidence, confidence high.
- **Remediation class: SHIP (comment/docs-only halves)** — zero behavior
  change; gate is suite + lint green. The dead-locals delete, the
  CREATURE_EFFECT_KINDS entry drop, and the log strings are **trivia riders**
  (behavior-invisible or presentation-only) — flagged for a chunk-4 trivia PR
  or to ride a staged fix, NOT shipped as docs.
- **Predicted test impact:** none.

---

## Leads adjudicated (handed down → resolved)

1. **A3-1's spell-side twin → A4-1, CLOSED IN FLIGHT** (PR #111 covers both
   resolvers; residual doc sentence rides A4-10; dead locals ride A4-25).
2. **A1-2's legality-vs-execution sweep:** ONE additional consequence mapped
   (doOptionalCost — see the A1-2 upgrade section; already an enumerated A1-2
   call site, now with an executed trigger-loss repro), and a **clean negative
   result**: no other pairs in the effects layer (splice re-checks via the same
   shared function — the correct pattern; trigger queue/resolution share the
   same legality component). The TypeError/limbo and schema-vs-dispatch
   findings (A4-17, A4-21) are the *family resemblance* cases, filed on their
   own evidence.
3. **A2-9 (parked) → adjudicated by A4-2:** diff-based reconcile + one shared
   lord predicate, with the live Mind-Control repro upgrading it from latent to
   live. A4-14's recursion guard belongs in the same predicate.
4. **A1-6/A3-14 silent-default sweep of the handlers:** confirmed arms landed
   in A4-17; the sevToNum destroy-default, grant_keyword/apply_sticker no-op,
   and fight-select arms were **refuted** (appendix R2/R7/R8/R13 — closed by
   construction, CI-pinned, or documented contract); the schedule_delayed
   injection probe was refuted as a **duplicate of filed A3-14** (R10), whose
   evidence it re-confirms.
5. **PR #102–105 fixes audited as current code (three lenses independently):**
   checkDeaths' t>0 indestructible exemption matches the A1-3 adjudication +
   §1101 — clean; the removeFromCombat funnel + change_control prune are
   correct including the tombstoned-blocker semantics — clean; **flag for
   chunk 5:** apply_in_game_splice's combat-state transfer does NOT use the
   funnel (bespoke logic, unaudited).
6. **The hexproof "enforced once" question:** verified TRUE at the layer level,
   answered with the predicate-triplication caveat (A4-24).
7. **The dispatch-table sync question (footguns lens assignment):**
   mechanically SOLVED in-repo (effectCoverageReport + test_effect_coverage,
   both directions, fake-kind canary) — strong negative space; the two
   unfenced surfaces are PROTOCOL.md (A4-10) and the matchFilter key
   vocabulary (A4-11), which compound (the doc teaches the spelling the engine
   silently ignores).

## Verified clean (negative space — checked against canon, no finding)

- **Severity ladder ordering** tap < bounce < destroy < exile matches PROTOCOL;
  indestructible blocks only destroy; exile bypasses — canon-consistent.
- **Tokens cease to exist on every leave path** (no zone leakage found).
- **Owner-routing is correct on bounce / exile / death / sacrifice / discard /
  normal resolution** — the sole violation engine-wide is counter (A4-19).
- **D1's hybrid LKI is implemented as DIVERGENCE documents** for every live
  card (liveTargetView; the lazy-read drift is comment-level — A4-25a).
- **move_card reanimation (graveyard/exile→battlefield) mints fresh iids and
  sets sickness** — test-pinned; the library arrival is the one gap (A4-20).
- **Mass scope snapshots its set before iteration** (no mutate-while-iterating
  bug); **chooses()/mass-scope hexproof bypass matches PROTOCOL §3.5.**
- **EOT cleanup registration is symmetric for all five temp systems**
  (tempPower/tempTou, eotGrants, eot typeGrants, tempControlUntilEot, eot
  castPermissions — each has its cleanup site).
- **Trigger queue and resolution share tsAutoPick/tsLegalBySlot** — queue-vs-
  resolve targeting cannot drift (and PR #111's gate reuses the same sets).
- **become_copy_of's clone discipline is deep enough** — the A3-13-style sweep
  found no new in-place template mutations in the EFFECTS table
  (schedule_delayed's shallow copies share nested filter/post objects but no
  handler mutates them — noted for any future remediator).
- **exile-as-kill trophy credit is intentional design** (git-history-verified
  rationale comment; appendix R3) — residue is a one-line comment restoration.
- **annihilate's combat silence is safe** — the ghost-combatant class is
  structurally impossible for a card that goes to NO zone (appendix R4,
  empirically disproven; one-line symmetry hardening optional).
- **The PENDING_DECISIONS gate genuinely prevents cross-resolution prompt
  clobbering** (appendix R5) — the modal freeze design holds.

---

## Coverage (union of the four lenses)

**Read (at the anchor):** `engine.js` — the FULL 31-kind EFFECTS table
line-by-line (L1714–3054, apply_in_game_splice skimmed for dispatch only), the
full targeting layer (fakeTargetsForLegality; resolveTarget/
resolveStackOrPermanent; getValidTargets/TARGET_FILTERS/targetsForFilter/
validTargetsBySlot + the whole ts* selection component + probeTargets;
matchFilter/matchFilterSpell/sameTarget L3763–4250), the snapshot/expr/LKI
layer + EFFECT_SCHEMA/validateAllCardEffects/CREATURE_EFFECT_KINDS
(L3054–3340), applyStaticKeywordGrants + emit/emitZoneChange, getStats' lord
loop, the mana pair (canPayFromPool→payMana), applyDamageFrom +
resolveFightOperands + creaturesInScope + the severity ladder, the zone
mutators (resetInPlayState through drawCard, L4251–4560), the death/life
pipeline (leavesPlayPreservingBuffs through damagePlayer, L4640–5000), the
three resolution loops (resolveTrigger/runTriggerEffects/doOptionalCost;
resolveTopOfStack FULL; doCastSpell/doActivateAbility + the do* prompt
handlers), isLegalAction's cases, and the CLEANUP region (L6610–6737). Also:
makeCard/intrinsicKeywords/canCreatureAttack-Block; cards.js color derivation;
types.js whole. **Canon:** rules 400/700/900 (+ 300/500/1100/1200 greps),
PROTOCOL §3 in full, DIVERGENCE (full table + D1/D4/D8 detail), BACKLOG full,
plan-effects-refactor §3.5/§3.7/§5.2, chunk-1/2/3 findings (chunk-2 in full).
**Tests read:** test_effects_scope, test_targeting, test_target_restrictions,
test_move_card, test_change_control, test_lord_keyword_grants,
test_effect_validation, test_effect_coverage, test_filter_parity,
test_predate_fight_d1, test_edict_human_choice, heir_edict_test,
false_witness_test (+ assertion-level skims of the targeting/shape/signed-life
families). **Cards:** ~30 JSONs read individually + whole-pool programmatic
sweeps (effect-kind census, target/target_filter pairings, multicolor census,
scope:'self' abilities, move_card users, static_buffs lord list, negative
gain_life family, chooses users). **Mutation artifacts:** both survivor files
in full (one lens re-bucketed all 698+64 by function; verifier re-derived the
bucketing from `git show bb8ea9f` and re-executed headline mutants).
**Live execution:** 12+ node repro scripts run by finders AND independently
re-executed by verifiers against scratch copies of the frozen anchor (every
behavioral finding above carries at least one executed repro; scripts preserved
under `%TEMP%` per the verdicts). **Current-tip verification:** workshop
`a08d8a1` git log + the full PR #111 diff (A4-1's closure).

**Not read (descoped to their owning chunks):** apply_in_game_splice internals
(chunk 5 — its 97 survivors handed forward); synthesizeStapledTemplate (chunk
5); makePlayer/makeState bodies + the mana-ability head (chunk 1);
dealCombatDamage internals (chunk 2); emit/drain internals beyond chunk-3's
findings (chunk 3); ai.js bodies (chunk 7); card-text.js describe layer (chunk
10 — only the not_color rendering line + repro samples); stickers.js bodies
(chunk 6); run.js appendSlot/removeSlotByIdx semantics (the steal meta-copy
question — chunk 9-adjacent, left open in A4-15's packet); ~250 card JSONs
beyond the named set (chunk 11 — sweeps were programmatic); ~60 test file
bodies (classified by name/grep).

---

## Refuted appendix — 13 (calibration normalized after chunk 3's zero)

Thirteen finder claims died under adversarial verification — a healthy rate
after chunk 3's anomalous 48/48, and worth noting that **five of the thirteen
died on "intentional design, verified"** grounds (R3, R6, R7, R8, R12), which
is the terminology ruling working as calibration: the engine's deliberate
choices are rules, and the verifiers held finders to proving a *defect*, not a
difference.

1. **R1 (rules) — Mass-damage log misreports scope** ("deals N to each
   creature" for all_opps/all_yours): code-true but unreachable — every shipped
   mass damage is all_creatures, for which the line is correct; scope:'self' is
   stripped before dispatch. The reachable pump "in scope" dev-speak half
   survives via A4-25c.
2. **R2 (rules) — Silent-default trio (sevToNum/grant_keyword/add_mana):**
   every claimed bypass vector is empty — sticker escalation sanitizes by
   construction, the generator never emits the kinds, card-data typos are
   CI-pinned by test_effect_validation; add_mana's TypeError is *loud*,
   contradicting the claim's own family definition. (The reachable schema-gap
   core was re-filed on its own evidence as A4-17.)
3. **R3 (rules) — Exile (sev 4) trophy credit is over-crediting:** git history
   surfaces the original design comment — exile doesn't fire dies, so it tags
   credit directly, deliberately; the asymmetry (bounce no, destroy/exile yes)
   is coherent permanent-removal design. Residue: restore the lost rationale
   comment.
4. **R4 (state) — annihilateCard bypasses the removeFromCombat funnel →
   ghost combatant:** structurally impossible (the card goes to NO zone; iids
   never reused; every combat-map consumer null-guards) and empirically
   disproven (13/13 checks, flash-speed worst case: zero damage, no crash).
5. **R5 (state) — Pending-prompt singletons clobber across resolutions:**
   gated out — PENDING_DECISIONS freezes every action while a prompt is open,
   so no second resolution can run; within-ONE-resolution is the real (latent)
   window, filed as A4-23 on the footguns lens's separate evidence.
6. **R6 (footguns) — move_card bf→exile should claim trophies like sev-4
   exile:** different verbs by documented design (removal ladder vs transport
   primitive); adding the claim would actively break the three
   temporary-exile/return cards. One-card authoring question (Bleach) at most.
7. **R7 (footguns) — resolveFightOperands ignores {select} VALUES:** the
   documented vocabulary is exactly two forms with ONE selector; the behavior
   is test-pinned and uniform across engine/AI/text layers. An unimplemented
   future feature, not a latent bug. (The slot-fallback bug is real and is
   A4-3.)
8. **R8 (footguns) — sevToNum unknown→destroy silently escalates:** unreachable
   from every existing input source; the boot check is CI-enforced
   (process.exit(1)), not warn-only as claimed; sticker escalation clamps to
   valid ladder strings by construction.
9. **R9 (testquality) — move_card deletes the card on unknown destination:**
   remove-then-warn is code-true but no authoring channel (cards, generator
   tables, stickers, schedule_delayed) can produce an unknown to_zone, and the
   validator + CI pin the exact repro value. Residual hardening note: re-home
   to owner's graveyard instead of stranding.
10. **R10 (testquality) — schedule_delayed unknown-`when` immortal entries:**
    accurate and **already filed as A3-14**, same ternary, same schema gap,
    same fix — duplicate; the probe re-confirms A3-14's evidence.
11. **R11 (testquality) — doOptionalCost as a NEW A1-2 instance:** A1-2's
    evidence already enumerates this call site verbatim — duplicate. The
    executed consequence repro was salvaged into the A1-2 upgrade section
    above.
12. **R12 (testquality) — change_control never re-imposes summoning sickness,
    making Threaten's grant_haste inert:** the load-bearing inference is false
    — sickness clears only at the *controller's own* untap step, so the
    canonical line (steal what they just cast) needs the haste grant, which the
    verifier proved load-bearing; the no-re-sick treatment of control changes
    is an explicitly documented design position (the EOT-revert comment), and
    rendered text matches behavior. At most a one-sentence canon clarification.
13. **R13 (testquality) — silent no-op micro-cluster (grant_keyword /
    apply_sticker / null-chooses sacrifice):** the chooses fizzle IS logged
    once, upstream, by design; the other guards are unreachable data-error
    paths owned by boot validation. Residue: optional console.warns for
    symmetry.

---

## Cross-chunk leads (handed forward)

- **Chunk 5 (staples/splice):** `apply_in_game_splice` is the campaign's
  darkest handler (97 survivors) and its combat-state transfer bypasses the
  PR #103/104 removeFromCombat funnel (bespoke logic — unaudited here); steal's
  slot-less meta branch (:2277–2289) copies stapledTpls/rolls but not
  permaBuffs/bonusTrigger — verify intended.
- **Chunk 7 (AI):** the 257 AI-valuation survivors (annotate as judgment-dark);
  pickBestTriggerTarget's gain_life branch reads `eff.amount` before expression
  resolution (`{from:…}` objects compare as not-<0); ai.js mirrors of the
  severity ladder and fight scoring.
- **Chunk 10 (card text):** fight cards' rendered text must reflect whichever
  way A4-9 lands (spill rider or no); mass-damage describe should be
  scope-aware if all_opps/all_yours damage ever ships (A4-25c); the
  discard-selector describe mismatch (A4-21 — describeEffect decides the
  discarder from a different signal than the engine); a sorcery-source
  grant_keyword renders "as long as this is on the battlefield" for a grant
  that is never revoked — check whether any spell authors that combination.
- **Chunk 11 (card JSONs):** enforce "no target_filter on the unfiltered
  kinds" until A4-8 lands (keeps it latent); pool-wide multicolor color-field
  conformance (only 2 multicolor cards exist — cheap to sweep); treat
  missing-required-param shapes (damage.amount, add_mana.amounts,
  grant_keyword.keyword) as conformance checks until A4-17's schema lands.

---

## Triage table (for INDEX.md)

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A4-1](chunk-04-effects-targeting.md) | P1 | effects-targeting | engine.js | Spell-side resolution target re-validation (A3-1's twin) — verified at anchor, fully covered by the A3-1 fix incl. filter-violation route; residual doc sentence → A4-10, dead locals → A4-25 | stage | **closed in flight (PR #111)** |
| [A4-2](chunk-04-effects-targeting.md) | P1 | effects-targeting | engine.js | Lord KEYWORD grants add-only — stolen creature keeps haste/hexproof forever while the stat half drops live (×4 lenses); adjudicates A2-9: one shared lordBuffApplies + diff-reconcile | stage | open |
| [A4-3](chunk-04-effects-targeting.md) | P1 | effects-targeting | engine.js | Fight retargets around removal: killed fight target silently replaced by the caster's own biggest creature — friendly fire instead of fizzle; live in all 4 fight cards; not closed by PR #111 (fight has no target slots) | stage | open |
| [A4-4](chunk-04-effects-targeting.md) | P1 | effects-targeting | engine.js | Mass removal is sequential: Day of Reckoning + Blood Artist fires 1 dies-trigger vs the damage wrath's 3, and the count depends on battlefield array order — violates checkDeaths' own batch contract | stage | open |
| [A4-5](chunk-04-effects-targeting.md) | P1 | effects-targeting | engine.js | CLEANUP keyword rebuild is copyOf-blind: a False Witness copy loses copied flying AND regains base flash at first EOT grant; same root corrupts trophy claims on copy victims; one intrinsicKeywords fix | stage | open |
| [A4-6](chunk-04-effects-targeting.md) | P1 | effects-targeting | engine.js | color/not_color test only the first pip — "non-Black" Doom Blade legally destroys the {U}{B} Seal-Thief Courier; route both checks through colorsOfCard | stage | open |
| [A4-7](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | Trigger/ability chooses() never opens the human prompt — Heir's dies-trigger silently sacrifices a land of the engine's choosing; share the spell resolver's GAP-2 branch | stage | open |
| [A4-8](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | target_filter silently dropped for creature_or_player/player/opp/spell while the header + PROTOCOL §3.5 claim it's honored (×3 lenses); latent — zero pool cards hit it | stage | open |
| [A4-9](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | Non-combat trample spills face damage from fight/effect damage — canon §902.2 is combat-only, the engine's own reminder text agrees, and the spill math skips the deathtouch threshold; design fork (spell-half is deliberate) | stage | open |
| [A4-10](chunk-04-effects-targeting.md) | P2 | effects-targeting | PROTOCOL.md | §3.2/§3.5 misdocument the effects/targeting wire 5+ ways (camelCase filter keys w/ wrong worked example, phantom fight_target/whose/tokenId, missing live kinds) + the now-doubly-stale cast-time-only legality sentence | ship | open |
| [A4-11](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | matchFilter key vocabulary has no boot validation — typo'd/camelCase keys silently fail open, text renders consistent (no tell); rides A3-5's GO | stage | open |
| [A4-12](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | Phylactery's unconditional "can't go below 0" violated by drains (−2 life, 0 rips, executed); follow-on incoherence (damage at negative life = net gain); floor fix + rip design ruling | stage | open |
| [A4-13](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | doActivateAbility self-scope lacks the creature-vs-player fork both siblings have (third copy of the v0.99.29 fix, divergent); latent — fix must also add add_type to CREATURE_EFFECT_KINDS | stage | open |
| [A4-14](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | getStats ↔ matchFilter mutual recursion — any stat-bounded lord filter hard-crashes every getStats call (RangeError, executed); one card-data edit away, boot-invisible; pair with A4-2's predicate | stage | open |
| [A4-15](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | steal writes the human's persisted run state for ANY controller — opp-cast steal corrupts the player's save (12→13 slots, executed); latent landmine under any thief boss | stage | open |
| [A4-16](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | move_card's battlefield-leave never flushes Elystra's permanent_eot buffs — keep_buffs is a dead param the refactor plan specified and no card got; unconditional flush + delete the dead fork | stage | open |
| [A4-17](chunk-04-effects-targeting.md) | P2 | effects-targeting | engine.js | Missing target/params = uncaught TypeError mid-mutation (spell ends in NO zone) or NaN damage immunity — boots clean; EFFECT_SCHEMA required-param entries + two guards; rides A3-5/A1-6 | stage | open |
| [A4-18](chunk-04-effects-targeting.md) | P2 | effects-targeting | mutation map | Coverage cluster (grouped): 698/1274 + 64/153 decomposed — 37% AI heuristics (→ch.7), 97 splice (→ch.5), named dark handlers w/ verifier-corrected buckets, brittleness flags, dispatch-sync verified solved | park | open |
| [A4-19](chunk-04-effects-targeting.md) | P3 | effects-targeting | engine.js | Countered spell goes to CONTROLLER's graveyard — the engine's lone owner-routing violation (×4 lenses), live via Seal-Thief Courier; canon §706; one-line fix | stage | open |
| [A4-20](chunk-04-effects-targeting.md) | P3 | effects-targeting | engine.js | fetchLibraryToBattlefield skips the arrival discipline (no iid mint, no sickness) — land-only today, but schema/PROTOCOL/plan all bless creature fetch; route through placeCardOnBattlefield | stage | open |
| [A4-21](chunk-04-effects-targeting.md) | P3 | effects-targeting | engine.js | move_card schema validates pairs, dispatch needs triples (schema-clean combos no-op); hand→graveyard ignores selector — "you discard" can discard the opponent; rides A3-5 | stage | open |
| [A4-22](chunk-04-effects-targeting.md) | P3 | effects-targeting | engine.js | Reanimation leaves killedBy stale (hand-rolled partial reset missed it) — wrong trophy credit in a verified 3-condition corner; call resetInPlayState instead | stage | open |
| [A4-23](chunk-04-effects-targeting.md) | P3 | effects-targeting | engine.js | Mid-resolution prompts: trailing effects run before the human's pick (AI resolves in authored order — asymmetric), and two prompts in one resolution blind-overwrite; latent; generalize the GAP-2 stash with A4-7 | park | open |
| [A4-24](chunk-04-effects-targeting.md) | P3 | effects-targeting | engine.js | Hexproof gate pasted ×3 with guard drift; permanent + permanent_or_spell copies mutation-dark (inversions pass 1842/1842, re-executed) — hoist predicate + two test pins | park | open |
| [A4-25](chunk-04-effects-targeting.md) | P3 | effects-targeting | engine.js | Comment/trivia sweep: dead sharedTarget/sharedSnap under a stale LKI comment (survived PR #111), retired-gainControl comments + dead registry entry, pump "in scope" dev-speak log | ship | open |
