# Chunk 3 — Stack / priority / trigger resolution (`emit` → queue → drain → resolve pipeline, depth cap, trigger generator, event payloads)

> Tier 2. **4-lens Workflow fan-out** (rules correctness, state-mutation discipline,
> structural footguns, test quality) **over a frozen anchor snapshot + adversarial
> verify per finding — 59 agents.** Anchor SHA **`e6715a9`** (frozen snapshot at
> `%TEMP%/audit-anchor-e6715a9`; finders and verifiers worked from scratch copies,
> never the snapshot itself). Canon set: `docs/wiki/rules/` (600, 700, 1000 + the
> chunk-1/2 pages where cited), `docs/PROTOCOL.md`, `docs/DIVERGENCE.md`,
> `reference/html-proto/BACKLOG.md`, plus the existing tests' stated expectations.
> Date 2026-06-10.
>
> Cross-lens duplicates are deduped below; "found independently by N lenses" is noted
> where it applies. This chunk produced the **heaviest convergence of the campaign so
> far**: the headline re-validation finding, the damagePlayer payload omission, the
> stale §1000 canon page, and the A1-1 consequence map were each found independently
> by **all four lenses**. The refuted appendix is **empty** — a first, discussed
> explicitly at the bottom as a calibration datum.

## Mutation-map note (governs ship gate this chunk)

Three survivor files govern this chunk (all in `C:/Users/Joe/.config/magiclike/audit/mutation/`):

