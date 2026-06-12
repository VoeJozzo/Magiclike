# Chunk 1 — Turn machine / phases / mana / state (`engine.js` L4400–6770 core + priority/legality plumbing)

> Tier 2. **4-lens Workflow fan-out** (rules correctness, state-mutation discipline,
> structural footguns, test quality) **+ adversarial verify per finding — 58 agents.**
> Anchor SHA **`1a92c42`** (workshop tip; `origin/dev` 37c2eb2 unchanged — claim-time
> merge was a no-op). Canon set: `docs/wiki/rules/` (100, 500, 600, 700, 1100, 1200),
> `docs/PROTOCOL.md`, `docs/DIVERGENCE.md`, `reference/html-proto/BACKLOG.md`, plus the
> existing tests' stated expectations. Date 2026-06-10.
>
> Cross-lens duplicates are deduped below; "found independently by N lenses" is noted
> where it applies (it strengthens the finding). 14 refuted claims in the appendix.

## Mutation-map note (governs ship gate this chunk)

The mutation map is **COMPLETE for `engine.js` at 45% killed**. The turn-machine region
(L4400–6770) is worse than the file average: **682 of 1103 regional mutants survived**
(`C:/Users/Joe/.config/magiclike/audit/mutation/engine-step-region-survivors.txt`).
Per the test-quality lens's judgment read, a nontrivial fraction of those survivors are
equivalent/near-equivalent (defensive `typeof RUN` guards, `|| 0` fallbacks, log-string
args), so 62% overstates raw risk — but the judgment-filtered clusters are real and they
sit **exactly under this chunk's behavioral findings** (specific lines cited per finding
below).

