---
name: audit-next-chunk
description: Overnight audit-campaign runner for the html-proto comprehensive audit. Invoked headlessly by the scheduled wrapper as "/audit-next-chunk pencils-down=<ISO>" (or manually, optionally with "dry-run"). Claims the next chunk from docs/audit/STATE.md, executes it at its tier, writes a findings file, ships ship-class fixes to the workshop, self-QAs, commits, and loops until the queue, the budget, or the deadline stops it. Contract: docs/plans/plan-proto-audit.md.
---

# /audit-next-chunk — campaign runner

You are the overnight runner for the html-proto audit campaign. The plan at
`docs/plans/plan-proto-audit.md` is the **contract** — read it before your
first chunk each session. This skill is the operational checklist; where they
disagree, the plan wins (unless STATE.md records a Joe-approved adaptation,
which wins over both).

**You are a thin orchestrator.** Subagents do ALL deep reading; you hold
summaries, route work, and write control files. If you catch yourself reading
a 500-line engine region in main context, stop and delegate.

## Geography

| Thing | Where |
|---|---|
| Campaign trunk (Joe's grant: Claude-owned autonomous space) | branch `Audit-Review-Refactor` |
| Findings branch (docs ONLY — never code) | `audit/findings`, worktree `C:\Users\Joe\Documents\magiclike-audit\findings` (you run here) |
| Workshop (code fixes) | `audit/integration`, worktree `C:\Users\Joe\Documents\magiclike-audit\workshop` |
| Control file / queue | `docs/audit/STATE.md` (findings worktree) |
| Findings files + INDEX + NIGHTLY | `docs/audit/` (findings branch) |
| Mutation map | `C:\Users\Joe\.config\magiclike\audit\mutation\{results.json,MUTATION-MAP.md}` |
| Selfplay sweep logs | `C:\Users\Joe\.config\magiclike\audit\logs\selfplay_<date>.log` |
| Your session logs (wrapper-made) | `C:\Users\Joe\.config\magiclike\audit\logs\` |

Branch flow (adapted 2026-06-10, recorded in STATE.md): fix PRs target
`audit/integration` and you merge them yourself on green. Findings commits go
directly on `audit/findings`; maintain ONE long-lived PR
`audit/findings` → `Audit-Review-Refactor` as the reviewable document.
**Nothing targets `dev`. Ever.** The campaign exits to dev once, at the end,
through Joe's ultimate review.

## Identity — mechanism, not memory

- Pushes from both campaign worktrees are already promptless and
  bot-attributed (worktree-scoped keyring credential helper; see
  `docs/IDENTITIES.md` → Push/PR flow).
- EVERY `gh` API write (pr create/comment/merge/review, api) goes through the
  wrapper (it prefixes `GH_TOKEN` from `gh auth token --user
  Thaumaturge-Claude`). The ONE canonical invocation form — this machine's
  execution policy blocks a bare `-File` call (learned in the 2026-06-10 dry
  run; this exact form delivered PRs #97/#98 promptlessly):
  ```
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/audit/gh-bot.ps1 <args…>
  ```
  Never call bare `gh pr create` — it posts as the OWNER's account. Never
  invoke gh-bot.ps1 any other way.
- After opening a PR, verify attribution once per session:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/audit/gh-bot.ps1 pr view <n> --json author --jq .author.login`
  must print `Thaumaturge-Claude`.

## The loop

Parse args first: `pencils-down=<ISO>` (treat missing deadline as "next
06:30 local" when between 23:00–07:00, else 3h from now); `dry-run` (see
Dry run section).

### 0. Orient (once per session)

1. `git -C <findings> pull --ff-only`; same for workshop. Read `STATE.md`.
2. If `Armed: no` and not a dry-run invocation → log "not armed" and exit 0.
3. Read the plan doc. Read `MUTATION-MAP.md` summary table (not the hole
   lists — pull those per-region later).
4. Check the latest selfplay log for crashes/invariant violations — any new
   anomaly becomes a candidate finding routed to whichever chunk owns that
   subsystem (note it in STATE.md's Log if that chunk is already done).

### 1. Claim

1. Pick work: any `in_progress` chunk claimed >12h ago with no live lock →
   re-claim (rewrite its findings file wholesale — chunk runs are
   idempotent). Else topmost `todo` in the queue table. None → write
   NIGHTLY.md ("queue empty"), exit 0.
2. **Size against the deadline.** Tier-2 chunks need ~2h, tier-1 ~1h,
   chunk 11 ~1.5h. If remaining time < estimate, claim nothing: finalize
   NIGHTLY.md and exit. Pencils-down means STOP WRITING by the deadline —
   the morning packet must be complete, not the queue.
3. Workshop prep: in the workshop worktree, `git fetch origin` then merge
   `origin/dev` into `audit/integration` (commit the merge; on conflict
   prefer dev's side for Joe-authored files, ours for `tools/audit/` +
   `docs/audit/`; if a conflict is substantive, abort the merge, note it in
   NIGHTLY.md, and anchor on the un-merged workshop tip instead). Push.
4. Record the claim in STATE.md: `in_progress`, ISO timestamp, anchor SHA =
   workshop tip (`git -C <workshop> rev-parse HEAD`). Commit STATE.md to
   `audit/findings`, push. The claim is what makes the hourly boops
   idempotent — later boops see it plus the lockfile and don't double-work.

### 2. Execute the chunk at its tier

Common to all tiers — every finder subagent prompt must include:
- the chunk's file/region list and the anchor SHA;
- the audit dimensions (plan §"Audit dimensions") it's hunting;
- the canon set: rulebook pages `docs/wiki/rules/`, card oracle text,
  `docs/PROTOCOL.md`, existing tests' stated expectations. NOT "real MTG";
- the dedupe list: relevant entries from `reference/html-proto/BACKLOG.md`,
  `docs/DIVERGENCE.md`, and findings files of DONE chunks (cite, don't
  re-file; upgrades allowed);
- the instruction to return findings as structured data (location, claim,
  evidence, severity guess) and to report **coverage**: which files/line
  ranges it actually read.

**Tier 1** (chunks 5–10): one deep-read subagent over the chunk in full
context, then **one adversarial-verification subagent per suspected bug** —
fresh context, told "here is a claimed bug; try to REFUTE it." Nothing is
filed without surviving refutation or carrying a reproducing snippet.

**Tier 2** (chunks 1–4): use the Workflow tool — 3–4 finder agents with
different lenses (rules correctness vs canon; structural footguns +
comment-vs-code contradictions; state-mutation discipline; test-quality for
this subsystem) → dedupe in plain code → adversarial verify each finding
(refuter default-skeptical). Joe pre-authorized multi-agent workflows
(2026-06-09).

**Tier 3** (chunk 11): bulk JSON conformance sweep on cheap Claude models
(Haiku agents batched over the 258 card folders; Sonnet for
contextual-but-mechanical passes). Verify anomalies with one Fable-tier
judge pass before filing.

**Test-quality interpretation** (cross-cutting): read the mutation map for
this chunk's files; classify weakly-covered regions; classify the chunk's
tests behavioral vs implementation-coupled. Both feed the findings file's
test-quality section.

### 3. Write the findings file

`docs/audit/chunk-NN-<slug>.md` on `audit/findings`, exactly the plan's
findings format: ID `A<chunk>-<n>`, location `file:line @ <anchor SHA>`,
dimension, severity P0–P3, evidence, fix sketch, effort, verification
status, remediation class, **predicted test impact** (each expected flip
with canon-cited X→Y adjudication), and for ship-class the **written
mutation-map judgment** (what the map says about the touched region, why
shipping is safe). Plus a **Coverage** section: files/line-ranges actually
read by the finders, and what was NOT read. No silent caps.

### 4. Remediate (ship class + trivia only)

Order within the night: ship-class fixes FIRST, then continue the queue —
later chunks must read already-fixed code.

For each ship-class finding (gates per plan — ALL must hold: unambiguous
single answer, repo-canon anchored, survived refutation, red→green repro
test landing WITH the fix, real coverage per the mutation map (or the fix
brings its own regression coverage — else demote to stage), pre-declared
test impact):

1. Branch `audit/fix-A<chunk>-<n>` off the workshop tip (in the workshop
   worktree).
2. Land the repro test red → fix → green. Run the FULL suite
   (`node tests/run_all.js` — read the real summary line) + `npm run lint`.
3. **Surprise red?** (any test the finding didn't predict): hand it to a
   fresh-context judge subagent (you never grade your own surprise) for
   canon-cited adjudication — intended-change / brittle-test / regression.
   Confident verdict → proceed with a mandatory top-of-PR disclosure
   (which test, what surprised, adjudication + confidence). Unsure or
   regression → demote to stage, revert the fix branch. Either way log it
   in NIGHTLY.md as a calibration datum. Declared flips: flip only — never
   delete or weaken an assertion.
4. PR → `audit/integration` via the canonical gh-bot invocation (see
   Identity above; body: finding ID, evidence, suite count you SAW, mutation
   judgment, disclosures). Robot-merge it (`… gh-bot.ps1 pr merge <n>
   --merge`). Verify author attribution.
5. html-proto convention: bump `js/main.js` VERSION + CHANGELOG.md entry
   when js/ files change (tests-only changes don't bump).

**Trivia** (fix smaller than the writeup — typo'd predicate, `x || x`):
batch the chunk's trivia into ONE small `audit/fix-chunkNN-trivia` PR into
the workshop, same green gates. Note each in the findings file as a line
item ("fixed inline, PR #n"), not a full finding.

**Stage class:** draft the patch INSIDE the finding as a plain-English
decision packet (what/why, options, recommendation + confidence) written
for a non-coder. No branch, no PR, until Joe's nod.

**Park class:** triage-table entry only.

**P0 escape hatch:** a P0 never waits and never self-decides — stamp it at
the top of the findings PR body + NIGHTLY.md and fire a push notification
immediately.

### 5. Self-QA gate (fresh context, before marking done)

Spawn a fresh-context subagent over the findings file: schema-complete?
evidence actually reproduces (it should re-run at least one repro)?
deduped against BACKLOG/DIVERGENCE/earlier chunks? severities sane?
ship-class judgments written and defensible? coverage section present?
Fix what it flags; re-run if the fixes were substantive. Only then mark the
chunk `done` in STATE.md (+ findings link), rebuild INDEX.md's triage table,
commit, push.

### 6. Morning packet + loop

After each chunk: update `docs/audit/NIGHTLY.md` (rewritten per night —
chunks done, fixes shipped w/ PR links, items staged, surprises +
calibration data, anomalies, what the next night should do first), refresh
the findings PR body (create the PR on first chunk if absent), then **loop
to step 1** for the next chunk. On any exit path, NIGHTLY.md must reflect
reality as of pencils-down; best-effort push notification with a one-line
summary (failure is fine — the PR has everything).

## Dry run (`/audit-next-chunk dry-run`)

Run chunk 6 (stickers) through the ENTIRE loop above regardless of the
Armed flag, then assert the hard mechanical gates:
1. zero permission prompts hit (a headless run can't answer one — any
   prompt = fail);
2. full commit → push → PR cycle completed on both branches;
3. identity assert: findings PR + any fix PR author == `Thaumaturge-Claude`;
4. self-QA green on the findings artifact.

ALL pass → set `Armed: yes` in STATE.md, commit, push, and say so loudly
(this is "Just Say Go" — no human switch). Any failure → leave `Armed: no`
and write a failure report into NIGHTLY.md.

## Failure discipline

- Usage wall mid-chunk: just stop — the claim + idempotent re-run handle it.
- Don't fight the environment: a broken mechanism (auth, merge conflict you
  can't safely resolve, repeated tool failure) gets logged to NIGHTLY.md and
  the chunk released back to `todo`; never improvise one-off credential
  commands (they can't pass the allowlist and they mis-attribute work).
- Never commit code to `audit/findings`; never push to `dev` or `main`;
  never edit Joe's files outside the campaign's scope.
- Copy facts, don't recall them: every count/SHA/PR number written into
  STATE.md, NIGHTLY.md, findings, or PR bodies must come from tool output
  you saw this session.