- **`triggers-survivors.txt`** — `triggers.js` is the **best-killed file in the
  campaign (76%, 148/195)**. The tested spine (the 12 atomic predicates, the
  condition walker, the shorthand happy paths) is genuinely strong; the dark 24%
  is almost entirely the **silent-fallback class** (warn-and-continue branches whose
  safe default no test asserts) plus the entire noSelfCascade guard (A3-9 #2).
- **`trigger-generator-survivors.txt`** — `trigger-generator.js` is **13% killed
  (107/123 survived)**: shape-only assertions plus a self-referential safety check
  (A3-9 #1). Effectively dark.
- **`engine-trigger-region-survivors.txt`** — the engine's trigger/stack
  orchestration region (map L3200–4470) had **240 of 527 regional mutants survive
  (~46%)**. **Line-number caveat:** this file was generated at the chunk-1 SHA; its
  numbers run a consistent **~31 lines below** anchor `e6715a9` (verified:
  map-L3394 `!G.priority` = anchor 3425; quoted code matches at every checked
  point). Survivor citations below give both.

**Calibration-day policy applied (chunk-2 precedent):** every behavioral fix in this
chunk **stages** — the orchestration core, the auto-pick heuristic, and the whole
generator are mutation-dark, which per the autonomy ladder is the demotion condition.
**Ship** class is reserved for docs/comment-only items with zero behavior change
(gate: suite + lint green). Extra weight here: PROTOCOL §3.3's trigger-event rows are
exactly the ones marked **"Godot (pending)"** — this region's docs are the spec the
port will implement from.

---

## A1-1 upgrade (cross-chunk confirmation) — the third-leg consequence map, delivered

> **Self-QA note (2026-06-10): read this section against Joe's same-day verdict that
> the A1-1 headline behavior is INTENTIONAL.** The consequence map below stands as
> documentation input for the staged packet, but its divergence-from-§1004 framing
> now feeds Option B (define + document the deliberate behavior) at least as much as
> the canon option — "diverges from §1004" below describes the canon delta, not a
> defect verdict.

**Not a new finding** — chunk 1's staged **A1-1** packet explicitly handed chunk 3
the homework of mapping its third leg (`pushTriggerEntry`, the chunk-3 twin of the
priority-holder cluster). All four lenses ran it to ground independently, with
converging answers and live repros. What's new for the staged packet:

- **The consequence matrix (verifier-confirmed ×4, live-executed through the real
  cast-resolve flow):** `pushTriggerEntry` (anchor `engine.js:3425–3427`) sets
  `G.priorityHolder = opp(p.controller)` on **every push**, and `drainTriggers`
  (:3504–3520) pushes the active player's triggers first, then the non-active
  player's — so the post-drain holder is opp(controller of the LAST drained
  trigger). Matrix: **mixed or NAP-only batch → holder = AP (canon-correct by
  accident); AP-only batch — the COMMON case, your own creature's ETB → holder =
  NAP**, directly contradicting canon §1004 sentence 4 ("After the drain completes,
  priority opens with the active player"). Live repro: AP casts ancestral_priest
  (untargeted ETB), trigger drains alone, NAP given a live response so auto-pass
  can't mask it → `priorityHolder='opp'` with `activePlayer='you'`.
  `openPriorityRound`'s own comment (:4952–4954) acknowledges and shrugs at the
  overwrite. **Stack ORDER under APNAP was verified canon-correct** — only the
  holder diverges from §1004.
- **Mutation-evidence upgrade:** survivor `map-L3394 drop-!` on `if (!G.priority)`
  (= anchor 3425) **survives the full suite** — the verifier re-ran the experiment
  end-to-end and confirmed the equivalence analysis: the mutant is observationally
  equivalent when a priority round is open but **crashes** (`TypeError` on
  `G.priority.passes.clear()`) when closed. No suite crash ⇒ **the closed-window
  synthesize path is never executed by any test.** Attach to A1-1's mutation-map
  judgment; the fix's test should drive a drain from a closed window.
- **Fix shape for the packet (canon option):** `pushTriggerEntry` keeps
  `passes.clear()` but stops writing `priorityHolder`; the drain callers
  (`openPriorityRound`, `passPriority`'s post-resolution branch :4976–4979) already
  set holder = active player, which then stands — batch-independent and §1004-clean.
  Under A1-1's Option B (the documented house rule, DIVERGENCE D0), the post-drain
  holder must instead be *defined deliberately* rather than left as last-write-wins.
- **Coupling note:** the off-stack activated-abilities finding (**A3-2**) is the
  same staged cluster — its missing response window and A1-1's holder/pass-tracker
  legs should be adjudicated in one sitting.

**Disposition unchanged:** A1-1's staged decision packet stands, now carrying the
full consequence map, the §1004 sentence-4 citation, and the closed-window mutation
proof. No new ID; no test pins the post-drain holder anywhere (self-QA re-verified
at the anchor: 52 `priorityHolder` occurrences in tests/ — 51 fixture writes plus
one harness actor-selection read, zero assertions), so whichever option the packet
lands faces no enshrined-bug wall.

---

## Findings

### A3-1 — Trigger targets are NOT re-validated at resolution: a target that became illegal on the stack (hexproof gained in response) is still hit, and the section header claims the opposite
- **Location:** `reference/html-proto/js/engine.js:3702` (runTriggerEffects "No
  re-validation" comment + behavior; the contradicting header at :3298; queue-time
  check at :3382–3399; drain-time check at :3433–3444) @ `e6715a9`
- **Dimension:** 1 (rules correctness) + 2 (comment contradicts code — three ways)
- **Severity:** P1 — **found independently by all 4 lenses**, live-reproduced by
  two finder scripts and two independent verifier repros (one using only real cards
  and real in-game actions).
- **Evidence (verifier-confirmed ×4, live-executed):** target legality is checked at
  queue time (`triggerHasAnyValidTarget`, rule 603.3c) and drain time
  (`tsAutoPick`/prompt) — and **never again**. `runTriggerEffects` fetches the locked
  targets via `makeSlotTargetGetter` (:3072–3079, returns the stale descriptor) with
  the explicit comment "No re-validation" (:3702–3703); per-effect handlers guard
  **liveness only** (`resolveTarget`/`findCard` no-op on a dead target), never
  **legality**. So hexproof gained while the trigger is on the stack provides zero
  protection (repro: damage applied, "APPLIED despite hexproof"), and a trigger whose
  sole target died still resolves its untargeted/rider effects instead of fizzling
  whole. **The three-way contradiction (the footguns lens's independent finding,
  folded in as evidence):** the `emit()` section header at :3298 says *"Targets
  re-validate at resolution"*; runTriggerEffects says (and does) *"No re-validation"*;
  canon §1006.1 requires re-validation with §704.1's fizzle semantics, naming
  *"became hexproof"* explicitly. Reachable today — **but not via the shared drain
  batch as originally sketched** (self-QA correction: in one batch the grant is
  AP-side — the drake enters by sorcery-speed cast on its controller's turn — and
  AP triggers are pushed first, i.e. resolve LAST, after the NAP's targeted trigger;
  the batch route can never deliver protection). The verified live route is **staple
  synthesis**: `aether_drake` (the pool's only hexproof granter) stapled onto a flash
  base (`synthesizeStapledTemplate('ambush_djinn', ['aether_drake'])` → a flash
  creature carrying the hexproof-grant ETB), cast in response to a trigger on the
  stack — its ETB drains onto the stack ABOVE the waiting trigger and resolves first.
  Self-QA re-executed this end-to-end with 100% real cards and actions at the anchor:
  grant resolved, the locked target had hexproof, the 2 damage applied anyway. The
  dead-sole-target half needs no exotic setup at all (any same-batch death).
  The left-play half of §704.1 is *de facto* approximated by the per-effect liveness
  guards — but a dead sole target still lets riders (scope:'self', mass effects)
  resolve, violating whole-object fizzle. **Spell-side twin:** `resolveTopOfStack`
  (:5084–5194) shares the same shape (no upfront legality re-check; the :5088–5090
  comment frames it as last-known-info, which is the WITHIN-resolution rule, not the
  pre-resolution fizzle rule) — handed to **chunk 4** with the §704.1 citation, not
  filed here.
- **Canon:** `docs/wiki/rules/1000-triggered-abilities.md` §1006.1 ("Re-validate
  targets (same fizzle behavior as spells, see §704.1)") +
  `700-casting-and-activating.md` §704.1. Checked against DIVERGENCE: **E5 covers
  the intervening-IF condition recheck only** (a different rule, deliberately
  absent per §1007); target re-validation has no divergence row. `grep fizzle
  DIVERGENCE.md` → zero hits.
- **Fix sketch (genuine fork):** (a) implement §1006.1 — at resolveTrigger /
  runTriggerEffects, re-run the existing `tsIsLegalSet` (:4043 — already handles all
  three target shapes + hexproof via getValidTargets) over the locked slots; if every
  targeted slot is illegal, log fizzle and skip all effects. Preserve the documented
  multi-effect snapshot semantics (Exorcist's [exile, gain_life] needs effect 1 to
  read pre-effect-0 state) — the gate runs once, *before* the loop. Fix the :3298
  header either way. Or (b) declare the per-effect-liveness model the house rule:
  rewrite §1006.1, add a DIVERGENCE row, fix the header. Both rules-lens and
  testquality verifiers lean (a) — canon is explicit and the helper already exists.
- **Effort:** small–medium (one guard + a red→green test pinning
  hexproof-in-response fizzle); spell-side twin coordinates with chunk 4.
- **Verification status:** survived adversarial refutation four times, confidence
  high; one verifier judged the filed severity "arguably understated."
- **Remediation class: STAGE** (genuine fork + dark region).
- **Predicted test impact:** none — no test pins resolution-time fizzle or
  re-validation anywhere (grep-verified by the testquality lens).
- **Mutation-map judgment (why stage):** the resolution path's guards are unpinned —
  the 603.3c queue-gate survivors `map-L3357 drop-!` / `map-L3365 bool-flip`
  (= anchor 3388/3396) show even the *existing* checks can be inverted green, and no
  test reaches runTriggerEffects with a stale target. The region is provably dark.

#### Decision packet for A3-1 (stage — plain English)
When an ability is waiting to resolve (it's "on the stack"), the rulebook says the
game must double-check its target is still legal at the moment it actually happens —
and if not, the ability fizzles (does nothing). The engine never does that second
check. Practical effect: protecting a creature in response (giving it hexproof) does
nothing — the incoming ability hits it anyway. Also, if the target simply dies, the
ability's side-effects still happen instead of the whole thing fizzling. The code
even argues with itself: one comment says "targets re-validate at resolution," the
code 400 lines later says "No re-validation" and means it. This is reachable today
with Aether Drake's hexproof grant.
- **Option A (recommended, confidence: high):** add the missing check — the function
  that knows how to judge target legality already exists; call it once before the
  ability's effects run, and fizzle if nothing is still legal. Comes with its own
  test. The rulebook is explicit, so this is mostly "make the code do what the book
  says."
- **Option B:** decide the current behavior is the house rule (targets lock in when
  chosen, period), and rewrite the rulebook sentence + divergence ledger to say so.
  Cheaper, but it makes "protect my creature in response" permanently meaningless —
  a real gameplay-feel decision, which is why this stages for Joe either way.
- Either option must also fix the lying comment, and the same question repeats for
  spells (chunk 4 inherits it) — worth answering once, consistently.

---

### A3-2 — Non-mana activated abilities resolve entirely OFF the stack, contradicting canon §705 — the code comment admits the simplification, and DIVERGENCE not only omits it but asserts the opposite
- **Location:** `reference/html-proto/js/engine.js:5555` (doActivateAbility
  :5483–5567; the admission comment at :5554–5565; `pushOnStack`'s sole caller is
  doCastSpell, :5460) @ `e6715a9`
- **Dimension:** 1 (rules correctness — canon contradicted, code-comment-acknowledged)
- **Severity:** P2
- **Evidence (verifier-confirmed, live-executed):** doActivateAbility pays costs,
  applies all effects inline (applyEffect loop → afterEffectsApplied), then
  drainTriggers — nothing is ever pushed to `G.stack` for the ability. The comment
  claims the post-drain flow "match[es] the 'ability goes on stack and opp can
  respond' flow of real MtG" — false: the opponent can only respond to TRIGGERS the
  ability spawned, never to the ability itself (already resolved), and dies-triggers
  from sacrifice costs resolve with the ability's effects already applied. **Verifier
  aggravation:** DIVERGENCE.md D8 doesn't just omit this — it *incorrectly asserts*
  the proto routes non-mana activations through the stack. This finding is the
  missing-stack-entry + untracked-divergence leg chunk 1 explicitly handed down
  (A1-1 leg 2 owns the priority/pass-tracker side — cited, not re-filed).
- **Canon:** `docs/wiki/rules/700-casting-and-activating.md` §705 ("Activated
  abilities go on the stack the same as spells, except mana abilities … This is the
  only [exception]").
- **Fix sketch (genuine fork):** (a) docs — add a truthful DIVERGENCE row + a §705
  implementation-status bullet (proto resolves ALL activated abilities immediately;
  deliberate lean model), fix D8's false assertion, soften the :5563–5565 comment;
  or (b) code — give non-mana abilities a real stack entry (`kind:'ability'`)
  resolving through `resolveTopOfStack`. (b) is the §705-faithful answer but is
  **large** and couples to A1-1's priority cluster.
- **Effort:** trivial (docs) / large (code).
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: STAGE** (genuine fork; couples to the staged A1-1 cluster —
  adjudicate together).
- **Predicted test impact:** none for (a); (b) would be its own project with its own
  battery.

#### Decision packet for A3-2 (stage — plain English)
In real Magic, activating an ability gives the opponent a chance to respond before
it happens. In this engine, non-mana abilities just happen instantly — no response
window. The code comment admits it's a simplification but then claims it still
matches real Magic's flow, which isn't true, and the divergence ledger actually says
the opposite of what the code does.
- **Option A (recommended for now, confidence: high):** keep the lean model, but
  tell the truth about it — one divergence row, one rulebook status note, fix the
  two lying sentences. Zero behavior change.
- **Option B:** make abilities use the real stack like spells do. Correct per the
  rulebook, but it's a big change touching the same priority machinery as the staged
  A1-1 packet — if you ever want it, decide it alongside A1-1, not separately.

---

### A3-3 — The trigger "depth cap" counts WIDTH, not depth: 101 flat, independent triggers trip it and the 101st is consumed silently — comment, log text, canon §1008, and DIVERGENCE E6 all describe semantics the code doesn't have
- **Location:** `reference/html-proto/js/engine.js:3641` (increment; cap const
  `TRIGGER_DEPTH_CAP=100` at :3299, compare :3642, bail :3643–3645, the only reset
  at :4983) @ `e6715a9`
- **Dimension:** 1/2 (doc-vs-code semantics) + 5 (zero coverage)
- **Severity:** P2 — **found independently by 3 lenses.**
- **Evidence (verifier-confirmed, live-executed):** `G.triggerChainDepth` has exactly
  four touch points — init, increment per `resolveTrigger` call, compare, and a
  reset **only when both players pass on an empty stack**. No decrement ⇒ it counts
  cumulative trigger resolutions per stack episode (width), not nesting. Repro
  executed: 101 independent `{gain_life 1}` triggers driven through real priority
  passes → life gained = 100, the 101st **popped and consumed with only a log line**
  ("Trigger chain too deep"); the bail also returns before `afterEffectsApplied`
  (benign today — no effects ran, and `advancePhaseAfterPriority`'s sweep catches
  up). Canon §1008 says "100 NESTED resolutions"; E6 says "chain depth" — and E6's
  line cite (`engine.js:2731`) is ~900 lines stale. Zero test coverage: no test
  file references `triggerChainDepth`/`TRIGGER_DEPTH_CAP` (grep-verified).
- **Canon:** `docs/wiki/rules/1000-triggered-abilities.md` §1008;
  `docs/DIVERGENCE.md` E6.
- **Fix sketch (the fork is the work):** (a) docs-only — keep the counter and
  rewrite §1008 + E6 + the comment/log to "per-stack-episode trigger budget of 100."
  The width count is arguably a **feature**: it bounds mutual A→B→A loops that true
  nesting-depth accounting would never catch (each round of such a loop resolves at
  depth 1–2). Or (b) code — make it true nesting (increment on entry, decrement
  after effects). Either way the cap gets its first test (the 15-line repro is the
  seed) and E6's stale cite gets refreshed.
- **Effort:** trivial (docs) / small (test) / medium (re-counting).
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: STAGE** (semantics fork; the footguns lens finds the budget
  semantics *defensible and possibly superior* — genuinely Joe's call).
- **Predicted test impact:** none — additive test only.
- **Mutation-map judgment (why stage):** the cap is invisible to the suite —
  survivors `map-L3268 num+1` on the cap constant (= anchor 3299) and
  `map-L3610–3611` (= anchor 3641–3642, counter arithmetic + comparison) all
  survive. Nobody would notice the loop-stopper breaking.

#### Decision packet for A3-3 (stage — plain English)
The engine has a circuit breaker meant to stop infinite trigger loops ("if abilities
keep triggering each other 100 deep, stop"). It actually counts something different:
the TOTAL number of triggers since the stack last emptied — so 101 completely
ordinary, unrelated triggers in one big turn would trip it, and the 101st ability
just silently doesn't happen. Everything that documents this breaker (the rulebook,
the divergence ledger, the code's own comment and log message) describes the "100
deep" version, not what's really there.
- **Option A (recommended, confidence: medium-high):** keep the current behavior and
  fix all the descriptions to say "100 triggers per stack-load, total." The total
  count is actually a STRONGER loop-stopper than true depth would be, and reaching
  101 legitimate triggers in one breath is practically impossible today. Docs +
  comment + a first test for the breaker.
- **Option B:** rewrite the counter to genuinely measure nesting. Matches the
  documentation as written, but is more code for arguably worse loop protection.

---

### A3-4 — Canon rulebook page §1000 (triggered abilities) documents the RETIRED pre-migration trigger system as current — the page the audit and ship gate adjudicate trigger fixes against is stale for the vocabulary/shape layer
- **Location:** `docs/wiki/rules/1000-triggered-abilities.md:16–29` (§1001 example,
  §1002 vocabulary; also §1003 self_only, §1005 prompt model) @ `e6715a9`
- **Dimension:** 2 (canon-vs-code; the doc side is the one lying — and it is the
  adjudication source)
- **Severity:** P2 — **found independently by all 4 lenses.**
- **Evidence (verifier-confirmed ×4):** §1001's example shows
  `cond_id`/`self_only`/`target_filter` — retired per DIVERGENCE **E2 "PROTO:
  DONE"** (all 97 card triggers + generator + Mercurial pool migrated; legacy
  TRIGGER_CONDITIONS removed). §1002 declares "the current event vocabulary is:
  card_enters_battlefield, card_dies" with spell_cast/life_gained "planned" — the
  live vocabulary is the **five unified kinds** (`VALID_TRIGGER_EVENTS`,
  triggers.js:304–306), per **E1 "PROTO: DONE."** `grep self_only|selfOnly js/
  cards/` → zero matches, falsifying §1003 and the page's own "1003 self_only:false:
  code path exists" status bullet; `grep cond_id cards/*/card.json` → 0 hits. §1005
  describes the Godot prompt model (`pick_trigger_target` /
  `awaiting_target_for_trigger`) without flagging the proto's
  `pendingTriggerTarget`/`triggerTargetPick` equivalents. **Scope-narrowing
  (verifier):** §§1004/1006/1007/1008 remain broadly accurate — the rot is confined
  to the vocabulary/shape/prompt sections. The page front-matter (`updated:
  2026-06-04`) predates the migration's completion. Page-vs-PROTOCOL is now
  canon-contradicting-canon.
- **Canon:** `docs/DIVERGENCE.md` E1/E2 adjudicate which side is current;
  `docs/PROTOCOL.md` §3.3/§5 carry the replacement shapes. Same class as
  A1-18/A2-11/A2-12 (canon pages carrying false implementation claims) — different
  page, much wider span.
- **Fix sketch:** rewrite §§1001–1003/1005 around the composable shape (five events
  + condition arrays, PROTOCOL §3.3/§5 as payload source of truth), with per-engine
  status notes — **the Godot side genuinely still runs the legacy vocabulary** (E1/E2
  GODOT: pending), so scope each paragraph rather than delete; keep the old shape as
  a **historical appendix**. Fold in two riders adjudicated this chunk: the §1008
  "nested" wording (A3-3) and one sentence pinning cleanup-era trigger timing
  ("triggers queued during cleanup drain at the next turn's first priority window,
  ordered by the NEW active player" — see Leads adjudicated clean #1).
- **Effort:** small–medium (docs, but wants care — downstream audit chunks
  adjudicate against this page).
- **Verification status:** survived adversarial refutation four times, confidence
  high.
- **Remediation class: STAGE** — deliberately NOT ship-docs despite being docs-only:
  the rulebook claims supremacy over code ("the doc wins"), and **this audit uses it
  as its own adjudication source**. Rewriting the constitution mid-campaign is Joe's
  call, not the robot's. Recommendation: approve a rewrite for the composable system
  with the per-engine scoping + historical appendix above.
- **Predicted test impact:** none.

#### Decision packet for A3-4 (stage — plain English)
The rulebook chapter on triggered abilities describes the OLD trigger system — the
one that was replaced months ago. The new system (the one actually running, with
five event types and composable conditions) is documented elsewhere, so the
project's two canon documents now contradict each other. Normally doc fixes ship
autonomously, but this page is special: it's the reference this audit itself judges
bugs against, and "the doc wins" is the house rule — so rewriting it changes the
measuring stick.
- **Option (recommended, confidence: high):** approve a rewrite of the stale
  sections around the new system, with clear notes where the Godot port still runs
  the old one, and keep the old description as a labeled historical appendix. The
  later sections of the page (timing, resolution, the depth cap) are still accurate
  and stay — two small wording riders from other findings fold in.

---

### A3-5 — The three generated-trigger data tables sit outside BOTH boot validators: a typo'd effect kind, token id, or predicate in GENERATOR_EFFECTS / GENERATOR_CONDITIONS / MERCURIAL_TRIGGER_POOL boots clean and silently no-ops for a whole run
- **Location:** `reference/html-proto/js/trigger-generator.js:15–112` (the two
  generator tables) + `engine.js:4–47` (Mercurial pool); validators at
  triggers.js:336–354 / engine.js:3215–3242 @ `e6715a9`
- **Dimension:** 2 (validation hole / silent-failure path) + 5 (coverage gap)
- **Severity:** P2 — **found independently by 2 lenses.**
- **Evidence (verifier-confirmed, executed):** `validateAllCardConditions` /
  `validateAllCardEffects` walk only the collection passed in, and the only boot
  call sites pass `CARDS` — the three module-level tables are validated by
  **nothing**. The verifier typo'd entries in all three tables
  (`gain_life→gain_lyfe`, token id, predicate name) and the suite stayed
  **1786/1786 green** while a player's whole-run boon became a silent no-op.
  Partial compensating control: trigger_generator_test checks `cond.event ∈
  VALID_TRIGGER_EVENTS` and the archetype round-trip, but effect kinds only as
  `typeof === 'string'` — never membership in EFFECTS or TOKENS; the Mercurial pool
  appears in no test assertion at all. **All current entries verified valid** (the
  footguns lens diffed every kind/token/predicate against the live registries — see
  Leads adjudicated clean #4), so this is recurrence-fencing plus the exact class
  the file header claims is filtered. PROTOCOL §3.4's promise ("Both engines
  validate that every ID a card references is registered at boot") is bypassed —
  the pool's triggers ARE card-attached at runtime. Save-migration side (stale
  bonusTrigger in old saves) overlaps chunk 9 — flagged, not re-filed.
- **Canon:** `docs/PROTOCOL.md` §3.4; the file's own header intent.
- **Fix sketch:** boot-time sweep over the three static tables — assert each effect
  kind ∈ EFFECTS (+ token_id ∈ TOKENS for create_tokens), run
  `_collectUnknownAtomics` + VALID_TRIGGER_EVENTS over GENERATOR_CONDITIONS and
  MERCURIAL_TRIGGER_POOL, same check over slot `bonusTrigger` at makePlayer; plus
  one test asserting the memberships (three lines in composable_predicates_test
  per the testquality sketch).
- **Effort:** small.
- **Verification status:** survived adversarial refutation twice, confidence high.
- **Remediation class: STAGE** (behavioral code addition in a dark region; nothing
  broken today).
- **Predicted test impact:** additive only.
- **Mutation-map judgment (why stage):** `triggers-survivors.txt` L196 (the
  unknown-predicate `return false` default in `_callAtomic` is invertible green) and
  L326 (the validator's registry-membership check itself is flippable) — the
  validation layer this would extend is itself unfenced.

#### Decision packet for A3-5 (stage — plain English)
Cards get checked at startup: "does every ability this card references actually
exist?" But the three data tables that power RANDOMLY GENERATED abilities (the
Architect's Codex build-an-ability flow and the Mercurial Adept's boon pool) are
never checked. A typo in one of those tables wouldn't crash — the player's special
ability would just silently never work, for the entire run. Nothing is typo'd
today; this adds the missing safety net.
- **Option (only one, confidence: high):** extend the existing startup check to
  cover the three tables, plus a small test. A "yep, ship it" shape — staged only
  because it's behavioral code in an untested area, so per policy it arrives with
  its own test and your nod.

---

### A3-6 — The composable `card_moves` zone vocabulary over-promises: the engine only emits zone-change events for battlefield-touching moves, but any zone pair (or typo) validates clean at boot and silently never fires
- **Location:** `reference/html-proto/js/triggers.js:310–330`
  (`_collectUnknownAtomics` validates names only; `card_moves` args at :23–28) +
  the emission census in `engine.js` @ `e6715a9`
- **Dimension:** 2 (structural footgun — silent-failure authoring trap)
- **Severity:** P2 — **found independently by 2 lenses**, live-reproduced by both
  (plus both verifiers).
- **Evidence (verifier-confirmed ×2, executed):** every `emitZoneChange` /
  `emitLeavesBattlefield` call site is battlefield-touching (arrivals
  :1898/:1977/:2546/:5082/:5405; departures via :4679); draws, discards
  (doDiscard :5596–5611, discardFromHand :1944–1958), and mill (:2389–2394) emit
  **nothing**, and `emit()` itself only walks battlefields + extraSources
  (:3349–3354) — non-battlefield listeners are doubly unreachable. Yet a trigger
  authored `card_moves(hand, graveyard)` ("whenever a card is discarded") — or
  typo'd `card_moves(handd, gravyard)` — returns
  `{unknownAtomics:[], unknownEvents:[]}` at boot and never fires (live repro R6).
  The `'none'` from_zone token used by token-minting (:2546) is also undocumented
  in PROTOCOL — fold into the same fix.
- **Canon:** boot-validation design intent (triggers.js:332–335 — zone tokens are
  the uncovered third axis); PROTOCOL §3.3.
- **Fix sketch:** (1) boot-validate `card_moves` args against a ZONE_TOKENS set AND
  the emitted-transition table (warn on never-emitted pairs, e.g. require one side
  to be `battlefield`/`anywhere`), with a pointer comment at emitZoneChange to
  update both together; (2) document the supported transitions + the `'none'` token
  in PROTOCOL §3.3. (Actually *emitting* hand→graveyard etc. is a separate design
  question — note it for triage, don't bundle.)
- **Effort:** small–medium.
- **Verification status:** survived adversarial refutation twice, confidence high.
- **Remediation class: STAGE** (behavioral validation addition; latent — no shipped
  card or generator output authors a non-battlefield pair today).
- **Predicted test impact:** additive only.

#### Decision packet for A3-6 (stage — plain English)
Card authors can write triggers like "whenever a card moves from X to Y." The engine
only ever announces moves that touch the battlefield — but the authoring layer
happily accepts any zone pair (even misspelled ones) and the trigger just silently
never fires. No card today falls into the trap; the first "whenever you discard/
mill/draw" card written in good faith would.
- **Option (only one, confidence: high):** make startup validation reject zone
  pairs the engine never announces (and typos), and write the supported list into
  the protocol doc. Whether the engine SHOULD announce hand/library moves someday
  is a separate design question for triage.

---

### A3-7 — `generateRandomTrigger` is a production-dead twin of `assembleTrigger` that omits the noSelfCascade loop guard — and its own header (plus two more comments) claims the Codex and Mercurial use it; tests reference it, so cleanup isn't trivia
- **Location:** `reference/html-proto/js/trigger-generator.js:125–147` (incl. the
  :140–146 fallback); the guarded sibling at :187–199; false attributions at
  :1–2/:149/:186 @ `e6715a9`
- **Dimension:** 2 (structural footgun + comment hygiene; latent loop)
- **Severity:** P2 — **found independently by 2 lenses.**
- **Evidence (verifier-confirmed, executed):** zero production callers — the Codex
  uses the three-step `generateConditionOptions` (engine.js:4547) →
  `generateEffectOptions` (:5739) → `assembleTrigger` (:5747) flow; the Mercurial
  Adept seeds from MERCURIAL_TRIGGER_POOL (:917–927). `generateRandomTrigger`
  appears only in trigger_generator_test.js + tests/_setup.js EXPOSED.
  `assembleTrigger` sets `noSelfCascade:true` with an explicit rationale
  (:193–197 — it stops token-ETB self-loops); the dead twin doesn't (verifier:
  **0 of 2000 rolls** carried the flag), and its tables can roll exactly the loop
  the flag prevents (`anotherCreatureYouEntersStrict` × `createTokenSoldier` —
  both offerable). Wiring it up per its own header would ship cascade-unguarded
  triggers that loop to the depth cap (E6's raison d'être).
- **Canon:** assembleTrigger's own loop-prevention rationale; DIVERGENCE E6.
- **Fix sketch:** delete `generateRandomTrigger` (and its test sections), or have
  it route through `assembleTrigger` / set the flag on both return paths. Recommend
  delete-or-route + the header rewrite (the comment half rides A3-16's ship).
- **Effort:** small.
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: STAGE** — **not trivia, despite being dead code:** tests
  reference the function, so removal flips test files (pre-declared below), and the
  alternative (adding the flag) changes a tested function's output shape.
- **Predicted test impact (pre-declared):** `trigger_generator_test.js`'s
  generateRandomTrigger sections (shape checks over 200 rolls, the L139–157 guard
  block) must be removed or re-pointed at `assembleTrigger` outputs as part of the
  fix — declared flips, not surprises. `tests/_setup.js`'s EXPOSED list loses one
  entry.
- **Mutation-map judgment (why stage):** trigger-generator.js is 13% killed; the
  function's fallback arm survivors (`trigger-generator-survivors.txt` L144–145)
  confirm nothing pins its behavior — but the test *references* make this a
  declared-test-edit fix, which per the ladder always needs the packet.

#### Decision packet for A3-7 (stage — plain English)
There are two "build a random ability" functions. The real one (used by the game)
always attaches a safety flag that prevents an ability from triggering itself in an
infinite loop. The other one — which nothing in the game actually calls, despite
three comments claiming otherwise — skips the flag. It's a loaded footgun: the
obvious-looking entry point produces loop-prone abilities the day someone wires it
up.
- **Option A (recommended, confidence: high):** delete the dead twin and update the
  test file that pokes at it (those test edits are declared here, per the rules).
- **Option B:** keep it but make it route through the real builder so it inherits
  the safety flag — if you anticipate wanting a one-call "roll me a trigger" API.
- Either way the three wrong comments get fixed (that half ships separately as
  comment-only).

---

### A3-8 — PROTOCOL.md §3.3 misdocuments the trigger-event wire it canonizes — and the wrong rows are exactly the ones marked "Godot (pending)"  ⟶ SHIP (docs-only)
- **Location:** `docs/PROTOCOL.md:185–196` (§3.3 event table) + :199/:205 (§3.4
  framing) @ `e6715a9`
- **Dimension:** 2 (the canonical wire spec lies about the working engine)
- **Severity:** P2 — **found independently by all 4 lenses** (the port would
  implement broken payloads from the spec; predicates could not evaluate against
  the documented shapes).
- **The corrections, each verified against the code (and live-executed where
  noted):**
  1. **spell_cast row** documents `{source_iid, controller_key}`; the engine emits
     `{subject_iid, subject_card, controller}` (engine.js:5048, agreeing with
     triggers.js:5). Neither documented field exists anywhere in the engine
     (`controller_key` appears nowhere at all). Live repro: the shipped predicates
     (`another_card`, `controlled_by`) pass on the actual shape and **fail on the
     documented one**.
  2. **attacks row** documents `{subject_iid}` only; the emit carries
     `subject_card`/`controller`/`defender_key` (+ the dead legacy
     `attacker`/`defender` — see A3-16d), and shipped archetypes
     (`creatureYouAttacksOfSubtype` via `controlled_by` + `card_has_subtype`)
     require the omitted fields. Recommend omitting the legacy pair from the spec.
  3. **combat_damage is missing from the table entirely** despite being emitted
     (:4931–4941), validated (VALID_TRIGGER_EVENTS), and consumed
     (`thisDealsCombatDamageToOpp`) — violating the table's own "(b) update this
     table" rule (:193–196).
  4. **§3.4 still frames conditions as `triggers[].cond_id`** — retired per E2.
  5. **Riders:** document the `'none'` from_zone token (A3-6) and fix the
     `lost_life_this_turn` engine column.
- **Canon:** self-referential — PROTOCOL is the canon being corrected against the
  code + triggers.js shapes, which agree with each other; A1-12 (§3.6) established
  this exact ship lane.
- **Fix sketch:** correct the two payload cells, add the combat_damage row, rewrite
  the §3.4 framing to the composable `condition` field, add the zone-token note.
- **Effort:** small. **Verification status:** every cell survived adversarial
  refutation ×4 with grep + live-predicate evidence, confidence high.
- **Remediation class: SHIP (docs-only)** — recording reality changes no behavior;
  gate is suite + lint green.
- **Predicted test impact:** none.

---

### A3-9 — Trigger-layer coverage darkness + test-quality cluster (dimensions 4/5, grouped): the orchestration core, the loop-stopper, the auto-pick heuristic, and the whole generator are invisible to the 1786-assertion suite  ⟶ park (grouped, A1-23-style)
- **Location:** `reference/html-proto/js/engine.js:3500` (drainTriggers; sub-points
  below) + `js/triggers.js` + `js/trigger-generator.js` + `tests/` @ `e6715a9`
- **Dimension:** 4 + 5
- **Severity:** P2 — every sub-point verified by *actually running the mutants*
  against the full suite (baseline 74 files / 1786 assertions green).
- **Evidence (verifier-replicated live mutant runs):**
  1. **Green theater (the chunk's sharpest test finding):**
     trigger_generator_test.js's hard-break-filter check is **self-referential** —
     it derives both `deadCondIds` and `liveKinds` from the very flags under test,
     so a flag regression in the dangerous direction (`needsLiveSource` true→false,
     `sourceLive` false→true) is undetectable **in principle**, not just in
     practice. Survivors: `trigger-generator-survivors.txt` L19/L26/L33/L41,
     L49/L60, L96–L110, and L129 (the filter line itself, `&&`→`||`). Live-run: the
     pumpSelf flag flip leaves the test's own 156 assertions green while the
     generator starts rolling "When ~ dies, ~ gets +1/+1" silent no-op boons. Fix:
     pin the matrix against hardcoded literal flag sets.
  2. **The anti-infinite-cascade defense has zero coverage:** all 6 mutants on the
     noSelfCascade guard (`triggers-survivors.txt` L360–362, including outright
     guard inversion `sid === self.iid`→`!==`) survive, and the depth-cap cluster
     (A3-3) survives — the two-layer loop defense whose failure mode (infinite
     token cascade per ETB) E6 documents as having already occurred once. The
     verifier executed the two worst mutants live: suite green both times.
  3. **pickBestTriggerTarget (:3526–3626) is near-fully dark** (~50 survivors,
     map L3501–3513 ≈ anchor 3532–3544 and onward) despite deciding BOTH AI trigger
     targets AND the human's implicit/forced auto-fills: controller-comparison
     flips survive — an auto-filled damage trigger preferring its OWNER's creatures
     or face passes the suite. (Verifier trim: the become_copy_of branch IS pinned
     by false_witness_test.js.)
  4. **The 603.3c queue gate is invertible green** (`map-L3357 drop-!`,
     `map-L3365 bool-flip` = anchor 3388/3396) — redundancy with the drain-time
     fizzle makes it near-equivalent today; the distinct_targets full-set arm is
     the part with real divergence and deserves the test.
  5. **targetsForFilter's `restrict` propagation is dark on the player/opp/
     permanent/spell/creature_or_player branches** (anchor 3876–3882; the
     'permanent' branch is live vocabulary) while creature/land are killed.
     (Verifier strike: the exile_until_eot cross-turn return-ETB IS pinned by
     test_exile_until_eot.js — removed from the dark list.)
  6. **triggers.js survivor commonality (the assigned 47/195 question):** the
     tested spine is the campaign's best (76%); the dark remainder is the
     **silent-fallback class** — parser/lexer/validator warn-and-continue branches
     and the unconditional-fire default (L371 flip survives: no test exercises a
     trigger lacking a condition). Cheap fix: one garbage-input section asserting
     the documented defaults.
  7. **trigger-generator value-blindness:** shape-only assertions — amounts,
     weights, pluralization, and describe-vs-effects agreement are all free-floating
     (a mutant making generated triggers deal 11–13 damage survives 1786/1786).
  8. **Orchestration core dark:** swapping APNAP drain order survives; no test
     asserts post-drain priorityHolder (all ~60 occurrences are fixture writes);
     the cap is untested; the mid-drain prompt pause/resume path is unpinned. The
     drain order itself was verified canon-correct (§1004) — correct but unfenced.
  9. **Test-file classification (assigned deliverable):** behavioral-strong —
     test_multitarget_trigger.js (best-in-class end-to-end),
     test_trigger_target_prompt.js, test_rules_infra's D4 section,
     composable_predicates_test.js (strong unit work; blind spot: synthetic events
     bypass emit(), so the payload field-name contract is tested nowhere — see
     A3-15). Theater: trigger_generator_test.js (#1, #7). Brittleness hotspot:
     trigger_migration_test.js's duplicated condSig implementation (dual-edit trap;
     export the real one or accept it). A1-4's fixture-coupling count already
     includes these files.
  10. **Design-flavored riders (single-lens, parked here for triage):**
      (a) **dies-trigger source LKI** — runTriggerEffects resolves ctx.sourceCard
      via battlefield-only findCard, so a dead source's deathtouch/lifelink/trample
      riders are silently dropped from its own dies-trigger damage (verifier:
      reachable today, no Codex needed); fork = document the divergence (§1006
      sentence + DIVERGENCE row) or snapshot rider keywords at emit time.
      (b) **'player'-type trigger slots never prompt the human** —
      tsIsImplicitTargetType auto-fills "a free player choice" via the heuristic,
      vs PROTOCOL §5's "targeted triggers controlled by you pause for UI input";
      recommend amending §5 with the implicit-slot carve-out now, revisit when a
      self-target-rational trigger lands. (c) **'opponent' text vs `target:'player'`
      shape** — Mercurial "Striker" and generator damageFace promise "opponent" in
      printed text but encode a free player choice; only the dark heuristic (#3)
      makes behavior match text; recommend `target:'opp'` (or signed gain_life for
      Striker's "loses life" wording) + a pin test.
- **Fix sketch:** one `tests/test_trigger_orchestration.js` battery — APNAP
  cross-controller order, post-drain holder (lands with A1-1), resolution fizzle
  (lands with A3-1), depth-cap bail at exactly 100, noSelfCascade live test, the
  distinct_targets queue-vs-fizzle case, restrict propagation per branch — plus a
  table-driven pickBestTriggerTarget unit test (~10 assertions), the generator
  literal-flag matrix + value/describe consistency pass, and the triggers.js
  garbage-input section. The staged A3 fixes each bring their own red→green slice;
  the remainder is the recommended consumption.
- **Effort:** medium (two test files; harness patterns exist in
  test_multitarget_trigger.js).
- **Verification status:** survived adversarial refutation (every battery
  independently re-run), confidence high.
- **Remediation class: PARK (test additions + classifications + design riders)** —
  the ladder allows landing new tests anytime.
- **Predicted test impact:** additive only.

---

### A3-10 — Trigger target legality is gated at EMIT time (inside the event) as well as at drain time: the redundant early gate silently suppresses triggers the drain-time check would fizzle with a log — and can wrongly suppress across the emit→drain window
- **Location:** `reference/html-proto/js/engine.js:3339` (the emit-time gate; the
  helper + misplaced 603.3c citation at :3380–3398; the correct drain-time check at
  :3433–3444) @ `e6715a9`
- **Dimension:** 1 (rules correctness — latent) + 2 (comment cites a rule at the
  wrong site)
- **Severity:** P3 (verifier-adjusted down: the wrong-suppression window is
  unreachable with the current pool — all emptyable-target triggers are
  single-event-synchronous today)
- **Evidence (verifier-confirmed, live-executed):** `emit()` runs
  `if (!triggerHasAnyValidTarget(trig, who)) continue;` per matched trigger at
  event time, before queueing; `pushTriggerOnStack` independently re-checks at the
  actual go-on-stack moment (and logs its fizzle). Repro: a "when a creature dies →
  damage target creature" permanent watching the only creature die →
  `pendingTriggers === 0` — suppressed at emit, never queued, **no log**. Canon
  places target choice at drain (§1005) and queueing on event/condition match
  (§1004); the helper's comment cites 603.3c but executes at the wrong moment. The
  divergence window (board changes between emit and drain) is real but currently
  unreachable.
- **Canon:** `1000-triggered-abilities.md` §1004/§1005.
- **Fix sketch (fork):** delete the :3339 gate and rely on the drain-time fizzle
  (behavior delta: today's silent vanishes become logged fizzles — arguably an
  improvement); or keep the early gate as a deliberate optimization and document it
  (DIVERGENCE row + fix the comment's rule citation).
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: STAGE** (behavioral fork in a dark region).
- **Predicted test impact:** none — no test pins the suppressed-vs-fizzled
  distinction (that's A3-9 #4's gap).

#### Decision packet for A3-10 (stage — plain English)
When something happens that *would* trigger an ability needing a target, the engine
checks "is there any legal target?" twice — once immediately, once at the proper
moment. The immediate check is redundant, silently eats the trigger with no message,
and is the one stamped with the rulebook citation that actually belongs to the
other check. With future cards it could also wrongly eat a trigger whose target
appears a moment later.
- **Option A (recommended, confidence: medium-high):** remove the early check; the
  proper one already handles everything and tells the player ("trigger fizzles — no
  legal target") instead of saying nothing.
- **Option B:** keep it as a deliberate shortcut and write it down in the
  divergence ledger. Either way the misplaced rule citation moves.

---

### A3-11 — `life_changed` / leave-play event payload conformance sweep (A2-8's class, completed): damagePlayer's life-loss emit omits `source_iid` (found by all 4 lenses), the entire leave-play family is structurally anonymous, and the header documents a phantom `killed_by_iid` field
- **Location:** `reference/html-proto/js/engine.js:4928` (damagePlayer emit;
  signature at :4904 takes only a `sourceName` string); `emitLeavesBattlefield`
  :4665 (no sourceIid param; callers :1843/:1869/:2422/:4779); attributed siblings
  at :1757/:2350 @ `e6715a9`
- **Dimension:** 2 (copy-paste / payload-shape divergence)
- **Severity:** P3 — the :4928 site **found independently by all 4 lenses**; this
  finding completes chunk 2's assigned ALL-emitters sweep, citing **A2-8** for the
  :5266 combat-lifelink site (not re-filed).
- **Evidence (verifier-confirmed ×4, live-executed):** of the four `life_changed`
  emitters, the two attribution-less ones are both on the damage path — :5266
  (A2-8) and :4928, where `damagePlayer(who, amount, sourceName)` structurally
  *cannot* attach the iid (only a display string is threaded; its caller
  `applyDamageFrom` has `ctx.sourceIid` in scope and drops it at :1729). PROTOCOL
  §3.3 declares `{who, delta, source_iid}`. The leave-play family
  (`emitLeavesBattlefield`) has no sourceIid parameter at all, so every bounce/
  exile/destroy/SBA-death `card_zone_change` is anonymous — even though checkDeaths
  holds `killedBy`/`damagedBySources` at that moment for kill-credit. And
  `killed_by_iid` has three doc declarations and **zero** emit sites (the header
  half rides A3-15). Verifier captured-event repros: loss events arrive with
  `source_iid` undefined; a noSelfCascade life-loss trigger fired off its own
  source's burn. **Severity counterweight (verifier, all three :4928 verdicts):**
  unlike A2-8, **zero consumers exist today** for the loss side — no card or
  generated condition pairs `is_life_loss` with noSelfCascade — so this is
  conformance + future-proofing, kept at P3 on the strength of the four-lens
  convergence and the port-spec angle. **Cross-reference for A2-8's packet:** its
  "both siblings attach it" sentence predates this sweep — there are four emitters,
  two clean, two not.
- **Canon:** triggers.js:3–8 (the proto's own declared shapes — post-A3-15 fix);
  PROTOCOL §3.3.
- **Fix sketch:** thread an optional `sourceIid` through `damagePlayer` (~5–6 call
  sites; combat passes `atk.iid`, spells `ctx.sourceIid`) and add a sourceIid param
  to `emitLeavesBattlefield` populated where causality is known; drop or implement
  `killed_by_iid`. Pairs naturally with A2-8's one-liner — **one PR makes all four
  life_changed emitters agree**.
- **Effort:** small. **Verification status:** survived adversarial refutation four
  times, confidence high.
- **Remediation class: STAGE** (behavioral payload additions in a dark region —
  same shape as A2-8's staged one-liner; bundle with it).
- **Predicted test impact:** none — no test references source_iid (chunk-2
  verified; re-confirmed here).

#### Decision packet for A3-11 (stage — plain English)
Game events are supposed to carry a tag naming which card caused them. Life GAINS
are tagged; life LOSSES from damage and all "card left the battlefield" events are
anonymous — the function that announces them is only ever handed a display name,
not the card. Nothing listens for the missing tags today, so nothing is broken;
but the event format doc promises the tag, and chunk 2 already staged the identical
fix for one sibling site (A2-8).
- **Option (only one, confidence: high):** thread the card identity through the two
  announcement functions so all the event sites match the documented format — and
  do it in the same PR as A2-8's one-liner so the whole family lands consistent.

---

### A3-12 — Mid-prompt trigger fizzle is silent: when a human's multi-slot target prompt ends in fizzle, the trigger vanishes wordlessly — both sibling fizzle paths log
- **Location:** `reference/html-proto/js/engine.js:5642–5643` (doTriggerTargetPick
  fizzle arm; logging siblings at :3437–3439 and :3701) @ `e6715a9`
- **Dimension:** 2 (silent-failure path / log truthfulness)
- **Severity:** P3 — **found independently by 2 lenses.**
- **Evidence (verifier-confirmed ×2):** on `r === 'fizzle'` the only handling is a
  comment + `drainTriggers()` — no `log()`. The player saw "X triggered — choose a
  target" (:3517), picked a target, and the trigger evaporates. **Reachability,
  honestly stated (both verifiers):** near-unreachable today — `isLegalAction`
  (:5851) freezes every actor except the prompted one while the prompt is open, so
  only distinct-slot exhaustion under the documented greedy no-backtracking pick
  can reach the arm, which needs a future 3+-slot/asymmetric-filter card. The
  underlying greedy/backtracking limitation is BACKLOG-tracked ("Two latent
  multi-slot selection edges") + in-code CAUTIONs — cited, not re-filed; the
  missing log line is the new part.
- **Fix sketch:** one log line in the fizzle arm mirroring :3438's wording.
- **Effort:** trivial. **Verification status:** survived adversarial refutation
  twice, confidence high.
- **Remediation class: STAGE** (behavioral one-liner in a dark region per policy —
  the chunk's smallest packet; a one-nod approval that can ride any trigger fix PR).
- **Predicted test impact:** none.

#### Decision packet for A3-12 (stage — plain English)
In a rare future situation, a player picking targets for a multi-target ability can
have the ability fizzle halfway through the prompt — and the game says nothing: you
picked a target and the ability just silently doesn't happen. Every other fizzle in
the engine prints a message. One-line fix (add the message); currently unreachable
with today's cards, so zero risk.

---

### A3-13 — Generated-trigger cloning discipline is inconsistent: two consumer sites share the `condition` array BY REFERENCE with the global Mercurial pool / built trigger, while the source constructors deliberately slice
- **Location:** `reference/html-proto/js/engine.js:921–927` (makePlayer pool pick)
  + :5779–5786 (finalizeBuild slot write); the careful siblings at
  trigger-generator.js:190/:134 @ `e6715a9`
- **Dimension:** 3 (state-mutation discipline) / 2 (copy-paste divergence)
- **Severity:** P3 — **found independently by 2 lenses.**
- **Evidence (verifier-confirmed, contamination executed):** both sites deep-clone
  `effects` per element but spread the parent — copying the `condition` array
  reference, so every game's Mercurial card aliases the module-level
  MERCURIAL_TRIGGER_POOL entry's array (verified: identity holds through makeCard;
  an in-place mutation of one game's condition array contaminated the pool entry
  for every subsequent game). Latent today (nothing mutates `trig.condition` in
  place; saves JSON-round-trip) — but `normalizeCardEffects` already rewrites the
  ADJACENT field `trig.effects` in place (triggers.js:188–190): the exact mutation
  pattern that would bite condition exists one key away. This is the same
  dynamically-shared-state class the project's `duplicate_deep()` discipline exists
  to prevent.
- **Fix sketch:** `condition: Array.isArray(pick.condition) ?
  pick.condition.slice() : pick.condition` at both spreads (2 lines).
- **Effort:** trivial. **Verification status:** survived adversarial refutation
  twice, confidence high.
- **Remediation class: STAGE** (behavioral two-liner; dark region; rides any
  trigger fix PR).
- **Predicted test impact:** none.

#### Decision packet for A3-13 (stage — plain English)
The Mercurial Adept's bonus ability is dealt from a shared global deck of options.
When the game deals one out, it photocopies most of the ability but keeps a live
link to one part of the original. If any future code edits that part in place, it
would corrupt the global deck for every later game. Nothing does that today — but
the neighboring field already gets edited in place, so the trap is one step away.
Two-line fix: photocopy that part too, like the other builder already does.

---

### A3-14 — Delayed-trigger queue keeps unknown `fireAt` values forever: the sibling leak to A1-6 — unknown effect kinds are silently DROPPED, unknown fire times are silently IMMORTAL, in the same 25-line block
- **Location:** `reference/html-proto/js/engine.js:2678` (schedule_delayed
  pass-through ternary; the CLEANUP drain at :6556–6578; A1-6's discard arm at
  :6563) @ `e6715a9`
- **Dimension:** 2 (structural footgun — silent-failure path)
- **Severity:** P3
- **Evidence (verifier-confirmed, executed):** `fireAt: params.when === 'end_step'
  ? 'endStep' : params.when` passes any unrecognized value through verbatim — and
  the boot validator's EFFECT_SCHEMA (:3188–3210) has **no schedule_delayed
  entry**, so a typo'd `when:'eot'` validates clean, then sits in `stillPending`
  re-checked and re-kept **every cleanup until game end** (the drain only fires
  `'endStep'`). Verifier note: the consequence is stronger than an inert immortal
  entry — when triggered repeatedly it accumulates. Unreachable today (the only
  producer, exile_until_eot's desugar, hardcodes 'end_step'). Cites **A1-6** (the
  filed unknown-effect discard mirror) and A1-15 (the fireAt naming lie) — not
  re-filed.
- **Fix sketch:** validate `when` at schedule time (console.warn + refuse to
  enqueue) — one guard covers this and narrows A1-6's surface; add a
  schedule_delayed EFFECT_SCHEMA entry. **Fold into A1-6's remediation.**
- **Effort:** trivial. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: STAGE** (behavioral guard; bundles with the staged A1-6).
- **Predicted test impact:** none.

#### Decision packet for A3-14 (stage — plain English)
"Do X at end of turn" effects go in a scheduling queue. If a future card misspells
the WHEN, the entry never fires and never leaves — an immortal zombie in the queue,
with no warning anywhere (its cousin bug, already filed as A1-6, silently DROPS
misspelled WHATs — opposite failures in the same code block). One small guard at
scheduling time fixes both silences; recommend folding it into A1-6's already-staged
fix so the block is hardened once.

---

### A3-15 — triggers.js's unified-event-shape header (the contract block predicates are written against) misnames the discriminator field (`kind` vs the real `type`) and documents a phantom `killed_by_iid` while omitting the real `source_iid`  ⟶ SHIP (comment-only)
- **Location:** `reference/html-proto/js/triggers.js:3–8` @ `e6715a9`
- **Dimension:** 2 (comment contradicts code; code is right)
- **Severity:** P3 — **found independently by 3 lenses.**
- **Evidence (verifier-confirmed ×3, runtime-demonstrated):** all five shapes are
  documented as `{kind, …}`; every emitter passes `type:` (eight engine.js sites:
  1757, 2350, 3366, 4928, 4933, 5048, 5266, 5582) and the dispatcher matches
  `trig.event !== evt.type` (:3337) — a probe `emit({kind:…})` queues nothing,
  `emit({type:…})` works. `killed_by_iid` appears nowhere outside this comment;
  the real optional causal field on card_zone_change is `source_iid` (:3376),
  which the **noSelfCascade guard 30 lines below the header reads** (triggers.js:
  361) — the header misleads exactly its declared cross-engine audience, and
  PROTOCOL §3.3 (correct on both counts) disagrees with it. Same comment-rot class
  as the BACKLOG-recorded Endomorph subject_card incident (a handler reading a
  retired field name, dead for months). Aggravator: composable_predicates_test's
  synthetic events also use `kind:` — the payload field-name contract is tested
  nowhere (A3-9 #9 carries the test half).
- **Fix:** rewrite the header to the emitted truth: `kind`→`type` (note the
  wire/Godot naming in one line, per PROTOCOL §3.3), drop `killed_by_iid`, document
  `source_iid` on card_zone_change.
- **Effort:** trivial. **Verification status:** survived adversarial refutation
  three times, confidence high.
- **Remediation class: SHIP (comment-only)** — zero behavior change; gate is
  suite + lint green.
- **Predicted test impact:** none.

---

### A3-16 — Comment-hygiene sweep (merged): three more verified-false attribution/contract comments in the trigger pipeline + one dead-payload caveat + the stale E6 line cite  ⟶ SHIP (comment/docs-only)
- **Location:** four comment sites + one DIVERGENCE cite @ `e6715a9`
- **Dimension:** 2 (comment hygiene)
- **Severity:** P3 — items found by 1–3 lenses each; merged into one ship.
- **The items, each verified:**
  - **(a) trigger-generator.js:1–2 (+ :149, :186) header attribution is false:**
    "Architect's Codex and Mercurial Adept use this to roll…" — neither uses
    `generateRandomTrigger` (the Codex uses the three-step flow, the Adept the
    static pool; grep-verified zero production callers). Rewrite to name the real
    consumers. (The dead function itself is A3-7's staged call.)
  - **(b) engine.js:4775–4778 (checkDeaths):** "Fires after all cardDies emits…" —
    the legacy cardDies event was retired (E1 PROTO: DONE; zero emit sites; the
    test suite asserts cardDies is *rejected* as unknown). Rewrite to the current
    contract ("emitted after the whole batch is spliced, with the batch as
    extraSources, so simultaneous deaths see each other").
  - **(c) engine.js:2478–2479 (EFFECTS.discard):** attributes its only live
    producer to "the Mercurial trigger generator (discardOpp)" — discardOpp lives
    in GENERATOR_EFFECTS, reachable only via the Codex build flow; the Mercurial
    pool contains no discard. Misattribution invites a bad "safe to delete" call.
  - **(d) engine.js:5580–5581 (attacks emit):** "legacy condId triggers read
    attacker/defender" — the legacy vocabulary is fully retired (E2) and grep finds
    **zero consumers** of either field. Rewrite the comment to a truthful caveat
    ("attacker/defender are dead legacy payload fields, no consumers; composable
    triggers read subject_card/defender_key"). **Removing the fields themselves was
    verified suite-green (1786/1786) but is a behavior-adjacent payload change —
    flagged as a candidate rider for a staged trigger PR, NOT shipped here.**
  - **(e) DIVERGENCE.md E6's line cite** `engine.js:2731` is stale — the cap lives
    at :3299/:3641–3645 (same zero-behavior ledger-refresh lane as chunk-2's
    A2-11 #4).
- **Effort:** tiny. **Verification status:** every sentence survived adversarial
  refutation with grep/execution evidence, confidence high.
- **Remediation class: SHIP (comment/docs-only)** — zero behavior change; gate is
  suite + lint green.
- **Predicted test impact:** none.

---

## Leads adjudicated clean

Five handed-down or standing questions were run to ground — by multiple lenses
independently where noted — and closed **without** a finding:

1. **CLEANUP-queued triggers draining at next turn's MAIN1 (chunk-1's cross-lead) —
   CANON-CORRECT, closed** (adjudicated independently by all 4 lenses, converging).
   pendingTriggers' only clearing writer is drainTriggers itself (:3509), so
   cleanup-era triggers persist and drain at the next turn's MAIN1
   openPriorityRound — exactly what §605 sanctions ("don't drain until priority
   next opens"; §514 explicitly states priority does not open during cleanup). The
   APNAP sort reads the NEW active player at drain time — §1004 binds order at
   drain time, so this complies with canon's literal text (it diverges from real
   MTG's cleanup priority round, but canon-not-real-MTG governs). The "wrong-turn
   lifeLostThisTurn read" sub-concern is REFUTED: trigger conditions evaluate at
   EMIT time (E5's documented no-recheck), so this-turn trackers are read
   pre-UNTAP-reset; drain-time evaluation is target legality only. **Residue:** one
   sentence pinning drain-time AP belongs in the §1000 rewrite (folded into A3-4).
   Zero coverage of the path (A3-9 #8).
2. **Nothing drains between first-strike passes (chunk-2's lead) — CONCUR with
   chunk-2's refutations** (3 lenses independently). resolveCombatDamage runs only
   afterEffectsApplied between passes, which QUEUES (checkDeaths emits) but never
   drains; no drainTriggers call site exists inside the combat-damage path, so
   mid-combat trigger RESOLUTION cannot corrupt pass-2 state; queued triggers
   resolve at MAIN2's round — and canon §803 L31–32 documents exactly that timing.
   The real pass-2 hazard remains A2-1's live-keyword re-read (filed, cited).
3. **Counterspells can't target triggers — §706-conform.** The counter effect
   refuses trigger stack entries (:2306–2310) and getValidTargets' 'spell' case
   excludes `kind:'trigger'` (:3832–3835) — a counterspell can never even target a
   trigger.
4. **The generated-trigger vocabulary is fully executable + describable.** Every
   GENERATOR_CONDITIONS/MERCURIAL_TRIGGER_POOL event ∈ VALID_TRIGGER_EVENTS, every
   condition atom ∈ ATOMIC_PREDICATES, every effect kind has a live EFFECTS handler
   (legacy draw/discard kinds retained explicitly for the generator, per comments
   :1943/:2478), both token_ids ∈ TOKENS, all 8 generator conditions round-trip
   through triggerArchetype (test-pinned), and generated triggers are describable
   via their authored `.text` (triggerLogText short-circuits on it). The
   needsLiveSource×sourceLive filter prevents the only hard-break pairing — and
   that filter is pinned by a real property test (verifier-corrected; what's dark
   is its *flag inputs*, A3-9 #1). What's missing is the *mechanism* keeping this
   true (A3-5), not today's truth.
5. **emit() / drainTriggers re-entrancy — safe.** emit snapshots and clears its
   work before looping; pushing to the stack runs no effects (tsAutoPick is
   side-effect-free), so drainTriggers cannot re-enter itself; effects only run at
   resolution via passPriority. Mid-drain prompt pause/resume preserves effective
   resolution order (the re-sort on resume is order-equivalent).

---

## Verified clean (negative space — checked against canon, no finding)

- **A2-4's trigger side needs no idempotency fix:** emit/pendingTriggers correctly
  have NO dedupe (a card may legitimately trigger twice from two events); the
  duplicate-attacker fix belongs on declaration legality exactly as A2-4 says.
- **Mid-prompt board freeze:** `isLegalAction` (:5851) blocks every action except
  triggerTargetPick while a prompt is open, so no state change can interleave; on
  resume, advanceTriggerTargetPrompt re-computes remaining slots and fizzles
  cleanly (modulo A3-12's missing log).
- **checkDeaths' batch `extraSources` design** correctly lets simultaneous deaths
  see each other without double-queueing (emit happens post-splice).
- **VALID_TRIGGER_EVENTS exactly matches the five emitted event types** — no dead
  or phantom registrations.
- **Cross-game leaks: none** — init() rebuilds G wholesale; emit/drainTriggers
  no-op on gameOver. Cross-TURN pendingTriggers survival is by design (lead #1).
- **doOptionalCost decline-path drain asymmetry is benign** — step()'s top-of-loop
  drain gate (:6409–6412) covers it (noted for any future remediator).
- **Depth-cap bail skipping afterEffectsApplied is benign today** — no effects ran
  on the bailed trigger, and advancePhaseAfterPriority's sweep catches up.
- **The constructible two-card mutual gain_life trigger loop terminates correctly
  at the cap** with a logged bail (different-card pairs defeat noSelfCascade by
  design — an intentional soft break per the generator header).
- **APNAP drain order itself is canon-correct** (§1004: AP-first queue → NAP-on-top
  LIFO) — correct but unfenced (A3-9 #8).

---

## Coverage (union of the four lenses)

**Read (at the anchor):** `js/triggers.js` and `js/trigger-generator.js` in full;
`engine.js` — the Mercurial pool (L1–60), applyDamageFrom, the relevant EFFECTS
handlers' emit sites, schedule_delayed, the full trigger/targeting core
(L3280–4130: cardHasEffect → emit/emitZoneChange → queue/drain/auto-pick →
resolveTrigger/runTriggerEffects → getValidTargets + the ts* TargetSelection
component), the death/life pipeline (L4660–4942), priority primitives +
stack resolution + combat-damage head (L4944–5350), the do* handlers
(L5530–5860), and the step loop incl. the CLEANUP delayed-trigger drain
(L6380–6612). Canon: rules 600/700/1000 pages in full; PROTOCOL §3.3 region;
DIVERGENCE E1–E8 + F4 + D0/D8; BACKLOG in full; chunk-1/2 findings files. Tests
read in full: composable_predicates_test, trigger_generator_test,
test_trigger_target_prompt, test_multitarget_trigger (+ trigger_migration_test
structure). Live node repros executed at the anchor by finders AND verifiers
(every behavioral finding carries one).

**Not read (descoped to their owning chunks):** engine.js L60–1700 except greps
(makeCard trigger-attach wiring grepped only); effect-handler bodies L2000–3280
(chunk 4); probeTargets/draw/move call-site bodies L4130–4660 (emit signatures
grep-verified); doCastSpell head L5350–5530 (A1-1 owns the priority side);
legality/getLegalActions L5860–6380 (chunk 1); executeAction tail; card-text.js's
render side (generated-trigger describability verified via the generator's
describe fns + boot validation only); ai.js trigger consumers (chunk 7); 256 of
258 card JSONs (chunk 11). One dedupe note for the record: the handed-down
pointer "BACKLOG B4 delayed-trigger cleanup timing" does not exist in the anchor
BACKLOG.md (only B3 remains); A1-6/A1-15 cover the delayed-trigger drain's
adjacent aspects.

---

## Refuted appendix — NONE (and why that's worth saying out loud)

**Zero refuted claims this chunk: 48 finder claims went to adversarial
verification, 48 survived.** Chunks 1 and 2 both produced refutations (chunk 2's
three were themselves a useful canon-misreading datum), so a zero is an anomaly
worth recording as a **calibration datum**, not a victory lap. Two readings:
finder discipline genuinely improved on a well-documented subsystem (the trigger
layer has the repo's best comments and its best-tested file), or the verifiers
under-pressured the claims. Evidence for the first: verifiers were demonstrably
adversarial in the *adjustment* dimension — roughly a third of the verdicts
pushed severity or framing DOWN (latency notes on A3-10/-11/-12, scope trims on
A3-4/A3-9, an unreachability proof on A3-12) and several corrected finder facts
(the exile_until_eot pin, the property-test pin on the generator filter, D8's
false assertion). Still: **the self-QA pass must re-attack the weakest items
rather than rubber-stamp the streak** — specifically A3-1's P1 severity (the
chunk's biggest call), A3-10/A3-12's unreachability claims (each rests on a
current-pool argument that new cards invalidate), and A3-11's "zero consumers"
claims. If self-QA also finds nothing, that is itself a datum for the morning
packet.

**Self-QA gate result (2026-06-10, fresh context):** the named weak items were
re-attacked at the anchor; **zero findings refuted, two evidence corrections
applied** — so the zero-refutation streak survives, but with demonstrated pressure
rather than by default. (1) **A3-1 re-executed end-to-end twice** in a scratch
`git archive e6715a9` copy: the original repro (locked trigger + hexproof granted
on the stack → 2 damage applied, getValidTargets simultaneously returning `[]`)
ran 3/3 deterministic once the NAP held a live flash response; a NEW
100%-real-actions repro via staple synthesis confirmed reachability. **Correction
applied:** the finding's shared-drain-batch reachability mechanism was wrong
(APNAP/LIFO order-blocks it — the grant in a shared batch is AP-side and resolves
last); the staple route replaces it. P1 sustained. (2) **A3-10/A3-12** —
unreachability arguments re-derived from the anchor code (`main_phase_only` on the
only instant-window reanimator; queue-time `tsAutoPick` gate + mid-prompt freeze);
both hold for the current pool, both correctly latent-P3. A3-12's cited lines
(:5642–5643 silent arm vs :3437–3439/:3701 logging siblings) verified exact.
(3) **A3-11 zero-consumer claims** re-grepped: `is_life_loss` has zero card /
generator / Mercurial-pool consumers (every live `life_changed` condition is
`is_life_gain`: ajanis_pridemate, generator gainLifeYou, pool entry); the only
`source_iid` reader is the noSelfCascade guard (triggers.js:361). Holds.
(4) **A1-1 upgrade section** — count precision fixed (52 `priorityHolder`
test occurrences, not ~60; one is a harness read, not a write) and the section
re-framed against Joe's 2026-06-10 intentional-behavior verdict (note at top).
Mutation citations spot-checked against the survivor files (counts 47/195,
107/123, 240; the L3394→anchor-3425 offset; the 6-mutant noSelfCascade cluster;
generator L129/L144–145) — all exact.

---

## Cross-chunk leads (handed forward)

- **Chunk 4 (effects/targeting):** the spell-side twin of A3-1 — resolveTopOfStack
  performs no resolution-time target legality re-check either (§704.1 citation
  handed over); plus the within-resolution LKI/snapshot semantics (D1) deserve a
  deliberate look where the effect handlers live.
- **Chunk 7 (AI):** ai.js trigger-frequency/triggerArchetype consumers unexamined;
  pickBestTriggerTarget's heuristics (A3-9 #3) are shared AI/human surface.
- **Chunk 9 (run.js/saves):** stale `bonusTrigger` shapes in old saves bypass any
  new A3-5 boot validation — the migration side of that fix.
- **Chunk 11 (card JSONs):** only aether_drake + a hexproof survey were read here;
  the per-card trigger-shape conformance sweep remains.
