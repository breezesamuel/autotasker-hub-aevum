$stamp = "mwf42el6"
$marker = "__DONE__" + $stamp
$outPath = "F:\\2026\\第二次点子\\repos\\autotasker-hub-aevum\\scripts\\_o_mwf42el6.txt"
$errPath = "F:\\2026\\第二次点子\\repos\\autotasker-hub-aevum\\scripts\\_e_mwf42el6.txt"
$inPath  = "F:\\2026\\第二次点子\\repos\\autotasker-hub-aevum\\scripts\\_i_mwf42el6.txt"
$key     = "C:\\Users\\Think\\.ssh\\id_ed25519"
$server  = "root@8.155.53.12"
$sshBin  = "C:\\Windows\\System32\\OpenSSH\\ssh.exe"
$env:REMOTE_CMD = "uptime"
$env:MARKER      = "__DONE__mwf42el6"
$a = @("-T", "-i", $key,
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=15",
        $server,
        'bash', '-c', 'eval "${REMOTE_CMD}"; echo "${MARKER}"'
)
$p = Start-Process -FilePath $sshBin
  -ArgumentList $a
  -RedirectStandardInput $inPath
  -RedirectStandardOutput $outPath
  -RedirectStandardError $errPath
  -PassThru -WindowStyle Hidden
$deadline = (Get-Date).AddSeconds(120)
do { Start-Sleep -Milliseconds 200 } while (-not $p.HasExited -and (Get-Date) -lt $deadline)
if (-not $p.HasExited) { try { $p.Kill() } catch {} }
Start-Sleep -Milliseconds 300
$body = ""
if (Test-Path $outPath) { $body = Get-Content $outPath -Raw -ErrorAction SilentlyContinue }
$body = $body -replace [regex]::Escape($marker), ""
Write-Output $body
@($ps1Path,$inPath,$outPath,$errPath) | Where-Object { Test-Path $_ } | ForEach-Object { Remove-Item $_ -Force -ErrorAction SilentlyContinue }