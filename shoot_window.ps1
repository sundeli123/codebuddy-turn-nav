param(
    [string]$ProcName = 'QQ',
    [string]$Out = "$PSScriptRoot\window_shot.png"
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public class WinShot {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$target = @{}
foreach ($p in (Get-Process -Name $ProcName -ErrorAction SilentlyContinue)) { $target[$p.Id] = $true }
if ($target.Count -eq 0) {
    Write-Host "[FAIL] no process named $ProcName"
    exit 1
}
Write-Host "[INFO] $ProcName pids: $($target.Keys -join ', ')"

$best = [IntPtr]::Zero
$bestArea = 0
$bestRect = New-Object WinShot+RECT

$cb = [WinShot+EnumProc]{
    param($hWnd, $lParam)
    if (-not [WinShot]::IsWindowVisible($hWnd)) { return $true }
    $pidOwner = 0
    [void][WinShot]::GetWindowThreadProcessId($hWnd, [ref]$pidOwner)
    if (-not $target.ContainsKey($pidOwner)) { return $true }
    $r = New-Object WinShot+RECT
    [void][WinShot]::GetWindowRect($hWnd, [ref]$r)
    $w = $r.Right - $r.Left
    $h = $r.Bottom - $r.Top
    if ($w -lt 300 -or $h -lt 200) { return $true }
    $area = $w * $h
    if ($area -gt $script:bestArea) {
        $script:bestArea = $area
        $script:best = $hWnd
        $script:bestRect = $r
    }
    return $true
}
[void][WinShot]::EnumWindows($cb, [IntPtr]::Zero)

if ($best -eq [IntPtr]::Zero) {
    Write-Host "[FAIL] no visible window (>=300x200) for $ProcName"
    exit 2
}

$w = $bestRect.Right - $bestRect.Left
$h = $bestRect.Bottom - $bestRect.Top
Write-Host "[INFO] window handle=$($best.ToInt64()) size=${w}x${h} iconic=$([WinShot]::IsIconic($best))"

$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [WinShot]::PrintWindow($best, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()

if (-not $ok) {
    Write-Host "[WARN] PrintWindow returned false (result may be incomplete)"
}

# black-frame check
$stepX = [Math]::Max(1, [int]($w / 60))
$stepY = [Math]::Max(1, [int]($h / 60))
$nonBlack = 0
$total = 0
for ($y = 0; $y -lt $h; $y += $stepY) {
    for ($x = 0; $x -lt $w; $x += $stepX) {
        $c = $bmp.GetPixel($x, $y)
        $total++
        if ($c.R + $c.G + $c.B -gt 24) { $nonBlack++ }
    }
}
$ratio = if ($total -gt 0) { [Math]::Round(100.0 * $nonBlack / $total, 1) } else { 0 }
Write-Host "[INFO] non-black pixel ratio: $ratio%  (below 5% usually means a black/garbage frame)"

$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "[OK] saved: $Out"
