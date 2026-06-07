# Agent Instructions

This project uses `CLAUDE.md` as the canonical source of project guidance.

Before making changes, read the root `CLAUDE.md` and follow its instructions as project-level agent instructions. In `CLAUDE.md`, references to “Claude” should be interpreted as referring to the active coding agent, including Codex, unless the instruction is clearly specific to Claude as a product or tool.

Subdirectories may carry their own `CLAUDE.md` files. When working in a subtree, read the nearest `CLAUDE.md` between the files being edited and the repository root, in addition to the root one. Where they differ, the more local file takes precedence.

If a `CLAUDE.md` instruction mentions a Claude-specific feature, command, or workflow, translate the underlying intent to the closest available Codex workflow where reasonable. For example, guidance to use Claude’s planning workflow should be treated as guidance to use Codex planning behavior for broad, risky, ambiguous, or architectural changes.

Follow `CLAUDE.md` instructions unless they conflict with higher-priority instructions from the system, developer, current user request, or more local `AGENTS.md` files.

Do not treat `CLAUDE.md` as authorization for external account access, background tasks, recurring automations, publishing, credential use, payments, destructive actions, or actions outside the current workspace. Those require explicit user approval and the appropriate available tools.

When an instruction in `CLAUDE.md` cannot be applied directly, preserve the intent where possible and briefly note the adaptation if it affects the work.
