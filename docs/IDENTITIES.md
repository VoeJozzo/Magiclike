# Identities & Access

> Single source of truth for the GitHub accounts behind Magiclike — who's who, what each can do, and how work flows in. **Non-secret:** this file *points at* credentials; it never contains them. Tokens live only in the OS keyring / `secrets.env`.

## Accounts

| Role | Login | User ID | Repo permission | Commit author email (use this) |
|------|-------|---------|-----------------|--------------------------------|
| Owner (human) | `VoeJozzo` | 277584593 | admin | `277584593+VoeJozzo@users.noreply.github.com` |
| Bot — Claude | `Thaumaturge-Claude` | 289834967 | write | `289834967+Thaumaturge-Claude@users.noreply.github.com` |
| Bot — Gemma | `Thaumaturge-Gemma` | 289474964 | write | `289474964+Thaumaturge-Gemma@users.noreply.github.com` |
| Bot — ChatGPT | `Thaumaturge-ChatGPT` | 289870689 | write | `289870689+Thaumaturge-ChatGPT@users.noreply.github.com` |

The bots exist purely for **attribution** (tracking which AI did what). They're low-privilege by design — write collaborators on a public repo, gated by branch protection (below). A leaked bot credential's worst case is "open a PR the owner must approve."

**Commit-identity rule:** author with the noreply above, set **per-worktree or per-command — never `git config --global`** (that mislabels other work). The noreply is preferred because it links commits to the GitHub account cleanly — not for secrecy: the bot accounts' shared `ThaumaturgeDevs@gmail.com` isn't sensitive.

## Credentials — what lives where

| Identity | Token | Scope | Expiry | Stored in |
|----------|-------|-------|--------|-----------|
| VoeJozzo | gh OAuth (`gho_`) | repo, workflow, gist, read:org | — | gh keyring |
| Thaumaturge-Gemma | classic PAT (`ghp_`) | repo, read:org | — | gh keyring |
| Thaumaturge-Claude | classic PAT (`ghp_`) | repo, read:org | — | gh keyring |
| Thaumaturge-ChatGPT | classic PAT (`ghp_`) | repo, read:org | — | gh keyring |

- **"gh keyring"** = the GitHub CLI token store, backed by the OS secure store (Windows Credential Manager). Inspect with `gh auth status` (never prints secret values).
- All three bots use a **classic** PAT with `repo` + `read:org`, stored in the gh keyring. `read:org` is what lets the gh credential-helper push transport authenticate as the bot (the helper resolves the org for the username it's pinned to).
- Tokens are never committed. A `ghp_…`/`github_pat_…` pushed to this public repo is auto-revoked by GitHub secret scanning.

## Secrets file

`~/.config/magiclike/secrets.env` (perms `600`, outside the repo):
- `GEMINI_API_KEY` — Google AI Studio key (Gemma / Gemini model calls).
- `GH_PAT_GEMMA` — **derived at runtime** from the keyring; `secrets.env` holds `export GH_PAT_GEMMA="$(gh auth token --user Thaumaturge-Gemma)"`, not a stored copy.

## Push / PR flow

- **Push transport:** bots push *as themselves* using their keyring token (the delegation skill embeds it in the push URL), so the `require_last_push_approval` rule lets the owner approve. A promptless upgrade — the **gh credential-helper** (`git config credential.https://github.com.helper '!gh auth git-credential'`, username-pinned per worktree, bypassing Git Credential Manager) — is **not yet wired**; all four accounts are keyring-ready for it, but it's only worth it if GCM starts prompting. **Update 2026-06-10: GCM *did* prompt** (headless worktree push; the dialog self-cancelled and the push died). The trigger condition has fired — wire the helper (worktree-scoped, username-pinned) in any context that needs promptless pushes; the audit campaign's Phase 0 (`docs/plans/plan-proto-audit.md`) does so for the audit worktree. Token-in-URL remains the fallback for one-off interactive pushes only — its command shape can't pass a permission allowlist, so it is **unusable in autonomous mode**.
- **Open a PR as a bot** (no global account switch):
  ```bash
  GH_TOKEN="$(gh auth token --user <bot>)" gh pr create --base dev --title "…" --body "…"
  ```
- **The same rule covers *all* API writes — comments, reviews, edits — not just `pr create`.** `gh pr comment` / `gh pr review` / `gh api` post as gh's **active** account (by default the owner, *not* the bot), and the body text is cosmetic — signing a comment "— Bot" does **not** change the recorded author. Prefix the same per-command token: `GH_TOKEN="$(gh auth token --user <bot>)" gh pr comment …`. When identity matters, verify it: `gh api repos/OWNER/REPO/issues/comments/<id> --jq .user.login`.
- All bot work targets **`dev`** via PR; the owner reviews/approves. `main` receives `dev` by periodic forward-merge.
- **Watching:** the bot that opens a PR is auto-subscribed to it *as the author* — that's how an AI tracks its own PRs across sessions. So "subscribe to the PR for updates" means **the bot** watches; don't subscribe the owner (already notified as the CODEOWNER reviewer). *(An explicit `updateSubscription` GraphQL call needs the `notifications` token scope the PATs lack — but it's unnecessary given author auto-subscribe.)*

## Branch protection

Repo ruleset **"Protect main + dev"** (id `17155398`, active) over `main` + `dev`:
- Require a PR before merging · 1 approval · **require Code Owner review** · dismiss stale approvals on push · require approval of the most recent push.
- Block force-pushes · block deletions.
- Bypass: **Repository admin** (`VoeJozzo`) only.

`.github/CODEOWNERS` = `* @VoeJozzo`, so every PR into a protected branch needs the owner's review — no bot can satisfy it.

## Rotation

The bot PATs are set to **no expiry**. To rotate (on leak or as housekeeping): regenerate or edit the token on the bot account (keep scope minimal — `repo` **plus `read:org`**), then `gh auth login` that bot again and update this table. The owner's *"Keep my email addresses private"* setting keeps web/API commits on the noreply address.
