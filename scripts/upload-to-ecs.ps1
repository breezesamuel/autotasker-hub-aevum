# Upload autotasker-src.tar.gz to ECS via base64-over-ssh in chunks
$ErrorActionPreference = "Stop"
$SourceFile = "F:\2026\第二次点子\repos\autotasker-hub-aevum\autotasker-src.tar.gz"
$RemoteFile = "/root/autotasker-src.tar.gz"
$B64File = "/root/autotasker-src.tar.gz.b64"
$Key = "$env:USERPROFILE\.ssh\id_ed25519"
$Server = "root@8.155.53.12"
$SshBin = "C:\Windows\System32\OpenSSH\ssh.exe"
$ScpBin = "C:\Windows\System32\OpenSSH\scp.exe"

Write-Host "Reading source file..."
$bytes = [IO.File]::ReadAllBytes($SourceFile)
$sizeMB = [math]::Round($bytes.Length / 1MB, 2)
Write-Host "Source size: $sizeMB MB ($($bytes.Length) bytes)"

$b64 = [Convert]::ToBase64String($bytes)
Write-Host "Base64 length: $($b64.Length) chars"

# Split into chunks of 4000 chars each
$chunkSize = 4000
$chunks = @()
for ($i = 0; $i -lt $b64.Length; $i += $chunkSize) {
    $chunks += $b64.Substring($i, [Math]::Min($chunkSize, $b64.Length - $i))
}
Write-Host "Total chunks: $($chunks.Count)"

# Upload chunks one by one
for ($ci = 0; $ci -lt $chunks.Count; $ci++) {
    $chunk = $chunks[$ci]
    $op = if ($ci -eq 0) { ">" } else { ">>" }
    # Use ssh with -T (no tty) and pipe echo output
    $cmd = "echo '$chunk' $op '$B64File'"
    $proc = Start-Process -FilePath $SshBin -ArgumentList @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15", $Server, $cmd) -NoNewWindow -Wait -PassThru -RedirectStandardError "$env:TEMP\ssh_err_$ci.txt"
    $err = Get-Content -Raw "$env:TEMP\ssh_err_$ci.txt" -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\ssh_err_$ci.txt" -Force -ErrorAction SilentlyContinue
    if ($proc.ExitCode -ne 0) {
        Write-Host "Chunk $ci FAILED (exit=$($proc.ExitCode)): $err" -ForegroundColor Red
        exit 1
    }
    Write-Host ("Uploading chunk {0}/{1} ({2:P1})" -f ($ci+1), $chunks.Count, ($ci+1)/$chunks.Count)
}

# Decode on remote
Write-Host "Decoding on remote server..."
$decodeCmd = "base64 -d '$B64File' > '$RemoteFile' && rm '$B64File' && wc -c '$RemoteFile' && md5sum '$RemoteFile'"
$proc = Start-Process -FilePath $SshBin -ArgumentList @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30", $Server, $decodeCmd) -NoNewWindow -Wait -PassThru -RedirectStandardError "$env:TEMP\ssh_decode_err.txt"
$err = Get-Content -Raw "$env:TEMP\ssh_decode_err.txt" -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\ssh_decode_err.txt" -Force -ErrorAction SilentlyContinue
$out = $proc.StandardOutput.ReadToEnd()
Write-Host $out
if ($proc.ExitCode -ne 0) {
    Write-Host "Decode FAILED: $err" -ForegroundColor Red
    exit 1
}

Write-Host "Upload complete!" -ForegroundColor Green
