#!/usr/bin/env node
// PreToolUse guard (Bash matcher): deny gh WRITE commands that lack a GH_TOKEN= prefix.
//
// Why: gh posts as its *active* account, which defaults to the repo owner
// (VoeJozzo). A bare `gh pr create/comment/review` or `gh api` mutation
// mis-attributes bot work to the owner. The fix is a per-command token:
//   GH_TOKEN="$(gh auth token --user <bot>)" gh pr create ...
// This hook turns that rule (docs/IDENTITIES.md) into a mechanism.
//
// Reads the PreToolUse payload on stdin; emits a deny decision only when the
// command is a gh write with no GH_TOKEN= anywhere in it. Reads (gh pr view,
// plain gh api GETs) pass through untouched. Errs toward denying: a gh api
// read that happens to mention -f/-F gets denied too, and adding the prefix
// to a read is harmless.

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = JSON.parse(raw).tool_input?.command ?? "";
  } catch {
    process.exit(0); // unparseable payload: stay out of the way
  }
  const ghWrite =
    /\bgh\s+pr\s+(create|comment|review|edit|merge|close|ready|reopen|lock|unlock)\b/.test(cmd) ||
    /\bgh\s+issue\s+(create|comment|edit|close|reopen|lock|unlock)\b/.test(cmd) ||
    /\bgh\s+(release|label)\s+(create|edit|delete)\b/.test(cmd) ||
    (/\bgh\s+api\b/.test(cmd) &&
      (/(?:-X|--method)[=\s]+['"]?(POST|PATCH|PUT|DELETE)\b/i.test(cmd) ||
        /(^|\s)(-f|-F|--field|--raw-field|--input)\b/.test(cmd)));
  if (ghWrite && !/\bGH_TOKEN=/.test(cmd)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            'gh write without a GH_TOKEN= prefix posts as the OWNER (VoeJozzo), not the bot. ' +
            'Re-run it as: GH_TOKEN="$(gh auth token --user <your-bot-account>)" gh ... — see docs/IDENTITIES.md.',
        },
      }),
    );
  }
  process.exit(0);
});
