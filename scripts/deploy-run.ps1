# Deploy autotasker to ECS: upload installer script and run it
$ErrorActionPreference = "Stop"
$SourceSh = "F:\2026\第二次点子\repos\autotasker-hub-aevum\scripts\deploy-ecs-autotasker.sh"
$RemoteSh = "/root/deploy-ecs-autotasker.sh"
$Key = "$env:USERPROFILE\.ssh\id_ed25519"
$Server = "root@8.155.53.12"
$SshBin = "C:\Windows\System32\OpenSSH\ssh.exe"

Write-Host "== Uploading deploy script ==" -ForegroundColor Cyan
& $SshBin -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=15 $Server `
    "bash -s" < $SourceSh
if ($LASTEXITCODE -ne 0) {
    Write-Host "Upload failed" -ForegroundColor Red
    exit 1
}
Write-Host "Deploy script uploaded."

Write-Host "== Running remote deploy ==" -ForegroundColor Cyan
& $SshBin -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=15 $Server `
    "bash /root/deploy-ecs-autotasker.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy failed" -ForegroundColor Red
    exit 1
}
Write-Host "DONE" -ForegroundColor Green
