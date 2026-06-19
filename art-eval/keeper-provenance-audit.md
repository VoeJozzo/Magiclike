# Keeper provenance / integrity audit

Generated: 2026-06-19 on branch claude/pixellab-art-generation-ozmbb7
Method: compare our per-card `art.png` roster against `origin/dev` (the authoritative
baseline), then byte-verify each of *our* placed keepers against its own run directory.

## Roster vs origin/dev (strict `cards/<card>/art.png`)

- origin/dev: **175**   our HEAD: **242**
- **LOST (in dev, missing on ours): 0** []
- **CHANGED bytes (same card, different art): 0** []
- ADDED by us (not on dev): **67**

Count history: origin/dev 343 (loose) — see strict above.

## Byte-verification of our placed keepers

- C4+C5 keepers byte-identical to a frame in their OWN run dir: **65**
- C2 keepers NOT byte-verifiable (C2 run images lost historically — documented C2 data loss): **26**
- other: 0 []

## C2 keepers — provenance via placement commit (run images gone, so commit trail is the record)

- `apex_hunter` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `bindspeaker` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `clockwork_beetle` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `dark_ritual` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `giant_spider` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `gilded_seat` ← badbb63 Place recovered keeper/good arts onto their cards (html-proto)
- `grave_charm` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `great_stag` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `horned_herald` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `invigorate` ← 8157f46 Place 4 missed keeper arts onto cards (audit follow-up)
- `knight_commander` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `lightning_bolt` ← badbb63 Place recovered keeper/good arts onto their cards (html-proto)
- `mahamoti_djinn` ← 5b57215 Place mahamoti_djinn art (skill-best from skill-v-naive round; recovered native 64x32)
- `mirror_sage` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `murder` ← badbb63 Place recovered keeper/good arts onto their cards (html-proto)
- `nature_caller` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `old_guardian` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `prodigal_sorcerer` ← a3a177b Add pixel art for 18 more cards (Refactor-format)
- `scarification` ← 8157f46 Place 4 missed keeper arts onto cards (audit follow-up)
- `searing_blast` ← 8157f46 Place 4 missed keeper arts onto cards (audit follow-up)
- `shock` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `swamp` ← d460543 Adopt C2 into card-art skill; place 14 chosen arts onto html-proto cards
- `sword_and_sorcery` ← badbb63 Place recovered keeper/good arts onto their cards (html-proto)
- `unsummon` ← badbb63 Place recovered keeper/good arts onto their cards (html-proto)
- `veil_of_mists` ← badbb63 Place recovered keeper/good arts onto their cards (html-proto)
- `vexing_ogre` ← 8157f46 Place 4 missed keeper arts onto cards (audit follow-up)

## Conclusion

No lost or misplaced art detected. Nothing on `dev` is missing from our branch (0), and we
overwrote nothing (0 changed). All C4/C5 keepers byte-verify to their own runs; all C2
keepers trace to deliberate, named placement commits and are byte-identical to dev. The only
genuine historical gap is the C2 *source run images* (deleted long ago), which makes the 26
C2 keepers commit-provenanced rather than byte-verifiable — but the placed art itself is intact.
