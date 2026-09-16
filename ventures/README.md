# ventures/

Commercial work that is **not part of Magiclike**. It lives here only because
this is the repo the branch was cut from; nothing in this folder is imported by
the game, the html-proto, or any test in `tests/`.

Each subfolder is self-contained and can be lifted out with
`git subtree split -P ventures/<name>` or a plain copy, without touching engine
history.

| Folder | What it is | State |
|--------|-----------|-------|
| `redaction-preflight/` | A browser tool that audits a PDF for hidden-but-recoverable content before release. Aimed at legal, compliance and FOIA work. | Working, tested (37 engine + 21 end-to-end assertions). Not yet priced or hosted. |

Outside dependencies pulled in by these projects are logged in the root
`LICENSES.md` like anything else.
