# Push AutoTasker Hub source + installer to ECS then run remote install.
# Uses python upload-ecs.py for upload (avoids Windows scp colon bug).
$ErrorActionPreference = "Stop"

$Root    = Split-Path -Parent $PSScriptRoot
$Uploader = Join-Path $Root "scripts\upload-ecs.py"
$TarPath = Join-Path $Root "autotasker-src.tar.gz"
$ShPath  = Join-Path $Root "scripts\deploy-ecs-autotasker.sh"
$NginxCnf = Join-Path $Root "deploy\nginx-autotasker.conf"

Set-Location $Root

Write-Host "== 1/5 stage source ==" -ForegroundColor Cyan
if (Test-Path $TarPath) { Remove-Item -Force $TarPath }
$items = @(
  "server.js", "index.js", "package.json", "package-lock.json",
  "lib", "data", "public", "config"
)
$stage = Join-Path $env:TEMP ("autotasker-stage-" + [guid]::NewGuid().ToString("N").Substring(0, 6))
New-Item -ItemType Directory -Path $stage | Out-Null
foreach ($i in $items) {
  if (Test-Path (Join-Path $Root $i)) {
    Copy-Item -Recurse -Force (Join-Path $Root $i) (Join-Path $stage $i)
  }
}
# Drop sensitive data
foreach ($p in @(".env.local",".env.production","credentials.json")) {
  Get-ChildItem -Path $stage -Recurse -Filter $p -Force -ErrorAction SilentlyContinue |
    Where-Object { $_ -ne $null } | Remove-Item -Force -ErrorAction SilentlyContinue
}
Get-ChildItem -Path "$stage\data\payments"   -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path "$stage\data\outreach"   -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path "$stage\data\recon"      -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Push-Location $stage
tar -czf $TarPath .
Pop-Location
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
Write-Host ("   archive {0:N1} MB" -f ((Get-Item $TarPath).Length / 1MB))

Write-Host "== 2/5 upload archive + installer == " -ForegroundColor Cyan
python "$Uploader" upload $TarPath "/root/autotasker-src.tar.gz"
python "$Uploader" upload $ShPath "/root/deploy-ecs-autotasker.sh"

Write-Host "== 3/5 push nginx vhost == " -ForegroundColor Cyan
python "$Uploader" upload $NginxCnf "/www/server/panel/vhost/nginx/autotasker.highkingflower.com.conf"
python "$Uploader" cmd "nginx -t 2>&1 && systemctl reload nginx && echo NGINX_RELOADED"

Write-Host "== 4/5 remote install/restart == " -ForegroundColor Cyan
python "$Uploader" cmd "sed -i 's/\r$//' /root/deploy-ecs-autotasker.sh && bash /root/deploy-ecs-autotasker.sh"

Write-Host "== 5/5 public self-check == " -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest -Uri "https://autotasker.highkingflower.com/api/status" -TimeoutSec 20
  Write-Output ("   public status " + $r.StatusCode)
  Write-Output $r.Content
} catch {
  Write-Host ("   public check failed: " + $_.Exception.Message) -ForegroundColor Yellow
}

Write-Host "DONE" -ForegroundColor Green
