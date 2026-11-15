param([string]$ProcName = 'QQ')

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinAll {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$target = @{}
foreach ($p in (Get-Process -Name $ProcName -ErrorAction SilentlyContinue)) { $target[$p.Id] = $true }
Write-Host "pids: $($target.Keys -join ', ')"

$rows = New-Object System.Collections.ArrayList
$cb = [WinAll+EnumProc]{
    param($hWnd, $lParam)
    $pidOwner = 0
    [void][WinAll]::GetWindowThreadProcessId($hWnd, [ref]$pidOwner)
    if (-not $target.ContainsKey($pidOwner)) { return $true }

    $r = New-Object WinAll+RECT
    [void][WinAll]::GetWindowRect($hWnd, [ref]$r)
    $cls = New-Object System.Text.StringBuilder 256
    [void][WinAll]::GetClassName($hWnd, $cls, 256)
    $ttl = New-Object System.Text.StringBuilder 256
    [void][WinAll]::GetWindowText($hWnd, $ttl, 256)

    [void]$rows.Add([PSCustomObject]@{
        Handle  = $hWnd.ToInt64()
        Pid     = $pidOwner
        Size    = "$($r.Right - $r.Left) x $($r.Bottom - $r.Top)"
        Pos     = "$($r.Left),$($r.Top)"
        Visible = [WinAll]::IsWindowVisible($hWnd)
        Iconic  = [WinAll]::IsIconic($hWnd)
        Class   = $cls.ToString()
        Title   = $ttl.ToString()
    })
    return $true
}
[void][WinAll]::EnumWindows($cb, [IntPtr]::Zero)

if ($rows.Count -eq 0) { Write-Host "[NONE] no top-level window owned by $ProcName" }
else { $rows | Sort-Object { [int](($_.Size -split ' x ')[0]) } -Descending | Format-Table -AutoSize -Wrap }
