---
name: gemma-delegate
description: >-
  Delegate bounded, mechanical, cheaply-verifiable grunt work to Gemma 4 (Google
  Generative Language API) to save Claude tokens — the "manager / intern" pattern.
  Use for LOC/count audits, manifest regeneration, doc sweeps, find/replace,
  boilerplate or template expansion, art-prompt drafting, comment/changelog
  condensing. Claude scopes the task and VERIFIES the result; Gemma drafts it.
  Do NOT use for rules/engine-logic correctness, cross-file architecture, or any
  task where verifying the output is as hard as producing it.
---

# Gemma delegation (manager / intern pattern)

A cheap model (Gemma 4, free tier) does the grunt work; Claude orchestrates and
**verifies**. The whole game is leverage:

> **Only delegate work where verifying the result is cheaper than producing it.**

If checking Gemma's output costs about as much as doing the task yourself, there's
no leverage — keep it.

## Setup (already wired in this repo)

- **Secrets:** `~/.config/magiclike/secrets.env` (outside the repo, perms `600`) holds
  `GEMINI_API_KEY` and `GH_PAT_GEMMA`. `source` it; reference the env vars. **Never
  print the values, never write them into a tracked file, never commit them.**
- **Provider:** Google Generative Language API (the key is a valid `AQ.`-prefixed
  AI Studio key — it authenticates via the `?key=` query param, no OAuth).
- **Models on the key:**
  - `gemma-4-31b-it` — primary delegate (the "Gemma 4 31B IT" used in PR #39).
  - `gemma-4-26b-a4b-it` — lighter/faster alt.
  - `gemini-2.5-flash` — smarter fallback; follows "output only X" more cleanly.
- **Gemma's GitHub identity** for delegated commits: bot account `Thaumaturge-Gemma`,
  email `ThaumaturgeDev@gmail.com` (a low-privilege scratchpad). Author each commit with
  `git -c user.name="Thaumaturge-Gemma" -c user.email="ThaumaturgeDev@gmail.com" commit …`
  (no secret needed). Push using `GH_PAT_GEMMA`. **Never set this globally** or your own
  commits get mislabeled. Full branch→push→PR recipe in the "Delegated git workflow"
  section below.

## Call Gemma

```bash
source ~/.config/magiclike/secrets.env
curl -s --max-time 60 \
  "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"<PROMPT>"}]}],"generationConfig":{"temperature":0}}'
```

Parse the **last** text part, not the first:
`jq -r '.candidates[0].content.parts[-1].text'`. Gemma 4 emits a reasoning preamble
before its answer (the first part is its thinking), so grabbing the first `text`
gives you `"The user wants a specific response: …"` instead of the result.

## Prompt rules (make output cheap to verify)

1. **Tight scope** — one file / one transform per call.
2. **"Output ONLY <X>. No preamble, no explanation, no markdown fences."** Gemma narrates by default.
3. **"Re-derive every value; do not trust existing numbers."** (Its PR #39 misses were on lines it left untouched.)
4. **Few-shot it** — one concrete before/after beats abstract instructions for a small model.
5. **temperature 0** for deterministic mechanical work.

## Verify like a manager — assert, don't read

Turn review into a deterministic check, not an eyeball pass. Example (the PR #39 LOC
audit): for each number Gemma claimed, run `git show <ref>:<file> | wc -l` and compare,
printing `*** MISMATCH` on any diff. You run an assertion; you never "read" the output.
If a task can't be reduced to a mechanical check, it's the wrong task to delegate.

## The loop

1. **You** scope a bounded task + write the verification script.
2. **Gemma** drafts it (on a branch; commits authored as `Thaumaturge-Gemma`).
3. **You** run the assertion.
4. **You** patch the few misses + merge.

Iterate Gemma's *prompt* freely (it's free). Design tasks so *you* touch the result
once (you're the expensive part).

## Good tasks / bad tasks

**GOOD** (high reliability, near-free to verify): LOC & file-map updates, manifest
regeneration, find/replace sweeps, table reformatting, boilerplate/scaffold expansion,
art-prompt drafting, comment/changelog condensing.

**BAD** (expensive to verify = no leverage): game-rules / engine-logic correctness,
cross-file architectural judgment, anything where a subtle error passes a glance,
anything where verifying ≈ redoing.

## Delegated git workflow (fork → cross-fork PR)

`Thaumaturge-Gemma` has **read-only** access to `VoeJozzo/Magiclike` (verified:
`push:false`, `pull:true`) — it **cannot** push branches to the upstream repo. So it
contributes the standard way: push to its **own fork**, open a **cross-fork PR** into
`VoeJozzo:dev`, and you or Joe review + merge.

```bash
source ~/.config/magiclike/secrets.env
BOT=Thaumaturge-Gemma; UP=VoeJozzo/Magiclike; AUTH="Authorization: Bearer $GH_PAT_GEMMA"

# 0. One-time: create the fork (idempotent — 202 if new, 200/exists otherwise)
curl -s -X POST -H "$AUTH" "https://api.github.com/repos/$UP/forks" >/dev/null

# 1. Branch off the latest UPSTREAM dev (not the fork, which may lag)
git fetch origin && git checkout -B <task-branch> origin/dev

# 2. Apply Gemma's output to files, then commit AS the bot
git -c user.name="$BOT" -c user.email="ThaumaturgeDev@gmail.com" commit -am "<summary>"

# 3. Push to the BOT'S FORK (never upstream — that 403s)
git push "https://$BOT:$GH_PAT_GEMMA@github.com/$BOT/Magiclike.git" HEAD:<task-branch>

# 4. Open the cross-fork PR into VoeJozzo:dev
curl -s -X POST -H "$AUTH" "https://api.github.com/repos/$UP/pulls" \
  -d '{"title":"<title>","head":"'"$BOT"':<task-branch>","base":"dev","body":"<body>"}'
```

Then a human reviews and merges. Notes:
- Push uploads the branch's commits to the fork even if the fork's `dev` lags — fine.
- The PAT only ever lives in `$GH_PAT_GEMMA`; never echo it or put it in a tracked file.
- Authorship (`user.name`/`user.email`) is per-command — **never** `git config --global` it,
  or your own commits get mislabeled as the bot.

## Safety

- The repo is **public** (GitHub Pages serves from `dev`) — treat every tracked file
  as world-readable.
- A `github_pat_…` committed to a public repo is **auto-revoked by GitHub within
  minutes** — keep the PAT in `secrets.env`, never in the tree.
- Secrets are env vars only. When testing, print a key's *length/prefix*, never its value.

## Known environment gotcha

This Windows / git-bash shell has shown a severe **stdout-buffering bug**: commands
execute correctly but their output flushes late, in large batches. Each delegation's
`curl` may stutter — write results to a file and read the file. A session restart
clears it. (Wiring this channel up was expensive almost entirely because of this; the
steady-state "one curl + one assertion" cost is small.)
