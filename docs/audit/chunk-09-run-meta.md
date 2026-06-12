# Chunk 9 — Run/meta/picklog (run.js: save/load/migration, map, rewards, snapshot rollback; picklog.js)

> Tier 1. **Deep-read + 3 hostile refuters** (one per behavioral finding A9-1,
> A9-2, A9-3) **over the frozen anchor snapshot.** Anchor SHA **`aca8883`**.
> Chunk claimed 2026-06-12T02:06:09Z. Every refuter ran an **independent
> repro** (own probes, own loader, never the finder's script) — including
> git-history verification of the v1 save shape against `df2fd38^:js/meta.js`.
>
> Refutation outcome: **3 confirmed / 0 modified / 0 refuted** — but not a
> rubber stamp: **A9-1 came back strengthened-WORSE** (the refuter probed one
> step further downstream and found the corruption ends in **total run
> destruction**, not a playable corrupted run) and **A9-3's evidence was
> upgraded** from by-inspection to executed at a contract-honoring site.
> A9-4 through A9-9 carried executed or read-verified evidence from the
> deep-read and skipped refutation per the campaign's repro-or-refute rule.
> A9-10 is a **new adjacent gap** surfaced by the A9-1 refuter, filed here.
>
> **Terminology ruling (Joe, 2026-06-10):** Magiclike's rules are THE rules.
> Intentional divergences from real MTG are *design decisions*, recorded as
> such — never framed as deviations from an external standard. MTG is a
> reference point only. Applied throughout this file.
>
> **Class policy (campaign rule, binding):** anything that can alter a game
> outcome **stages** (plain-English decision packet per finding); docs/comment-
> only and test-infrastructure-diagnostic fixes **ship** (gate: suite + lint
> green). So: A9-1 **stages** (P2 — arguably data-repair, but it changes load
> behavior → stage), A9-2 **stages** (P2 — behavioral one-liner), A9-3
> **stages** (P3 — rides the A9-2/A5-4 shared-helper fix), A9-10 **stages**
> (P3 — verify-then-fix in the same PR as A9-1), A9-4 ships (P4 defensive
> guard, behavior-neutral standing rule), A9-5 ships (P4 analytics-only),
> A9-6 ships (P3 comments), A9-7 ships (P3 canon docs), A9-8 **parks** (P3
> landmine, unreachable today), A9-9 **parks** (P3 unguarded invariant — the
> test-assertion line may ship with A9-6's PR as behavior-neutral).

---

## Findings

### A9-1 — MIGRATIONS[1] written against a phantom save shape: migrates 4 never-existed fields, misses 3 real v1 tplId carriers — un-migrated snapshot resurrects pre-rename tplIds, persists them at v2, and the next game start DESTROYS THE RUN  ⟶ STAGE (P2)
- **Location:** `reference/html-proto/js/run.js:260–286` (the migration, with
  a comment claiming the phantom list is "every place a tplId persists");
  `:1216–1236` (rollbackForMidGameRestore — resurrects the un-migrated
  snapshot into live slots and saves); `:385–391` (load() deliberately keeps
  the pendingReward phases the migration ignores);
  `tests/tplid_renames_test.js:54–100` (test **actively pins the phantom
  shape**); destruction endpoint: `controller.js:583` continueRun's catch →
  `RUN.clearSave()`. @ `aca8883`
- **Dimension:** save migration vs real persisted shape (data corruption →
  run destruction).
- **Severity:** **P2** (durable save corruption + guaranteed run loss for
  every pre-cutoff mid-game save — the migration's core purpose defeated for
  its main real carrier, with a false-green test pinning the wrong shape.
  Not P1 only because it hits the aging legacy-save population of a
  single-player game).
- **Claim:** the v1→v2 migration renames `rs.pendingNeowModifier` /
  `rs.currentPack` / `rs.youPicks` / `rs.oppDecks` — **none of which ever
  existed on persisted runState**. It misses the real v1 tplId carriers:
  **`midGameSlotsSnapshot`** (a full slots copy), **`pendingReward.replacementPack`**
  (transform packs, both shapes — load() deliberately keeps those phases),
  and **`modifier`** (inert today — zero readers — but its v1 key
  `'cityOfBrass'` IS in TPLID_RENAMES, so the "inert" hedge is accurate and
  the rename is still correct hygiene).
- **Evidence (executed + git, finder + refuter independent):** refuter
  verified the real v1 shape against git — at `df2fd38^:js/meta.js`
  (run.js didn't exist pre-split; SAVE_VERSION=1 at line 889):
  `pendingNeowModifier` was a controller.js module-**local** variable,
  `currentPack`/`youPicks` lived on DRAFT's in-memory state, `oppDecks` has
  **zero hits in the entire js/ tree**; meanwhile `midGameSlotsSnapshot`,
  both `replacementPack` shapes, and `modifier` were all real persisted v1
  carriers. The migration AND its wrong comment were added in `df2fd38`
  itself. **Repro 1 (executed, both parties, scratch localStorage shim):**
  v1 mid-game blob → load() migrates `slots` correctly
  (fireImp→cinder_sprite) but leaves the snapshot untouched →
  rollbackForMidGameRestore() resurrects `['fireImp', 'zealot', 'forest']`
  into live slots → save() persists them under version:2 — durable: no
  normalize/prune path touches tplIds (load()'s normalization is
  sticker-only) and the migration never re-runs at v2. **Refuter's
  downstream probe (the strengthening):** with the corrupted slots persisted,
  the next `RUN.startNextGame()` **THROWS "Unknown card: fireImp"** during
  deck build → continueRun's catch calls `RUN.clearSave()` → **total run
  destruction**. **Repro 2 (executed):** v1 save on a transform reward —
  the pack survives as legacy ids; picking writes a dead tplId into the run.
- **Reachability:** any save created before 2026-05-16 loaded by current
  code; mid-game saves are the common quit case and exactly the corrupting
  path (controller.js:583 continueRun → load → rollback; the destruction
  endpoint is continueRun's catch at controller.js:596–600 → `RUN.clearSave()`
  at :599).
- **Fix sketch:** rewrite MIGRATIONS[1] — slot-walk `slots` **and**
  `midGameSlotsSnapshot`; rename `modifier`; map `replacementPack` in both
  shapes; delete the four phantom lines; fix the comment; re-pin the test
  with the **real** `df2fd38^` shape. The PR description must name the
  run-destruction endpoint (throw → clearSave) so the stakes are on record.
  Ship together with **A9-10** (same family — see below).
- **Effort:** small (one migration rewrite + one test re-pin; the real v1
  shape is already established from git in this audit).
- **Verification status:** refuter verdict **confirmed P2, strengthened**
  (every claim independently re-derived incl. git archaeology; downstream
  endpoint found by the refuter; both repros executed <5s on the scratch
  shim). Confidence very high. Not a duplicate (A3-4 is a canon-doc issue).
- **Remediation class: STAGE** (it changes load behavior — arguably
  data-repair, but the campaign rule binds: it can alter run outcomes).
- **Predicted test impact:** `tplid_renames_test.js` must be rewritten — it
  currently pins the phantom shape and would fail against the correct
  migration. That failure is the fix working.

#### Decision packet for A9-1 (stage — plain English)
When the project renamed ~250 card ids (camelCase → snake_case), it shipped
a save-file upgrader so old saves keep working. The upgrader was written
against a guessed save shape: it "fixes" four fields that were **never in
any save file**, and skips three that really were. The worst miss is the
mid-game snapshot — the backup copy of your deck used when you quit
mid-battle. Load an old mid-game save today and the upgrader fixes your
visible deck but not the backup; the restore step then overwrites your deck
**with the un-upgraded backup**, saves it, and on the next battle the game
hits a card name it no longer knows, errors out, and **deletes the entire
run**. The unit test for this upgrader checks the same four phantom fields,
so it's green while the upgrader is wrong — worse than no test. The fix is
mechanical (upgrade the right three fields, re-pin the test against the real
historical shape, verified from git); the only judgment call is whether any
pre-2026-05-16 saves still exist in the wild to protect — but the upgrader
is also the template for every future rename migration, so fixing the
template has value even if zero legacy saves remain.
- **Option A — fix the migration + test as sketched (recommended, high
  confidence):** small, fully specified, repro-backed; ship with A9-10.
- **Option B — additionally make continueRun's catch non-destructive** (warn
  + keep the blob instead of clearSave): broader safety net, slightly larger
  blast radius; could ride A9-4's guard PR instead.
- **Option C — declare legacy saves unsupported and delete MIGRATIONS[1] +
  the test:** honest but loses the working template for future migrations.

---

### A9-2 — EFFECTS.rip (Vile Edict) skips the removeSlotByIdx caller contract: no slotIdx fixup — later slot-writes through stale pointers corrupt the wrong run slot and persist it; LIVE via two boss decks  ⟶ STAGE (P2)
- **Location:** `reference/html-proto/js/engine.js:2853–2862` (bare
  `RUN.removeSlotByIdx(slotIdx)`); the contract at `run.js:1287–1289`
  ("CALLER CONTRACT: must decrement slotIdx for any in-game card whose
  slotIdx > removed index"); honoring siblings at `engine.js:5661–5670`
  (ripSlotForPhylactery), `:5699–5706` (ripSlotByIdx, side-aware), and both
  splice fixups (`:3120–3140`, whose comment calls the fixup "CRITICAL" /
  `:3265–3276`, whose comment says "still needed"). @ `aca8883`
- **Dimension:** broken caller contract → durable save corruption.
- **Severity:** **P2** (silent, durable corruption of the run save — the
  roguelike's core progression artifact — reachable in ordinary play;
  consistent with A5-4's P2 for the same class).
- **Claim:** the rip handler removes the run slot with no zone-walk
  decrement. Every in-game player card with `slotIdx >` the ripped index
  points one slot too high for the rest of the game; any subsequent durable
  slot-write through such a stale pointer lands on the wrong run-deck slot
  and is saved. **Precision (refuter, folded):** the rip alone persists only
  the *correct* shrunk slot list — the durable WRONG data lands when a
  **later** slot-write goes through a stale pointer; and the stale pointers
  themselves die at the next game's makeCard rebuild, so the corruption
  window is the remainder of the current game (any write inside it is
  permanent).
- **Evidence (executed, finder + refuter independent):** refuter re-derived
  the repro from scratch (real RUN.start + startNextGame, engine-assigned
  slotIdx, real pendingEdictChoice → edictChoice): **13/13 substantive
  assertions pass** — bystander card keeps slotIdx 1 while
  `RUN.getSlots()[1]` is now a Plains; a durable write with the exact call
  shape the real absorb handler uses puts the sticker on the Plains slot;
  the saved blob carries it. load()'s normalization cannot detect or repair
  it (a sticker on the wrong slot is a valid save shape). **Organic durable
  writers through cached card slotIdx (refuter-enumerated):** absorb
  (`engine.js:2293`/`:2302`), finalizeBuild writing `slot.bonusTrigger` via
  `p.slotIdx` (`:6755–6756`), splice reuseBaseSlot via `baseCard.slotIdx`
  (~`:3296`); plus wrong-slot **reads** (permaBuffs at `:5040`/`:5375`)
  causing in-game misbehavior. `test_edict_human_choice.js` asserts only the
  slot-count drop.
- **Reachability:** live — `vile_edict` ×2 in archdemonBoss and ×2 in
  equatorialArtificerBoss (`draft.js:123`/`:167`); every map exit is a boss
  (`run.js:549–551`); the AI casts it (`test_boss_removal_ai.js:49`).
- **Fix sketch:** route the handler through `ripSlotByIdx`
  (`engine.js:5677`), which does both halves side-aware — effectively a
  one-line reroute. Cross-ref **A5-4** (same class, staged) + **A5-15**; a
  shared fixup helper would close the whole class, and **A9-3**'s
  playedSlotIdxs remap belongs in that same helper.
- **Effort:** trivial for the reroute; small if the shared-helper
  consolidation rides along.
- **Verification status:** refuter verdict **confirmed P2, no substantive
  corrections** (two precision notes folded above; 13/13 independent
  assertions; persistence attack failed). Confidence very high. Not a
  duplicate — A5-4 is the same *class* at a different site (Stapler
  out-of-charges rip), honestly cross-referenced.
- **Remediation class: STAGE** (behavioral — changes which slot survives
  edicts and where later writes land; game-outcome-altering).
- **Predicted test impact:** `test_edict_human_choice.js` should gain a
  fixup assertion (currently asserts only the count drop — part of why this
  escaped).

#### Decision packet for A9-2 (stage — plain English)
When a boss's Vile Edict destroys one of your creatures, it's supposed to
also remove that card from your run deck — and there's a written rule in the
code: anyone removing a deck slot must renumber every in-game card's
slot-pointer that sat past it. Three other removal sites follow the rule;
this one doesn't. After the edict, every card you're holding "remembers" the
wrong deck slot for the rest of that game — and the first time anything
writes through that memory (a sticker absorb, a splice), the upgrade lands
on the **wrong card in your saved deck**, permanently. Both final bosses
carry this spell, so it's live in every run. The fix is rerouting one call
through the existing helper that already does the renumbering correctly.
- **Option A — one-line reroute through ripSlotByIdx (recommended, high
  confidence):** minimal, uses the proven path, the refuter's 13-assertion
  repro becomes the regression test.
- **Option B — A plus the shared fixup helper consolidating all removal
  sites (and folding in A9-3's remap + A5-4):** the durable fix for the
  class; slightly larger PR, still small.

---

### A9-3 — playedSlotIdxs is never remapped by ANY slot removal — even contract-honoring rips — so the win's reward filter targets the wrong slots  ⟶ STAGE (P3)
- **Location:** writers `engine.js:6265–6266`, `:6318–6319`; no fixup
  anywhere (all four removal-fixup sites walk zones touching `c.slotIdx`
  only; the contract comment at `run.js:1287–1289` names only cards'
  slotIdx); consumed `run.js:706–716` (recordResult persists
  `lastPlayedSlotIdxs`) → filterByPlayed, which has **four** call sites:
  `run.js:801`, `:894`, `:917`, and `:1085` — `:1085` (the
  threeStickersBlind commit) is the most consequential, **permanently
  applying stickers through the stale filter**. @ `aca8883`
- **Dimension:** missed invariant across the whole removal class (a second
  index set the contract never covered).
- **Severity:** **P3** (calibrated, not inflated: filterByPlayed's
  empty-intersection fallback degrades to unrestricted rather than crashing,
  the stale set is overwritten each game, and the harm is design-intent
  violation — reward gating onto never-played slots / excluding played ones).
- **Claim:** `G.you.playedSlotIdxs` (the Set of run-slot indices played this
  game) is decremented by no rip/splice site. **Precision (refuter, folded):**
  indices **greater than** the removed index are off by one; the removed
  index itself **dangles onto whatever slot shifted into it**. recordResult
  persists the stale set; the win-reward filters (sticker / twoStickers /
  threeStickersBlind) then gate onto the wrong slots.
- **Evidence (executed — UPGRADED by the refuter):** the finder's repro
  covered the non-honoring rip (post-rip playedSlotIdxs still {1} while the
  played bears sits at slot 0) and honoring sites only by inspection; the
  refuter **drove ripSlotForPhylactery — a contract-honoring site —
  end-to-end**: real castSpell of the slot-1 creature, phylactery overflow
  rip of slot 0; the card instance's slotIdx was correctly fixed 1→0,
  **playedSlotIdxs stayed {1}**, and recordResult persisted
  `lastPlayedSlotIdxs:[1]` to the save while the played creature sits at
  slot 0. "No fixup anywhere" is grep-provable (the symbol appears only at
  init, the two writers, and one controller read). No load() path prunes or
  remaps it.
- **Reachability:** WON games — phylactery overflow rips and Stapler splices
  happen mid-game in winnable games (and A9-2's edict path adds more once
  you survive it).
- **Fix sketch:** fold a playedSlotIdxs remap (**decrement >, drop ==**)
  into the shared fixup helper from A9-2/A5-4; widen the contract comment to
  name both invariants.
- **Effort:** trivial as a rider on the shared helper; small standalone.
- **Verification status:** refuter verdict **confirmed P3, evidence
  upgraded** (independent executed repro at a *honoring* site — stronger
  than the original filing). Confidence high. Not a duplicate — A5-4/A9-2
  are per-site contract skips; this is a different invariant missed
  universally.
- **Remediation class: STAGE** (alters which slots win-rewards can target —
  game-outcome-altering; rides the A9-2/A5-4 shared-helper fix).
- **Predicted test impact:** the shared-helper PR should pin playedSlotIdxs
  across a removal (none exists today).

#### Decision packet for A9-3 (stage — plain English)
The game remembers which deck slots you actually *played* this battle, and
on a win it steers your reward (which cards are eligible for stickers)
toward those slots. But when a slot is removed mid-battle, that
played-slots list is never renumbered — even at the removal sites that
correctly renumber everything else, because the written contract never
mentioned it. Result: after any mid-battle deck-slot removal, your win
reward can be aimed at cards you never played and exclude ones you did —
including the blind three-sticker reward, which stamps permanent stickers
through the wrong filter. It self-heals next game (the list is rebuilt),
so the damage is one reward roll per affected win — real but bounded; P3.
- **Option A — fold the remap into the A9-2/A5-4 shared helper
  (recommended, high confidence):** one rule ("decrement above, drop the
  removed index"), one place, covers every site at once.
- **Option B — patch each removal site individually:** same behavior, four
  copies of the rule; only sensible if the shared helper is rejected.

---

### A9-10 — NEW (refuter-surfaced): the snake_case rename sweep extended TPLID_RENAMES without bumping SAVE_VERSION to 3 — v2 saves from the gap window never get those tplIds renamed by ANY path  ⟶ STAGE (P3)
- **Location:** `reference/html-proto/js/run.js` — TPLID_RENAMES vs
  `SAVE_VERSION = 2` (still 2 with only MIGRATIONS[1] defined). @ `aca8883`
- **Dimension:** missing migration version bump (same family as A9-1,
  different gap).
- **Severity:** **P3** (same corruption→destruction endpoint as A9-1 for
  affected saves, but the population is narrower: v2 saves created between
  2026-05-16 and the later rename sweep).
- **Claim:** the later snake_case rename sweep added entries to
  TPLID_RENAMES but did not bump SAVE_VERSION to 3 with a MIGRATIONS[2].
  Saves written at version 2 **before** that sweep carry the
  then-current camelCase tplIds; on load they are already "at" the current
  version, so MIGRATIONS[1] never runs for them and no other path renames
  tplIds — they hit the same "Unknown card" → clearSave endpoint as A9-1's
  corrupted saves.
- **Evidence:** read-verified at the snapshot (SAVE_VERSION=2, one
  migration, load() runs migrations only while `blob.version <
  SAVE_VERSION`); surfaced and family-verified by the A9-1 refuter during
  the git archaeology. **The exact sweep date/commit has NOT yet been
  bracketed in git — that verification is the first step of the fix.**
- **Fix sketch:** verify the sweep date in git (bracket which TPLID_RENAMES
  entries postdate the v2 bump), then bump SAVE_VERSION to 3 with a
  MIGRATIONS[2] applying the post-sweep renames over the **correct** carrier
  list from A9-1's fix. **Ship in the same PR as A9-1** — the carrier-walk
  code is shared.
- **Effort:** small (git bracketing + one migration entry reusing A9-1's
  walker).
- **Verification status:** filed from the A9-1 refuter's verified family
  analysis; **git bracket completed by self-QA**: the sweep is commit
  `e2e151f` ("Normalize card ids to match names…", 2026-05-30) — it rewrote
  TPLID_RENAMES to snake_case targets and added the old camelCase ids as keys
  with NO SAVE_VERSION change, so the v2 window is proven, not hypothesized.
- **Decision packet (plain English):** saves made between 2026-05-16 and
  2026-05-30 are "version 2" but carry card ids that were renamed afterward —
  and because they're already at the current version, no migration ever
  re-runs to rename them. Loading one resurrects dead ids exactly like A9-1
  (same throw → save-wipe endpoint). The fix is one new migration entry
  (v2→v3, SAVE_VERSION bump) reusing A9-1's corrected slot-walker.
  **Recommendation: fix in the same PR as A9-1 (high confidence — same
  walker, same test, one review).** One decision covers both; A9-1's packet
  carries the family rationale.
- **Remediation class: STAGE** (changes load behavior; companion to A9-1).
- **Predicted test impact:** the re-pinned tplid_renames test from A9-1
  should gain a v2→v3 case.

---

### A9-4 — load() silently accepts future-version saves (upward-only migration loop)  ⟶ SHIP (P4)
- **Location:** `reference/html-proto/js/run.js:316–324` — the migration
  loop only runs while `blob.version < SAVE_VERSION`; a blob with
  `version > SAVE_VERSION` sails through as-is. @ `aca8883`
- **Dimension:** missing defensive guard.
- **Severity:** **P4** (no live path produces a future version today; the
  exposure is a downgraded build reading a newer save and mangling it).
- **Evidence (executed):** a version-99 blob loads `true` and the run
  proceeds on whatever shape it carries.
- **Fix sketch:** `console.warn` + `return false` when
  `blob.version > SAVE_VERSION` — **don't clear** (the newer build can still
  read it; clearing would destroy a valid save).
- **Effort:** trivial (a two-line guard).
- **Verification status:** finder-executed; not refuted (defensive-guard
  class — behavior-neutral for every save that exists today).
- **Remediation class: SHIP** (behavior-neutral standing rule; gate suite +
  lint green).
- **Predicted test impact:** one new assertion (future-version blob →
  load() false, blob intact).

---

### A9-5 — picklog gamesPlayed double-counts on crash-restore and counts at game start, not completion  ⟶ SHIP (P4)
- **Location:** `reference/html-proto/js/run.js:655` (increment at game
  start) + the controller's resume replay (re-runs the start path on
  crash-restore, incrementing again). @ `aca8883`
- **Dimension:** analytics integrity (picklog is stats-only; no gameplay
  reads it).
- **Severity:** **P4** (wrong analytics counter; zero gameplay effect).
- **Evidence (executed):** start → simulated crash → resume replays the
  start path → counter at 2 for one actual game; abandoned games also count
  as played.
- **Fix sketch:** count in `recordResult` (completion) instead, or set a
  skip-once flag on rollback. Completion-counting is the cleaner semantic.
- **Effort:** trivial.
- **Verification status:** finder-executed; not refuted (analytics-only
  class).
- **Remediation class: SHIP** (analytics-only counter move; gate suite +
  lint green).
- **Predicted test impact:** none existing (picklog has zero tests — see
  Test quality); the fix is the natural seed for the first one.

---

### A9-6 — RUN.start() comment cluster: a phantom canonical example, a retired mechanism, two contradictory contracts, and a double-pasted header  ⟶ SHIP (P3)
- **Location / items @ `aca8883`:**
  1. `run.js` RUN.start() comment cluster — cites **"Watcher's Gift"** as
     the canonical slots-mutating boon. **No such boon exists**, and no boon
     mutates slots in place — all 7 RUN_MODIFIERS return extras only
     (traced; see Coverage).
  2. `run.js:465–467` — describes the retired Mercurial **triggerPool**
     mechanism; `engine.js:49` documents its replacement. The extras
     triggerPool line at `:471` is dead for every current boon.
  3. `cards.js:464` claims boons are "pure (no runState mutation)" while
     `run.js:455–459` says "mutate IN PLACE… both valid" — **two
     contradictory contracts** for the same interface.
  4. `run.js:1260–1262` — the appendSlot header is pasted twice.
- **Dimension:** comment vs code (a policy-comment cluster at the run's
  single most-read entry point).
- **Severity:** **P3** (the phantom example + contradictory contract pair
  actively misleads anyone writing the next boon; canon §1505 cites the same
  phantom — A9-7 — so the ghost is self-reinforcing across doc layers).
- **Evidence:** all 7 RUN_MODIFIERS traced end-to-end (finder); engine.js:49
  read; both contract comments quoted above.
- **Fix sketch:** one comment PR. **Recommendation: adopt mutation-allowed
  as the contract** (it's what run.js documents and what the call site
  tolerates) and fix `cards.js:464` to match; replace the phantom example
  with a real boon; delete the triggerPool remnants; de-dupe the header.
  A9-9's behavior-neutral test-assertion line may ride this PR.
- **Effort:** trivial-to-small (comments only, but the contract choice
  should be stated in the PR).
- **Verification status:** finder-executed trace; not refuted (comment-only
  class).
- **Remediation class: SHIP** (comment-only; gate suite + lint green).
- **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** comment edits; no behavioral
  surface.

---

### A9-7 — Canon §1500 gaps: endless sectors undocumented, §1502 omits the 15% constructed mid-nodes, §1505 cites the phantom Watcher's Gift, §1504 TwoStickers wording mismatch  ⟶ SHIP (P3)
- **Location:** `docs/wiki/rules/1500-*.md` (§1501/§1502/§1504/§1505) +
  `docs/wiki/roguelike-meta.md`, vs `run.js` behavior. @ `aca8883`
- **Dimension:** canon vs code (the rulebook is the project's canonical
  *what*; the code is the intended behavior).
- **Severity:** **P3** (four independent staleness axes in one section; the
  §1505/code-comment pair cite **each other's ghost** — canon and the A9-6
  comment both name the nonexistent Watcher's Gift).
- **Claim (four legs):**
  - **(a)** **Endless sectors** are undocumented — the run can only end in
    loss; §1501/§1502 describe one map and stop; roguelike-meta.md has the
    same gap.
  - **(b)** §1502 omits the **15% constructed mid-node** chance.
  - **(c)** §1505 cites the phantom **Watcher's Gift** boon (cross-ref
    A9-6 item 1 — fix both layers in their respective PRs).
  - **(d)** §1504 says TwoStickers lands "(often to one slot)" — the code is
    **always** same-slot.
- **Negative space (verified, no finding):** REWARD_TYPE_WEIGHTS match §1504
  **exactly**. The Clone wording mismatch is **A5-11 pending** — cited, not
  re-filed.
- **Evidence:** finder read of all §1500 pages against run.js's map
  generation, node rolling, and reward tables.
- **Fix sketch:** document endless sectors (new paragraph or §150x page,
  mirrored into roguelike-meta.md); add the 15% constructed mid-node to
  §1502; replace §1505's phantom example with a real boon; fix §1504's
  TwoStickers wording to always-same-slot.
- **Effort:** small (four doc edits).
- **Verification status:** finder-executed doc-vs-code pass; not refuted
  (docs class).
- **Remediation class: SHIP** (docs-only; gate suite + lint green).
- **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** docs edit; no behavioral surface.

---

### A9-8 — pickRewardCandidate guard asymmetry: sticker/ripUp skip the bounds re-check and the non-stackable dedup that twoStickers/transform perform  ⟶ PARK (P3)
- **Location:** `reference/html-proto/js/run.js` reward-pick handlers —
  sticker and ripUp paths take the pre-rolled slotIdx with no bounds
  re-check (and sticker skips the non-stackable dedup), where twoStickers
  and transform re-validate fully. @ `aca8883`
- **Dimension:** latent landmine (guard asymmetry across sibling handlers).
- **Severity:** **P3** (a stale sticker slotIdx would TypeError at pick
  time — but see reachability).
- **Claim & honest reachability:** **unreachable today** — pendingReward is
  pre-rolled single-shot and **nothing mutates the slot list between offer
  and pick** (verified). The asymmetry is a landmine for any future
  mid-reward mutation (e.g., a future boon or UI path that touches slots
  while a reward is pending).
- **Evidence:** finder read of all reward-pick handlers + the
  offer-to-pick window trace establishing no interleaved mutation.
- **Park pointer (the one-liner for the future):** *anyone adding a path
  that can mutate slots while a reward is pending must first hoist one
  shared validSlotIdx guard (bounds + non-stackable dedup) across all four
  pick handlers — today only two of the four have it.*
- **Effort (if ever picked up):** trivial (hoist one guard).
- **Verification status:** finder read-verified; not refuted (unreachable
  class — nothing to repro).
- **Remediation class: PARK** (unreachable by construction today; the
  pointer is the deliverable).
- **Predicted test impact:** none.

---

### A9-9 — Unguarded invariant: TPLID_RENAMES keys must never be reused as live card ids — picklog re-applies renames unconditionally on every load  ⟶ PARK (P3)
- **Location:** `reference/html-proto/js/picklog.js` (unconditional rename
  re-application on load) + `run.js` TPLID_RENAMES (~250 legacy keys).
  @ `aca8883`
- **Dimension:** unguarded invariant (correct today, nothing keeps it so).
- **Severity:** **P3** (silent, permanent analytics rewriting if violated —
  a future card reusing **any** of the 250 legacy keys gets its picklog rows
  silently rewritten to the rename target forever).
- **Evidence (executed):** today's intersection TPLID_RENAMES-keys ∩ CARDS
  = **∅** — the invariant holds; nothing enforces it.
- **Fix sketch:** a full-map assertion (every TPLID_RENAMES key absent from
  CARDS) in the tplid_renames test or boot validation. Behavior-neutral —
  **the assertion line may ship with A9-6's PR** while the finding itself
  parks.
- **Effort (if ever picked up):** trivial (one assertion).
- **Verification status:** finder-executed intersection check; not refuted
  (invariant-guard class).
- **Remediation class: PARK** (invariant holds today; the cheap guard can
  ride A9-6).
- **Predicted test impact:** one new assertion; green today by construction.

---

## Trivia (noted, not filed)

- `node.cols` is written, never read — and the legacy map backfill skips it
  (harmless either way).
- `isCurEnd`'s `MAP_DEPTH-1` conjunct is unreachable (the loop is bounded at
  `MAP_DEPTH-2`).
- `stickersFor`'s `undefined` conjunct is subsumed by the preceding check.

---

## Cited, not refiled (cross-chunk concurrences)

- **A5-4 (Stapler rip contract skip)** — same class as A9-2, different site;
  the shared fixup helper should close both plus A9-3's remap. **A5-15**
  adjacent.
- **A5-11 (Clone wording/heuristic)** — pending; §1504's Clone wording
  mismatch is cited under A9-7, not re-filed.
- **A3-4** — canon-doc issue adjacent to A9-1's territory;
  refuter-confirmed not a duplicate.
- **In-game splice path** — engine.js never calls RUN.applySplice (that's
  reward-screen only); the in-game splice is chunk 5's ground (verified, not
  re-audited).
- **A9-5's picklog leak** is the only non-run-state escape from the
  mid-game snapshot revert (see negative space).

---

## Coverage (deep-read)

- `run.js`: **1308/1308 lines** read in full; `picklog.js`: **178/178**.
- All **7 RUN_MODIFIERS** traced end-to-end (none mutates slots in place;
  all return extras only — the A9-6 phantom-example proof).
- **Complete RUN.\* call-site sweep outside run.js:** the rip variants,
  appendSlot ×3, applyStickerToSlot ×4; engine.js never calls
  RUN.applySplice (reward-screen only — in-game splice is chunk 5's ground).
- **Git bracketing of the v1/v2 boundary:** `df2fd38` (2026-05-16) — run.js
  didn't exist pre-split; the real v1 shape read from `df2fd38^:js/meta.js`.
- **Six executed probes** with the scratch localStorage shim (per
  tests/_setup.js — never real storage): the two A9-1 repros, the A9-2
  edict chain, the A9-3 phylactery chain, the A9-4 version-99 blob, the
  A9-5 crash-restore double-count (+ the A9-9 intersection check).

## Test quality

- **run.js ≈ 17% touched, and the touched part is hostile ground:**
  `tplid_renames_test.js` **actively pins the phantom migration shape** —
  worse than absent for that region (it certifies the A9-1 bug as correct).
  map_progression and the steal-gate are the other touchpoints. **Fully
  dark:** reward offer/roll/pick for all 7 kinds, load() normalization,
  snapshot rollback, sector clear.
- **picklog.js ≈ 4%: zero dedicated tests.** The one section that existed
  was deliberately deleted as fake — the IIFE caches data with no reset
  hook, making it **untestable without one**; adding a reset hook is the
  prerequisite for any real picklog test. Stakes are low (analytics-only)
  except the A9-9 loop.
- **Recommendation — highest-value single test:** a migration round-trip
  battery pinned to the **real** git-derived v1 shape (the A9-1 re-pin),
  plus a slot-removal invariant test asserting both card slotIdx AND
  playedSlotIdxs across a rip (pins A9-2 and A9-3 at once).

## Verified clean (negative space — checked, no finding)

- **REWARD_TYPE_WEIGHTS = §1504 exactly** (table-vs-canon diff clean).
- **Opp scaling matches §1503** (/1 /3 /5).
- **STICKER_ID_RENAMES values all exist** in the live sticker registry.
- **TPLID_RENAMES ∩ CARDS = ∅ today** (the A9-9 invariant holds — just
  unguarded).
- **No reload-scum vector:** everything is pre-rolled+persisted or
  committed-in-pick.
- **Non-stackable dedup holds** through the 2×/3× sticker loops.
- **midGameSlotsSnapshot revert is complete for run-state** — the only
  non-run leak is picklog's counter (A9-5).
- **Map integrity:** every node ≥1 in-edge, every non-final node ≥1
  out-edge.
- **Legacy multi-successor warn-path unreachable** (back-compat only).
- **No-reward-on-win impossible** with ≥1 slot.
- **Zero AI call sites** into RUN re-confirmed.
- **Slot-array discipline:** inserts go at end/after-self only — the
  stale-pointer class is **fully enumerated**: A9-2, A9-3, A5-4.
- **picklog idempotency by inspection:** double finishDraft no-ops;
  malformed blob catch-resets.

## Cross-references

- **A5-4 / A5-15 (chunk 5)** — the removeSlotByIdx contract-skip class and
  its adjacent site; A9-2/A9-3 complete the enumeration; one shared helper
  closes all.
- **A5-11 (chunk 5)** — Clone wording/heuristic; §1504's Clone mismatch
  cited under A9-7, not re-filed.
- **A3-4 (chunk 3)** — canon-doc issue; refuter-diffed from A9-1.
- **Chunk 5** — owns the in-game splice path (engine.js side); this chunk
  verified RUN.applySplice is reward-screen-only.
- **Chunk 8** — draft.js side of the run boundary (startNextGame consumers,
  PICKLOG hooks) covered there.

## Triage table (for INDEX.md)

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A9-1](chunk-09-run-meta.md) | P2 | save migration | run.js | MIGRATIONS[1] migrates 4 phantom fields, misses the 3 real v1 carriers (midGameSlotsSnapshot/replacementPack/modifier — git-verified at df2fd38^); rollback resurrects pre-rename tplIds, persists at v2, next startNextGame throws "Unknown card" → clearSave = total run destruction; test pins the phantom shape | stage | open |
| [A9-2](chunk-09-run-meta.md) | P2 | contract skip | engine.js:2853 | EFFECTS.rip (vile_edict) skips the removeSlotByIdx slotIdx-fixup contract — later slot-writes through stale pointers corrupt the wrong saved slot (refuter 13/13 executed); live ×2 in both boss decks; fix = one-line reroute through ripSlotByIdx | stage | open |
| [A9-3](chunk-09-run-meta.md) | P3 | missed invariant | engine.js/run.js | playedSlotIdxs never remapped by ANY slot removal (executed at a contract-honoring site: card fixed 1→0, set stayed {1}, persisted [1]); win-reward filters (4 call sites; :1085 threeStickersBlind commits stickers through the stale filter) target wrong slots; rides the A9-2/A5-4 shared helper | stage | open |
| [A9-10](chunk-09-run-meta.md) | P3 | missing migration | run.js | NEW (refuter-surfaced): snake_case sweep extended TPLID_RENAMES without bumping SAVE_VERSION to 3 — gap-window v2 saves never renamed by any path, same destruction endpoint; verify sweep date in git, fix in the A9-1 PR | stage | open |
| [A9-4](chunk-09-run-meta.md) | P4 | missing guard | run.js:316 | load() silently accepts future-version saves (upward-only loop; version 99 loads true, executed); fix: warn + return false on blob.version > SAVE_VERSION — don't clear | ship | open |
| [A9-5](chunk-09-run-meta.md) | P4 | analytics | run.js:655 | picklog gamesPlayed double-counts on crash-restore and counts at start not completion (executed); move to recordResult or skip-once flag on rollback | ship | open |
| [A9-6](chunk-09-run-meta.md) | P3 | comments | run.js/cards.js | RUN.start() comment cluster: phantom "Watcher's Gift" example (no boon mutates slots; all 7 return extras only); retired triggerPool mechanism; cards.js:464 "pure" vs run.js:455-459 "mutate IN PLACE" contradictory contracts (rec: adopt mutation-allowed); appendSlot header pasted twice | ship | open |
| [A9-7](chunk-09-run-meta.md) | P3 | canon docs | docs/wiki/rules §1500 | Canon §1500 gaps: endless sectors undocumented (run only ends in loss; roguelike-meta same); §1502 omits 15% constructed mid-nodes; §1505 cites the phantom Watcher's Gift (canon and code comment cite each other's ghost); §1504 TwoStickers "(often to one slot)" vs always-same-slot; Clone mismatch = A5-11, cited not re-filed; REWARD_TYPE_WEIGHTS = §1504 exactly | ship | open |
| [A9-8](chunk-09-run-meta.md) | P3 | latent landmine | run.js | pickRewardCandidate guard asymmetry: sticker/ripUp skip bounds re-check + sticker skips non-stackable dedup vs twoStickers/transform full guards; honestly unreachable today (pre-rolled single-shot, no offer-to-pick mutation); stale slotIdx would TypeError; pointer: hoist one validSlotIdx guard before any mid-reward mutation path | park | parked |
| [A9-9](chunk-09-run-meta.md) | P3 | unguarded invariant | picklog.js/run.js | TPLID_RENAMES keys must never be reused as live card ids (picklog re-applies renames unconditionally every load; reuse = rows silently rewritten forever); executed: intersection ∅ today; the full-map assertion may ship with A9-6's PR | park | parked |
