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

**Commit-identity rule:** set `user.name` / `user.email` to the noreply above **per-worktree or per-command — never `git config --global`** (that mislabels other work). Never author with the real `ThaumaturgeDevs@gmail.com`.

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
- `GH_PAT_GEMMA` — **to be derived at runtime** from the keyring (`gh auth token --user Thaumaturge-Gemma`) rather than kept as a stored second copy *(being wired)*.

## Push / PR flow

- **Push transport:** the gh credential-helper —
  `git config credential.https://github.com.helper '!gh auth git-credential'`, username-pinned per worktree. Bypasses Git Credential Manager (which is what pops the desktop prompt). *Active for all four accounts — each is in the gh keyring.*
- **Open a PR as a bot** (no global account switch):
  ```bash
  GH_TOKEN="$(gh auth token --user <bot>)" gh pr create --base dev --title "…" --body "…"
  ```
- All bot work targets **`dev`** via PR; the owner reviews/approves. `main` receives `dev` by periodic forward-merge.

## Branch protection

Repo ruleset **"Protect main + dev"** (id `17155398`, active) over `main` + `dev`:
- Require a PR before merging · 1 approval · **require Code Owner review** · dismiss stale approvals on push · require approval of the most recent push.
- Block force-pushes · block deletions.
- Bypass: **Repository admin** (`VoeJozzo`) only.

`.github/CODEOWNERS` = `* @VoeJozzo`, so every PR into a protected branch needs the owner's review — no bot can satisfy it.

## Rotation

The bot PATs are set to **no expiry**. To rotate (on leak or as housekeeping): regenerate or edit the token on the bot account (keep scope minimal — `repo` **plus `read:org`**), then `gh auth login` that bot again and update this table. The owner's *"Keep my email addresses private"* setting keeps web/API commits on the noreply address.
