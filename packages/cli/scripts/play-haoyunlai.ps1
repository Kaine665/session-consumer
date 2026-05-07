Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Vol {
    [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    static readonly byte VK_UP = 0xAF;
    static readonly byte VK_DOWN = 0xAE;
    static readonly uint KEYEVENTF_KEYUP = 0x2;

    public static void Set(int pct) {
        // Zero out first
        for (int i = 0; i < 50; i++) {
            keybd_event(VK_DOWN, 0, 0, UIntPtr.Zero);
            keybd_event(VK_DOWN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            System.Threading.Thread.Sleep(20);
        }
        // Up to target (50 steps = 100%)
        int steps = pct / 2;
        for (int i = 0; i < steps; i++) {
            keybd_event(VK_UP, 0, 0, UIntPtr.Zero);
            keybd_event(VK_UP, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            System.Threading.Thread.Sleep(20);
        }
        Console.WriteLine("Volume set to " + pct + "%");
    }
}
'@ -ReferencedAssemblies System.Runtime.InteropServices

[Vol]::Set(50)

# Download correct 好运来 (祖海原版 id=333750)
$url = 'https://music.163.com/song/media/outer/url?id=333750.mp3'
$outPath = "$env:TEMP\haoyunlai2.mp3"
Invoke-WebRequest -Uri $url -OutFile $outPath -TimeoutSec 30
$size = (Get-Item $outPath).Length
Write-Host "Downloaded: $size bytes"

if ($size -gt 100000) {
    Start-Process $outPath
    Write-Host "Playing 好运来 - 祖海"
} else {
    Write-Host "Small file, might not be the right song ($size bytes)"
}
