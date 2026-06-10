# Audit findings index

> Consolidated triage table across all chunk findings files. Rebuilt by the
> runner as chunks complete; sorted severity × effort at triage time.
> Finding format + severity scale: [`docs/plans/plan-proto-audit.md`](../plans/plan-proto-audit.md) → "Findings format".

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A6-1](chunk-06-stickers.md#a6-1--random-reward-eligibility-comment-understates-the-kind-pool) | P2 | Footgun/comment | `stickers.js:159-169` | Random-reward eligibility comment understates the kind pool | stage | open (decision packet) |
| [A6-2](chunk-06-stickers.md#a6-2--empower-fallback-roll-is-non-persistent-re-rolls-on-the-staple-path) | P3 | Rules correctness | `stickers.js:111-122` | Empower fallback roll non-persistent; re-rolls on staple path | stage | open |
| [A6-3](chunk-06-stickers.md#a6-3--inline-set_colorset_types-descriptors-accumulate-duplicate-persisted-entries) | P3 | Footgun/comment | `stickers.js:147-149` | Inline set_color/set_types accumulate duplicate persisted entries | park | open |
| [A6-4](chunk-06-stickers.md#a6-4--dispatch-test-header-over-claims-kind-coverage--shipped-docs-only) | P3 | Comment hygiene | `tests/sticker_kinds_dispatch_test.js:1-3` | Dispatch-test header over-claims kind coverage | ship | **fixed (PR #97)** |
| [A6-5](chunk-06-stickers.md#a6-5--grant_activated_ability-dedup-branch-absent-ability_id-is-untested) | P3 | Coverage gap | `stickers.js:75-80` | grant_activated_ability dedup branch (absent ability_id) untested | park | open |
| [A6-6](chunk-06-stickers.md#a6-6--applystickerkindeffect-violates-the-files-own-deep-copy-discipline-latent) | P3 | Footgun (latent) | `stickers.js:76-81` | applyStickerKindEffect violates file's own deep-copy discipline | park | open |
| [A6-7](chunk-06-stickers.md#a6-7--multi-sticker-cost-resolution-is-apply-order-dependent) | P3 | Rules correctness | `stickers.js:45-63` | Multi-sticker cost resolution is apply-order dependent | park | open |

*Chunk 6 (stickers) only — DRY RUN. Queue gated on the first full mutation run
for chunks 1-11. Severity × effort re-sort happens at triage.*
