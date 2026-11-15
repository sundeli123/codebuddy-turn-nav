Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinEnum {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$rows = New-Object System.Collections.ArrayList

$cb = [WinEnum+EnumProc]{
    param($hWnd, $lParam)
    if (-not [WinEnum]::IsWindowVisible($hWnd)) { return $true }
    $len = [WinEnum]::GetWindowTextLength($hWnd)
    if ($len -le 0) { return $true }
    $sb = New-Object System.Text.StringBuilder ($len + 2)
    [void][WinEnum]::GetWindowText($hWnd, $sb, $sb.Capacity)
    $title = $sb.ToString()
    $pidOwner = 0
    [void][WinEnum]::GetWindowThreadProcessId($hWnd, [ref]$pidOwner)
    $r = New-Object WinEnum+RECT
    [void][WinEnum]::GetWindowRect($hWnd, [ref]$r)
    $w = $r.Right - $r.Left
    $h = $r.Bottom - $r.Top
    if ($w -lt 200 -or $h -lt 150) { return $true }
    $p = Get-Process -Id $pidOwner -ErrorAction SilentlyContinue
    [void]$rows.Add([PSCustomObject]@{
        Handle = $hWnd.ToInt64()
        Pid    = $pidOwner
        Proc   = if ($p) { $p.ProcessName } else { '?' }
        Size   = "$w x $h"
        Title  = $title
    })
    return $true
}

[void][WinEnum]::EnumWindows($cb, [IntPtr]::Zero)
$rows | Sort-Object Size -Descending | Format-Table -AutoSize -Wrap
