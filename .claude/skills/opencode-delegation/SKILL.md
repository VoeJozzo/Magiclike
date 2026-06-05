---
name: opencode-delegation
description: >-
  Read this before delegating work to Gemma or OpenCode — it's the judgment
  layer that decides if and how to delegate, not just the how. Use whenever:
  "have Gemma do X", "delegate this", "send to Gemini", "ship to OpenCode",
  "cheap model could handle this", "digest this file first", "tag in bulk",
  "second opinion on", "audit parity between", "this is going to use a lot of
  tokens", or "is this worth doing myself". Fires PROACTIVELY on large-file
  ingestion (over ~500 lines), bulk classification or tagging, parity audits,
  mechanical refactors, manifest regeneration, find/replace sweeps. Contains
  the six-criterion rubric, tier-to-job routing (counts→Gemma,
  judgment→Flash), two access paths (bare API vs OpenCode CLI), and four
  workflow patterns. Do NOT use for rules/engine-logic correctness, cross-file
  architectural judgment, or any task where verifying the output is as hard as
  producing it.
---

# OpenCode delegation

This skill is two halves welded together. **Front half: judgment** — when a job should leave Claude. **Back half: technical operations** — how to actually run Gemma when it should. Don't skip the front half to get to the back half; mis-routed delegations cost more than they save (PR #40 below).

---

## The single most important principle: invert the default frame

**The default frame is "Claude does the work, cheap models assist." Flip it.**

Claude is expensive supervision. Most jobs in a software project don't need supervision — they need throughput. The discipline is recognizing which jobs those are and *handing them off*, not absorbing them out of habit.

The inversion question, before any non-trivial task:

> *"Could a cheaper model generate this, with me verifying?"*

If yes — that's the pattern. You critique, Gemma generates. Your attention goes into the verification surface, not the production surface. The relationship the user already runs with you (they don't code, you code, they play the game to check) is the same relationship one rung down: Gemma generates, you verify, the user arbitrates only when stuck.

## The leverage rule

> **Only delegate work where verifying the result is cheaper than producing it.**

If checking Gemma's output costs about as much as doing the task yourself, there's no leverage — keep it. Inversion tells you to flip the default; leverage tells you what bar the flipped task has to clear.

---

## Two ways to reach Gemma (this is the most important operational section)

There are **two distinct access paths**, and they have very different power. A claim true for one is often false for the other — do not conflate them (an earlier version of this skill did, and was wrong for two turns).

1. **Bare API** (`curl` to `generativelanguage.googleapis.com`). Text-in / text-out, NO tools. The model can only *generate text*; YOU apply it to files and do all the git/search/verify. Good for "generate this prose, I'll place it." This is the path the "Calling Gemma (bare API)" / "Delegated git workflow" sections below describe.

2. **OpenCode CLI** (`opencode run`). A **full tool-using agent** — it reads, greps, edits, and runs git *itself*, in the repo, autonomously. Installed at `C:/Users/Joe/AppData/Roaming/npm/opencode` (v1.15+; `npm i -g opencode-ai`). It **shares the same Google auth** (`~/.local/share/opencode/auth.json`) — no separate key.

   ```bash
   # headless agentic run — Gemma edits the repo herself
   opencode run --model google/gemma-4-31b-it "Use your tools to <task>. Commit on a
     branch as Thaumaturge-Gemma and open a PR." 2>&1
   # models: opencode models | grep google ;  auth: opencode auth list
   ```

   **VERIFIED (2026-06-01):** `gemma-4-31b-it` via `opencode run` called the `read` tool on a file and returned the correct contents — it IS agentic, despite being the free ~1500/day tier. (Gemini Flash models are also agentic but ~20/day each.) Do NOT claim a model "can't use tools" from one timeout — Gemma is SLOW (~3–4 min/agentic run); give it 180–240s+ before concluding anything. Capability claims need the same evidence discipline as numeric claims: verify, don't infer from a single negative.

   **Output channel = git/PR, NOT stdout.** OpenCode's final answer does NOT pipe cleanly to stdout on this Windows shell. That's fine and BY DESIGN: real work comes back as a **Gemma-authored commit + PR** (read via `gh`/`git`), which is exactly why Thaumaturge-Gemma has a GitHub identity. For the rare time you need her raw text reply, read it back via `opencode export <session-id>` (find the id with `opencode session list`), not the pipe.

