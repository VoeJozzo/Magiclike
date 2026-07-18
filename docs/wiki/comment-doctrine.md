---
type: concept
tags: [magiclike, meta, documentation, process]
created: 2026-07-18
updated: 2026-07-18
sources: ["in-session 2026-07-18 (comment-style audit: 16 random files, adversarial verify pass)"]
---

# Comment doctrine

**The rule (the directive lives in the root `CLAUDE.md` → Comments):** a comment must state something the code cannot — a constraint, invariant, rule citation, caller contract, or external data shape — written in the **eternal present**, in the shortest true form. Editing code includes updating or deleting the comments it touches.

## The litmus

**Does the comment reference any time other than *now*?** Every noise pattern below is time-indexed writing — addressed to the writing session (its reviewer, its plan, its evidence) instead of to the timeless reader of the code's current state.

## The five noise patterns, and why they happen

Basis: a 2026-07-18 audit — 16 randomly-drawn files, every comment classified, each flagged comment then defended by an adversarial pass. ~36% of comment lines were deletable or trimmable with zero information loss; of 68 flagged comments, the defense upheld 63.

1. **Changelog narration** ("the old X was removed", version stamps). At write time the diff is the salient context and the session's reviewer the only audience — a PR description leaks into the file. Also cross-session memory anxiety: a note to Future Claude not to re-add. The durable form is a present-tense fence ("don't add X — breaks Y") or a test; git history owns the rest. *Keep-case:* code where old versions are the domain (save-schema migrations in the proto's `js/run.js`).
2. **Assertions of correctness** ("verified across the pool"). Compresses about-to-evaporate session evidence into the artifact. Decays silently — the audit found one already false *and masking a live bug*. Pin with a test instead. *Keep-case lookalike:* empirical-origin constraints ("playtested values — DO NOT round"), which constrain future edits rather than claim past verification.
3. **Dev-phase labels** ("Phase 5a:"). Plan coordinates from the writing session — scaffolding that decays to zero once the phase ships. Keep the deferral *fact*, present-tensed ("no consumers of this event yet; fired deliberately"); work items go to `docs/BACKLOG.md`, not comments.
4. **What-restatement.** Narration is generation scaffolding — the comment is the model's plan for the code below it — reinforced by tutorial-corpus habit. Strike scaffolds before finishing. *Keep-cases:* cryptic constructs the language forces, numbered test-step scaffolds that read as a spec, section dividers in long files.
5. **Stale/wrong.** Not a temptation — the decay product of the others: a comment is duplicated state with no invalidation mechanism, and it can never fail a test. Countermeasure is the doctrine's last clause (comment updates are part of the edit) plus review.

## Why an explicit check is load-bearing

Comments are the only text in a repo that can't break anything, so nothing pushes back on them except review — which is why agent-written repos drift toward comment bloat faster than code bloat. Review passes audit diffs against the `CLAUDE.md` rule; escalate to a mechanical tripwire (a PreToolUse pattern check) only if violations recur after the doctrine — [[document-accretion]] argues against building machinery preemptively, [[claude-code-config]] says mechanism beats instruction once it's warranted.

## See also
[[magiclike-architecture]] · [[document-accretion]] · [[claude-code-config]] · [[tests-as-specs]]