**Calibration-day policy applied here:** every behavioral fix in this chunk **stages**,
because the map shows the touched regions are weakly covered — which per the autonomy
ladder is precisely the demotion condition ("in weakly-tested regions … demotes to
stage"). **Ship** class is reserved for docs/comment-only items with zero behavior
change, whose safety gate is "full suite + lint stay green," not the map. **Trivia** is
code that is provably behavior-preserving (dead guard, dead parameter), batched into one
chunk-1 trivia PR.

---

## Findings

### A1-1 — Priority cluster: stack pushes hand priority to the opponent; immediate-resolve abilities never reset the pass tracker; triggers synthesize priority rounds in closed windows
- **Location (3 sites, one mechanism family):**
  `reference/html-proto/js/engine.js:5012` (pushOnStack), `:5443-5527`
  (doActivateAbility), `:3394-3396` (pushTriggerEntry) @ `1a92c42`
- **Dimension:** 1 (rules correctness) + 3 (state-mutation discipline)
- **Severity:** P1 (cluster; the L3394 leg alone is P2-latent)
- **Found independently by:** the L5012 leg by **2 lenses** (rules + footguns, both
  confirmed); L5443 and L3394 by the state lens.
- **Evidence (verifier-confirmed, all three legs live-executed):**
  - **L5012 (opp-handoff after cast):** `G.priority.passes.clear(); G.priorityHolder =
    opp(item.controller);` — deliberate per the design comment at 4913-4917. Canon
    contradicted in **two places**: `docs/wiki/rules/600-priority-and-the-stack.md` §603
    ("that player retains priority (MTG rule 117.1c)") and `700-casting-and-activating.md`
    §702 step 5 ("Caster retains priority"). **DIVERGENCE.md D0 (line 96) is factually
    wrong about the proto** — it claims caster-retains and tags the row "already-aligned"
    (with stale line cites 2867/3874); git history (`git log -S`) shows the opp-handoff
    has existed since the original upload and a caster-retention variant never existed.
    The Godot side genuinely retains (engine.gd:685-686), so the engines **live-diverge
    on every cast**. Verifier node repro: after casting bolt 1, `priorityHolder === 'opp'`
    and the caster's second cast is illegal while the opponent's response is legal — the
    response order is *reversed* vs canon (not equivalent to retain-then-auto-pass:
    the opponent gets the first window). Nuance: the caster regains priority after the
    opponent passes (passPriority else-branch, 4963), so follow-up stacking is delayed,
    not denied; only player-visible when the opponent has live responses.
  - **L5443 (no pass-reset after ability resolution):** doActivateAbility mutates the
    board but never clears `G.priority.passes` — the **only** mutation path without a
    reset (pushOnStack 5011 and pushTriggerEntry 3395 both clear). Verifier re-ran the
    finder's repro at anchor: AP passes → NAP activates Prodigal Sorcerer → the single
    `executeAction` closed MAIN1, auto-skipped combat, and parked in MAIN2 — **the AP
    never held priority on the post-ability board** (in COMBAT_BLOCK that's the defender
    losing the response window before damage). The in-code comment at 5523-5525 shows
    the author *intended* a post-activation window — fulfilled today only when the
    activation happens to fire a trigger. Repro script:
    `C:/Users/Joe/AppData/Local/Temp/audit_c1_repro_passes.js`.
  - **L3394 (synthesized round in a closed window):** `if (!G.priority) G.priority =
    {passes: new Set()}` conjures a priority round when a trigger drains while priority
    is closed. If that happens while step() is parked on a pending declaration, both
    players auto-pass the synthetic round and `advancePhaseAfterPriority` skips straight
    past the declaration — **combat silently skipped with `attackersDeclared` still
    false**. Latent today (verifier surveyed all 14 add_mana cards: none emits triggers
    or has a sac cost), live the day any "sacrifice: add mana" card lands, because mana
    abilities are legal at ANY time (isLegalAction 5957-5961) and doActivateAbility ends
    with unconditional `drainTriggers()` (5526). Verifier aggravators: the identical path
    through COMBAT_BLOCK pre-declaration is worse (blocks skipped entirely → attackers
    connect unblocked, and §605 explicitly lists that window as closed), and the
    synthetic round illegally opens an instant-cast window pre-declaration.
- **Fix sketch (coordinated):** (1) pushOnStack: `G.priorityHolder = item.controller`
  (keep `passes.clear()`); (2) doActivateAbility: clear `G.priority.passes` after
  non-mana resolution (activator retains per §603; consider doPlayLand too); (3)
  pushTriggerEntry: refuse to synthesize a round when priority is closed — leave the
  trigger queued; step() already drains at the next openPriorityRound. **Chunk-3 twin:**
  `pushTriggerOnStack` does the same opp(controller) handoff — adjudicate together when
  chunk 3 runs; don't fix one and leave the other.
- **Effort:** small code change per leg; **moderate blast-radius verification** (AI
  driver must handle "I just cast/activated, I hold priority again" without looping;
  selfplay + full suite run).
- **Verification status:** all three legs **survived adversarial refutation, confidence
  high**, each with a live node repro (L5012 and L5443 executed this session; L3394 by
  mechanism demo with a seeded trigger standing in for the future card).
- **Remediation class: STAGE** (genuine fork + weakly covered region).
- **Predicted test impact:** zero tests assert `priorityHolder` post-cast or post-ability
  (grep: all ~50 test occurrences are fixture setup writes). Declared ex ante: flow
  tests that alternate `passPriority` for both seats may be sequence-sensitive; ability
  tests that expect phase advance after ONE pass may need a second pass — run the suite
  to enumerate. step()'s dead-round auto-pass makes most existing paths converge either
  way.
- **Mutation-map judgment (why stage):** passPriority's round-close core is among the
  *better*-killed code in the region, but survivors sit exactly at the seams this fix
  touches — `L4932 ||->&&` (the holder/guard condition), `L4949`/`L4953` (chain-depth
  resets), `L4992 >->>=` (the round-close phase boundary) — and **no assertion anywhere
  pins who holds priority after a cast or activation**. The suite cannot fence this
  fix's blast radius; per the ladder that demotes to stage.

#### Decision packet for A1-1 (stage — plain English)
When you cast a spell in this game, who gets to act next? The official rulebook (and
the Godot version) says **you do** — you keep "priority" so you can cast a second thing
on top of your first. The prototype instead **hands the turn to your opponent**
immediately, every time. Worse, two cousins of the same machinery: activating an
ability (like the Sorcerer's ping) can **end the whole phase in one click** — your
opponent's earlier "pass" is still counted as if nothing happened in between, so they
never get to respond to the ability; and the trigger system can invent a fake
priority round in a moment the game is supposed to be paused, which (once a certain
kind of future card exists) would let the game **skip combat entirely**.
- **Option A (recommended, confidence: medium-high):** make the prototype match the
  rulebook and the Godot engine — caster keeps priority, ability use resets the
  pass-count, triggers wait instead of inventing rounds. One coordinated fix, one
  test pinning each behavior. This also un-lies two documentation pages (see A1-13).
- **Option B:** decide "opponent responds first" is the house rule you actually want,
  keep the code, and rewrite the rulebook §603/§700 and DIVERGENCE D0 to say so — and
  then change the **Godot** engine to match the proto. More total work, and the
  pass-tracker and synthesized-round legs still need fixing regardless (they're bugs
  under either rule).
The pass-tracker leg (ability ends the phase out from under the opponent) is not a
taste call — it's wrong under both options. The packet is staged as one unit because
the three legs share machinery and a partial fix would leave the priority model
internally inconsistent.

---

### A1-2 — Legality and payment disagree on mana payability: backtracking `canPayPotential` vs greedy `payMana` → uncaught mid-cast Error + half-applied state
- **Location:** `reference/html-proto/js/engine.js:1605` (payMana; supporting
  1564-1602 canPayPotential, 1666-1690 tapSourceProducing, 5404 doCastSpell) @ `1a92c42`
- **Dimension:** 2 (structural footgun — one fact, "can/how to pay," in two diverging
  implementations); rules correctness secondary
- **Severity:** P1 as filed (verifier suggests medium: reachability today is narrow,
  but the exposure surface grows with every multicolor card or dual land)
- **Evidence (verifier-confirmed via green end-to-end repro through the public API):**
  canPayPotential backtracks over choose-color source assignments; payMana pays
  greedily in fixed W,U,B,R,G order via tapSourceProducing, which taps the FIRST
  choose-source containing the requested color, no backtracking. isLegalAction gates on
  canPayPotential (5896); doCastSpell calls payMana as its **first** mutation (5404);
  the `throw new Error('Mana payment failed (color): …')` at 1626 escapes executeAction
  (6642 — no try/catch wraps executeAction or any of its call sites; the handful of
  try/catches elsewhere in js/ guard DOM focus/fullscreen/localStorage, none on the
  action path — QA-corrected from "no try/catch anywhere in js/"). Verifier repro observed: `isLegalAction ===
  true`, executeAction **threw**, one land left wrongly tapped, the produced {U}
  consumed, spell still in hand, stack empty, step()/notify() never ran. Violates the
  engine's own contract comment at 5347 ("assume the action has been validated").
  Reachable today: partial choose-lists are constructible via `land_color_*` stickers
  (grantManaAbility 262-275), land staple-merges, City of Brass; real-pool two-pip
  cards exist (seal_thief_courier {U}{B}{C}, sword_and_sorcery {W}{U}{C}). The same
  mismatch also gates **activateAbility** (5935 vs 5453) and **optional trigger costs**
  (3710/3715) — a fix must cover all three payMana call sites.
- **Fix sketch:** (a) plan-based payment — canPayPotential returns the satisfying
  assignment, payMana executes it; or (b) smaller: snapshot tapped-set + pool, rewind
  on throw, reject the action. Either way, regression test with two overlapping
  choose-duals.
- **Effort:** medium (plan refactor) / small (rewind variant)
- **Verification status:** survived adversarial refutation, confidence high; repro left
  at `reference/html-proto/tests/_repro_paymana_mismatch.js` in the workshop worktree
  ("BUG CONFIRMED" output observed).
- **Remediation class: STAGE.**
- **Predicted test impact:** none — no test pins greedy payment (test_mana.js pins only
  fixed-preferred-over-choose:'any'); the staged fix lands its own red→green test.
- **Mutation-map judgment (why stage):** L1605-1690 sits outside the step-region
  survivor extract, and per the verifier **no test exercises a payment that requires
  backtracking at all** — the touched region is dark, so the suite can't catch a botched
  payment refactor. Stage per ladder.

#### Decision packet for A1-2 (stage — plain English)
The engine has two different brains for mana: one decides "can you afford this spell?"
(smart — it tries every combination of your dual lands), the other actually pays
(dumb — grabs the first land that works, never reconsiders). With two dual lands whose
colors partially overlap, the smart brain says "yes, castable," then the dumb brain
paints itself into a corner mid-payment and the engine **crashes out of the action**,
leaving a land wrongly tapped and the spell stuck in your hand. Needs run-reward duals
plus a two-color spell, so it's rare today — but every new dual land or multicolor card
widens it.
- **Option A (recommended, confidence: high on correctness, medium on effort):** make
  the payer follow the plan the affordability checker already found. Fixes it
  everywhere (spells, abilities, optional costs).
- **Option B (cheaper):** keep the dumb payer but make failure safe — undo any taps
  and politely refuse the action instead of crashing. Honest, but it means the engine
  sometimes says "castable" and then refuses, which is its own small lie.
Recommendation: A; B is acceptable as a stopgap if A's refactor feels heavy.

---

### A1-3 — Indestructible creatures at toughness ≤ 0 illegally survive (SBA skips all three death causes)
- **Location:** `reference/html-proto/js/engine.js:4720-4727` (checkDeaths) @ `1a92c42`
- **Dimension:** 1 (rules correctness; surfaced via the test-quality lens)
- **Severity:** P1 as filed (verifier: medium — real rules bug, corner-case reachability)
- **Evidence (verifier-confirmed by live repro):** `lethalDamage = (c.damage >= t) ||
  (t <= 0) || c.dealtDeathtouch;` then the indestructible `continue` at 4722 skips ALL
  three causes. Canon `docs/wiki/rules/1100-state-based-actions.md` L17 is explicit:
  indestructible creatures are "exempt from the lethal/lethal-marked checks **but still
  die at 0 toughness**" (matches MTG 704.5f — 0-toughness death isn't destruction).
  Line 4720 is the only toughness≤0 check in the file, so nothing else kills such a
  creature. Verifier repro: non-indestructible vanilla at effective toughness −1 dies
  (control); indestructible vanilla at −1 **survives** (bug); real-pool route confirmed
  (iron_statue 0/5 printed-indestructible + stacked sicken/plague_sower, or an
  Endomorph-absorbed indestructible + one sicken). The comment at 4723-4726 justifies
  only the marked-damage case — the t≤0 skip looks accidental, not a deliberate
  divergence. DIVERGENCE F1/F2 do NOT cover this (F1 claims engine parity only, not
  canon conformance).
- **Fix sketch:** one-line reorder — check `t <= 0` death **before** the indestructible
  continue (indestructible exempts only damage/deathtouch causes). Land with a
  red→green test covering both t≤0 cases (plain + indestructible).
- **Effort:** small
- **Verification status:** survived adversarial refutation, confidence high; repro
  executed this session (mirrors test_rules_infra helpers, drives SBA via real passes).
- **Remediation class: STAGE.**
- **Predicted test impact:** none existing — no test puts ANY creature at t≤0 (see
  A1-23 #11); test_rules_infra F2 pins only the marked-damage exemption, which the fix
  preserves. The staged fix brings the pinning test.
- **Mutation-map judgment (why stage):** both L4720 mutants survive the full suite —
  `<=-><: "t <= 0" -> "t < 0"` and `||->&&` (which deletes the pure-debuff death path
  entirely) — i.e., the exact line being edited is unfenced. This is the canonical
  ladder demotion: single unambiguous canon answer, but the touched region's coverage
  is not real until the fix's own test lands. Stage.

#### Decision packet for A1-3 (stage — plain English)
"Indestructible" is supposed to mean "can't be destroyed by damage" — but a creature
shrunk to zero toughness (by −X/−X effects) dies anyway; that's not destruction,
that's just having no body left. The rulebook page says exactly that. The prototype's
death-check skips indestructible creatures **entirely**, so a shrunk-to-nothing
indestructible creature illegally stays on the battlefield.
- **Option (only one, confidence: high):** reorder two lines so the zero-toughness
  check happens before the indestructible exemption, plus a test for both cases.
This stages rather than ships only because the death-by-shrinking code path has zero
test coverage today (the mutation map proves the suite is blind there) — the fix
arrives with its own test and is a "yep, ship it" nod.

---

### A1-4 — Systemic test coupling: 36 of ~70 test files hand-write engine internals (`G.priority = { passes: new Set() }`, `G.phase = …`, `priorityHolder`, `gameOver`)
- **Location:** `reference/html-proto/tests/test_rules_infra.js:31-34` (exemplar;
  97 occurrences across 36 files, grep-verified) @ `1a92c42`
- **Dimension:** 4 (test quality — brittleness)
- **Severity:** P2 (big)
- **Evidence (verifier-confirmed, with an empirical demonstration of the predicted
  failure mode):** no shared helper exists — each file duplicates its own hand-built
  state. The priority-round shape is genuinely internal (PROTOCOL.md never mentions
  `priorityHolder`/`priority.passes`; only the phase enum VALUES are protocol-pinned,
  §3.6). The verifier performed a behavior-preserving rename of the internal field
  (`G.priority` → `G.prio`) in a scratch copy and ran all 36 affected tests:
  **34/36 SILENTLY KEPT PASSING** (hand-writes became dead writes; the engine's lazy
  re-init self-heals — the tests stopped constraining the priority machinery at all)
  and 2/36 went false-red (test_seal_thief_courier.js, verse_counter_test.js), with
  zero engine behavior change. The dominant failure mode under the parked step()/
  decomposition refactors is therefore the WORSE one: the suite stays green while
  losing its grip — exactly the laundering scenario plan dimension 4 warns about.
  This coupling is also the direct cause of the region's 62% mutation survival.
- **Fix sketch:** centralize — one `startMainPhase(who)` helper in `_setup.js` that
  drives the real machine where feasible, falling back to a SINGLE hand-built-state
  helper so the internal coupling lives in exactly one file. Mechanical sweep; do
  alongside (or before) the step() refactor.
- **Effort:** medium
- **Verification status:** survived adversarial refutation, confidence high (counts
  exact; 34-silent/2-false-red datum from a live rename experiment).
- **Remediation class: PARK** — refactor-scale; feeds the parked step()/engine.js
  decomposition planning as the pre-identified false-red/silent-green noise list.
- **Predicted test impact:** n/a (this finding is *about* the tests); the 34/36-silent
  datum should be recorded in the refactor plan.

---

### A1-5 — Action-vocabulary sync: one fact in four hand-synced switches, `executeAction` has no default arm (silent no-op reports success); same missing-default class in `advancePhaseAfterPriority`
- **Location:** `reference/html-proto/js/engine.js:6654` (executeAction dispatch, 16
  cases, no default; siblings: isLegalAction 5860-6098, getLegalActions 6105+,
  isForcedActionResponse 5807-5818) and `:4987` (advancePhaseAfterPriority, 5 phases,
  no default) @ `1a92c42` — parked together per triage policy (same hardening class).
- **Dimension:** 2 (structural footgun)
- **Severity:** P2 (both latent — case lists are in sync today; verifier downgrades to
  maintainability/robustness with documented recurrence)
- **Evidence (verifier-confirmed):** an action type added to isLegalAction but missed
  in the dispatch would no-op yet return true; controller.js:1631-1636 falls back to
  pass only on `false`, so the failure mode is an **AI softlock re-deciding the same
  no-op every 100ms with zero diagnostics**. Not hypothetical as a class: three prior
  bites of this drift class are documented in comments in the same file (6087-6092,
  6357-6359 "Codex MAIN1-skip bug", 6622-6626), and the vocabulary is actively growing
  (edictChoice, optionalCost). For L4987: an unknown phase silently leaves `G.phase`
  unchanged and step()'s `while(true)` spins — verifier **empirically reproduced the
  hang** (corrupt phase 'UPKEEP' during an open round → synchronous infinite loop,
  external timeout kill, exit 124; an in-process watchdog never fires). Unreachable
  today (all phase writes are setPhase literals); becomes the first landmine on the
  UPKEEP path (DIVERGENCE B1). Verifier correction: a complete fix needs defaults in
  BOTH advancePhaseAfterPriority AND step()'s own phase switch (6422-6611), which
  shares the flaw.
- **Fix sketch:** `default: console.error(...); return false;` in executeAction +
  boot-time assertion that the case lists match (shared ACTION_KINDS array); loud
  default (error + throw or force-set CLEANUP) in both phase switches.
- **Effort:** small — but parked because the right home is the step()/PHASE_TABLE
  refactor, where the vocabulary and phase tables become single sources of truth.
- **Verification status:** both legs survived adversarial refutation, confidence high
  (the hang empirically reproduced; the drift demonstrated via simulated-drift patch).
- **Remediation class: PARK** (with the step() refactor; cheap to do there, and the
  one-line defaults are a natural first commit of that refactor).
- **Predicted test impact:** none (no test guards case-list parity — itself part of
  the finding).

---

### A1-6 — CLEANUP delayed-trigger drain silently discards unknown effect kinds; adjacent comment names the retired `returnFromExile` kind
- **Location:** `reference/html-proto/js/engine.js:6505-6516` (drain; producer ground
  truth at 2643-2655) @ `1a92c42`
- **Dimension:** 2 (silent-failure path + comment contradicts code; code side is right)
- **Severity:** P2 as filed (verifier: low — the drop branch is unreachable today;
  single producer always emits `effect:'deferredEffects'` with an effects array)
- **Evidence (verifier-confirmed by live repro):** a dt matching `fireAt === 'endStep'
  && matchesPlayer` but with any other effect kind falls past the inner if and is NOT
  pushed to stillPending — removed without firing, no warning ("// fired, don't keep"
  is a lie on that path). Verifier repro: pushed `{fireAt:'endStep',
  effect:'returnFromExile'}`, drove through CLEANUP — trigger gone, effect never
  executed (getter probe never accessed), zero warnings. The comment at 6493-6495 names
  'returnFromExile', which exists nowhere except two comments; the sole producer
  (schedule_delayed, 2646-2655) hardcodes 'deferredEffects' and its own comment says it
  *replaced* the bespoke returnFromExile path. A future author modeling a second
  delayed-effect kind on that comment gets silent no-fire.
- **Fix sketch:** fix the comment (deferredEffects) + add `else { console.warn('delayed
  trigger with unknown effect kind dropped:', dt.effect); }` (or push-to-stillPending).
  Behavior unchanged for all current cards.
- **Effort:** tiny
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: STAGE** (behavioral code change in a dark region, per policy —
  the warn arm is new executable code; the comment half alone would be ship, but
  splitting it would orphan the warn).
- **Predicted test impact:** none — test_exile_until_eot pins only the deferredEffects
  path; no test pins the silent drop as intended.
- **Mutation-map judgment:** the drain's conjunctions survive wholesale — `L6505 &&->||`,
  `L6506 &&->||`, plus the L6504 fireFor mutants (see A1-23 #7) — the region is dark,
  so even this tiny change stages and should carry a pinning test for the warn path.

#### Decision packet for A1-6 (stage — plain English)
The end-of-turn cleanup has a queue of "do this later" effects. If an entry it doesn't
recognize ever lands in that queue, it's **thrown away silently** — no error, no log —
and the comment next to the code describes an effect type that was deleted long ago.
Nothing breaks today (only one effect type exists and it's handled), but the next
developer who adds a second type by reading that comment gets invisible failure.
- **Option (only one, confidence: high):** correct the comment and make the
  throw-away path shout (console warning). One line each; current games unchanged.

---

### A1-7 — Empty-combat fast path skips the §505 priority window entirely (no round opens when zero attackers are declared)
- **Location:** `reference/html-proto/js/engine.js:6457-6461` @ `1a92c42`
- **Dimension:** 1 (rules correctness — latent canon divergence)
- **Severity:** P3 — **found independently by 2 lenses** (rules + state; both confirmed)
- **Evidence (verifier-confirmed, both lenses, live repros):** `if (G.attackers.length
  === 0) { G.attackersDeclared = false; setPhase('MAIN2'); continue; }` runs before
  `openPriorityRound()` — zero attackers (explicit, endTurnPending, or no-eligible
  auto-skip) means no COMBAT_ATTACK round ever opens for either player; the skip never
  consults hasNoAction, so §606's auto-pass license doesn't cover it. Canon: §500 table
  row 505 grants priority "Yes" with no carve-out; §801.1 is explicit about the
  defender's response window; §605's closed list does NOT include declare-attackers.
  Repro: defender holding a castable flash creature gets priority in MAIN1/MAIN2/END of
  every turn but never in any COMBAT phase of attacker-less turns; a state probe showed
  2 castSpell entries WOULD be legal if a round opened. Both verifiers' materiality
  note: impact today is **nil** — MAIN2's round opens immediately with state identical
  (no phase-keyed combat cards, no events on empty declaration, pools empty either way);
  triggers queued during the skip drain in MAIN2's round (not lost). Becomes observable
  the day any "during combat"/beginning-of-combat card lands. Godot already windows
  COMBAT_ATTACK (DIVERGENCE B7 note) — the engines diverge here, untracked (B6/B7 cover
  other skips, not this one).
- **Fix sketch:** decision fork — (a) docs: one DIVERGENCE.md row + an "Implementation
  status" bullet on the 500/800 rulebook pages covering the proto combat-priority model
  including this skip (both verifiers recommend this; consistent with the deliberately
  lean combat); or (b) code: replace the fast path with a hasNoAction-gated
  openPriorityRound (two lines).
- **Effort:** trivial (docs) / small (code)
- **Verification status:** survived adversarial refutation twice, confidence high.
- **Remediation class: STAGE** (genuine docs-vs-code fork on a canon divergence; the
  rulebook is the tie-breaker doc and currently contradicts both the proto AND the
  documented-deliberate intent).
- **Predicted test impact:** none — the only test touching the skip
  (test_exile_until_eot.js endTurn helper) passes identically under either option.
- **Mutation-map judgment:** `L6458 bool-flip` survives (the fast path's flag reset is
  unpinned); no test reaches a COMBAT_ATTACK round at all in attacker-less turns. Dark
  region → stage.

#### Decision packet for A1-7 (stage — plain English)
When nobody attacks, the game jumps straight from "combat" to the second main phase
without offering either player the brief "anything before we move on?" window the
rulebook promises during combat. Today that window would be useless anyway (the very
next window is identical), so nothing is actually wrong for players — but the rulebook,
the Godot engine, and the prototype now all disagree with each other on paper.
- **Option A (recommended, confidence: high):** paper fix — record the skip as a
  deliberate prototype shortcut in DIVERGENCE.md and the rulebook's status notes, and
  add a tripwire note for any future "during combat" card.
- **Option B:** open the window in code and let auto-pass close it instantly when
  nobody can act. Slightly more canonical, slightly slower turn loop, no player-visible
  gain today.

---

### A1-8 — `G.attackers` is never pruned when attackers die/leave; the `advancePhaseAfterPriority` L4992 zero-attackers arm is unreachable dead code with divergent flag hygiene
- **Location:** `reference/html-proto/js/engine.js:4992` (dead arm; no-prune evidence
  at 4705-4752 checkDeaths, writes only at 5529/6478/6605/2879-2888) @ `1a92c42`
- **Dimension:** 3 (state-mutation discipline — stale collection + implicit contract)
- **Severity:** P3
- **Evidence (verifier-confirmed, runtime repro):** nothing splices G.attackers on
  death/bounce/steal; every consumer findCard-guards ghosts (5198, 6399-6405, ai.js:390),
  so the count can't drop mid-round and the L4992 length===0 → MAIN2 arm is unreachable
  in live play. Its flag hygiene differs from the live skip path (6457-6459 resets
  attackersDeclared before MAIN2; the dead arm would leave it true until CLEANUP) —
  verifier note: unobservable even counterfactually (attackersDeclared only read when
  phase===COMBAT_ATTACK). Runtime repro confirmed the ghost walk: lone attacker shocked
  to death mid-round → G.attackers still holds the dead iid, round close takes the
  COMBAT_BLOCK arm, engine auto-declares no blockers, defender gets a COMBAT_BLOCK
  round. **That extra round is canon-CORRECT** (CR 508.8 and repo §801 both proceed to
  blocks once attackers were *declared*) — the stronger "documented skip-to-MAIN2"
  framing of this claim was refuted (see appendix R2); what survives is the dead arm +
  the unstated "consumers must findCard-guard stale iids" contract. The scariest
  variant (bounced-then-recast attacker falsely re-recognized) is structurally
  impossible: iids re-mint on every battlefield arrival.
- **Fix sketch:** either prune G.attackers (and G.blockers values) in checkDeaths/
  leave-play, or delete the unreachable L4992 false-arm and document the re-guard
  contract where G.attackers is declared.
- **Effort:** small
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: STAGE** (two reasonable shapes — prune vs document-the-contract —
  and the prune option changes live combat bookkeeping in a weakly covered region).
- **Predicted test impact:** none — no test exercises kill-attacker-in-response;
  deleting the dead arm or adding pruning fails nothing existing.
- **Mutation-map judgment:** `L4992 >->>=` survives (the boundary is unpinned), and the
  combat flag lifecycle is broadly dark (L6458/6479/6480 bool-flips survive). Stage.

#### Decision packet for A1-8 (stage — plain English)
The engine keeps a list of "who's attacking." When an attacker dies mid-combat, it's
never crossed off — every later step just quietly ignores dead entries. That works
(verified — the extra block step it causes is actually what the rules want), but it
leaves a booby trap: one branch of code that *looks* like it handles "all attackers
died" can never actually run, and the "everyone must ignore dead entries" rule is
nowhere written down.
- **Option A (recommended, confidence: medium):** delete the can't-run branch and
  write the rule down as a comment where the list is declared. Zero behavior change.
- **Option B:** actively cross dead attackers off the list (cleaner long-term, touches
  live combat bookkeeping — wants a test that kills an attacker mid-combat first).

---

### A1-9 — DRAW step logs a draw that never happened on both empty-library paths (deck-out and phylactery rip)
- **Location:** `reference/html-proto/js/engine.js:6441-6442` (drawCard paths at
  4467-4493) @ `1a92c42`
- **Dimension:** 1 (log/UI truthfulness; engine state itself is canon-correct)
- **Severity:** P3 — **found independently by 2 lenses** (rules + state; both confirmed)
- **Evidence (verifier-confirmed, live repro both times):** `drawCard(ap); log(`…
  draws.`);` with no return-value check; drawCard returns null on deck-out (loss) and
  phylactery rip. log() unshifts, so the deck-out log reads newest-first: "You draws." /
  "Opponent wins!" / "You can't draw — loses!" — the topmost line on a loss claims a
  successful draw. The phylactery variant is MORE user-visible: the game continues and
  "rips a slot instead" is followed by a false "draws." in live play. Secondary:
  setPhase('MAIN1') runs post-gameOver (harmless — loop-top gameOver check exits).
  Winner/state/canon (§100.6, §512) all correct; only the log lies.
- **Fix sketch:** `const c = drawCard(ap); if (c) log(…draws.)` + optionally
  early-return when G.gameOver after the draw.
- **Effort:** trivial
- **Verification status:** survived adversarial refutation twice, confidence high
  (exact log sequence reproduced in node by both verifiers).
- **Remediation class: STAGE** (behavioral per chunk policy — it changes what players
  see in the log; smallest packet in the chunk, a one-nod approval).
- **Predicted test impact:** none — no test asserts the DRAW-step log on deck-out.
- **Mutation-map judgment:** the DRAW case is in the dark zone (L6438 draw-skip mutant
  survives; nothing pins DRAW-step logging). Stage with the fix's own assertion.

#### Decision packet for A1-9 (stage — plain English)
When you lose by drawing from an empty deck, the last line of the game log says you
drew a card. You didn't. (Same false line appears when the Phylactery boon saves you.)
One-line fix: only log "draws." when a card was actually drawn. Recommendation: do it
(confidence: high) — staged only because chunk policy stages all behavior-visible
changes.

---

### A1-10 — `tapLandForMana` is legal during cleanup discard: a window where the mana is unusable and the tap is irreversibly wasted
- **Location:** `reference/html-proto/js/engine.js:5823` (whoHasPriority
  cleanupDiscarding clause; legality at 5874/5890) @ `1a92c42`
- **Dimension:** 3 (state-mutation discipline — mutation permitted in a canon-closed
  window)
- **Severity:** P2 (raised from finder's P3 by self-QA recommendation, accepted by runner: UI-reachable today via clickBattlefield with material cost — the land stays tapped through the opponent's entire turn)
- **Evidence (verifier-confirmed, live repro):** chain verified end-to-end:
  cleanupDiscarding=true (6487) → whoHasPriority returns true for the AP (5823) →
  isLegalAction tapLandForMana passes → land taps, mana floats → nothing is castable
  during CLEANUP and setPhase('UNTAP') zeroes the pool. Canon §605 closes the cleanup
  discard explicitly ("no spells or abilities can be cast or activated"); §705's
  mana-ability exception requires "any time mana could be paid" — nothing is payable.
  Verifier upgrades to the finder's framing: (1) the hole is reachable through the
  normal UI — controller.js clickBattlefield (1789) guards pendingSearch/forcedDiscard
  but NOT cleanupDiscarding, so a misclick mid-discard taps the land; (2) UNTAP untaps
  only the NEW active player's permanents, so the land **stays tapped through the
  opponent's entire turn** — a real loss of instant-speed mana, not merely a cosmetic
  wasted tap. Repro left at
  `reference/html-proto/tests/_repro_cleanup_tap.js` (workshop worktree).
- **Fix sketch:** drop the cleanupDiscarding clause from whoHasPriority (discard
  legality has its own check at 6023; expectedActor its own at 6631 — needs a careful
  dependents check), or explicitly exclude tap actions during cleanup.
- **Effort:** small
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: STAGE.**
- **Predicted test impact:** none pin the hole (only test_deepseam_quarry.js:26 touches
  the flag, as setup hygiene); the dependents check should enumerate whoHasPriority
  consumers before landing.
- **Mutation-map judgment:** `L5823 ===->!==` and `L5874 ||->&&` both survive — the
  exact gate being edited is unpinned. Stage with a pinning test (tap illegal during
  cleanup discard; discard still legal).

#### Decision packet for A1-10 (stage — plain English)
While you're discarding down to seven at end of turn, the game still lets you click
your lands to tap them for mana — mana you cannot possibly spend (nothing is castable
right then) and that evaporates seconds later. Worse, the land stays tapped through
your opponent's whole turn, so a stray click genuinely costs you. The rulebook says
this window is closed.
- **Option (one, confidence: medium-high):** close the loophole — make land-tapping
  illegal during the cleanup discard. Needs a quick check that nothing else leaned on
  the permissive gate, hence staged.

---

### A1-11 — Forced modal responses silently disarm End Turn fast-forward (`endTurnPending` cleared by compelled actions)
- **Location:** `reference/html-proto/js/engine.js:6651-6653` (clear site; consumer
  controller.js:1650) @ `1a92c42`
- **Dimension:** 1 (comment-vs-code intent mismatch / UX papercut)
- **Severity:** P3
- **Evidence (verifier-confirmed, live repro, exit 0):** executeAction clears
  endTurnPending for ANY active-player action except pass/endTurn. The forced-response
  action types (the exact isForcedActionResponse set, 5807-5818) all match — and per
  isLegalAction 5859 they're the ONLY legal actions while a modal is open, so the
  player **cannot** answer the modal without disarming End Turn; the auto-pass loop
  (controller.js:1650) silently never resumes. The in-code rationale ("the player is
  re-engaging," 6649-6650) is false for compelled responses. Refutation attempt failed
  on the asymmetry: stack interruptions pause-and-RESUME ('pass' is excluded from the
  clear), forced modals permanently disarm — collateral from the blanket clear, not
  design. Repro: endTurn → flag true; inject forcedDiscard; answer it → flag false.
- **Fix sketch:** one-line carve-out: `… && !isForcedActionResponse(action)` (the
  helper already exists), or whitelist the voluntary kinds explicitly.
- **Effort:** trivial-small (one condition + a controller-driven check)
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: STAGE** (behavior change to a documented-adjacent feature;
  DIVERGENCE B7 documents the clear with the same voluntary framing and is silent on
  forced modals — B7 gets a one-line update with the fix).
- **Predicted test impact:** none — zero tests reference endTurnPending at all (see
  A1-23 #3); fix should land the feature's first pinning test.
- **Mutation-map judgment:** the entire endTurnPending feature is dead under the suite —
  all four feature-deleting mutants survive simultaneously (L5796 set, L6608 rollover
  clear, **L6651 clear-condition mutants** ×5, L6387 forced declaration). Maximal dark
  region → stage with tests.

#### Decision packet for A1-11 (stage — plain English)
You press End Turn and the game fast-forwards. If something forces you to make a
choice mid-fast-forward (a forced discard, a "pick a target" prompt), answering it
**silently cancels** your End Turn — the game just stops and waits, and you have to
press End Turn again with no explanation. The code's own comment says the cancel is
for when you *voluntarily* re-engage; a forced prompt isn't voluntary.
- **Option (one, confidence: high):** exempt forced responses from the cancel (the
  one-line check already exists in the engine). Fast-forward resumes after the prompt,
  exactly like it already does after enemy spells.

---

### A1-12 — PROTOCOL.md §3.6 misdescribes the proto turn machine ("collapses UNTAP+UPKEEP+DRAW into a single UNTAP step")  ⟶ SHIP (docs-only)
- **Location:** `docs/PROTOCOL.md:298` @ `1a92c42`
- **Dimension:** 1 (doc contradicts code; the code side is correct)
- **Severity:** P3
- **Evidence:** verifier-confirmed: engine.js has distinct `case 'UNTAP'` (6423) →
  `setPhase('DRAW')` (6432) → `case 'DRAW'` (6435), and setPhase empties pools on the
  boundary, so UNTAP→DRAW is a real, behaviorally observable phase boundary; render.js
  lists DRAW in the UI ribbon; UPKEEP alone is absent (DIVERGENCE B1, intentional).
  PROTOCOL.md also claims a "plan … to split them" that contradicts B1.
- **Fix sketch:** rewrite the §3.6 sentence: "JS has UNTAP and DRAW as distinct
  (auto-advancing) phases; UPKEEP alone is unimplemented (DIVERGENCE B1, intentional)."
- **Effort:** trivial. **Verification status:** survived adversarial refutation,
  confidence high (static repro suffices).
- **Remediation class: SHIP** — docs-only, zero behavior change; safety gate is suite
  + lint green (mutation map not an input for comment/doc edits).
- **Predicted test impact:** none.

---

### A1-13 — DIVERGENCE.md D0 is factually wrong: claims the proto retains caster priority and tags the row "already-aligned"  ⟶ SHIP (docs-only)
- **Location:** `docs/DIVERGENCE.md:96` (row D0; stale line cites engine.js:2867/3874)
  @ `1a92c42`
- **Dimension:** 2 (doc-contradicts-code; the canonical divergence ledger is lying)
- **Severity:** P3 (the underlying behavior is A1-1's P1; this entry is the ledger fix)
- **Evidence:** verified under A1-1: the proto does opp-handoff (engine.js:5012,
  deliberate per 4913-4917) and always has (git log -S — a caster-retention variant
  never existed); Godot genuinely retains (engine.gd:685-686). D0 is wrong about the
  proto AND wrong that the engines align.
- **Fix sketch:** correct D0 to record the live divergence — proto: opponent receives
  priority after a stack push (engine.js:5012/3396); Godot: caster retains (canon
  §603) — and update the stale line numbers. **Reference the staged A1-1 packet** as
  the open adjudication; whichever option Joe picks there, the ledger must state
  today's truth now (and gets a one-line update again if the code changes).
- **Effort:** trivial. **Verification status:** carried by A1-1's verdict (confidence
  high, live-executed).
- **Remediation class: SHIP** — recording reality in the ledger changes no behavior and
  doesn't pre-empt the A1-1 decision.
- **Predicted test impact:** none.

---

### A1-14 — `skipApEndStep` comment imprecision + §606 doc gap (the AP-END auto-skip is intended but suppresses instant-speed actions the comment doesn't mention)  ⟶ SHIP (comment/docs-only)
- **Location:** `reference/html-proto/js/engine.js:6373-6374` (comment; behavior at
  6376-6382); `docs/wiki/rules/600-priority-and-the-stack.md` §606; DIVERGENCE B6
  (stale line cites 5177/5196) @ `1a92c42`
- **Dimension:** 2 (comment hygiene) + canon-gap documentation
- **Severity:** P3
- **Evidence:** confirmed by two lenses; the **defect framing was refuted by a third**
  (see appendix R5 — the skip is intentional, pinned by tests/test_priority_window.gd:
  85-90, specced in plan-priority-window-refactor.md:132, recorded in B6). What
  survives: the justifying comment "(they had M2 for sorcery-speed plays)" is genuinely
  imprecise — sorcery speed never existed in END (engine.js:5843-5849), so what the
  skip actually suppresses is exactly the instant-speed category the comment omits; and
  §606's sanctioned-auto-pass list doesn't enumerate this skip (§500 row 509 grants AP
  priority with no documented exception). The NAP's EOT window is preserved
  (false_witness_test.js depends on it) and the AP regains a window on any non-empty
  stack.
- **Fix sketch:** comment-only: extend 6373-6374 to state the real trade ("AP loses
  instant-speed initiation at their own END; anything castable there was equally
  available in M2 / on a non-empty stack"); add the AP-END skip to §606's sanctioned
  list + fix B6's stale line numbers. **No code change** (narrowing the skip to
  hasNoAction is a possible future behavior change — that would be stage; not taken).
- **Effort:** tiny. **Verification status:** survived adversarial refutation (both
  comment-imprecision and canon-gap angles), confidence high.
- **Remediation class: SHIP** — docs/comment-only, zero behavior change.
- **Predicted test impact:** none (no test pins skipApEndStep; the only END-priority
  tests use NAP-holds-priority setups).

---

### A1-15 — `fireAt:'endStep'` is a naming lie: the field promises the §509 END step (a priority window) but execution is in CLEANUP (no priority)  ⟶ SHIP (comment-only)
- **Location:** `reference/html-proto/js/engine.js:6505` (drain inside `case
  'CLEANUP'`; sole writer schedule_delayed:2647) @ `1a92c42`
- **Dimension:** 1 (naming footgun; the CODE's timing is right for its only consumer)
- **Severity:** P3 (verifier: naming debt / latent trap, no current misbehavior)
- **Evidence:** verifier-confirmed: the engine has a real END phase that IS a pure
  priority phase (6449-6452) — the window the name promises exists and is bypassed;
  cleanup timing is correct and test-pinned for exile_until_eot ("until end of turn"
  durations end in cleanup); the hazard is a future genuine "at the beginning of the
  end step" trigger wired to this field firing silently in the wrong, unrespondable
  window — and no test would catch it (test_exile_until_eot's endTurn helper crosses
  both phases in one loop).
- **Fix sketch (comment clarification ONLY, per chunk policy):** add a warning comment
  at the drain site and at schedule_delayed: this queue fires in CLEANUP and is NOT the
  home for genuine §509 end-step triggers; note the `when:'end_step'` wire name in
  PROTOCOL.md row 152 carries the same caveat. **A code rename (`fireAt:'cleanup'`)
  would be stage — not done here.**
- **Effort:** tiny. **Verification status:** survived adversarial refutation,
  confidence high (verifier downgraded severity to low; behavioral demo in transcript).
- **Remediation class: SHIP** (comment-only).
- **Predicted test impact:** none.

---

### A1-16 — PENDING_DECISIONS registry header understates the add-a-modal checklist by ~4 mandatory sites  ⟶ SHIP (comment-only)
- **Location:** `reference/html-proto/js/engine.js:350-351` @ `1a92c42`
- **Dimension:** 2 (comment hygiene — misleads maintainers about a hand-synced fact's
  true span)
- **Severity:** P3
- **Evidence:** verifier-confirmed against the two newest modals (pendingEdictChoice,
  pendingOptionalCost): a working modal needs the registry entry + makeState field +
  isForcedActionResponse branch (5815-5816) + isLegalAction case (6056-6067) +
  getLegalActions block (6309-6321) + executeAction dispatch (6667-6668) + AI/controller
  handling. Following the comment's two-step recipe literally produces a **hard
  soft-lock** (engine paused, getLegalActions returns [], every answer illegal — the
  verifier traced the mechanism through 5859/6324/6332).
- **Fix sketch:** rewrite the header to the full checklist. Docs-only.
- **Effort:** tiny. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: SHIP** (comment-only).
- **Predicted test impact:** none.

---

### A1-17 — tests/README.md is stale by ~6×: "362 assertions across 13 files," "9 module files" vs 74 test files / 1786 assertions / 17 modules  ⟶ SHIP (docs-only)
- **Location:** `reference/html-proto/tests/README.md:4,17,34,108,119,174` @ `1a92c42`
- **Dimension:** 2 (doc hygiene — misleads suite-scope reads, including ship-gate
  coverage reads)
- **Severity:** P3
- **Evidence:** verifier-confirmed: run_all.js CATEGORY_A = exactly 74 entries (counted
  programmatically); _setup.js ENGINE_FILES = 17 modules; the README even contradicts
  itself ("9 module files" at L4 vs "13 module files" at L108). origin/dev carries the
  identical stale lines, so this isn't workshop lag.
- **Fix sketch:** replace hardcoded counts with pointers ("see run_all.js CATEGORY_A /
  _setup.js ENGINE_FILES" — can't rot) or refresh the figures.
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high.
- **Remediation class: SHIP** (docs-only).
- **Predicted test impact:** none.

---

### A1-18 — Canon §1102's "20-iteration SBA cap" describes the Godot engine, not the proto (proto's checkDeaths is uncapped `while(true)` with provable termination)  ⟶ SHIP (docs-only)
- **Location:** `docs/wiki/rules/1100-state-based-actions.md:24` (vs
  `reference/html-proto/js/engine.js:4712` and `engine/engine.gd:1023`) @ `1a92c42`
- **Dimension:** 2 (canon-vs-code; **the doc side is the one lying**, per the evidence)
- **Severity:** P3
- **Evidence:** verifier-confirmed beyond "likely": engine.gd:1023 `var safety := 20`
  is the exact mechanism and number the rulebook describes — the page documented the
  Godot implementation as engine-independent canon. The proto's termination argument is
  sound (dies/leaves emits queue into pendingTriggers rather than resolving inline, so
  the battlefield strictly shrinks each iteration — O(creatures) bound). The divergence
  is untracked (DIVERGENCE F4 marks SBA sweep "already-aligned" — true for ordering,
  silent on the cap; inversely symmetric with E6, where the proto has the trigger-depth
  cap and Godot lacks it).
- **Adjudication (ship, not stage):** the rulebook sentence is wrong *as
  engine-independent canon*; proto behavior is correct and provably terminating, so
  there is a single unambiguous docs fix: scope §1102's cap sentence as Godot-only and
  note the proto relies on guaranteed termination (+ optionally an F-row in
  DIVERGENCE.md). The optional belt-and-braces cap **in the proto** is a separate tiny
  code change — flag it at triage alongside the parked step() refactor if symmetry with
  E6 is wanted; it is not refactor-coupled today.
- **Effort:** small. **Verification status:** survived adversarial refutation,
  confidence high (inspection-level repro: the three greps in the transcript).
- **Remediation class: SHIP** (docs-only).
- **Predicted test impact:** none.

---

### A1-19 — Redundant guard in step()'s trigger-drain gate: `!G.pendingTriggerTarget` at L6369 is unreachable-false  ⟶ trivia
- **Location:** `reference/html-proto/js/engine.js:6369` @ `1a92c42`
- **Dimension:** 2 (dead guard / comment-consistency prune)
- **Severity:** P3 (nit) — **found independently by 2 lenses** (rules + footguns)
- **Evidence:** proven statically (PENDING_DECISIONS registers pendingTriggerTarget
  with `active:()=>true`, so anyoneOwesDecision() returns at 6360 first; only pure
  reads between; drainTriggers self-guards at 3471 — doubly backstopped) AND
  empirically: the footguns verifier patched the conjunct into a tripwire and ran the
  **full suite (74 files, 1786 assertions) + 200-game selfplay — zero hits**. The
  tombstone comment at 6415-6419 documents exactly this class of guard as already
  pruned; this occurrence was missed.
- **Fix sketch:** drop `&& !G.pendingTriggerTarget` from the 6369 condition.
- **Effort:** one token. **Verification status:** survived adversarial refutation
  twice, confidence high.
- **Remediation class: trivia — batch into one chunk-1 trivia PR** (provably
  behavior-preserving; the sibling `pendingTriggers.length > 0` conjunct is
  load-bearing and stays).
- **Predicted test impact:** none (dead code; tripwire run proves it).

---

### A1-20 — `openPriorityRound(initialHolder)` parameter is dead code (all three call sites zero-argument; the implied contract is doubly false)  ⟶ trivia
- **Location:** `reference/html-proto/js/engine.js:4919-4921` @ `1a92c42`
- **Dimension:** 2 (dead code)
- **Severity:** P3
- **Evidence:** verifier-confirmed: workshop-wide grep = exactly 4 occurrences — the
  definition + three zero-arg calls (6451, 6463, 6472); function is IIFE-local, so no
  external caller can pass an argument. A hypothetical passed holder would also be
  silently clobbered by drainTriggers→pushTriggerEntry (3396) — the parameter's implied
  contract is unreliable on top of unused.
- **Fix sketch:** remove the parameter; hardcode `G.priorityHolder = G.activePlayer`.
- **Effort:** tiny. **Verification status:** survived adversarial refutation,
  confidence high (static proof sufficient).
- **Remediation class: trivia — batch into one chunk-1 trivia PR.**
- **Predicted test impact:** none (no test references the function).

---

### A1-21 — Combat-state reset list (attackers/blockers/attackersDeclared/blockersDeclared) maintained in 3 engine sites + a 4th copy in a test  ⟶ park
- **Location:** `reference/html-proto/js/engine.js:6478-6480` (COMBAT_DAMAGE), `:6605-
  6608` (CLEANUP, + endTurnPending), `:6458` (skip-path partial); 4th copy
  `tests/test_seal_thief_courier.js:21-22` @ `1a92c42`
- **Dimension:** 2 (flag-reset list duplication)
- **Severity:** P3 (maintainability only; nothing misbehaves)
- **Evidence:** verifier-confirmed with one rationale correction: the CLEANUP copy is
  canon-pinned (§514.3 "attacker/blocker state clear") + defense-in-depth, NOT
  load-bearing for the skip path (which self-cleans at 6458); the COMBAT_DAMAGE copy is
  independently load-bearing same-turn (without it stale combat highlights persist
  through MAIN2/END — verifier's deletion repro). So the list is genuinely
  double-maintained and the claim was actually undersold (4th copy in the test).
- **Fix sketch:** one `resetCombatState()` helper called from all sites; natural
  PHASE_TABLE entry-action in the parked step() refactor.
- **Effort:** tiny — parked because its home is the step() refactor (BACKLOG's
  duration-dedupe item owns the adjacent EOT-revert duplication; deliberately not
  re-filed).
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: PARK.** **Predicted test impact:** none (the only test touching
  these fields hand-rolls its own reset — see A1-4).

---

### A1-22 — Empty-mana-pool literal `{W:0,…,C:0}` triplicated; color-key list re-listed inline in ≥5 more places  ⟶ park
- **Location:** `reference/html-proto/js/engine.js:951, 4973, 4974` (literals); inline
  color lists at 306, 344 (COLORS), 429, 1180, 2128; `js/draft.js:9` duplicate COLORS
  @ `1a92c42`
- **Dimension:** 2 (one fact in N hand-synced literals) — low stakes
- **Severity:** P3 — flagged by **2 lenses** (footguns confirmed the DRY observation;
  the state lens's stronger "silent float hazard" mechanism was **refuted** — see
  appendix R6: setPhase does whole-object replacement, so a missing key is *deleted*,
  never floated; the predicted symptom was mechanically backwards)
- **Evidence:** verifier-confirmed all sites, plus scoping nuances: deckColorsFromSlots
  (306) is outside the IIFE so it *can't* reference COLORS as structured; COLORS
  without 'C' is defensible domain modeling. Pure DRY/maintainability; behavior is
  canon-correct (§604, DIVERGENCE B2 DONE).
- **Fix sketch:** `emptyManaPool()` helper at 951/4973/4974; hoist/export COLORS;
  derive poolTotal from Object.values. Sweep 429/1180/2128 + draft.js:9.
- **Effort:** tiny — parked into the engine.js decomposition refactor (and see A1-23
  #10: strengthen the B2 test BEFORE any such refactor touches setPhase).
- **Verification status:** survived adversarial refutation, confidence high.
- **Remediation class: PARK.** **Predicted test impact:** none.

---

### A1-23 — Coverage gaps (dimension 5, grouped) — the turn machine's dark zones, with survivor citations
- **Location:** `reference/html-proto/js/engine.js` (per-entry lines below) @ `1a92c42`
- **Severity:** P3 (test debt, not code bugs) — **Effort:** medium (one scripted
  full-turn behavioral test) — **Predicted test impact:** additive only (new tests;
  none existing flip).
- **Lens:** testquality; each entry **survived adversarial refutation, confidence
  high** — every one was verified by *actually running the mutants* against the full
  suite (1786/1786 green in every case unless noted). These are test-debt entries, not
  code bugs: in every case the shipped code was checked against canon and found
  correct. Grouped here rather than given full packets.
- **Remediation class: PARK (test additions)** — the ladder allows landing new tests
  anytime; the recommended consumption is **one scripted full-turn behavioral test**
  (drive real turns via executeAction passes; assert draw skip, untap resets, mana
  emptying both players, combat flag lifecycle, cleanup discard, turn counter,
  endTurnPending) — the lens estimates it kills **100+ survivors at once**, the
  highest-leverage single test in the campaign so far. Land it before the parked
  step()/decomposition refactors.

1. **Win/loss detection — zero suite coverage.** `L4551 bool-flip` (endGame
   gameOver=true→false) and all 5 checkLifeTotals mutants survive, including
   `L4758/L4759 <=-><` (a player at exactly 0 life not losing) and the phylactery-guard
   `drop-!`. Six live mutant runs, all 1786/1786 green. Only selfplay_harness asserts
   G.winner and it's not in run_all. (ai_burn_lethal_test's disjunct assert can't fail
   once life ≤ 0.) Canon: §1201/§1101.
2. **Cleanup discard (§514.2) — untested both seats.** `L6485 7→8`, `L6486 seat-flip`,
   `L6487 gate→false` (human prompt never opens), `L6491` count/choice mutants all
   survive — including a combined feature-breaking run. No test reaches CLEANUP with
   hand > 7.
3. **endTurnPending — total gap.** All four feature-deleting mutants applied
   *simultaneously* (L5796 set deleted, L6608 rollover clear deleted, L6651 cancel
   disabled, L6387 forced declaration deleted): 1786/1786 green. The feature can be
   deleted wholesale invisibly; no test issues an endTurn action. Pairs with A1-11.
4. **lifeLostThisTurn accumulator + UNTAP reset.** `L4890 -→+`, `L4892 +→-`,
   `L6429/L6430 0→1` survive (the L4891 `>→>=` and `||0` survivors are near-equivalent
   noise per the verifier — dropped from evidence). Existing lifeLostThisTurn tests
   drive a *duplicate* accumulation line (engine.js:2323), never damagePlayer's. Sole
   consumer bloodlust_berserker is untested. Canon cite corrected: §501, not §511.
5. **Phylactery engine half — whole-subsystem dark.** Throw-probes at the top of
   ripSlotForPhylactery (4779), ripSlotByIdx (4834), damagePlayer's phylactery branch
   (4878), and drawCard's rip (4480): suite identical-green — the regions are never
   executed. `L4879 -→+` (damage HEALS the protected player) survives; even the
   always-on predicate mutant (4770 ===→!==) survives, which also shows **no test
   asserts the human can lose at ≤0 life at all**. Root cause: every test boots
   plains-only decks; no phylactery slot ever installed. (Canon-cite caveat: the boon's
   spec lives in engine comments + cards.js, not the cited rules pages.)
6. **Temp-control EOT revert (B5) — zero behavioral coverage.** `L6582 splice(i,1)→
   (i,2)` (revert EATS an adjacent permanent), `L6571 >=→>` (index-0 creature never
   returned), `L6574`, `L6589` (sick flip), `L6595` (castPermissions filter flip) all
   survive. test_change_control never crosses an end of turn. Spec-drift risk: B5 says
   the Godot port will read this code as spec.
7. **delayedTriggers player-matching dormant.** `L6504 drop-!/===→!==`, `L6505/L6506
   &&→||` survive; all producers hardcode `fireFor:'either'`, so both the default
   branch and the `=== ap` branch are dead with current producers. YAGNI-delete or pin
   before any card relies on it (chunk-3 lead; mirror the decision when Godot does B4).
8. **Play/draw fairness + turn counting.** `L6438 &&→||` (first player skips draw EVERY
   turn) and `L6604 ===→!==` (turn increments on the wrong player's cleanup) survive;
   verifier proved both non-equivalent (5 skip-logs vs 1 in a 3-turn game). DIVERGENCE
   A2 makes the proto the spec the Godot port copies — no executable spec on either
   side.
9. **END-step NAP window.** `L6377 ===→!==` and `L6378 ===→!==` survive — the
   non-active player's only EOT instant window (load-bearing for flash AI) can be
   deleted invisibly; the existing END tests bypass step(). Ready-made pin test in the
   workflow transcript.
10. **B2 mana-emptying thin (1 of 12 cells pinned).** 10 of 12 zero-literal `num+1`
    mutants at L4973-4974 survive (every phase change could refill opp's pool and the
    suite stays green). The B2 test is well-shaped but samples one cell. One-line
    strengthening: assert both players' whole pools. Land before any refactor touches
    setPhase (A1-22).
11. **SBA toughness≤0 death path (non-indestructible too).** Both `L4720` mutants
    survive (`<=→<` and `||→&&`, which deletes the debuff-death path); contrast: the
    damage-death path IS real-tested (the `>=→>` control mutant is killed by
    test_endomorph_absorb). This is the gap that concealed A1-3; A1-3's red→green test
    covers it automatically.

---

## Cross-chunk leads (one line each, not deep-dived — for later finders)

- (chunk 2) dealCombatDamage internals L5212-5330 have heavy survivor density
  (first-strike gate, lifelink, kill-value ordering, trample remainder) — the "smart
  distribution" algorithm DIVERGENCE C1 tells Godot to copy is largely untested.
- (chunk 3) `pushTriggerOnStack` mirrors A1-1's opp-handoff — adjudicate together.
- (chunk 3) triggers queued during CLEANUP drain at the NEXT turn's MAIN1 where APNAP
  uses the NEW active player; and UNTAP resets lifeLostThisTurn before that drain —
  any "this turn" read at drain time reads the wrong turn.
- (chunk 3) all non-mana activated abilities resolve off-stack (engine.js:5471-5473
  comment admits it), contradicting §705 — known in comments, absent from DIVERGENCE.
- (chunk 3) stack-resolution rip/retarget block L5057-5110 survives broadly;
  triggerChainDepth reset (L4949) survives — depth-cap behavior likely untested (E6).
- (chunk 3/4) doDiscard moves hand→graveyard with NO emitZoneChange; drawCard emits no
  event at all — "whenever you draw / discard" trigger classes structurally unsupported.
- (chunk 7) ai.js scoreFlashAmbush pushes a phantom card onto the LIVE battlefield and
  combatBuffSwingValue temp-mutates live stats — restored in `finally`, currently
  disciplined but try/finally-fragile; CLEANUP AI discard drops hand[0]×N, not worst
  cards.

---

## Refuted-claims appendix (14 — survived nothing; kept for the record)

| # | Lens | Claim (one line) | Why refuted (one line) |
|---|---|---|---|
| R1 | rules | tapLandForMana's priority gate contradicts canon §705.47/D8 and hides mid-cost taps from the AI | Canon's mid-cost prong is implemented *inside* payMana's auto-tap (no decision window exists mid-payment); the gated path is the canon-correct one — residue is a cosmetic gate inconsistency only |
| R2 | rules | Stale attackers mean combat "should" skip to MAIN2 when the lone attacker dies, per docs | No doc documents such a skip; proceeding to blocks matches CR 508.8 and repo §801; all consumers null-guard and iids re-mint, so the scary variant is structurally impossible (kernel survives as A1-8) |
| R3 | rules | DIVERGENCE B3's "either-fine" cleanup-order tag is stale because §514 "has since" specified an order | Git history: the §514 list predates the tag (same-day commits, byte-identical since); the same canon page gives BOTH orders; "pick one" is already B3's recorded TO-DO |
| R4 | rules | doPlayLand's unguarded findIndex → splice(-1) silently plays the wrong card | Unreachable by construction: closure-private, single call site gated synchronously by isLegalAction; the do* contract documents the assumption |
| R5 | state | skipApEndStep force-passing the AP is a defect | Intentional and triply documented (comment, plan spec, DIVERGENCE B6) and pinned by test_priority_window.gd:85-90; §606 classifies engine-issued auto-pass as agent UX (doc-gap residue shipped as A1-14) |
| R6 | state | A color missing from the mana-reset literal would silently FLOAT across phases | Mechanism backwards: setPhase does whole-object replacement, so a missing key is deleted, never preserved; the failure mode is an unpayable color, and the implied loop refactor is what would CREATE the float hazard (DRY residue parked as A1-22) |
| R7 | state | cleanupDiscarding is a hand-rolled modal escaping the PENDING_DECISIONS registry | It's a turn-based-action window (family: attackersDeclared/blockersDeclared), deliberately not a modal; registry semantics (hard-block, who-objects, resolve-clears) don't fit; the cited Codex lesson covers open-ended modal growth, not the 3 fixed turn-based windows |
| R8 | state | finalizeBuild mutates run-persistent state without RUN.save(), breaking the inline-save contract | Zero reachable effect: clean game-end saves the slot anyway, and mid-game saves are deliberately negated by the crash-restore snapshot rollback (anti-crash-farming) — the cited "contract" sites are themselves rolled back |
| R9 | state | init() resetting nextIid lets game-N timers fire iid-bearing actions into game N+1 | Every timer path either decides at fire time (sync microtask — no window) or only ever issues `pass` (no iids); fresh-game guards + the isLegalAction gate close the rest; residual is one legal pass in a sub-second automation-only window |
| R10 | footguns | passPriority's two both-passed branches drain/reset in opposite orders → holder depends on branch | Divergent sub-path unreachable (legality gate forecloses pass-while-modal-blocks-drain); 60 instrumented AI-vs-AI games: branchB_withPending = 0; branch B's drain+override is vestigial dead code |
| R11 | footguns | getLegalActions vs isLegalAction are two encodings already drifting (gameOver, unguarded effects[0], haste keyword) | Every "drift" instance fails verification (transitively gameOver-gated; all 297 card JSONs have well-formed abilities; keywords always arrays); the dual encoding is a test-pinned design and executeAction gates all mutations anyway |
| R12 | footguns | Phase-successor facts are dual-encoded in step() AND advancePhaseAfterPriority, both copies live | Each duplicated successor has exactly ONE live copy; the claimed reachability mechanisms (attackers emptying mid-round) don't exist — residue is the dead defensive arms (covered by A1-8) |
| R13 | testquality | The suite never executes a full turn cycle; 682 survivors prove the whole step() machine untested | Two CATEGORY_A tests drive complete real turns (test_exile_until_eot, test_type_change) and kill spot mutants in two of the listed clusters; the headline quantitative citation was unverifiable at finder time — the *specific* gaps survive as A1-23, the totalizing claim does not |
| R14 | testquality | Rulebook §500's upkeep text carries no proto-divergence note, misleading cold readers | appendices.md A3 line 51 records it verbatim ("proto does not implement upkeep at all") and the rulebook hub delegates live status to DIVERGENCE.md; residue is a one-word wording preference |

---

## Coverage

Union of the four lenses' declared reads (deduplicated); notRead lists only what **no**
lens read.

- **engine.js (read):** 258-400 (PENDING_DECISIONS + helpers), 900-1160 (makePlayer/
  makeState/G init, findCard/zone helpers), 1484-1711 (mana: resolvedManaCost →
  tapSourceProducing), 1890-1940 (forcedDiscard/pendingSearch guards), 2643-2655
  (delayedTriggers producer), 3332-3600 (trigger push/drain, priority interplay),
  4400-5215 (drawCard/endGame/phylactery trio/checkDeaths/checkLifeTotals/priority
  primitives/pushOnStack/resolveTopOfStack head/resolveCombatDamage head), 5349-6118
  (all do* handlers incl. modal bodies, doPass/doEndTurn, whoHasPriority/isInstantWindow/
  isMainPhaseWindow, isLegalAction complete), 6100-6770 (getLegalActions incl.
  enumeration body, hasNoAction, step() in full, expectedActor, executeAction, init,
  export surface).
- **engine.js (NOT read):** 1-258 (module head, CARDS loading), 400-900 (card
  construction/stickers/charges — chunks 6/11), 1160-1484 (getStats/static lords —
  chunks 2/4), 1711-1890 and 1940-3330 (effect handlers + trigger/APNAP/depth-cap
  internals — chunks 3/4; only the 2643-2655 producer and signature greps), 3600-4400
  (effects dispatch — chunk 4), 5215-5349 (combat-damage internals — chunk 2).
- **Other js:** controller.js 1630-1690 read (+ endTurnPending/clickBattlefield greps;
  rest unread); ai.js 365-420 + 660-900 read (rest unread); run.js 260-340, 620-660,
  1200-1320 read (rest unread); **triggers.js, trigger-generator.js, stickers.js,
  draft.js, picklog.js, card-text.js, render.js NOT read** (grep-only where cited).
- **Canon/docs read:** rules 500, 600, 700 (full), 1100, 1200 (full), 100 (targeted
  §100.4-100.6); 800-combat consulted by verifiers for §801; PROTOCOL.md §3.6 region +
  targeted rows (rest unread); DIVERGENCE.md (full); html-proto BACKLOG.md (full);
  plan-proto-audit.md contract sections. **Rules pages 200-400, 900-1000, 1300-1500 NOT
  read** (combat §800 beyond §801 deferred to chunk 2, triggers §1000 to chunk 3;
  1300/1500 cited by name only — flagged where it weakened a citation, A1-23 #5).
- **Tests:** run_all.js, _setup.js, test_rules_infra.js read in full; tests/README.md
  L1-80; selfplay_harness.js partial; test_exile_until_eot/test_type_change via
  targeted reads + greps; **the other ~65 test file bodies classified via grep patterns,
  not read line-by-line**. Cross-file greps: priorityHolder/phase/gameOver poke patterns
  (97 hits / 36 files), turn-machine symbols (85 hits / 38 files).
- **Mutation artifacts:** `engine-step-region-survivors.txt` read in full (682 survivor
  lines); per-mutant verification runs executed live for every A1-23 entry.
- **Live execution:** 10+ node repros run this session (priority handoff, pass-tracker,
  deck-out log, cleanup tap, endTurnPending disarm, payMana mismatch, indestructible
  t≤0, phase-hang, plus the mutant batteries). Caution learned mid-session: the shared
  workshop tree was being live-mutated by the rig — verifiers switched to
  `git archive 1a92c42` sandboxes; future chunks should start there.
- **Dedupe:** DIVERGENCE B1/B2/B3/B4/B6/B7 and BACKLOG's step()-refactor +
  duration-dedupe items were cited, not re-filed; only new angles are above. D0 is
  *upgraded* (A1-13), explicitly allowed by the dedupe rule.
- **Overall confidence:** high on everything filed — every confirmed finding carries an
  adversarial verdict, most with live repros. The known soft spot is breadth, not
  depth: ~65 test bodies and the chunk-3/4 engine internals were classified, not read.

---

## Triage table (for INDEX.md)

| ID | Sev | Class | One-line |
|---|---|---|---|
| A1-1 | P1 | stage | Priority cluster: opp gets priority after every cast (canon+Godot+D0 say caster-retains); abilities never reset the pass tracker (phase closes under the opponent); triggers synthesize rounds in closed windows (latent combat-skip) |
| A1-2 | P1 | stage | canPayPotential backtracks but payMana pays greedily → legal cast throws uncaught Error mid-payment, land left tapped, state half-applied |
| A1-3 | P1 | stage | Indestructible creature at toughness ≤ 0 illegally survives — SBA skips all three death causes; canon says it dies (one-line reorder + test) |
| A1-4 | P2 | park | 36/70 test files hand-write engine internals; behavior-preserving rename left 34/36 silently green — feeds the parked step()/decomposition refactor planning |
| A1-5 | P2 | park | Action vocabulary in 4 hand-synced switches, executeAction + both phase switches have no default arm (silent no-op success / browser-hang landmine) — park with step() refactor |
| A1-6 | P2 | stage | CLEANUP delayed-trigger drain silently discards unknown effect kinds; comment names the retired returnFromExile kind (comment fix + else-warn) |
| A1-7 | P3 | stage | Zero-attacker combat skips the §505 priority window entirely — latent canon divergence, Godot windows it; docs-vs-code fork |
| A1-8 | P3 | stage | G.attackers never pruned on death; L4992 zero-attackers arm is unreachable dead code with divergent flag hygiene; re-guard contract unstated |
| A1-9 | P3 | stage | "X draws." logged on deck-out loss and phylactery rip — the log's top line lies on both empty-library paths (one-line gate) |
| A1-10 | P2 | stage | tapLandForMana legal during cleanup discard — UI-reachable, mana unusable, land stays tapped through the opponent's turn |
| A1-11 | P3 | stage | Forced modal answers silently disarm End Turn fast-forward — compelled responses treated as voluntary re-engagement (one-line carve-out) |
| A1-12 | P3 | ship | PROTOCOL.md §3.6 falsely says the proto collapses UNTAP+UPKEEP+DRAW — UNTAP and DRAW are distinct real phases (docs edit) |
| A1-13 | P3 | ship | DIVERGENCE D0 misdocuments the proto as caster-retains and "already-aligned" — record the live opp-handoff divergence, ref A1-1 (docs edit) |
| A1-14 | P3 | ship | skipApEndStep comment omits the instant-speed trade; §606 doesn't list the sanctioned AP-END skip; B6 line numbers stale (comment/docs only) |
| A1-15 | P3 | ship | fireAt:'endStep' fires in CLEANUP — comment-only warning that this queue isn't the home for genuine §509 triggers (rename would be stage) |
| A1-16 | P3 | ship | PENDING_DECISIONS header's 2-step add-a-modal recipe omits 4 mandatory sites → soft-lock trap; write the full checklist (comment) |
| A1-17 | P3 | ship | tests/README.md stale ~6×: claims 13 files/362 assertions/9 modules vs 74/1786/17 (docs edit, replace counts with pointers) |
| A1-18 | P3 | ship | Canon §1102's "20-iteration SBA cap" describes Godot only; proto is uncapped with provable termination — scope the sentence, optional DIVERGENCE row |
| A1-19 | P3 | trivia | Dead `!G.pendingTriggerTarget` conjunct at step():6369 — unreachable-false, tripwire-proven over full suite + 200-game selfplay (chunk-1 trivia PR) |
| A1-20 | P3 | trivia | openPriorityRound's initialHolder param dead — 3 call sites all zero-arg, contract would be clobbered anyway (chunk-1 trivia PR) |
| A1-21 | P3 | park | Combat-reset four-field list maintained in 3 engine sites + 1 test copy — resetCombatState() helper, home is the step() refactor |
| A1-22 | P3 | park | Empty-mana-pool literal ×3 + color list inlined ×5 + draft.js duplicate COLORS — pure DRY, fold into decomposition (float-hazard framing refuted) |
| A1-23 | P3 | park | Coverage gaps (11 grouped): win/loss, cleanup discard, endTurnPending, lifeLostThisTurn, phylactery, temp-control revert, fireFor, play/draw+turn count, NAP END window, B2 thinness, t≤0 SBA — one full-turn test kills est. 100+ survivors |
