---
name: gemma-delegate
description: >-
  Delegate grunt work to a free Google model (Gemma 4 / Gemini) to save Claude
  tokens — the "manager / intern" pattern. TWO access paths (see "Two ways to
  reach Gemma"): the bare API (text-in/text-out, for generation you then apply)
  and the OpenCode CLI (`opencode run`, a FULL TOOL-USING AGENT that reads/edits/
  greps/commits itself). Use for LOC/count audits, manifest regeneration, doc
  sweeps, find/replace, reorg, boilerplate/template expansion, art-prompt drafting,
  comment/changelog condensing. Claude scopes + VERIFIES; Gemma executes.
  Do NOT use for rules/engine-logic correctness, cross-file architecture, or any
  task where verifying the output is as hard as producing it.
---

# Gemma delegation (manager / intern pattern)

A cheap model (Gemma 4, free tier) does the grunt work; Claude orchestrates and
**verifies**. The whole game is leverage:

> **Only delegate work where verifying the result is cheaper than producing it.**

If checking Gemma's output costs about as much as doing the task yourself, there's
no leverage — keep it.

## Two ways to reach Gemma (this is the most important section)

There are **two distinct access paths**, and they have very different power. A claim
true for one is often false for the other — do not conflate them (an earlier version of
this skill did, and was wrong for two turns).

1. **Bare API** (`curl` to `generativelanguage.googleapis.com`). Text-in / text-out, NO
   tools. The model can only *generate text*; YOU apply it to files and do all the
   git/search/verify. Good for "generate this prose, I'll place it." This is the path the
   "Call Gemma" / "Delegated git workflow" sections below describe.

2. **OpenCode CLI** (`opencode run`). A **full tool-using agent** — it reads, greps,
   edits, and runs git *itself*, in the repo, autonomously. Installed at
   `C:/Users/Joe/AppData/Roaming/npm/opencode` (v1.15+; `npm i -g opencode-ai`). It
   **shares the same Google auth** (`~/.local/share/opencode/auth.json`) — no separate key.
   This is the path that makes Gemma a real *worker*, not just a text generator.

   ```bash
   # headless agentic run — Gemma edits the repo herself
   opencode run --model google/gemma-4-31b-it "Use your tools to <task>. Commit on a
     branch as Thaumaturge-Gemma and open a PR." 2>&1
   # models: opencode models | grep google ;  auth: opencode auth list
   ```

   **VERIFIED (2026-06-01):** `gemma-4-31b-it` via `opencode run` called the `read` tool
   on a file and returned the correct contents — it IS agentic, despite being the free
   ~1500/day tier. (Gemini Flash models are also agentic but ~20/day each.) Do NOT claim a
   model "can't use tools" from one timeout — Gemma is SLOW (~3–4 min/agentic run); give it
   180–240s+ before concluding anything. Capability claims need the same evidence discipline
   as numeric claims: verify, don't infer from a single negative.

   **Output channel = git/PR, NOT stdout.** OpenCode's final answer does NOT pipe cleanly
   to stdout on this Windows shell. That's fine and BY DESIGN: real work comes back as a
   **Gemma-authored commit + PR** (read via `gh`/`git`), which is exactly why Thaumaturge-
   Gemma has a GitHub identity. For the rare time you need her raw text reply, read it back
   via `opencode export <session-id>` (find the id with `opencode session list`), not the pipe.

**Which path for what:** generation-only work you'll apply yourself → bare API. Anything
where Gemma should *do the work in the repo* (sweeps, reorg, multi-file edits, "open a PR
that does X") → OpenCode CLI (the agent). When in doubt, the CLI is the more capable tool.

**Reality check — does delegation actually pay HERE?** Spinning up a Gemma call has
real overhead (write a script, round-trip the API, parse, debug the Windows transport
quirks below). It only nets out when the task is **voluminous** (dozens of files/edits)
or needs **natural-language generation at volume** (rewrite N oracle blurbs, draft N art
prompts). For a handful of trivial edits — e.g. swapping 3 numbers — just use `Edit`
directly; delegating is *net more work* (measured: a 3-line CLAUDE.md fix took far longer
via Gemma than 3 Edits would have). And note: deterministic find/verify (`grep`, `wc -l`,
JSON parse) is NOT Gemma's job — see "What is actually Gemma's job" below. Delegate the
**generation**, not the **search**.

## Setup (already wired in this repo)

- **Secrets — where to find what you need.** Everything lives in ONE file, outside
  the repo so it can never be committed:
  `~/.config/magiclike/secrets.env` (Windows: `C:/Users/Joe/.config/magiclike/secrets.env`), perms `600`.
  It defines exactly two env vars:
  - `GEMINI_API_KEY` — the Google AI Studio key (`AQ.`-prefixed). Authenticates the
    model calls via the `?key=` query param (no OAuth).
  - `GH_PAT_GEMMA` — a **classic** GitHub PAT (`ghp_`-prefixed, `repo` scope) for the
    `Thaumaturge-Gemma` bot. Used only for fork/push/PR.

  To use them: `source ~/.config/magiclike/secrets.env`, then reference `$GEMINI_API_KEY`
  / `$GH_PAT_GEMMA`. **Never print the values, never write them into a tracked file,
  never commit them.** When a command must echo (e.g. a push URL), pipe it through
  `sed "s#$GH_PAT_GEMMA#***#g"` first.

  **If `secrets.env` is missing (fresh machine):** keys do NOT travel via git — that's
  intentional (the repo is public). Recreate the file by hand:
  ```bash
  mkdir -p ~/.config/magiclike && umask 077
  cat > ~/.config/magiclike/secrets.env <<'EOF'
  export GEMINI_API_KEY='<paste AI Studio key>'
  export GH_PAT_GEMMA='<paste classic repo-scoped PAT>'
  EOF
  chmod 600 ~/.config/magiclike/secrets.env
  ```
  Source the keys from a password manager or paste them out-of-band — not from any
  repo file or chat log. (For CI/Codespaces instead of local, use encrypted GitHub
  Actions/Codespaces secrets, not this file.)
- **Models on the key + routing policy.** Free tier; the binding limit is **RPD
  (requests/day)**. Route by it:
  | Model id | RPD | Use for |
  |---|---:|---|
  | `gemma-4-31b-it` | ~1500 | **DEFAULT.** All bulk/mechanical work — counts, sweeps, reformatting, expansion. Effectively unmetered. |
  | `gemma-4-26b-a4b-it` | ~1500 | Lighter/faster alt of the default. |
  | `gemini-3.5-flash` | ~20 | **Judgment tasks** — anything needing reasoning/attribution (e.g. "is this Done, and at which version?"). |
  | `gemini-3-flash` | ~20 | Judgment alt. |
  | `gemini-2.5-flash` | ~20 | Judgment alt; follows "output only X" cleanly. |

  The ~20 RPD is **per Flash model** (≈60 judgment reqs/day total), not shared.
  **Rule:** default to Gemma 4 31B; escalate to a Gemini-Flash ONLY when the task
  needs judgment, not just transformation. Mis-routing is what made PR #40 bad:
  a version-attribution task (judgment) was run on a plain model and it fabricated
  version numbers. Counts→Gemma; "which version / is this true"→Flash.
- **Gemma's GitHub identity** for delegated commits: bot account `Thaumaturge-Gemma`,
  email **`ThaumaturgeDevs@gmail.com`** (note the **`s`** — a typo'd `ThaumaturgeDev@gmail.com`
  was used for several early commits and left them showing as UNLINKED on GitHub, because the
  email must EXACTLY match a verified address on the bot account to link). Author each commit with
  `git -c user.name="Thaumaturge-Gemma" -c user.email="ThaumaturgeDevs@gmail.com" commit …`
  (no secret needed). Push using `GH_PAT_GEMMA`. **Never set this globally** or your own
  commits get mislabeled. If a commit shows UNLINKED, the email doesn't match the bot's verified
  one — re-author (`commit --amend --author=...`) + force-push the branch; GitHub re-links live.
  Full branch→push→PR recipe in the "Delegated git workflow" section below.

## Call Gemma

```bash
source ~/.config/magiclike/secrets.env
curl -s -o C:/Users/Joe/gemma_resp.json -w '%{http_code}' --max-time 90 \
  "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"<PROMPT>"}]}],"generationConfig":{"temperature":0}}'
```

**Windows/git-bash transport rules (learned the hard way — do not deviate):**
- Pass the JSON body **inline with `-d '{...}'`**. `-d @file` and `--data-binary @-`
  both FAIL: the native `curl.exe` can't resolve git-bash's msys `/tmp` paths and sends
  an empty body (`http_code=000` / 0-byte response).
- Single-quote the inline payload. Safe as long as the text has no single quotes; if it
  might, build the JSON with python (`miniconda3/python`) writing to a `C:/...` path,
  then inline it — still never `@file`.
- Write the response to a **`C:/Users/...` path**, not `/tmp` (native tools resolve `/tmp`
  as `C:\tmp`, which doesn't exist). Read/parse it with `miniconda3/python` (there is no
  `jq` here).
- Python `urllib`/`requests` to the API has timed out in this shell — prefer `curl` for
  the network call, python only for build + parse.

Parse the **last** text part, not the first — Gemma 4 emits a reasoning preamble
(part 0 is its thinking), so the first `text` is `"The user wants a specific response: …"`.
Also **capture `usageMetadata`** every call — it's how you know what the delegate cost
(otherwise you're advocating a cost-saving pattern while blind to the cost):

```bash
C:/Users/Joe/miniconda3/python - <<'PY'
import sys; sys.stdout.reconfigure(encoding="utf-8")   # see UTF-8 rule below
import json; d=json.load(open(r"C:/Users/Joe/gemma_resp.json",encoding="utf-8"))
print(d["candidates"][0]["content"]["parts"][-1]["text"].strip())
print("TOKENS:", d.get("usageMetadata"))   # promptTokenCount / candidatesTokenCount / totalTokenCount
PY
```

**Windows console encoding (learned the hard way):** the git-bash console is cp1252, so
any python `print()` of unicode (box-drawing `│├─`, em-dashes, etc.) throws
`UnicodeEncodeError` and kills the script *before* it applies the edit. ALWAYS start the
python with `sys.stdout.reconfigure(encoding="utf-8")` (or run with `PYTHONUTF8=1`), and
prefer not to echo the raw unicode line at all.

## Prompt rules (make output cheap to verify)

1. **Tight scope** — one file / one transform per call.
2. **"Output ONLY <X>. No preamble, no explanation, no markdown fences."** Gemma narrates by default.
3. **"Re-derive every value; do not trust existing numbers."** (Its PR #39 misses were on lines it left untouched.)
4. **Few-shot it** — one concrete before/after beats abstract instructions for a small model.
5. **temperature 0** for deterministic mechanical work.
6. **Apply-step guard** — after writing Gemma's output back to the file, assert the diff is
   exactly what you expected (e.g. `git diff --numstat` == the line count you intended). A
   silent no-op (script crashed before applying, or matched nothing) otherwise sails through
   as a fake "success." This guard caught a real zero-change run this session.

## What is actually Gemma's job (depends on the access path)

The split differs by path — this is where conflating the two paths bites:

**Bare-API Gemma (text-only):** it canNOT run `grep`/`wc -l`, so asking it to *source* facts
("is this accurate? at which version?") makes it FABRICATE (that's what broke PR #40). On
this path: tools find + verify (done by the orchestrator), Gemma only *generates* the prose,
you apply it. A pure number-swap needs bare-API Gemma for nothing — tools find, `Edit` places.

**OpenCode-CLI Gemma (agentic):** it CAN grep/read/verify itself, so "find the stale refs and
fix them, opening a PR" is a legitimate task — it sources from the real repo, not from memory.
This is the path for in-repo execution at volume.

Either way, two things stay with the **orchestrator (you)**:
- 🧠 **Canonical-source judgment** — when sources disagree, decide *which* wins (this session:
  card count was 258 in ARCHITECTURE.md vs 279 in the manifest; the right move was to NOT pin a
  number, not to have any model guess). Don't delegate "which of these conflicting facts is true."
- 🔎 **Verification of the result** — always assert the PR/diff is what you intended (next section).

**Find vs. flag (safe even on a weak/cautious model):** asking Gemma to *flag* candidates
("which of these look stale/redundant?") is safe — a missed flag leaves things as-is, and you
verify each hit cheaply. Asking it to *produce a specific value it must source* ("mark this Done
at version X") is the dangerous shape — it fabricates rather than hedge. Flag = safe; produce-
the-sourced-value = trap.

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

`Thaumaturge-Gemma` is **not a collaborator** on `VoeJozzo/Magiclike` (`push:false` on
upstream) but its PAT is a **classic token with `repo` scope**, so it CAN fork, push to
its own fork, and open cross-fork PRs. It contributes the standard outside-contributor
way: push to its **own fork**, open a **cross-fork PR** into `VoeJozzo:dev`, and you or
Joe review + merge. (A *fine-grained* PAT on this non-collaborator account canNOT do this
— it 403s on fork/PR. Use the classic `repo`-scoped token in `GH_PAT_GEMMA`.)

Validated end-to-end: fork `Thaumaturge-Gemma/Magiclike` created, branch pushed, and
PR #41 opened into `dev` — all under the bot.

```bash
source ~/.config/magiclike/secrets.env
BOT=Thaumaturge-Gemma; UP=VoeJozzo/Magiclike; AUTH="Authorization: Bearer $GH_PAT_GEMMA"

# 0. One-time: create the fork (ASYNC — poll GET .../repos/$BOT/Magiclike until it 200s
#    before pushing; first push may need a few seconds after the POST returns)
curl -s -X POST -H "$AUTH" "https://api.github.com/repos/$UP/forks" >/dev/null

# 1. Branch off the latest UPSTREAM dev (not the fork, which may lag)
git fetch origin && git checkout -B <task-branch> origin/dev

# 2. Apply Gemma's output to files, then commit AS the bot
git -c user.name="$BOT" -c user.email="ThaumaturgeDevs@gmail.com" commit -am "<summary>"

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

**Push-hang gotcha (Windows Git Credential Manager).** A `git push` to a `https://...github.com`
remote can hang forever: the Windows GCM (`git-credential-manager.exe`) pops an *interactive*
prompt the headless shell can't answer. Made worse now that `gh auth` holds TWO accounts
(VoeJozzo + Thaumaturge-Gemma), so the helper can pick the wrong one. Fix when a push wedges:
```bash
taskkill //F //IM git-credential-manager.exe   # kill the stuck prompt
# then push with GCM disabled + gh helper forced:
git -c credential.helper= -c credential.helper='!gh auth git-credential' \
    -c credential.https://github.com.helper='!gh auth git-credential' \
    push -u origin <branch>
# PR via gh with prompts disabled: GH_PROMPT_DISABLED=1 gh pr create ...
```
For Claude's *own* pushes (not the bot), the same `gh auth git-credential` helper override uses
YOUR token cleanly.

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
