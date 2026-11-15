# Registers / removes the logon autostart entry for the turn navigator.
# Usage:
#   powershell -ExecutionPolicy Bypass -File autostart.ps1            # install
#   powershell -ExecutionPolicy Bypass -File autostart.ps1 -Remove    # uninstall
#   powershell -ExecutionPolicy Bypass -File autostart.ps1 -Status    # show
param(
    [switch]$Remove,
    [switch]$Status
)

$Name = 'CodeBuddyTocNav'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$Vbs = Join-Path $env:APPDATA 'CodeBuddyTocNav\start_hidden.vbs'

if ($Status) {
    $v = (Get-ItemProperty -Path $RunKey -Name $Name -ErrorAction SilentlyContinue).$Name
    if ($v) { Write-Host "[ON ] $Name = $v" } else { Write-Host "[OFF] $Name not registered" }
    exit 0
}

if ($Remove) {
    Remove-ItemProperty -Path $RunKey -Name $Name -ErrorAction SilentlyContinue
    Write-Host "[OK] removed autostart entry: $Name"
    exit 0
}

if (-not (Test-Path $Vbs)) {
    Write-Host "[FAIL] launcher not found: $Vbs"
    exit 1
}

$Cmd = 'wscript.exe "' + $Vbs + '"'
Set-ItemProperty -Path $RunKey -Name $Name -Value $Cmd
Write-Host "[OK] autostart registered"
Write-Host "     key: $RunKey\$Name"
Write-Host "     cmd: $Cmd"
Write-Host ""
Write-Host "It will start silently at next logon. To start it now:"
Write-Host "     wscript.exe `"$Vbs`""
