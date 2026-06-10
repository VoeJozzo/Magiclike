# nightly-machine.ps1 — the audit campaign's free tier: pure machine time,
# no Claude usage. Runs nightly at 21:00 via the "Magiclike Audit Nightly
# Machine" scheduled task, finishing before/alongside the 23:00 audit window.
#
#   1. Pull the workshop worktree to the latest audit/integration tip.
#   2. Incremental mutation run (only mutants in changed files re-execute)
#      + regenerate MUTATION-MAP.md.
#   3. Selfplay bughunt sweep (500 games) — crashes/invariant violations land
#      in the dated log for the audit runner to read.
#
# Outputs: ~\.config\magiclike\audit\mutation\{results.json,MUTATION-MAP.md}
#          ~\.config\magiclike\audit\logs\selfplay_<date>.log
# Contract: docs/plans/plan-proto-audit.md -> "Free tier runs nightly regardless".

$ErrorActionPreference = "Continue"
$Workshop  = "C:\Users\Joe\Documents\magiclike-audit\workshop"
$AuditHome = "C:\Users\Joe\.config\magiclike\audit"
$LogDir    = Join-Path $AuditHome "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd"
$log   = Join-Path $LogDir "nightly-machine_$stamp.log"
function Log([string]$msg) { "$(Get-Date -Format o)  $msg" | Add-Content -Path $log -Encoding utf8 }

Log "nightly machine start"

if (-not (Test-Path $Workshop)) { Log "workshop worktree missing - exiting"; exit 0 }

# 1. Update workshop to latest audit/integration (ff-only; never clobber).
Set-Location $Workshop
git fetch origin 2>&1 | Out-Null
$pull = git merge --ff-only origin/audit/integration 2>&1
Log "workshop update: $pull"
Log "workshop tip: $(git rev-parse HEAD)"

# 2. Mutation run (incremental) + report.
$runner = Join-Path $Workshop "tools\audit\mutation\mutation-runner.js"
if (Test-Path $runner) {
    Log "mutation run starting"
    node $runner --proto (Join-Path $Workshop "reference\html-proto") 2>&1 |
        ForEach-Object { Log "  mut: $_" }
    Log "mutation run done (exit $LASTEXITCODE)"
} else {
    Log "mutation runner not found - skipping"
}

# 3. Selfplay bughunt sweep.
$selfplayLog = Join-Path $LogDir "selfplay_$stamp.log"
Set-Location (Join-Path $Workshop "reference\html-proto")
node tests\selfplay_harness.js 500 bughunt > $selfplayLog 2>&1
Log "selfplay sweep done (exit $LASTEXITCODE) -> $selfplayLog"

Log "nightly machine end"
