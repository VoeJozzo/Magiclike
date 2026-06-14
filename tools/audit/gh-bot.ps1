# gh-bot.ps1 — run any gh command as Thaumaturge-Claude.
#
# gh API writes (pr create/comment/merge/review, api ...) post as the ACTIVE
# gh account — by default the owner, NOT the bot. This wrapper derives the
# bot token from the keyring at runtime (never stored) and prefixes it, per
# docs/IDENTITIES.md -> Push/PR flow. Usage:
#   tools/audit/gh-bot.ps1 pr create --base audit/integration --title "..." ...
#   tools/audit/gh-bot.ps1 pr view 42 --json author --jq .author.login

$token = & gh auth token --user Thaumaturge-Claude 2>$null
if (-not $token) {
    Write-Error "gh-bot: could not derive Thaumaturge-Claude token from gh keyring (gh auth status?)"
    exit 1
}
$env:GH_TOKEN = $token
& gh @args
exit $LASTEXITCODE
