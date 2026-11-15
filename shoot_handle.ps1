param(
    [Parameter(Mandatory = $true)][long]$Handle,
    [string]$Out = "$PSScriptRoot\handle_shot.png"
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class HandleShot {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

[void][HandleShot]::SetProcessDPIAware()   # report physical pixels, otherwise HiDPI windows get cropped
$hwnd = [IntPtr]$Handle
$r = New-Object HandleShot+RECT
if (-not [HandleShot]::GetWindowRect($hwnd, [ref]$r)) {
    Write-Host "[FAIL] GetWindowRect failed"
    exit 1
}
$w = $r.Right - $r.Left
$h = $r.Bottom - $r.Top
Write-Host "[INFO] rect ${w}x${h} at $($r.Left),$($r.Top) visible=$([HandleShot]::IsWindowVisible($hwnd))"
if ($w -lt 50 -or $h -lt 50) { Write-Host "[FAIL] window too small"; exit 2 }

function Grab([IntPtr]$hnd, [int]$ww, [int]$hh) {
    $bmp = New-Object System.Drawing.Bitmap $ww, $hh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc()
    $ok = [HandleShot]::PrintWindow($hnd, $hdc, 2)
    $g.ReleaseHdc($hdc)
    $g.Dispose()
    return @{ bmp = $bmp; ok = $ok }
}

function NonBlackRatio($bmp, [int]$ww, [int]$hh) {
    $stepX = [Math]::Max(1, [int]($ww / 60))
    $stepY = [Math]::Max(1, [int]($hh / 60))
    $nonBlack = 0; $total = 0
    for ($y = 0; $y -lt $hh; $y += $stepY) {
        for ($x = 0; $x -lt $ww; $x += $stepX) {
            $c = $bmp.GetPixel($x, $y)
            $total++
            if ($c.R + $c.G + $c.B -gt 24) { $nonBlack++ }
        }
    }
    if ($total -eq 0) { return 0 }
    return [Math]::Round(100.0 * $nonBlack / $total, 1)
}

$wasVisible = [HandleShot]::IsWindowVisible($hwnd)

$res = Grab $hwnd $w $h
$ratio = NonBlackRatio $res.bmp $w $h
Write-Host "[1] PrintWindow ok=$($res.ok) nonBlack=$ratio%"

if ($ratio -lt 5) {
    Write-Host "[INFO] looks like a black frame; showing window briefly (no activation) and retrying"
    [void][HandleShot]::ShowWindow($hwnd, 4)   # SW_SHOWNOACTIVATE
    Start-Sleep -Milliseconds 1200
    $res.bmp.Dispose()
    $res = Grab $hwnd $w $h
    $ratio = NonBlackRatio $res.bmp $w $h
    Write-Host "[2] PrintWindow ok=$($res.ok) nonBlack=$ratio%"
    if (-not $wasVisible) {
        [void][HandleShot]::ShowWindow($hwnd, 0)   # SW_HIDE, restore original state
        Write-Host "[INFO] window hidden again"
    }
}

$res.bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$res.bmp.Dispose()
Write-Host "[OK] saved: $Out (nonBlack=$ratio%)"
