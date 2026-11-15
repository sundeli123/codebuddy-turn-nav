# Adds --remote-debugging-port to the CodeBuddy shortcuts (backup first).
# Usage:
#   powershell -ExecutionPolicy Bypass -File set_shortcut.ps1            # add port
#   powershell -ExecutionPolicy Bypass -File set_shortcut.ps1 -Restore   # revert
param(
    [int]$Port = 9333,
    [switch]$Restore
)

$targets = @(
    "$env:USERPROFILE\Desktop\CodeBuddy CN.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\CodeBuddy CN\CodeBuddy CN.lnk"
)

$backupFile = Join-Path $env:APPDATA 'CodeBuddyTocNav\shortcut_backup.json'

$shell = New-Object -ComObject WScript.Shell

if ($Restore) {
    if (-not (Test-Path $backupFile)) {
        Write-Host "[FAIL] backup not found: $backupFile"
        exit 1
    }
    $backup = Get-Content $backupFile -Raw | ConvertFrom-Json
    foreach ($b in $backup) {
        if (-not (Test-Path $b.Path)) { continue }
        $lnk = $shell.CreateShortcut($b.Path)
        $lnk.Arguments = $b.Arguments
        $lnk.Save()
        Write-Host "[OK] restored: $($b.Path)  args='$($b.Arguments)'"
    }
    exit 0
}

$records = @()
foreach ($p in $targets) {
    if (-not (Test-Path $p)) { Write-Host "[SKIP] not found: $p"; continue }
    $lnk = $shell.CreateShortcut($p)
    $orig = $lnk.Arguments
    $records += [PSCustomObject]@{ Path = $p; Arguments = $orig }

    $flag = "--remote-debugging-port=$Port"
    if ($orig -match [regex]::Escape($flag)) {
        Write-Host "[SKIP] already has flag: $p"
        continue
    }
    $newArgs = ($orig + ' ' + $flag).Trim()
    $lnk.Arguments = $newArgs
    $lnk.Save()
    Write-Host "[OK] $p"
    Write-Host "     args: '$newArgs'"
}

$records | ConvertTo-Json -Depth 3 | Set-Content -Path $backupFile -Encoding UTF8
Write-Host "[DONE] original args saved to $backupFile"
Write-Host "       revert with: -Restore"
