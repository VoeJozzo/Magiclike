# Plan: html-proto comprehensive audit

*Agreed 2026-06-09 (grill-me interview, Joe + Fable). This doc is the contract for the audit campaign — overnight runner sessions execute against it cold.*

## Purpose

A comprehensive audit of the html-proto (`reference/html-proto/`, ~19.7k LOC across 17 JS modules + 258 card JSONs) to: (1) improve it generally, (2) remove bugs and latent future bugs, (3) make it a cleaner, more trustworthy spec for the eventual Godot port. The proto is the debt lab — debt gets found and paid here, before it metastasizes into the port.

## Scope decisions

- **html-proto only.** The Godot port is not audited (it isn't worth rebuilding yet; it gets re-derived from the cleaned proto later). A "Godot loose-ends scan" is parked as a separate maybe-someday project — see BACKLOG.
- **No port-impact tagging** on findings (considered, rejected: the port is far enough out that such tags would be stale guesses).
- **Two-phase: audit → remediation, never mixed.** The audit produces findings, not fixes. Exception: *trivial confirmed bugs* (typo'd predicate, `x || x`) are fixed inline when the fix is smaller than the writeup, batched into the chunk's commit and flagged in the PR.
- **Rolling anchor.** Each chunk audits `dev`'s tip as of when that chunk is claimed; every finding cites `file:line` @ that SHA. Joe's dev work continues mid-audit — except the two big structural refactors (`step()` phase-handler refactor, `engine.js` decomposition), which stay parked until the findings inform their seams.

## Audit dimensions (ranked)

1. **Rules correctness** — does the engine do what the game intends? Trigger ordering, SBA timing, combat edges, targeting legality, zone-change events. A proto rules bug becomes a *spec* bug for the port.
2. **Structural footguns** — patterns that breed future bugs: one fact maintained in N hand-synced places (the `makeCard` whitelist class), silent-failure paths, copy-paste divergence.
3. **Card-data conformance** — the 258 card JSONs: schema drift, dead fields, oracle-text-vs-behavior mismatches.
4. **Test-suite quality** — mutation-testing-backed (see below), hunting BOTH failure modes: **green theater** (under-assertion — the test can't fail; mutation scores catch this) and **brittleness** (over-assertion — the test is coupled to incidental implementation details and goes red under behavior-preserving refactors; only the judgment read-through catches this). The read-through classifies tests *behavioral* vs *implementation-coupled*; the brittle list feeds the parked refactors' planning, so their false-red walls are pre-identified as noise to rewrite against behavior — never appeased by "updating tests until they pass," which is how regressions get laundered into a suite.
5. **Test-coverage gaps** — per subsystem, note whether a finding there could even be *caught* today (known example: static-lord keyword grants have zero unit coverage).

**Out of scope:** performance, security, UI/render polish. UI code is examined only where it *masks engine bugs* (e.g. a render `catch` swallowing an engine exception).

**Dedupe rule:** anything already tracked in `reference/html-proto/BACKLOG.md` or `docs/DIVERGENCE.md` is cited, not re-filed — but the audit may *upgrade* an existing item ("this deferred wart is live, here's the repro").

## Chunk queue

Priority-ordered, stop-after-any semantics. A session/run consumes chunks greedily until budget stops it. Ordering is value-if-we-stop-here: if the campaign dies after chunk 4, the rules core — what the port inherits most directly — is done.

| # | Chunk | Contents | Tier |
|---|---|---|---|
| 1 | Turn machine / phases / mana / state | `engine.js` `step()` region (interleaved — can't split cheaply) | 2 |
| 2 | Combat | attack/block/damage, combat keywords | 2 |
| 3 | Stack / priority / trigger resolution | trigger pool, `triggers.js`, `trigger-generator.js` | 2 |
| 4 | Effects dispatch + targeting legality | ~25 effect kinds, targeting | 2 |
| 5 | Synthesis / staple | `engine.js` splice region | 1 |
| 6 | Stickers pipeline | `stickers.js` | 1 |
| 7 | AI | `ai.js` — decision logic, combat sim | 1 |
| 8 | Draft | `draft.js` | 1 |
| 9 | Run / meta / picklog | `run.js` (save/load migrations!), `picklog.js` | 1 |
| 10 | Card-text generation | `card-text.js` | 1 |
| 11 | Card-data JSON sweep | 258 card JSONs vs schema + behavior | 3 |

(Mutation-testing setup was originally queue position 5; it moved into Phase 0 because the ship gate depends on the coverage map — until mutation scores exist, every fix demotes to *stage* by default, so the map must exist before chunk 1 runs.)

Chunk boundaries follow context boundaries: split wherever the code's own seams allow (separate files), combine only what's textually entangled (mana woven through phases; triggers woven through stack).

**Dry run:** before the queue runs in earnest, the runner pipeline is shaken out on a *small, low-stakes* chunk (6, stickers) so pipeline bugs don't burn the big chunks' budget. Then the queue proceeds in priority order.

## Execution tiers

- **Tier 1 (default):** single deep-read in full context + **one adversarial-verification subagent per suspected bug** — fresh context, told "here's a claimed bug, try to refute it." Nothing is filed without surviving refutation or a reproducing snippet.
- **Tier 2 (rules core, chunks 1–4):** multi-agent Workflow fan-out — several finders with different lenses (rules correctness, footguns, state-mutation discipline) sweep the chunk in parallel; findings dedupe; then the same adversarial verify. **Joe has explicitly authorized multi-agent workflows for audit sessions** (2026-06-09): "Yes, multi-agent work is authorized. Use the tools you need in order to do this well."
- **Tier 3 (mechanical):** off-Max where possible — OpenCode/Gemma delegation for the JSON sweep (per the opencode-delegation skill rubric), unattended machine time for mutation runs and selfplay bughunt sweeps.
- **Model:** Fable for chunk judgment work (part of the campaign's motivation is using Fable while available). Cheap models only for tier-3 mechanical work.
- **Test-quality interpretation** is cross-cutting: mutation scores are produced unattended; each chunk session interprets the scores for its own subsystem.

## Findings format

Findings live in **`docs/audit/`** — one file per chunk (`chunk-NN-<slug>.md`) plus `INDEX.md` (consolidated triage table). Each finding:

- **ID** (`A<chunk>-<n>`, e.g. `A3-2`), **location** (`file:line` @ observed SHA), **dimension**, **severity**
- **Severity scale:** P0 live bug actively corrupting games / P1 bug / P2 latent footgun / P3 cleanliness
- **Evidence** — repro snippet or reasoning; **suggested fix sketch**; **rough effort**
- **Verification status:** *survived adversarial refutation* or *reproduced by test snippet*
- **Remediation class:** *ship* / *stage* / *park* (see the autonomy ladder below)

**Repro tests do NOT land in the suite during the audit** (a committed failing test breaks dev's green suite). The repro lives as a snippet in the finding; the real test lands *with the fix* in remediation, red→green in one PR.

## Autonomy design (overnight runs)

Overnight is the **default execution mode** — usage stretches further at low server load (Joe-confirmed; auction-like dynamic), and runs consume windows that would otherwise idle.

- **`/audit-next-chunk` runner** (project skill, built in Phase 0): read `docs/audit/STATE.md` → claim next chunk (record dev-tip anchor SHA) → execute at the chunk's tier → write findings file → **self-QA gate** → commit to the audit branch → update STATE.md → loop to next chunk. Runs greedily until the queue or the usage budget is exhausted.
- **Self-QA gate:** after each chunk, a fresh-context pass validates the findings file — schema-complete, evidence actually reproduces, deduped against BACKLOG/DIVERGENCE, severity sane — before the chunk is marked done.
- **Scheduling:** Windows Task Scheduler fires headless `claude -p "/audit-next-chunk"` hourly through the night window. Each invocation is **idempotent**: resume in-progress chunk, claim next, or exit fast if nothing to do / no budget. Hitting the usage wall just means a later invocation resumes after the window resets. (A stale `in_progress` claim older than ~12h is treated as crashed and re-run; chunk runs are idempotent — the findings file is simply rewritten.)
- **Branch/PR flow:** long-lived `audit/findings` branch; findings accumulate commit-by-commit; one PR to dev grows as chunks land. Joe reviews **asynchronously** — morning review never gates overnight progress; branch protection (PR + CODEOWNERS) already guarantees nothing merges without him.
- **P0 escape hatch:** an overnight run never decides — it stamps the P0 at the top of the PR and fires a push notification.
- **Free tier runs nightly regardless:** mutation testing + AI-selfplay bughunt sweeps are pure machine time, no Claude usage.

### Remediation autonomy ladder

Joe's rule (2026-06-09): *"anything with a single, unambiguous, correct answer should be something you just fix… if the only thing I would reasonably do is say 'yep, ship it', then ship it."* Every verified finding is stamped with a class:

- **Ship it — fix autonomously, no size limit.** Gates (ALL must hold): single unambiguous correct answer, anchored in **repo canon** (rulebook page in `docs/wiki/rules/`, the card's oracle text, `docs/PROTOCOL.md`, or an existing test's stated expectation — NOT "that's how real MTG works"; the proto diverges deliberately); finding survived adversarial refutation with a reproducing test; fix lands red→green with full suite + lint green; **the touched region's coverage is real** (per mutation scores) — in weakly-tested regions the fix must bring its own regression coverage, or it demotes to *stage*; **and the fix modifies NO existing test's expectations.** A red existing test is a claim that behavior changed — adjudicating intended-change vs brittle-test vs real-regression is exactly the ambiguity the ship class excludes, so needing to touch an existing test auto-demotes to *stage* (adding new tests is fine; that's the red→green requirement itself). Each ship lands as its own small PR off fresh dev. Branch protection still gates every merge on Joe — "autonomous" means autonomous *labor*, never autonomous *merging*.
- **Stage it — draft, don't ship.** Any genuine fork (two reasonable behaviors, taste call, tradeoff), or unambiguous-but-uncovered per above. The patch is drafted and embedded in the finding; it becomes a PR only after Joe's nod (morning review or triage).
- **Park it — triage only.** Refactor-scale, cross-cutting, or design-flavored.

**Calibration:** for the dry-run chunk and the first real chunk, even ship-class items are only staged. Joe's first morning reviews confirm the classifier matches his taste before autonomous shipping switches on.

**Nightly ordering:** ship-class fixes from already-reviewed chunks run first (small, perishable — they rot into merge conflicts as dev moves — and they clean the code later chunks read), then the run resumes the chunk queue. Fix PRs are separate from the `audit/findings` docs branch: findings PRs stay reviewable as documents, fix PRs as code.

### Phase 0 setup checklist (one short interactive session)

1. Create `docs/audit/` + `STATE.md` skeleton (queue table: chunk, status todo/in_progress/done, claim timestamp, anchor SHA, findings link).
2. **Stand up mutation testing** (Stryker or a hand-rolled mutant runner against `tests/run_all.js`) and kick off the first full run — the coverage map must exist before chunk 1, because the ship gate reads it. Schedule nightly mutation + selfplay sweeps (pure machine time).
3. Write the `/audit-next-chunk` project skill encoding the runner loop above.
4. Pre-authorize the audit worktree's permission allowlist so unattended runs never stall on a prompt.
5. Create the Task Scheduler entry (night window, hourly).
6. Dry-run on chunk 6 (stickers) while watching; judge artifact quality next morning before unleashing the queue.

## Remediation phase

- **Triage session** when the queue finishes (or whenever Joe says "enough"): consolidated table sorted by severity × effort; **Joe picks** what gets fixed and in what order. The audit produces options, not a self-executing to-do list. By triage time, ship-class items are largely already fixed (autonomy ladder above) — triage consumes the *stage* and *park* classes.
- **P0s** surface immediately (see escape hatch), not at end-of-audit.
- **Trivial fixes** (smaller than their writeup) were fixed inline during audit — the narrow precursor of the ship class; they never reach triage.
- **The two parked refactors** (`step()`, `engine.js` decomposition) get re-planned *against* the findings at triage — by then the decomposition seams are known.
- Remediation items run as normal work sessions (worktree → PR to dev), with the red→green repro test landing alongside each fix.

## Status

- [ ] Phase 0 setup
- [ ] Dry run (chunk 7)
- [ ] Queue execution (tracked live in `docs/audit/STATE.md` once it exists)
- [ ] Triage
- [ ] Remediation (separate planning at triage)
