# overnight-runner.ps1 — the audit campaign's hourly "boop"
#
# Invoked hourly 23:00-06:00 by the "Magiclike Audit Runner" scheduled task
# (via the stable shim at ~\.config\magiclike\audit\boop.ps1). Each invocation
# is idempotent: it either starts/resumes audit work or exits fast.
#
# Exit-fast conditions (logged, exit 0):
#   - outside the 23:00-06:30 window (unless -IgnoreWindow)
#   - another invocation holds a live lock
#   - the campaign is not armed (STATE.md lacks "Armed: yes")
#   - the runner worktree is missing
#
# Contract: docs/plans/plan-proto-audit.md -> "Autonomy design (overnight runs)".
# The ~3h watchdog below is a CRASH backstop; work-sizing against the
# pencils-down deadline is the runner skill's job, so the deadline is passed
# into the prompt.

param(
    # Worktree the headless session runs in (pinned to audit/findings; it
    # holds STATE.md and the /audit-next-chunk skill).
    [string]$WorktreePath = "C:\Users\Joe\Documents\magiclike-audit\findings",
    # Bypass the time-window guard for manual / dry-run invocations.
    [switch]$IgnoreWindow,
    # Watchdog: kill the claude process after this many seconds (default 3h).
    [int]$WatchdogSeconds = 10800
)

$AuditHome = "C:\Users\Joe\.config\magiclike\audit"
$LogDir    = Join-Path $AuditHome "logs"
$LockFile  = Join-Path $AuditHome "runner.lock"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$stamp   = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$LogFile = Join-Path $LogDir "boop_$stamp.log"
function Log([string]$msg) {
    "$(Get-Date -Format o)  $msg" | Add-Content -Path $LogFile -Encoding utf8
}

Log "boop start (pid $PID)"

# --- 1. Window guard: only work 23:00-06:30 ---------------------------------
if (-not $IgnoreWindow) {
    $now = Get-Date
    $inWindow = ($now.Hour -ge 23) -or ($now.Hour -lt 6) -or ($now.Hour -eq 6 -and $now.Minute -le 30)
    if (-not $inWindow) {
        Log "outside 23:00-06:30 window ($($now.ToString('HH:mm'))) - exiting"
        exit 0
    }
}

# --- 2. Lockfile: is someone already working? --------------------------------
if (Test-Path $LockFile) {
    $lockPid = $null
    try { $lockPid = [int](Get-Content $LockFile -TotalCount 1 -ErrorAction Stop) } catch {}
    $alive = $false
    if ($lockPid) {
        try { $alive = $null -ne (Get-Process -Id $lockPid -ErrorAction Stop) } catch {}
    }
    if ($alive) {
        Log "live lock held by pid $lockPid - exiting (no double work)"
        exit 0
    }
    Log "stale lock (pid $lockPid not running) - clearing"
    Remove-Item $LockFile -Force -Confirm:$false
}
Set-Content -Path $LockFile -Value $PID -Encoding ascii
Log "lock acquired"

try {
    # --- 3. Worktree + armed check -------------------------------------------
    $stateFile = Join-Path $WorktreePath "docs\audit\STATE.md"
    if (-not (Test-Path $WorktreePath)) {
        Log "runner worktree missing at $WorktreePath - exiting (Phase 0 incomplete)"
        exit 0
    }
    if (-not (Test-Path $stateFile)) {
        Log "STATE.md missing at $stateFile - exiting (campaign not initialized)"
        exit 0
    }
    $armed = Select-String -Path $stateFile -Pattern '^\s*Armed:\s*yes\s*$' -Quiet
    if (-not $armed) {
        Log "campaign not armed (STATE.md lacks 'Armed: yes') - exiting"
        exit 0
    }

    # --- 4. Pencils-down deadline: the NEXT 06:30 ----------------------------
    $now = Get-Date
    $deadline = Get-Date -Hour 6 -Minute 30 -Second 0
    if ($now -gt $deadline) { $deadline = $deadline.AddDays(1) }
    $deadlineIso = $deadline.ToString("yyyy-MM-ddTHH:mm")
    Log "pencils-down deadline: $deadlineIso"

    # --- 5. Run the headless session under the watchdog ----------------------
    $claudeCmd  = "C:\Users\Joe\AppData\Roaming\npm\claude.cmd"
    $prompt     = "/audit-next-chunk pencils-down=$deadlineIso"
    $sessionLog = Join-Path $LogDir "session_$stamp.log"
    Log "launching: claude -p `"$prompt`" (cwd $WorktreePath, watchdog ${WatchdogSeconds}s)"

    $proc = Start-Process -FilePath $claudeCmd `
        -ArgumentList @('-p', "`"$prompt`"") `
        -WorkingDirectory $WorktreePath `
        -RedirectStandardOutput $sessionLog `
        -RedirectStandardError  ($sessionLog + ".err") `
        -NoNewWindow -PassThru

    $finished = $proc.WaitForExit($WatchdogSeconds * 1000)
    if (-not $finished) {
        Log "WATCHDOG: session exceeded ${WatchdogSeconds}s - killing pid $($proc.Id) and its children"
        # Kill the process tree: claude.cmd spawns node underneath.
        & taskkill.exe /PID $proc.Id /T /F | ForEach-Object { Log "  taskkill: $_" }
        Log "boop end: watchdog kill (resume next boop via STATE.md claims)"
        exit 1
    }
    Log "session exited with code $($proc.ExitCode)"
    Log "boop end: ok"
    exit 0
}
finally {
    Remove-Item $LockFile -Force -Confirm:$false -ErrorAction SilentlyContinue
}
