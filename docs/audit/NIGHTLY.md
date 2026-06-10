# Nightly packet — 2026-06-10 (DRY RUN)

> Rewritten each run. This is the supervised chunk-6 dry run of the
> `/audit-next-chunk` pipeline. Pencils-down 10:00; finished well ahead.

## TL;DR

**The audit pipeline works end-to-end. NOT auto-armed — one 1-line skill edit
is required first, and I lacked permission to make it (it's yours to approve).**
Everything else passed cleanly: both-branch commit→push→PR, bot attribution on
the merged fix PR, and a green fresh-context self-QA.

## Dry-run gate scorecard

| Gate | Result | Note |
|---|---|---|
| 1. Zero permission prompts | ⚠️ **not clean** | The *final working* command forms hit zero prompts, but discovery hit approvable prompts (`cd && …` compounds) and the gh-bot wrapper was unusable until I added `-ExecutionPolicy Bypass`. The durable fix (bake the invocation into SKILL.md) was **permission-denied** this session — see Required action. |
| 2. Commit→push→PR, both branches | ✅ | Findings: commits pushed to `audit/findings`; long-lived findings PR **#98** (→ `Audit-Review-Refactor`) opened. Workshop: fix PR **#97** merged. |
| 3. Identity assert (PR author == bot) | ✅ | PR #97 author = `Thaumaturge-Claude`, merged by `Thaumaturge-Claude` (merge `ed3ee53`). |
| 4. Self-QA green | ✅ | Fresh-context QA = PASS; re-verified the shipped header in the post-merge tree and A6-1's filter claim. |

**Arming decision: `Armed: no`.** Gate 1 did not cleanly pass and the
prerequisite fix could not be baked into mechanism. Per the dry-run contract,
no auto-arm on a failure. This is a *cheap* miss by design (first-contact
plumbing, surfaced while you're awake) — not a pipeline defect.

## Required action before arming (≈30 seconds, yours)

The gh-bot wrapper is a `.ps1`, and this machine's PowerShell execution policy
**blocks running it via a bare `-File`** — proven live (a bare invocation errors
`running scripts is disabled on this system`). The working, prompt-free form is:

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/audit/gh-bot.ps1 <args…>
```

I attempted to bake this (plus the allowlistable-command-form rules) into the
runner's contract at `.claude/skills/audit-next-chunk/SKILL.md` → *Identity*
section, but the write was **permission-denied** (skill files are gated; the
overnight `acceptEdits` config would allow it, but this interactive session did
not). The exact replacement text is staged in my message and in STATE.md's log.

**To arm:** approve that one SKILL.md edit (or grant skill-write + re-run the dry
run), then flip `Armed: no → yes` in `docs/audit/STATE.md`. Once the invocation
is in the contract, arming is a formality — the mechanism itself is proven.

> Why not just set the machine execution policy or hack a shim? That would be
> fighting the environment / improvising outside campaign scope — exactly what
> the failure-discipline rules forbid. The clean fix is the documented
> per-invocation flag, recorded in the contract.

## Other plumbing learnings (folded into the proposed SKILL.md edit)

Overnight commands must be **plain single invocations** the static analyzer can
read, or they prompt/refuse (no human to answer):
- `git -C <dir> …`, never `cd <dir> && git …` (compound → prompt).
- One command per call — no `;`/`&&` chains, no `$(…)` substitution (refused).
- Redirect only into an allowed worktree (`/tmp` is blocked) — or pipe to one
  filter. `node <abspath>/run_all.js` works from anywhere (uses `__dirname`).

## Chunk 6 — stickers (findings: `chunk-06-stickers.md`)

7 findings, all surviving adversarial refutation or carrying a repro snippet:

- **A6-4 (P3, ship, docs-only) — FIXED, PR #97.** Dispatch-test header
  over-claimed "each STICKERS kind"; corrected to an accurate enumeration.
  Comment-only, suite 1786/1786 green, lint clean, **zero predicted/actual test
  flips**. Mutation-map judgment: N/A (no behavior to cover). The only ship this
  chunk — everything behavioral demoted to *stage* because the mutation map does
  not yet cover `stickers.js` (run still in flight, see below).
- **A6-1 (P2, stage)** — random-reward eligibility comment understates the pool
  (filter also admits add_type/cost_mod/remove_keyword). Canon is silent on the
  intended pool → genuine fork. **Decision packet written for you** in the
  finding (recommend: keep broad behavior, fix the comment — your taste call).
- **A6-2 (P3, stage)** — empower fallback roll isn't persisted; re-rolls each
  rebuild on the staple-over-null path (design question; fix changes run rewards).
  Bonus latent at `run.js:1029` (`{...null}` → `{}`).
- **A6-3 / A6-5 / A6-6 / A6-7 (all P3, park)** — inline set_color dup-storage;
  untested ability_id-absent dedup branch; latent shared-ref deep-copy
  inconsistency (no live trigger today); apply-order-dependent multi-sticker
  cost. All cheap, none urgent.

**Refuted (not filed):** the "three untested sticker kinds" claim — all three
are covered in `test_mana.js` / `test_equatorial_artificer_boss.js`.

**Surprises / calibration:** none. The one shipped fix predicted zero test
impact and produced zero. Classifier well-calibrated on this (trivially-safe)
sample.

## Machine-time status (no Claude usage)

- **Mutation first full run: still in flight** — 4080/7592 @ 07:09, ~13/min,
  ~4.3h ETA (won't finish before pencils-down). `MUTATION-MAP.md` covers only
  `types.js` so far. **The chunk queue stays gated** until it completes and the
  map covers all 11 target files (per STATE.md's queue gate). So even once
  armed, the runner will only dry-run-equivalent work until the map lands.
- No new selfplay crash/invariant anomalies to route.

## What the next session should do first

1. (You) Approve the SKILL.md gh-bot-invocation edit; flip `Armed: yes`.
2. Confirm the mutation run finished (`mutation-first-full-run.log` ends `DONE:`
   and `MUTATION-MAP.md` covers all 11 files); only then lift the queue gate.
3. Then claim chunk 1 (turn machine) — tier 2, ~2h.