**Which path for what:** generation-only work you'll apply yourself → bare API. Anything where Gemma should *do the work in the repo* (sweeps, reorg, multi-file edits, "open a PR that does X") → OpenCode CLI (the agent). When in doubt, the CLI is the more capable tool.

**Reality check — does delegation actually pay HERE?** Spinning up a Gemma call has real overhead (write a script, round-trip the API, parse, debug the Windows transport quirks below). It only nets out when the task is **voluminous** (dozens of files/edits) or needs **natural-language generation at volume** (rewrite N oracle blurbs, draft N art prompts). For a handful of trivial edits — e.g. swapping 3 numbers — just use `Edit` directly; delegating is *net more work* (measured: a 3-line CLAUDE.md fix took far longer via Gemma than 3 Edits would have). And note: deterministic find/verify (`grep`, `wc -l`, JSON parse) is NOT Gemma's job — see "Find vs flag" below. Delegate the **generation**, not the **search**.

---

## The tier ladder

Reach DOWN before reaching UP. If `grep` works, use `grep`.

| Rung | When |
|---|---|
| **Claude** (you) | Synthesis, final calls, subtle correctness, verifier of last resort |
| **Gemini Flash** (`gemini-3.5-flash`, `gemini-3-flash`, `gemini-2.5-flash`) | **Judgment tasks** — anything needing reasoning/attribution ("is this Done, and at which version?"). ~20 RPD per model, ~60 total. Scarce. |
| **Gemma 4** (`gemma-4-31b-it` default, `gemma-4-26b-a4b-it` lighter alt) | **DEFAULT.** All bulk/mechanical work — counts, sweeps, reformatting, expansion. ~1500 RPD, effectively unmetered. |
| **Deterministic scripts** (grep, sed, tests, type-checker) | No LLM judgment needed. Cheapest, most reliable. |

The ladder is not aspirational. If a regex would do it, the LLM tier is the wrong direction.

---

## The six-criterion rubric

A task is delegation-shaped when **all six** hold. Walk the checklist; don't argue past misses.

1. **Expensive to do, cheap AND reliably verified.** Verification must reduce to something that isn't another LLM as the sole checker — tests, lint, type-checker, runnable spec, the user's eyeball, or `grep`/`wc`/JSON-parse assertions. LLM cross-checking is fine *as an attention-throttling filter* on top of a real verifier; not as the verifier.
2. **Branch-isolatable.** Throwaway branch, bounded blast radius. If bad output reaches production by default, the criterion fails.
3. **Factual or mechanical, low synthesis demand.** Lookups, transforms, tags. Not "decide whether this design is good."
4. **High-volume, many-of-the-same.** Throughput dominates per-item quality. Tagging 250 items > tagging 1 item.
5. **Loud-failing.** Errors surface obviously — broken test, malformed JSON, weird tag. NOT silent (subtle off-by-one in priority handling, wrong damage value nobody catches for a week).
6. **Candidate-shaped, not decision-shaped.** The cheap model proposes; you or the user picks. Never give the weaker model decision authority.

### Do NOT delegate when

- **Cheap to do, expensive to verify.** "Is this thread-safe?" takes a second to ask, hours to verify.
- **Touches cross-cutting state that fails silently.** Magiclike's rules engine — priority, stack, trigger draining, combat damage — is the archetypal example. Failures don't announce themselves.
- **Requires unstated context only you or the user holds.** The cheap model will produce something plausible but wrong because it can't know what you know.

**If you have to argue past more than one criterion, don't delegate.**

---

## Tier-to-job mapping

Job shape → tier → why:

- **Pre-digest a large file before you read** → Gemma via OpenCode CLI (it reads the file itself) or Flash via bare API if you just want a paragraph summary → throughput on volume
- **Bulk classification or tagging** → Gemma → throughput, cheapest tier that can do the job
- **Cross-tree parity audit** → Gemma via OpenCode CLI for ingestion + diff; Flash if synthesis depth matters
- **Multimodal review** (images, screenshots, card art) → Flash → free multimodal
- **Adversarial second opinion on subtle reasoning** → Flash (different model family catches different errors than another Claude would)
- **Mechanical refactor in an isolated branch** → Gemma via OpenCode CLI → loud-failing via tests
- **"Which version did X land?" / "Is this claim true?"** → Flash → it's a judgment task; Gemma will fabricate (PR #40 below)
- **Anything touching engine invariants or silent-failure code** → You. Do it yourself.

