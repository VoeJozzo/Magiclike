# Magiclike — Rules Engine

Magic: The Gathering-style card game. `magiclike_engine.html` plus a `js/` folder of vanilla-JS modules — no build step, no frameworks, no network calls. Open in any modern browser to play.

## Version

**Current: `v2.0.47`** (source of truth: `js/main.js` `const VERSION` — keep this line in sync on bump). v2.0.0 was the
Slice 3 effects/targeting refactor (atomic-effect collapse, unified `target()`
step with restriction `target_filter`, `move_card`, mana-as-ability, sticker
pipeline, splice harmonization). v2.0.1: post-refactor bug-fix sweep — boss
special-removal + mind-control AI casting, the trigger/cast/highlight
target-prompt regressions, the drain→life-loss migration, and card-text polish.
v2.0.2: consolidated the targeting-shape question into one engine API
(`objectNeedsTarget`/`primaryLegalTargets`/`probeTargetsForObject`) that the cast
flow, castable highlight, and trigger prompt all route through. v2.0.3: decoupled
authored text from the `special` gameplay flag (now keyed on `customText` only),
so 5 cards (vileEdict, symmetricize, endomorph, bleach, embargo) generate
accurate text from their effects instead of hand-written text that can drift.
v2.0.4: completed the card-data-Part-2 dispatch-key snake_case sweep for effect
kinds (card.json + JS `EFFECTS` table). Supersedes STANDARDIZATION-PLAN §4.6's
"JS stays camelCase" for dispatch keys. v2.0.5: finished the sweep — keywords
(`first_strike`, `double_strike`) and target filters (`permanent_or_spell`,
`graveyard_creature`); events + predicate ids were already snake (Slice 2). All
four Godot `JsonCardLoader` remap tables are now dead, slated for deletion.
v2.0.6: split the overloaded `player` target into `opp` (opponent-only — drain/
burn/discard/edict) vs `player` (free choice — heals), so generated text matches
the actual legal targets instead of guessing "opponent" from the effect kind.
v2.0.7: filter parity — the engine now enforces every restriction the card text
renders (`minTough`/`maxPower`/`minPower`/`notKeyword` added to matchFilter) and
the text renders every restriction the engine enforces (`notToken`); fixed
counterSpecialist's preamble ("cast a counterspell", not "counter a spell").
v2.0.8: fixed the UI player-target button for "any target" spells — `getValidTargets`
now accepts the §3.5 taxonomy spelling `creature_or_player` (was legacy `any` only),
and render drives the "→ Target <player>" button off real legality instead of a
hardcoded target list (so `opp` correctly shows only the opponent's face).
v2.0.9: unified the "creature or player" target token on the single canonical
spelling `creature_or_player` (matches Godot's taxonomy + the docs). Migrated the
last per-effect `target:'any'` holdouts (crusadersCharm/stormCharm modal modes +
trigger-generator's damageAny roll) and dropped the v2.0.8 `any` alias — `any` is
no longer a target token anywhere in proto, so the Godot loader's
`_TARGET_FILTER_REMAP["any"]` can finally die. (`choose:'any'` for mana color is a
separate field and stays.)
v2.0.10: City of Brass mana label `W`→`C` — it's an identity-less land (taps for
any color via the §3.9 `add_mana choose:'any'` ability, but has no color identity),
so it now renders a colorless frame and stops counting as a White source in
deck-color/draft-pip display. `C` is the colorless-identity land label; the
land-mana invariant test exempts it (production stays WUBRG).
v2.0.11: post-refactor review cleanup (slice 1/4). Unified mass `grant_keyword` onto
the `scope` field (`all_yours`/`all_creatures`) — retired the parallel `whose`
(`allYours`/`all`) field, which was a half-migrated distributed invariant (every mass
consumer read both) AND the lone camelCase wire-value violation. Deleted two dead
branches (legacy `condition`-as-function + `params.sub` fallback in triggers.js) and
fixed stale comments/docs (zone-change migration-window comment, CLAUDE.md trigger
registry name, PROTOCOL exile_until_eot row).
v2.0.12: review cleanup (slice 2/4) — finished the spec'd `remove_creature`→
`affect_creature` rename (plan §6.7/decision 12) across the EFFECTS dispatch, all
31 cards, and every consumer, AND converted `severity` from integers `1-4` to the
string ladder `tap|bounce|destroy|exile` (plan §5). Centralized the int↔string
mapping in one helper (`sevToNum`/`numToSev`); empower still promotes severity up
the ladder. Resolves the half-wired `affect_creature` phantom the review flagged
(name was referenced in schema/valuation but undispatchable).
v2.0.13: fixed two AI severity-scoring sites the v2.0.12 rename missed — they read
`eff.severity` with numeric comparisons (`sev === 3`), silently mis-scoring string
severities (a `destroy` spell scored as `exile`; a `tap` ignored its already-tapped
guard). No crash, so tests/selfplay stayed green — the textbook §8.1 lockstep trap.
Both now go through `_sevNum`; added a regression (AI won't `tap` an already-tapped
creature).
v2.0.14: review cleanup (slice 3/4) — decomposed Scarification (plan #18): the
`destroy_and_sticker_slot` monolith → `[apply_sticker(scarified), affect_creature(
destroy)]` (sticker-FIRST so the run-slot scar lands before the creature leaves;
matches embargo's pattern). Extended `apply_sticker` to accept a registry
`stickerId` (not just an inline descriptor) for complex registered stickers.
Deleted the `destroy_and_sticker_slot` handler + all its classification/scoring/
text sites. Behavior note: under atomic decomposition an indestructible target now
gets scarred-but-not-destroyed (the monolith fizzled both halves) — an acceptable
edge on a boss-targeted creature.

v2.0.43–44: fixed Bleach's inert "bleaching." Bleach is `[apply_sticker
set_color C, move_card exile]` — Swords/Path-rate exile removal whose UPSIDE is
the bleach: the exiled creature's mana cost becomes permanently colorless, so
(cast on your own creature) it returns color-flexible for the rest of the run.
The bug: `set_color` only changed the frame color, not the COST, and color is
read by almost nothing (only Doom Blade's `not_color` filter) — so the signature
effect did nothing. Fix: `set_color C` now also folds the target's colored cost
pips into generic `{C}` (e.g. `{W}{B}{B}` → `{3}`), updating the runtime card AND
the persisted run-slot (the "Forever") — verified a rebuilt-from-slot card comes
back colorless. Added card-text for the `set_color` rider ("…it becomes
colorless, including its mana cost, permanently") + a standalone-`apply_sticker`
case. (v2.0.43 briefly removed the exile on a misread of intent; v2.0.44 restored
it — Bleach IS removal, the cost-bleach is the upside.) Tests updated:
test_balancer asserts exile + cost-fold + slot persistence + rebuilt-colorless.
1200 green, lint clean, 200-game selfplay clean.

v2.0.45: **unified type-system Phase 1** (design-of-record: `docs/plan-unified-type-system.md`).
Additive foundation, ZERO behavior change: new `js/types.js` derives a card's type
tags on-demand from the legacy `card.type` + `card.sub` fields and exposes the
future single source of truth — `typesOf` / `hasType` / `governingType` /
`isPermanent` / `typeLine` over a small `TYPE_REGISTRY`. Nothing in the engine
reads these yet; Phase 2 migrates the ~50 `card.type === X` / `card.sub` reads onto
them, Phase 3 authors `types[]` directly + adds the type-modifier layer (manlands,
"becomes an artifact") + retires Instant→flash-Sorcery, Phase 4 ships the first
multi-type cards (Robots, artifact lands). `governingType` resolves the two-fork
governance (permanent beats spell; Creature > Land among permanents; Artifact/
Enchantment co-types). `typeLine` is a canonical parser (supertypes + types left
of the em-dash, subtypes right, deduped). `test_types_identity.js` pins
equivalence with legacy `type`/`sub` across all 258 cards + a synthesized
multi-type case. 1221 green, lint clean, selfplay clean.

v2.0.46: **unified type-system Phase 2** — converted every rule-evaluation read of
`card.type`/`card.sub` across all modules onto the `hasType`/`governingType`/
`isPermanent`/`typeLine` accessors (~150 sites: engine ~50, ai 24, the rest
spread over render/controller/cards/draft/card-text/triggers/stickers/run). Each
conversion is behavior-preserving — every card is single-type today, so
`hasType(c,'X') === (c.type==='X')` exactly. The `Creature||Land||Artifact`
permanent-triples collapse to `isPermanent()`; subtype word-boundary regexes
collapse to `hasType(c, sub)`; the dead `PERMANENT` regex in controller.js is
gone; display/search strings route through `governingType`. **LEFT for Phase 3**
(type-representation machinery, not reads): the staple/splice synthesis
(`canonicalSplicePair`/`mergeStapleInto`, engine.js ~88–516), the `type:`/`sub:`
copy-writes, `card.legendary`, and the Instant→flash retirement. `render.js`'s
typeline now calls `typeLine(card)`: a cosmetic improvement for the 6 basic-land
cards whose legacy `sub` repeated "Land" — `forest`/etc. now render the
MTG-correct **"Basic Land"** (via a new `Basic` supertype in the registry) and
`cityOfBrass` renders **"Land"** (was "Land — Land"). Everything else renders
identically. 1222 green (+1 supertype assertion), lint clean, 300-game selfplay clean.

v2.0.47: **unified type-system Phase 3a** — retired the `Instant` type (spec §7). An
old Instant is now a `Sorcery` with the `flash` keyword: mechanically identical
(flash → instant-speed cast), and the keyword-render guard is creature-gated so
the 42 migrated cards display as plain "Sorcery" with no "Flash" line. Data: all
42 `"type":"Instant"` card.jsons rewritten to `Sorcery` + `flash` keyword
(parse→serialize round-trip, zero formatting churn). Logic: the cast gates
(`isLegalAction` castSpell, `getLegalActions` spells) drop the `Instant` branch
and gate purely on `flash`; `Instant` removed from `TYPE_REGISTRY`; spell-value /
damaging-spell-keyword checks key on `Sorcery` alone; the AI's "instant
flexibility premium" and off-turn-castable check now key on the flash keyword.
(`isInstantWindow`/`isSorceryWindow` are timing-window names — unchanged.) The
chosen direction (user): retire to "Sorcery", not keep an Instant display label.
1223 green, lint clean, 300-game selfplay clean.

v2.0.42: resolved three rules-infrastructure divergences (B2 / F2 / D4 — all now
*PROTO: DONE* in DIVERGENCE). **B2** — unused mana now empties at *every* phase
boundary (MTG 106.4), not only CLEANUP. New `setPhase(p)` helper empties both
pools on an actual change; all 11 phase-progression assignments route through it,
the redundant CLEANUP clear is gone. Direct `G.phase = …` (test setup) bypasses
it, so pre-loaded pools survive until real play advances a phase. **F2** —
indestructible creatures now KEEP their marked damage (SBA only skips the death
check, doesn't heal); if indestructible is removed later the same turn, the
retained lethal damage kills it at the next SBA (MTG-correct). Damage clears at
end of turn with everything else. **D4** — `damagePlayer` now fires the
directional `life_changed(delta<0)`, so "whenever you lose life" (`is_life_loss`)
triggers fire from burn/combat too, not only from `gain_life(negative)`/drain.
Safe: no card uses `is_life_loss` yet, and `is_life_gain` needs delta>0 so a
negative delta can't mis-fire it. (gain_life's signed half was already done.) New
test_rules_infra.js (7 checks). 1198 green, lint clean, 400-game selfplay clean.

v2.0.41: optional paid ETB for Land+Spell staples (BACKLOG feature). A spell
stapled onto a LAND used to give a FREE ETB trigger (a land is free to play, so
that's pure value); it's now a "you may pay {the spell's mana cost}" trigger.
Two new general primitives: (1) **optional triggers + cost-payment during
resolution** — a trigger may carry `optional_cost`; at resolution `resolveTrigger`
pauses on a new `pendingOptionalCost` decision (registered in PENDING_DECISIONS),
and on pay `doOptionalCost` calls `payMana` (which auto-taps) then
`runTriggerEffects` (split out of resolveTrigger so the pay path resumes it).
Targets are already locked at queue time, so the order is target → may-pay →
effect. Can't-afford auto-declines (no prompt). Gated at synthesis: only
`merged.type === 'Land'` staples get `optional_cost`; Creature/artifact bases
stay free (you paid the body). New action `optionalCost {pay}`, AI pays when
`spellValueForEffects > 0`, card-text renders "...you may pay {cost}: <effect>",
and a DOM modal (`#optionalCostModal`, mirrors the edict modal — browser-verify).
These primitives are reusable for kicker-style "you may pay" effects. New
test_optional_paid_etb.js (16 checks: synthesis gate, pay/decline/can't-pay flow,
AI decision). 1192 green, lint clean, 200-game selfplay clean.

v2.0.40: AI audit follow-ups. (1) `decideMain` now sequences main-phase casts by
play VALUE, not raw mana cost — so cheap high-impact removal beats expensive
filler (the audit's quality finding). Extracted `bestSpellPlay` (returns
{opt, score}) from `pickBestTargetForSpell` (now a thin wrapper) + a new
`spellPlayValue` cross-card scale (targeted → target score, creature →
getCardValue, utility → effect value); cost-descending stays as the tiebreak so
creatures still curve out biggest-first. All castable plays still get made
across successive priority passes, just in value order. (2) Dropped the
nonsensical `!flying` exemption in damage-vs-creature scoring (damage never
destroys an indestructible creature, flying or not). (3) Removed a dead
`bestAbilityScore` write in `decideOffTurnCombat` (the real gate is
`pickBestActivation`'s `<= 0 → null`). Kept `is_life_loss` predicate (intentional
pair with `is_life_gain`). New test_ai_main_sequencing.js (removal over filler).
1176 green, lint clean, 300-game selfplay clean.

v2.0.39: corrected the Archdemon bargain chooser DIRECTION (v2.0.38 had it
backwards) + made the AI's bargain pick position-aware. Clarified intent: you
make a bargain WITH the demon — its NON-controller (opponent) picks 1-5; that
many stickers go on the demon's controller now, and the chooser collects that
many when they kill it. So the chooser is `opp(controller)`, not the controller.
v2.0.38 set it to the controller (backwards — it broke the common boss case:
boss-controlled should prompt the human, opp(boss)=you). Now correct both ways:
boss controls → human picks; player controls (drafted/stolen) → AI picks. The
original `who:'you'` was accidentally right for boss-control and only wrong when
the player controls it. AI pick: new `bargainPick(state, who)` ties N to a rough
life+board advantage (ahead → 5, behind → 1) instead of always the minimum —
the AI collects N when it kills the demon, so it bargains high when it can
afford the buff and expects the kill. choice_prompts_test reverted to the
correct non-controller ('you' for an opp-controlled demon); new test covers both
control directions + the position scaling. 1173 green, lint clean, 200-game
selfplay clean.

v2.0.38: two gameplay bug fixes (user-reported). (1) Archdemon of Bargains ETB
number-choice was hardcoded `who: 'you'`, so when the BOSS controlled the demon
the HUMAN got the prompt — choosing the boss's ETB sticker count AND their own
death payout. Now follows the demon's CONTROLLER (the dealmaker):
`who: sourceCard.controller`. When the boss controls it the boss (AI) chooses;
the human only chooses when they control it (cast/stolen). The ETB→controller /
LTB→opponent recipients were already correct — only the chooser was wrong.
(Note: the AI resolves its bargain pick at the min, 1 — a weak choice for a boss
that wants a buffed board; AI-tuning follow-up, not a bug.) Updated
choice_prompts_test, which had encoded the bug (opp-controlled demon yet expected
`who === 'you'`). (2) Empower on signed values: `applyEmpowerRoll` did
`field += amount`, so a -2 debuff (Sicken's pump) empowered to -1 (WEAKER), not
-3. Now amplifies magnitude in the field's existing direction
(`cur + (cur < 0 ? -amount : amount)`) — fixes pump debuffs and negative
gain_life (drains); positive fields (damage, buffs, counts) unchanged. New
test_bargain_chooser_and_empower.js (9 checks). 1170 green, lint clean,
150-game selfplay clean.

v2.0.37: AI scoring — single-target exile now outvalues destroy (user call).
In `spellValueForEffects`, the single-target `affect_creature` severity value was
tap 3 / bounce 4 / destroy=exile 12 (the v2.0.36 collapse of the dead `?12:12`).
Exile now scores 15 vs destroy's 12 — same board result, but it dodges death
triggers / indestructible / recursion / regeneration. (The activated-ability
path already ranked exile above destroy: 35 vs 30.) Also resolved the v2.0.36
gain_life open question: the removed dead branch ("valuable only when low":
ourLife<=6?6:…) was a cruder predecessor of the surviving signed-life branch in
`pickBestActivation`, which is strictly better (drain- + target- + amount-aware,
already low-life gated at ≤10). No swap — removal stands. 1161 green, lint clean,
150-game selfplay clean.

v2.0.36: added dev-only lint tooling + fixed the 5 bug-smells it immediately
found. ESLint (flat config, `reference/html-proto/eslint.config.js`) +
eslint-plugin-sonarjs, run via `npm run lint` from `reference/html-proto/`.
Dev-only — NOT in the runtime (no build step; Pages serves raw files);
`node_modules/` git-ignored, `package-lock.json` committed. Scope is narrow on
purpose: high-signal BUG rules only (sonarjs/no-identical-expressions +
no-identical-conditions + no-all-duplicated-branches, plus core no-dupe-else-if /
no-self-compare / no-constant-binary-expression / no-unreachable / dupe-keys|args|
case / etc.), no stylistic rules; `no-undef` off (plain <script>s share globals,
no modules). The motivating `x || x` case (v2.0.33's grant_haste) is exactly what
sonarjs/no-identical-expressions catches — verified. First run found 5 real
issues, all fixed: (1) ai.js single-target severity had a dead `sev===3?12:12`
ternary (collapsed to `12`, behavior-identical; left a note that destroy & exile
both score 12 here vs 10/14 in the all_opps branch — flagged as a tuning
question). (2) stickers.js had an unreachable `damage && scope` label branch
after the general `damage` branch, so mass-damage stickers were mislabeled
'damage' instead of 'damage to all' — folded the scope check into the damage
branch (cosmetic fix). (3) ai.js had a DUPLICATE `else if (eff.kind ===
'gain_life')` in the activated-ability scoring chain — the second (with a
"valuable only when low" heuristic: `ourLife<=6?6:ourLife<=12?2:0`) was dead,
since the first gain_life branch always caught it. Removed the dead branch
(behavior-preserving); OPEN QUESTION for the user — was that low-life heuristic
the intended scoring for gain_life abilities (in which case swap it in)? 1161
green, lint clean.

v2.0.35: unblocked + did the render() you/opp counter loop (review item #3,
deferred from v2.0.34). The five mirror pairs (life/library/graveyard/exile/hand
counts) collapsed into one `for (const w of ['you','opp'])` loop. The blocker
was an asymmetric element ID: the player's hand-COUNT span was `youHand2` (the
bare `youHand` id is the player's card *container*) while the opponent's was
`oppHand` — so a naive `w+'Hand'` loop would have written the count into the
card container and frozen the real count, a silent bug. Fixed by normalizing the
two count spans to `youHandCount`/`oppHandCount` (HTML + render.js); the `youHand`
container and `oppHandView` cardback area are untouched. Verified end-to-end (no
CSS or other JS referenced the old ids), so no behavior change. 1161 green.

v2.0.34: de-dup the two button-construction hotspots the v2.0.33 review flagged
(behavior-preserving; pixel-identical output). (1) Start screen: ~7 buttons each
hand-wrote their cssText + create/text/style/onclick/append boilerplate. Now a
`START_BTN_STYLE` table (primary/cube/discard/secondary/sandbox) + a
`makeStartBtn(parent, text, styleKey, onclick)` factory — showStartScreen
creates 0 buttons inline. (2) Choice modals (pick-a-number / symmetricize /
edict) each spelled out the same option-button create + lift-on-hover
(background swap + translateY) + onclick three times; now one
`makeChoiceButton(html, css, normalBg, hoverBg, onclick)` helper in render.js
(background moved out of the css string to `style.background` so the hover swap
can't drift from the base color). Browser-verify the start screen + the three
modal prompts look unchanged. 1161 green. (Deferred from the review: render()'s
you/opp pairs — blocked on the asymmetric `youHand2`/`oppHand` element IDs.)

v2.0.33: modularization-review cleanups (behavior-preserving). A code-health
sweep (3 parallel surveys, all findings verified against source before acting).
(1) `change_control` haste rider checked `grant_haste || grant_haste` — the same
field twice (copy-paste of the line above, which legitimately checks
`untap_on_take || untap`). Threaten (the only steal-with-haste card) supplies
`grant_haste`, so haste was always granted correctly — a redundant-clause
landmine that *looked* like a bug, not an actual one. Collapsed to a single
check at both sites (engine.js change_control handler + card-text.js rider
text). (2) Fixed a stale line-number reference in cards.js (cited a line that no
longer exists; now points at the function/module). Review notes (no code change
needed): an audit flagged effect handlers writing `G.pending*` as "boundary
violations" — but that's the prototype's by-design IIFE-state architecture (the
"don't touch globals from handlers" rule is the *Godot port's* discipline, root
CLAUDE.md "Patterns to NOT replicate"), and the `pending*` writes are consistent
across all five modal prompts. Real (deferred) duplication worth a future pass:
start-screen button construction + choice-modal button/hover styling repeat
inline cssText; render()'s you/opp pairs *look* loopable but the element IDs
aren't fully symmetric (`youHand2` vs `oppHand`) — a naive loop would break, so
that one needs care. 1161 green.

v2.0.32: three QA/devtools items (all browser-verify — DOM not covered by
Node). (1) Minimap de-dup: the v2.0.30 "always show map" change left
`continueFromMap` as a near-byte-identical twin of `pickMapNodeClick`'s tail;
both now route through one `advanceFromMap()` (fork pick resolves the node
choice first, Continue advances directly). Investigated the "multiple map GUIs"
worry: it's ONE `renderMap()` + ONE `#mapModal` with a justified `hasChoice`
conditional (fork = clickable nodes/no Continue; non-fork = Continue button) —
not duplicate functions; all referenced DOM (`#mapContinue`/`#mapSubtitle`)
exists, so no soft-lock. (2) New devtool toggle "Reveal AI opponent's hand"
(Settings → Devtools, beside the font picker) — `revealAiHand` SETTINGS key;
`renderOppHand` draws the AI's real cards face-up (read-only, no onclick)
instead of cardbacks. Factored both devtools checkboxes through a shared
`addDevtoolsToggle` helper. (3) Sandbox mode (start screen → "🔬 Sandbox"): a
RUN-less throwaway game on basic-land decks with a floating panel to spawn any
card into either player's hand/board and top up mana/life. `sandboxMode` guards
`onStateChange`/`gameOverClick` so it never touches a saved run; the all-basics
opp deck makes the AI naturally passive until you spawn onto its board. Static/
passive-opponent control is a planned follow-up. New `test_sandbox_spawn.js`
(18 checks: deck validity, RUN-less boot, spawning complete instances onto the
battlefield, 30 AI plies without crash). 1161 green.

v2.0.31: closed GAP 2 — the human-facing `chooses()` edict prompt. `chooses()`
(Diabolic Edict / Vile Edict) always auto-picked the lowest-sac-value permanent,
even when the player forced to sacrifice was the HUMAN — so a human edict-victim
had their creature chosen for them. Now, when the chooser is `'you'`,
`resolveTopOfStack`'s chooses-branch defers: it stashes the chosen-dependent
trailing effects (sacrifice/annihilate/rip) on a new `pendingEdictChoice` modal
(registered in PENDING_DECISIONS, so `step()`/`anyoneOwesDecision` pauses for the
pick) and `break`s — the spell still resolves to the graveyard. The human submits
an `edictChoice` action; `doEdictChoice` rebuilds a minimal ctx with the pick as
`ctx.chosen`, replays the trailing effects, and `drainTriggers()` (so a sacrificed
creature's death triggers — Blood Artist — still fire). The AI path is UNCHANGED:
the handler still auto-picks lowest sac-value for AI choosers, and `AI.decide`
resolves its own `pendingEdictChoice` the same way (so selfplay, where the
AI-driven `'you'` seat can be edicted, stays clean — caught a runaway regression
mid-build that the AI-resolution block fixed). Extracted `choosesEligiblePool` /
`choosesDescriptor` as the single source for auto-pick + prompt + enumeration.
New `test_edict_human_choice.js` (27 checks: prompt opens + creature not
auto-sac'd, the human's pick is honored over the AI's default, legality, the
human-edicts-AI regression guard, Blood Artist death-trigger drain, and Vile
Edict's annihilate+rip replay). DOM modal wired (`#edictChoiceModal`,
mirroring the symmetricize modal) — **browser-verify** (DOM not covered by Node).
1138 green, 200-game selfplay clean.

v2.0.30: minimap always shows between levels + boss-advance crash fix. (1) The
post-level map was only rendered when the current node forked (2+ paths); ~70% of
nodes are single-path or dead-ends, so the map was usually skipped. Now the
controller always renders it: interactive at forks (unchanged), and a "you are
here" view with a Continue button on single-path nodes and at sector starts
(`renderMap` no longer early-returns on no-choice; new `continueFromMap` advances
via the same `startNextGame` path). UI-only — verify the modal/button in a
browser. (2) BUG found while verifying: advancing into a boss node threw
`ReferenceError: getConstructedDeck is not defined` — `startNextGame` (run.js)
called the bare name, but it lives inside draft.js's DRAFT IIFE (every other site
uses `DRAFT.getConstructedDeck`). Slipped in at the v1.0.135 meta.js→run.js split;
fixed. The boss banner never worked before this (the crash preempted it). New
`test_map_progression.js` walks a full sector (root→boss→next sector) asserting no
throw + map state present every transition. 1111 green.

v2.0.29: bugfix — two faults behind "Patient Saint + High Priestess + Ajani's
Pridemate didn't chain." (1) `card_has_subtype(X)` guarded on
`Array.isArray(c.sub)`, but `sub` is a space-separated STRING everywhere (token
cards, splice merge, matchFilter), so every subtype-ETB trigger (High Priestess
"another Cleric entered → gain 2 life"; the subtype lords) silently never fired.
Now a word-boundary string match (triggers.js), matching matchFilter. (2)
`scope:'self'` creature effects were silently dropped: the pump/affect_creature/
grant_keyword handlers route any `params.scope` through `creaturesInScope()`,
which returns `[]` for `'self'` — so a self-pump applied to NOBODY (Ajani's
Pridemate + ~13 self-pump cards + the Skirmisher/Reaper stickers; also Char's "1
damage to you"). The four resolution paths already resolve `scope:'self'` into the
`target` arg, so `resolveEffectParams` now strips `scope:'self'` and the handler
operates on that target (engine.js). Neither bug crashed → tests/selfplay stayed
green (the §8.1 lockstep trap). New `test_scope_self_and_subtype.js` asserts the
observable effects (9 checks). 1105 green, 300-game selfplay clean.

v2.0.28: dead-code prune — removed the unused `formatCost` helper (render.js).
The plain-concat mana formatter (`{R:2}`→`"RR"`) was fully superseded by
`formatCostBraced` (`"{R}{R}"`, the input to `renderManaSymbols`); it had zero
callers across js/ + tests/ + the HTML shell. A conservative whole-corpus
reference scan (raw `\bname\b` counts with strings INCLUDED, so `onclick=`
handler refs are counted — stripping them is what makes naive dead-code scans
lie) found it the only declared function appearing exactly once, confirming the
v2.0.11→v2.0.27 cleanup arc left the engine clean. Behavioral no-op; 1096 green.

v2.0.27: inlined the always-true FLASH_AI_ENABLED flag. With the A/B setter gone
(v2.0.26), the flag was a `const true` gating 4 `if (FLASH_AI_ENABLED && …)` sites
— an always-true condition is a dead abstraction, so the flag is removed and the
flash-AI heuristics (end-step tempo, ambush bonus, flash-hold deferral) now run
unconditionally, which is exactly what they always did. Per-site comments already
document the flash-AI intent, so no marker lost. Behavioral no-op; 1096 green,
300-game selfplay clean. (Should've done this in v2.0.26 instead of demoting
let→const — an always-true flag IS the cruft.)

v2.0.26: removed the dead flash-AI A/B setter/getter. `setFlashAIEnabled`/
`isFlashAIEnabled` had zero callers (confirmed across js/ + tests/) — deleted
them + their exports. Kept `FLASH_AI_ENABLED` (it's READ at 4 sites, so live) but
demoted `let`→`const` since nothing reassigns it now; flip the const for tuning
A/B. (Earlier I'd kept the setter/getter as a "deliberate seam" — wrong call; a
comment claiming usefulness isn't a caller. Confirmed-dead → removed.) 1096 green.

v2.0.25 (docs): re-corrected the #7 symmetricize status. v2.0.22 claimed #7 was
"NOT done (still monolithic)" — that was wrong, an over-correction from an audit
agent's surface read. Verified by reading the handler + doSymmetricizeChoice
against §3.8: symmetricize IS decomposed per spec — it stays a named effect with
a player-choice prompt (§3.8 explicitly specifies "the effect computes its value
via its player-choice prompt and calls the shared apply path") and emits
stat_boost + cost_mod snapshot stickers via the shared pipeline (no bespoke slot
field; applyBalancerOverrides/symmetrizedTo gone). No code change — the code was
already correct; only the doc status was wrong. (The "decompose symmetricize"
audit task resolved to: it's already done; nothing to build.)

v2.0.24: dedup (audit finding). Two extractions, both behavior-preserving:
(1) `makeSlotTargetGetter(targets)` replaces FOUR byte-identical lazy per-slot
target-getter closures (spell-resolve, resolveTopOfStack, trigger, ability — the
audit found 3; there were 4). Each was a Map + closure snapshotting the slot
target on first read (§3.6). (2) `validTargetsBySlot(card, targetedEffs, who)`
unifies the slot-grouping + per-slot spec resolution shared by `isLegalAction`
(cast-legality) and `getLegalActions` (AI enumeration) — the same logic whose
`slotSpecs ? : eff` comment had already drifted (fixed in v2.0.22), exactly the
kind of duplication this removes. isLegalAction now checks the given target
against the slot's resolved set; getLegalActions builds its cross-product from
the same Map. Equivalent (per-effect validation == per-slot intersection).
1096 green, 35 multi-target cast regressions pass, 300-game selfplay clean.

v2.0.23: snake_case the dynamic-value DSL (audit #4 — the one Godot-facing miss).
The `{from:"..."}` computed-amount tokens were still camelCase (the #9 sweep did
keys only): `targetPower`→`target_power`, `targetToughness`→`target_toughness`,
`targetController`→`target_controller`, `sourcePower`→`source_power`,
`sourceToughness`→`source_toughness`, `countCreaturesYou`→`count_creatures_you`,
`countCreaturesOpp`→`count_creatures_opp`. Renamed the tokens in `resolveExpr`'s
switch (engine.js), the card-text `describeAmount` dynMap + the `who.from`
comparison (also fixed a pre-existing dynMap key bug: `targetTough` →
`target_toughness`, matching the real token), and the 2 cards that use them
(exorcist, swords). render.js's local `targetController` variable is NOT a token —
left alone. Not an active break (Godot doesn't read computed values yet), but
closes the latent wire-format trap before Godot ports those cards. 1096 green,
200-game selfplay clean.

v2.0.22: post-audit cleanups (4 verification agents). Dead-code prune + doc
corrections. Deleted: dead card-text `case 'embargo'`/`'bleach'` (cards decomposed,
no kind uses them); dead `triggerNeedsPlayerChoice` (superseded by
`triggerPlayerTargetPrompt`); dead export entries `allCardEffects`,
`affectOneCreature` (engine), `spellValue` (AI) — functions stay, only the unused
export tokens removed. KEPT `EFFECTS.steal` — the audit agents flagged it dead
("no card uses kind:steal") but `change_control` delegates to it at engine.js
for the `transfer_ownership` case (Steal card); verified live before NOT deleting.
Corrected the misleading per-effect-fallback comments (it serves MODAL charm
cards — which carry per-effect target in their modes — NOT staple-synthesis, which
the audit proved carries only card-level target). Fixed: stale version header
(was v2.0.2); `cards/cityGuardian` keyword typo `"first strike"`→`"first_strike"`;
ARCHITECTURE.md stale effect-dispatch list (removeCreature→affect_creature etc.).
Corrected a FALSE status claim: #7 symmetricize was marked "already done" but is
still a monolithic effect (decomposition pending — done next). 1096 green.

v2.0.21: review cleanup (#5b phase 3 — COMPLETE) — target_slots is the single
source of truth for the 5 multi-target spells. Dropped inline per-effect
`eff.target` from branchingBolt/twinStrike/drainLife/rootsAndBranches/
swordAndSorcery; each slot-bound effect now carries only `target_slot:N`, and the
filter lives in the card-level `target_slots[N]` spec. Consumers migrated to read
the slot spec: `effectNeedsTarget` now recognizes slot-bound effects
(target_slot != null); getLegalActions + isLegalAction prefer
`card.target_slots[slot]` for per-slot validity/validation; card-text's
describeEffectList resolves the synthetic per-effect target from the slot spec
(extends the existing top-level-step mapping); render's slot machinery
(pendingObjectTargetSlots, slotsNeededForPending, pendingTargetEffect)
recognizes card-level target_slots, not just ability-level. New end-to-end cast
regressions in test_targeting_cast.js (cross-product enumeration; both targets
damaged; drainLife's mixed creature/player slots: creature dmg + opp life-loss +
self life-gain). 1096 green, 500-game selfplay clean. The per-effect-target shape
now survives ONLY as the staple-synthesis runtime fallback (a contained
`slotSpecs ? : eff` branch in the two enumeration sites) — staple-merged spells
are runtime synthesis, not authored wire format, and the canonical API handles
them. Fully migrating synthesizeStapledTemplate to emit target_slots (to delete
that fallback) is deferred: the staple/splice pipeline is complex and the value
(removing a one-line fallback) doesn't justify the regression risk.

v2.0.20: review cleanup (#5b phase 1/2) — canonical target_slots on multi-target
cards + kill the dead multi_target flag. The 5 multi-target spells (branchingBolt,
twinStrike, drainLife, rootsAndBranches, swordAndSorcery) now carry a card-level
`target_slots: [{target:...}, ...]` array (the same shape Stapler's abilities use)
and explicit `target_slot:0` on the first targeted effect. The `multi_target`
boolean was a DEAD WRITE — set in synthesizeStapledTemplate (engine.js:518/526)
and on the 5 cards, but READ nowhere (multi-target is recognized structurally via
per-effect target_slot in slotsNeededForPending + the canonical target API).
Removed all writes + the card-data flag. This phase is purely additive/dead-code:
inline per-effect `eff.target` is still present and still what card-text/AI/the
render slot-pick read; dropping it (so target_slots is the single source) is
phase 3, which must also teach render's slot machinery to read card-level
target_slots (today slotsNeededForPending only recognizes ability-level
target_slots, not card-level). 1083 green, 300-game selfplay clean.

v2.0.19: review cleanup (#5a) — self-direction `target:"self"` → `scope:"self"`.
Per-effect `target: "self"` was the legacy way of saying "this half of the spell
acts on the source/controller, not the picked target" — which conflated two
distinct concerns under the `target` field. Migrated to `scope: "self"` (the §3.5
canonical for self-direction): 44 cards (on-cast + triggers + activated abilities),
all 4 engine dispatch sites (spell resolver + trigger resolver + two more), all
card-text rendering sites (~10), 4 AI sites, trigger-generator's 5 template rolls
+ random-trigger card, the scarified-sticker payload (cards.js) + the 5 sticker
effects defined at the top of engine.js, and the 5 test files that constructed
synthetic effects with `target:"self"` inputs. Selfplay caught a real regression
mid-migration: the engine dispatch was sed-switched ahead of all the producers,
so triggers were briefly running `pump`/`gain_life` with null targets (152
crashes in 500 games). Completing the producer migration (especially the trigger/
ability effects in 44 cards — jq's first pass only walked on-cast effects) cleared
the regression. 1083 green, 500-game selfplay clean. This is **5a** — the
self-direction half of #5. The multi-target canonicalization (multi_target flag →
ability-level target_slots on the 5 multi-target spells) is **5b**, deferred: it
entangles with the staple-merge pipeline (engine.js:518/526 still sets
multi_target=true on staple), and that's not session-tail work.

v2.0.18: review cleanup (#9) — field-name snake_case sweep. Renamed 24 camelCase
JSON keys across the card pool to snake_case to match the rest of the wire
format: `customText`/`multiTarget`/`staticBuffs`/`permanentEot`/`staticCostBump`/
`triggerPoolSeed`/`chargesAtRunStart`/`buildOnDraw`/`artLadder`/`ripOnTarget`/
`targetSlot`/`targetSlots`/`tokenId`/`stickerId`/`grantHaste`/`notToken`/
`modeNames`/`hasKeyword`/`maxTough`/`notColor`/`spliceableBase`/`spliceableStaple`/
`minPT`/`sorcerySpeed` → snake_case equivalents (and the orphan filter-field
reads `notKeyword`/`minTough`/`maxPower`/`minPower` in consumer code, for
vocabulary consistency — no card uses them today). 63 card JSONs + ~12 JS modules
+ tests updated in one coordinated pass. Godot's `JsonCardLoader` doesn't read
these fields (Phase 6 unstarted), so no Godot churn — the renamed JSON arrives
already-snake_case when Godot starts porting these cards. 1083 green, 500-game
selfplay clean. (`targetSlotIdx` is a JS-internal variable name, not a wire-format
field — out of scope.)

v2.0.17: review cleanup (#8) — effect-shorthand parser (§5.1/§5.2). Card effects
may now be authored as function-call strings ("damage(3)", "draw(2)",
"chooses(creature)") that ingestCard() normalizes to canonical dicts at load
(triggers.js: `_parseEffectCall` + `desugarEffectString` + `normalizeCardEffects`,
reusing the predicate lexer). The §5.2 curated movement shorthands (draw/discard/
mill/bounce/search_for/search_land_tapped/shuffle_into_library/
target_player_discards) desugar to canonical move_card — verified executable
against the (already-generalized) move_card handler. `flicker` is intentionally
omitted: its §5.2 desugar needs a `previous_target` move_card selector the engine
doesn't implement. Dict-form effects pass through untouched, so the all-dict pool
is a no-op; no card uses shorthand yet (forward-authoring seam). New
test_effect_shorthand.js (25 checks incl. end-to-end execution). 1083 green.

v2.0.16: review cleanup (#6) — relocated AI spell valuation engine.js → ai.js.
Moved `spellValue` / `spellValueForEffects` + the `VALUED`/`UNVALUED` effect-kind
classification to ai.js module scope (exposed on `AI.*` for tests; the engine
coverage report reads the sets lazily, like the cast-scoring sets). KEPT the
engine-consumed creature-body heuristics (`getCardValue`, `sacValueOnBoard`,
`abilityValue`) in engine.js — `dealCombatDamage`'s blocker damage-assignment
order and the edict `chooses()` auto-pick genuinely depend on them, so a full
relocation would force a combat-behavior change (the engine has its own coarse
`cardValueOrZero` for layering-pure picks, but switching combat onto it is a
behavioral change, out of scope here). No behavioral change; 1058 green, 500-game
selfplay clean. (Engine internals live in the ENGINE IIFE — ai.js reaches the
two shared helpers via `ENGINE.sevToNum` / `ENGINE.getModes`; `TOKENS` is a
top-level global.)

v2.0.15: review cleanup (slice 4a/4) — broadened rip (plan #27/§13). Built the
zone-agnostic `rip` primitive (run-layer slot-strip reading ctx.chosen's
snapshotted slotIdx) and decomposed Vile Edict from the `rip_permanent` monolith →
`target(opp) → chooses(permanent) → annihilate → rip`. Per user call, KEPT the
"rip a permanent" breadth (generalized `chooses()` to honor a `permanent` filter,
not just creatures). Deleted `rip_permanent` + the now-dead `pendingRipSelect`
prompt machinery (engine + render + controller + AI). Note: rip-edict now uses
`annihilate` (no death triggers, matches §13) and auto-picks the victim's permanent
(human rip-pick prompt folds into the tracked GAP-2 human-chooses work, like
Diabolic Edict). Browser-verify the rip UI removal (DOM not covered by Node tests).
(#7 symmetricize: confirmed already in the decided end-state — no change.)

> **MUST UPDATE on every dev-branch push that touches code.** Bump `VERSION` in `js/main.js` AND the line above, in the same commit. GitHub Pages caches aggressively; the version string is the only reliable way to confirm a fresh build is live.

Always work on `dev` for html-proto changes.

Deferred work lives in `BACKLOG.md` (gating rules in `/CLAUDE.md`).

## File structure

The codebase was a single self-contained HTML file until it crossed ~19k lines. It's now split into per-subsystem JS files loaded as plain `<script src>` tags (no ES modules, no build step). The HTML shell holds the body, CSS, and fourteen script tags in dependency order.

Also in the repo: `index.html` at the repo root — a small redirect that points GitHub Pages at the engine file.

## Module layout

| File | Role |
|---|---|
| `cards/<tplId>/card.json` | One file per card template (258 cards). Each folder also holds `art.png` for cards with PNG art. `cards/_manifest.json` lists every folder name. |
| `js/settings.js` | `SETTINGS` IIFE — user-tunable display config (card frame style, per-element font + size multipliers, popup text scale, mana symbol sizes, devtools flag). `localStorage` at `magiclike_settings_v1`. `applyFontsToRoot()` pushes saved values into `:root` CSS vars at boot before the first paint. |
| `js/cards.js` | `CARDS = {}` + `async loadCards()` fetcher (populates CARDS from the per-card JSONs at boot). Also holds `TOKENS`, `KEYWORDS`, `STICKERS`, `EMPOWER_FIELDS`, `KEYWORD_DISPLAY`, `KEYWORD_STICKER_WEIGHTS`, `RUN_MODIFIERS` — the shared registries that don't fit the per-card model. |
| `js/engine.js` | Mercurial trigger pool, splice eligibility helpers (`isSpliceableBase`, `canonicalSplicePair`, `isCompatibleStaplePair`, `remapEmpowerRollForStaple`, etc.), general helpers (`tplForSlot`, `deckColorsFromSlots`, `fakeTargetsForLegality`), `ENGINE` IIFE (state, mana, triggers, phases, combat, synthesis, `EFFECTS` dispatch ~25 kinds). |
| `js/card-text.js` | Card-text description helpers — `describeCardSegments`, `describeCardText`, `describeEffect/Trigger/Ability/StaticBuff/ModalSegs` + internal helpers (targetPhrase, withFilter, bumpedSeg/Derived, capitalizeSegs, triggerPreamble, keywordPreamble, abilityCostPhrase, segsToText). Pure data → English; reads `ENGINE.synthesizeStapledTemplate` for stapled-card baselines. |
| `js/stickers.js` | Sticker pipeline — runtime application (`weightedPick`, `applyStickersToCard`, `applyOneStickerToRuntimeCard`, `applyRandomStickersToSide`, `empowerRollLabel`, `applyEmpowerRoll`) and deck-construction helpers (`rollSubtypeFromDeck`, `pushStickerWithRoll`, `stickersForSlot`). Late-binds to `ENGINE.synthesizeStapledTemplate`, `tplForSlot`, `deckColorsFromSlots`. |
| `js/ai.js` | `AI` IIFE — decision logic, combat sim, lethal detection |
| `js/draft.js` | `DRAFT` IIFE — pack generation, color-aware sampling, 23-pick player draft, opp deck construction (incl. constructed-deck registry: Goblin Aggro, Spirit Tribal, Aristocrats, Archdemon Boss, Balancer Boss) |
| `js/run.js` | `RUN` IIFE — roguelike meta (map generation, rewards, post-draft offers), save/load to `magiclike_run_v1` localStorage key, schema migrations |
| `js/picklog.js` | `PICKLOG` IIFE — draft pick analytics, `magiclike_picklog_v1` storage, exposed on `window.PICKLOG` for console queries |
| `js/controller.js` | `CONTROLLER` IIFE — input handling, modals, AI scheduling, plus the meta-game render helpers it owns (renderMap, renderReward, renderDraft, renderStatsContent, …) |
| `js/render.js` | `render()` main repaint, `renderManaPool`, `renderHand`, `renderBf`, `passLabel`, `makeCardEl`, `cardToViewModel`, etc. — in-game UI only |
| `js/settings-panel.js` | `SETTINGS_PANEL` IIFE — settings modal render + show. Sub-renderers per section (devtools, font preset, per-element rows, popup scale, mana pip sizes, export button). Pulled out of controller.js on v1.0.185. |
| `js/triggers.js` | `ATOMIC_PREDICATES` registry (12 composable atomic predicates) + `evaluateCondition` walker (string / list-AND / `{op,terms}` tree) — the composable trigger-condition vocabulary used at runtime (Slice 2) |
| `js/trigger-generator.js` | `GENERATOR_EFFECTS` / `GENERATOR_CONDITIONS` data plus the rolling functions for Mercurial Adept / Architect's Codex (`generateRandomTrigger`, `generateConditionOptions`, `generateEffectOptions`, `assembleTrigger`) |
| `js/main.js` | `VERSION`, the `opp(who)` helper, and the bootstrap that awaits `loadCards()` then calls `CONTROLLER.init()`. |
| `tests/` | Node-based regression suite (~20 test files + harness). See `tests/README.md`. |

Load order in `magiclike_engine.html` is: settings → cards → engine → card-text → stickers → ai → draft → run → picklog → controller → render → settings-panel → triggers → trigger-generator → main. Each IIFE declares as a top-level `const`, so it's a global accessible from later scripts. Note: DRAFT calls PICKLOG at runtime (not at module-load), so the DRAFT-before-PICKLOG order is fine — identifier resolution inside IIFE function bodies is lazy. Same goes for stickers.js's late-bound references into ENGINE and into engine.js's top-level helpers.

**Card data:** Cards live one-folder-per-template under `cards/`. The tplId is the folder name AND a top-level field in `card.json`. To add a new card, create a folder, write `card.json`, append the folder name to `cards/_manifest.json`. The browser loads everything at boot via the manifest. Tests sync-load via `fs.readFileSync` (see `tests/_setup.js`).

## Persistence

`localStorage` is the only persistence. Keys:
- `magiclike_run_v1` — current roguelike run (deck, stickers, wins/losses)
- `magiclike_picklog_v1` — draft history analytics
- `magiclike_settings_v1` — user display preferences (fonts, sizes, devtools flag)

Schema migrations live in the `RUN` module and run on load.

## Design backlog

The earlier in-code roadmap comment block has been removed as features shipped (tokens, modal spells, etc. are now implemented). Static Lords remain partially implemented: lords grant `staticBuffs` (stat changes) but not keywords — grep `cards/*/card.json` for `staticBuffs` to find them. Ask the user about current priorities before assuming what's next.

## Testing

Node-based regression suite under `tests/`. Run from `reference/html-proto/`:

```
node tests/run_all.js                       # 482 assertions, ~2s
node tests/selfplay_harness.js 500 bughunt  # AI vs AI, ~20s
npm install   # one-time, pulls the dev-only lint deps (node_modules git-ignored)
npm run lint                                 # ESLint + sonarjs bug-smell scan
```

`npm run lint` is dev-only static analysis (not part of the runtime — no build
step). Narrow, high-signal bug rules (`no-identical-expressions` = the `x || x`
catcher, duplicate conditions/branches, unreachable code); see
`eslint.config.js`. Treat a clean lint as part of "done" alongside green tests.

`tests/_setup.js` boots the engine in Node by stubbing the DOM and concatenating the JS modules in script-tag order. Coverage is engine-level (card synthesis, sticker application, target legality, trigger generation, AI burn lethal, modal helper). See `tests/README.md` for the file-by-file breakdown.

DOM/UI behavior isn't covered by the harness — verify those by:
1. Opening `magiclike_engine.html` directly in a browser (or visiting the GitHub Pages URL).
2. Watching the devtools console — uncaught errors are the strongest signal of regression.
3. Playing through at least one combat phase, one stack interaction, and one draft pick if those areas were touched.
4. For AI changes: play a full game and watch the AI log entries (orange `.cb` log lines) for nonsensical decisions.

Console hooks for analytics: `window.PICKLOG.summarize()`, `window.PICKLOG.getCardStats()`, `window.PICKLOG.getPairsMatrix()`.