**The hard routing rule (PR #40 lesson):** **counts → Gemma; "which version / is this true" → Flash.** Mis-routing a judgment task to Gemma is what made PR #40 bad — a version-attribution task was run on a plain model and it fabricated version numbers. Gemma transforms; Flash judges.

---

## Find vs flag

The single sharpest heuristic for what's safe to ask a weaker model.

- **Flag = safe.** "Which of these look stale/redundant?" A missed flag leaves state unchanged; you verify each hit cheaply. The cost of a wrong flag is small.
- **Produce-the-sourced-value = trap.** "Mark this Done at version X." The model has to source X from somewhere — if it can't, it fabricates rather than hedge. The cost of a wrong sourced value is silently shipping a lie.

Asking Gemma to flag candidates is safe even on a cautious model. Asking it to *produce a specific value it must source* is the dangerous shape. When you frame a delegation, listen for which side of this line it lands on.

---

## The four workflow patterns

Pick one based on the job's shape. Don't blur them.

### 1. Tool pattern

Cheap model called once for a single discrete sub-task ("digest this file," "classify this item"). One-shot, one return, you integrate.

**Use when:** the job is well-scoped, you can describe the output format precisely, and you'll consume the result directly.

### 2. Bulk worker pattern

Fire-and-collect over N items. Same task, many inputs, collected results.

**Use when:** N is large (≥20-ish), items are independent, per-item quality is acceptable at the cheap-tier level.

### 3. Adversarial verifier pattern

Both Gemma AND Claude classify the same items. **Agreement → accept. Disagreement → human attention or you re-examine.**

**Use when:** the task is binary or otherwise verifiable (tagging, classification, true/false). The win is not "Gemma plus Claude is more accurate than Claude alone" — it is, modestly, but errors correlate so the real-world gain is smaller than naive independence math predicts. **The real win is concentrating Claude's expensive attention only on disputed items**, skipping the 80% the models agree on.

### 4. Inverted generator-critic loop

Gemma generates; you critique with specific findings; the critique is fed BACK to Gemma as context (not as a fresh prompt); Gemma revises; cap rounds at 2–3; escalate to user on non-convergence.

**Use when:** the artifact has external verification (tests, lint, spec) but generation is tedious. Gemma drafts code that fails tests; you read the failure and tell it specifically what's wrong; it tries again with that feedback in context.

**Critical anti-pattern: naive rerolls are not iteration.** Same prompt, same input, same model usually produces the same answer. Each round must feed the prior critique forward as informed re-examination. Vary the framing per round if you're not seeing movement. Independence is not what you want here — informed convergence is.

---

## Verify like a manager — assert, don't read

Turn review into a deterministic check, not an eyeball pass. Example (the PR #39 LOC audit): for each number Gemma claimed, run `git show <ref>:<file> | wc -l` and compare, printing `*** MISMATCH` on any diff. You run an assertion; you never "read" the output.

> **If a task can't be reduced to a mechanical check, it's the wrong task to delegate.**

The orchestrator (you) always keeps two things:
- 🧠 **Canonical-source judgment** — when sources disagree, decide *which* wins. Don't delegate "which of these conflicting facts is true."
- 🔎 **Verification of the result** — always assert the PR/diff is what you intended.

## The loop

1. **You** scope a bounded task + write the verification script.
2. **Gemma** drafts it (on a branch; commits authored as `Thaumaturge-Gemma`).
3. **You** run the assertion.
4. **You** patch the few misses + merge.

Iterate Gemma's *prompt* freely (it's free). Design tasks so *you* touch the result once (you're the expensive part).

---

## Failure modes this skill is defending against

Two axes: **your own reluctance to delegate** (Claude defaults) and **Gemma's failure shapes** (the operational traps). Both are live; both need watching.

### Your defaults (Claude-side)

1. **Error-aversion bias.** You prefer doing it yourself because you can verify yourself. That feels like prudence; it's actually expensive under-delegation. You don't feel the cost of running Opus on a job a Gemma could've done; the user does.

2. **Diplomatic-hedge habit.** When proposing delegation, you soften it: *"you might consider sending this to Gemma."* Don't. State it plainly: *"This is delegation-shaped. Send to Gemma via OpenCode CLI."* If you're wrong, the user redirects. Hedging buys you nothing and noise-floors your useful signal.

3. **Over-applying engine-rules caution.** The caution against delegating silent-failure code is real and important. But most code in any codebase is NOT load-bearing rules logic. Re-evaluate per task; don't blanket-apply the engine-rules sticker to everything in the same repo just because it's nearby.

4. **Verification-by-LLM laundering.** "I'll have Claude check Gemma's output" is fine *if* a non-LLM check exists downstream — tests, lint, the user's eyeball. LLM cross-checking in that context is attention-throttling: it filters the easy cases so human attention concentrates on hard ones. It becomes laundering when the LLM is the *sole* checker with nothing downstream — frontier models share training data and tuning objectives, so correlated blind spots can ship silently. The adversarial-verifier pattern survives this because the user is always the real arbiter.

5. **Skipping the inversion.** Defaulting to "Claude does it" when the job actually fits "Gemma does it, Claude verifies." The inversion is the most powerful pattern; the bias against it is the most expensive habit.

6. **Burying the escalation.** When generator-critic loops stall, you tend to keep trying instead of pulling the user in. Cap rounds explicitly. After 2–3 rounds without convergence, escalate. Looping silently is a failure mode dressed as persistence.

7. **Caveat-loading after the user has already decided.** If the user has named the risks and proceeded, adding more "but be careful with X" is noise, not signal. Match the level of engagement the user brought; don't reflexively guard-rail a guard-railed argument.

### Gemma's failure shapes (operational-side)

1. **Mis-routing to Gemma what was a Flash task.** PR #40's lesson — anything requiring "which version / is this true" goes to Flash. Gemma will fabricate because it has no source. Pattern: the model produces a confident-sounding value with no basis. Fix: route by question shape, not vibe.

2. **Asking Gemma to source-and-produce a single value.** The find-vs-flag trap. "Mark this Done at version X" forces fabrication. Reshape as a flag-pass.

3. **Silent zero-change runs.** A Gemma call that crashed before applying its output, or matched nothing, still returns "success" to the orchestrator. The apply-step guard in the prompt-rules section catches this — never skip it.

4. **Confused output by reading part 0 instead of part −1.** Gemma 4 emits a reasoning preamble. The first `text` part is its thinking; the *last* is the answer. Always `parts[-1]`.

---

## Setup (already wired in this repo)

- **Secrets — where to find what you need.** Everything lives in ONE file, outside the repo so it can never be committed: `~/.config/magiclike/secrets.env` (Windows: `C:/Users/Joe/.config/magiclike/secrets.env`), perms `600`. It defines exactly two env vars:
  - `GEMINI_API_KEY` — the Google AI Studio key (`AQ.`-prefixed). Authenticates the model calls via the `?key=` query param (no OAuth).
  - `GH_PAT_GEMMA` — the `Thaumaturge-Gemma` bot's **classic** GitHub PAT (`ghp_`-prefixed, `repo` + `read:org` scopes). All three bots' tokens now live in the **gh keyring** (`gh auth status`); `secrets.env` *derives* this one rather than storing a copy (see below). Used for push/PR.

  To use them: `source ~/.config/magiclike/secrets.env`, then reference `$GEMINI_API_KEY` / `$GH_PAT_GEMMA`. **Never print the values, never write them into a tracked file, never commit them.** When a command must echo (e.g. a push URL), pipe it through `sed "s#$GH_PAT_GEMMA#***#g"` first.

  **If `secrets.env` is missing (fresh machine):** keys do NOT travel via git — that's intentional (the repo is public). Recreate the file by hand:
  ```bash
  mkdir -p ~/.config/magiclike && umask 077
  cat > ~/.config/magiclike/secrets.env <<'EOF'
  export GEMINI_API_KEY='<paste AI Studio key>'
  # GH tokens live in the gh keyring now — `gh auth login` each bot first (classic PAT, repo+read:org), then derive it:
  export GH_PAT_GEMMA="$(gh auth token --user Thaumaturge-Gemma)"
  EOF
  chmod 600 ~/.config/magiclike/secrets.env
  ```
  Source the keys from a password manager or paste them out-of-band — not from any repo file or chat log. (For CI/Codespaces instead of local, use encrypted GitHub Actions/Codespaces secrets, not this file.)

- **Models on the key + routing policy.** Free tier; the binding limit is **RPD (requests/day)**. Route by it:

  | Model id | RPD | Use for |
  |---|---:|---|
  | `gemma-4-31b-it` | ~1500 | **DEFAULT.** All bulk/mechanical work — counts, sweeps, reformatting, expansion. Effectively unmetered. |
  | `gemma-4-26b-a4b-it` | ~1500 | Lighter/faster alt of the default. |
  | `gemini-3.5-flash` | ~20 | **Judgment tasks** — anything needing reasoning/attribution. |
  | `gemini-3-flash` | ~20 | Judgment alt. |
  | `gemini-2.5-flash` | ~20 | Judgment alt; follows "output only X" cleanly. |

  The ~20 RPD is **per Flash model** (≈60 judgment reqs/day total), not shared. **Rule:** default to Gemma 4 31B; escalate to a Gemini-Flash ONLY when the task needs judgment, not just transformation.

- **Gemma's GitHub identity** for delegated commits: bot account `Thaumaturge-Gemma`, author email **`289474964+Thaumaturge-Gemma@users.noreply.github.com`** (its GitHub noreply — links to the account automatically and never exposes a real address; all three bots now use the `<id>+<login>@users.noreply.github.com` form). Author each commit with `git -c user.name="Thaumaturge-Gemma" -c user.email="289474964+Thaumaturge-Gemma@users.noreply.github.com" commit …` (no secret needed). Push using `GH_PAT_GEMMA`. **Never set this globally** or your own commits get mislabeled. Full branch→push→PR recipe in the "Delegated git workflow" section below.

---

## Calling Gemma (bare API)

```bash
source ~/.config/magiclike/secrets.env
curl -s -o C:/Users/Joe/gemma_resp.json -w '%{http_code}' --max-time 90 \
  "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"<PROMPT>"}]}],"generationConfig":{"temperature":0}}'
```

**Windows/git-bash transport rules (learned the hard way — do not deviate):**
- Pass the JSON body **inline with `-d '{...}'`**. `-d @file` and `--data-binary @-` both FAIL: the native `curl.exe` can't resolve git-bash's msys `/tmp` paths and sends an empty body (`http_code=000` / 0-byte response).
- Single-quote the inline payload. Safe as long as the text has no single quotes; if it might, build the JSON with python (`miniconda3/python`) writing to a `C:/...` path, then inline it — still never `@file`.
- Write the response to a **`C:/Users/...` path**, not `/tmp` (native tools resolve `/tmp` as `C:\tmp`, which doesn't exist). Read/parse it with `miniconda3/python` (there is no `jq` here).
- Python `urllib`/`requests` to the API has timed out in this shell — prefer `curl` for the network call, python only for build + parse.

Parse the **last** text part, not the first — Gemma 4 emits a reasoning preamble (part 0 is its thinking), so the first `text` is `"The user wants a specific response: …"`. Also **capture `usageMetadata`** every call — it's how you know what the delegate cost (otherwise you're advocating a cost-saving pattern while blind to the cost):

```bash
C:/Users/Joe/miniconda3/python - <<'PY'
import sys; sys.stdout.reconfigure(encoding="utf-8")   # see UTF-8 rule below
import json; d=json.load(open(r"C:/Users/Joe/gemma_resp.json",encoding="utf-8"))
print(d["candidates"][0]["content"]["parts"][-1]["text"].strip())
print("TOKENS:", d.get("usageMetadata"))   # promptTokenCount / candidatesTokenCount / totalTokenCount
PY
```

**Windows console encoding (learned the hard way):** the git-bash console is cp1252, so any python `print()` of unicode (box-drawing `│├─`, em-dashes, etc.) throws `UnicodeEncodeError` and kills the script *before* it applies the edit. ALWAYS start the python with `sys.stdout.reconfigure(encoding="utf-8")` (or run with `PYTHONUTF8=1`), and prefer not to echo the raw unicode line at all.

---

## Calling Gemma (OpenCode CLI, agentic)

When Gemma should *do work in the repo* (not just generate text you apply), use the CLI. Shares the same Google auth — no separate key needed.

```bash
opencode run --model google/gemma-4-31b-it "Use your tools to <task>. \
  Commit on a branch as Thaumaturge-Gemma and open a PR." 2>&1
# inspect: opencode models | grep google
# auth:    opencode auth list
# raw reply: opencode session list; opencode export <session-id>
```

- Output channel is **git/PR, not stdout** on Windows. The real deliverable is the PR; treat the pipe as informational.
- Gemma agentic runs are **slow** (~3–4 min). Don't time out at 60s and conclude failure. 180–240s+.
- Flash variants via the CLI are also agentic but rate-limited (~20 RPD each); reserve for judgment-shaped agentic work.

---

## Prompt rules (make output cheap to verify)

1. **Tight scope** — one file / one transform per call.
2. **"Output ONLY <X>. No preamble, no explanation, no markdown fences."** Gemma narrates by default.
3. **"Re-derive every value; do not trust existing numbers."** (Its PR #39 misses were on lines it left untouched.)
4. **Few-shot it** — one concrete before/after beats abstract instructions for a small model.
5. **temperature 0** for deterministic mechanical work.
6. **Apply-step guard** — after writing Gemma's output back to the file, assert the diff is exactly what you expected (e.g. `git diff --numstat` == the line count you intended). A silent no-op (script crashed before applying, or matched nothing) otherwise sails through as a fake "success." This guard caught a real zero-change run this session.

---

## Delegated git workflow (same-repo PR)

`Thaumaturge-Gemma` is now a **write collaborator** on `VoeJozzo/Magiclike` (same as `Thaumaturge-Claude` and `Thaumaturge-ChatGPT`), so it pushes a branch **straight to the upstream repo** and opens a **same-repo PR** into `dev` — no fork. This unified all three bots onto one flow; the old fork → cross-fork dance is retired, and the `Thaumaturge-Gemma/Magiclike` fork is now vestigial. (The classic `repo`+`read:org` token in `GH_PAT_GEMMA` is what makes collaborator push/PR work — a *fine-grained* token can't contribute to a personal repo you don't own.)

Because the **bot** is the pusher, VoeJozzo (the CODEOWNER) can approve the PR cleanly — which is exactly what the branch-protection gate on `dev` requires.

```bash
source ~/.config/magiclike/secrets.env          # GH_PAT_GEMMA derives from the gh keyring
BOT=Thaumaturge-Gemma; UP=VoeJozzo/Magiclike
EMAIL=289474964+Thaumaturge-Gemma@users.noreply.github.com

# 1. Branch off the latest upstream dev
git fetch origin && git checkout -B <task-branch> origin/dev

# 2. Apply Gemma's output to files, then commit AS the bot (noreply email, per-command)
git -c user.name="$BOT" -c user.email="$EMAIL" commit -am "<summary>"

# 3. Push the branch straight to UPSTREAM (collaborator access — no fork)
git push "https://$BOT:$GH_PAT_GEMMA@github.com/$UP.git" HEAD:<task-branch>

# 4. Open the same-repo PR into dev
GH_TOKEN="$GH_PAT_GEMMA" gh pr create --repo "$UP" --base dev \
  --head <task-branch> --title "<title>" --body "<body>"
```

Then VoeJozzo reviews and merges (branch protection requires the CODEOWNER's approval — the bot can't self-merge). Notes:
- The branch goes straight into the upstream repo; the same-repo PR's `head` is just the branch name (no `owner:branch` fork prefix).
- `GH_PAT_GEMMA` is sourced from the gh keyring; never echo it or put it in a tracked file.
- Authorship (`user.name`/`user.email`) is per-command — **never** `git config --global` it, or your own commits get mislabeled as the bot.

**Push-hang gotcha (Windows Git Credential Manager).** A `git push` to a `https://...github.com` remote can hang forever: the Windows GCM (`git-credential-manager.exe`) pops an *interactive* prompt the headless shell can't answer. Made worse now that `gh auth` holds **four** accounts (VoeJozzo + the three bots), so the helper can pick the wrong one. Fix when a push wedges:
```bash
taskkill //F //IM git-credential-manager.exe   # kill the stuck prompt
# then push with GCM disabled + gh helper forced:
git -c credential.helper= -c credential.helper='!gh auth git-credential' \
    -c credential.https://github.com.helper='!gh auth git-credential' \
    push -u origin <branch>
# PR via gh with prompts disabled: GH_PROMPT_DISABLED=1 gh pr create ...
```
For Claude's *own* pushes (not the bot), the same `gh auth git-credential` helper override uses YOUR token cleanly.

---

## Safety

- The repo is **public** (GitHub Pages serves from `dev`) — treat every tracked file as world-readable.
- A `github_pat_…` committed to a public repo is **auto-revoked by GitHub within minutes** — keep the PAT in `secrets.env`, never in the tree.
- Secrets are env vars only. When testing, print a key's *length/prefix*, never its value.

## Known environment gotcha

This Windows / git-bash shell has shown a severe **stdout-buffering bug**: commands execute correctly but their output flushes late, in large batches. Each delegation's `curl` may stutter — write results to a file and read the file. A session restart clears it. (Wiring this channel up was expensive almost entirely because of this; the steady-state "one curl + one assertion" cost is small.)

---

## Exemplar use cases (Magiclike, illustrative not definitional)

The skill is project-agnostic. These are concrete examples from the user's Magiclike project showing the rubric and routing in action.

**Pre-digestion of `engine/engine.gd` (1,840 lines) → Gemma via OpenCode CLI.**
Before diving into "how does triggered-ability draining work," fire `opencode run` with: *"Read `engine/engine.gd`. Output a function map (line ranges + one-line purpose for each top-level function) and the specific line range where trigger draining happens."* Gemma reads the file herself; you get a paragraph back instead of burning your context on Read-after-Read. **This is the biggest single unlock.**

**Cross-tree parity audit (`engine/engine.gd` ↔ `reference/html-proto/js/engine.js`) → Gemma via OpenCode CLI for the diff, Flash if synthesis depth matters.**
"Diff these two implementations by capability; list what the html-proto does that the Godot port doesn't yet." Gemma can read both files and produce a flag-pass (find-vs-flag: *flag* candidates, don't *produce* sourced claims about each). You verify the flags.

**Batch-tag 250+ card JSONs in `reference/html-proto/cards/` by archetype/color/mechanic → Gemma + Claude as adversarial verifier.**
Canonical adversarial-verifier example. Both models tag each card. The 80% they agree on is done. You only look at the 20% they disagree on. Your attention concentrates on the hard cases; the easy ones never reach you. Route to Gemma, not Flash — tagging is bulk transformation, not judgment.

**"Has this been Done? At what version?" pass over `BACKLOG.md` → Flash.**
**Do not route this to Gemma.** This is the PR #40 shape — sourced-value production, version attribution. Gemma will fabricate; Flash judges. Or reshape as a flag-pass: *"Which items look like they may already be Done? Don't assert when."* Flag-shape is safe even on Gemma.

**Multimodal art review against the "art enacts the mechanic" principle from `magiclike-card-art` → Flash.**
After a generation, send the art + the card's oracle text to Flash: *"does this art enact the mechanic, or just decorate the theme?"* Cheap multimodal pass before the user sees it. Flag obvious misses; let the user adjudicate borderlines.

**Second opinion on a subtle rules-engine bug → Flash, NOT Gemma.**
The *one* engine-touching delegation that fits — because Flash is the **verifier**, not the implementer. Different model family catches different errors than another Claude would. Cheap correctness insurance for the hardest work. Never let Flash write the fix; just review yours.

---

## One-breath summary

Walk the six-criterion rubric → if it passes, pick the lowest tier that fits (counts→Gemma, judgment→Flash) → pick the access path (bare API for text-you-apply, OpenCode CLI for work-in-repo) → pick a workflow pattern (tool / bulk / adversarial verifier / inverted generator-critic) → run it → **assert, don't read** → escalate to the user on non-convergence. The skill is the judgment, the routing, and the wired-up operational path — together.
