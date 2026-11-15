# 事故报告 · 2026-11-15 生产服务器全球失联

> 发现时间：2026-11-15 20:10（本地时间）
> 影响：全部收入路径中断（x402 收款、17→20 条 cron、watchdog 自愈、对账、返利、trading paper loop）
> 状态：**待处理 —— 需要阿里云控制台操作（SSH/HTTPS 均不可用，无法远程修复）**

## 1. 证据链（已排除"墙"和"本机网络"）

| 探测 | 结果 | 含义 |
|------|------|------|
| ICMP ping 8.155.53.12 | 通，TTL=47，53–123ms（抖动大） | 主机网络层活着 |
| TCP 22 直连 | 握手成功 0.09s，**收到 0 字节，无 SSH banner** | sshd 没有响应（不是被墙：被墙不会完成握手） |
| TCP 443 直连 | 握手成功 0.08s，**收到 0 字节，无 TLS ServerHello** | nginx 没有响应 |
| TCP 8795 / 9999 | 无 SYN-ACK，超时 | 安全组仍只放行 22/443 → **IP 仍是我们的机器**（不是被回收换租户） |
| check-host.net 5 节点（香港/印尼/伊朗/哈萨克/塞尔维亚） | 全部 `Connection timed out`（25s） | **全球不可达**，与 GFW 无关 |
| GitHub Actions（Azure 美国网络，run `43715793885`） | `Public status endpoint must answer 200` → failure | 第二个独立网络确认：**不是本机/不是墙** |
| api.github.com / github.com 443 | 通 | 本机出网正常；GitHub API 推送路径可用 |

结论：**不是墙、不是本机、不是 DNS**。是这台 ECS 的应用层/IO 层卡死（典型：磁盘写满、系统盘 I/O 卡住、快照冻结、OOM）。
TCP 能握手是因为内核仍在内核态接受连接，但用户态进程（sshd/nginx）无法调度或无法读盘。

## 2. 影响面

- x402 收款归零（外部 agent 拿不到 402 报价，直接失败）
- 20 条 cron 全部停摆：watchdog / warmup / backup / rebate / reconcile / digest / bounty-bump / social-queue / **trading-loop**
- **自愈失效**：watchdog 是 `*/5 systemctl is-active || restart`，它自己就跑在这台机器上 —— 磁盘满/IO 卡死时 systemd 也起不来
- 数据不会丢（账本在 data/，但备份 cron 也停了 → 事故期间新数据无备份）

## 3. 恢复步骤（需要你操作，约 3 分钟）

**A. 阿里云控制台 → ECS → 实例（8.155.53.12）**

1. 看实例状态：`运行中` / `已停止` / `欠费`
   - 欠费停机 → 充值后 `启动`
   - 已停止 → 直接 `启动`
2. 看 云监控：CPU、**磁盘使用率**、磁盘 IOPS。若磁盘 100% 或 IOPS 打满 → 基本确诊磁盘满/IO 卡死
3. 用 **远程连接（VNC/Workbench）** 登录（不依赖 22 端口）：
   ```bash
   df -h /                     # 看是不是 100%
   du -sh /www/autotasker/data /www/autotasker/backups /var/log 2>/dev/null
   ls -lhS /www/autotasker/data/*.log | head           # 哪个日志爆了
   systemctl status autotasker --no-pager | head -20   # 服务什么状态
   journalctl -u autotasker -n 50 --no-pager           # 崩在哪
   ```
4. VNC 也进不去 / 命令卡住 → 控制台 `重启`（先普通重启；仍不行再 `强制重启`）

**B. 机器恢复后（本地一条命令，自动全流程）**

```powershell
cd F:\2026\第二次点子\repos\autotasker-hub-aevum
python scripts/watch-recover.py --hours 2 --interval 60
```

它会：探测 SSH banner → `deploy-v6.py`（含磁盘预检+清理） → `server-crons.py`（装 20 条 cron） → `verify-v13.js`（34 项生产验收）。

> 后台已经有 72 小时常驻 watcher 在跑（见第 5 节），机器一回来自动部署，无需手动。

## 4. 本次已落地的防复发加固（代码侧）

| 加固 | 文件 | 作用 |
|------|------|------|
| deploy 前置体检 | `scripts/deploy-v6.py` | 部署前打印 df/load/mem/大目录/日志体积；自动清理旧备份、/tmp、>50MB 日志、journal 超 200MB；**剩余 <300MB 直接中止部署**，不再往病机上压 10MB 上传 + npm ci |
| `diskguard` cron（第 20 条） | `scripts/server-crons.py` | 每 30 分钟：备份裁到 14 份、日志 >50MB 截尾到 3MB、journal 压到 200MB；磁盘 ≥85% 写 `data/disk.log` 审计行。**目标是永远不再到 100%** |
| 外部 watchdog | `.github/workflows/uptime.yml` | GitHub 网络每 15 分钟探测：`/api/status` 必须 200、`/api/x402/util/weather` 必须 402（收入面存活）、DNS 是否仍指向 8.155.53.12；失败即 GitHub 通知（机器上跑不了自愈时才靠它发现） |
| Vercel 镜像 workflow 修复 | `.github/workflows/deploy.yml` | 旧版用已归档的 `vercel/action@main` + 每次 push 触发 → **每次推送都红 + 发失败邮件**。改为手动触发 + 无 token 时绿色跳过 + 官方 CLI |
| 恢复 watcher | `scripts/watch-recover.py` | 三态判定（DOWN / HTTP-ONLY / SSH-UP），只认真正的 SSH banner（TCP 握手不算，避免本次这种假阳性）；恢复即自动跑 deploy→crons→verify；状态写 `data/ops/recover-state.json` |
| logrotate + 开机自启 | `scripts/deploy-v6.py` | 部署时幂等安装 `/etc/logrotate.d/autotasker`（50M×5 份、compress、copytruncate）→ 日志不再无界增长；并 `systemctl enable autotasker` 保证重启后自启 |
| 原型脚本重试 | `scripts/server-crons.py` | SSH 4 次重试（60s 超时/次） |

## 5. 当前后台任务

```
python scripts/watch-recover.py --hours 72 --interval 180
```
- 每 3 分钟探测一次，连续 72 小时
- 日志：`logs/ops/`（每次探测/每个恢复步骤一个文件）
- 状态：`data/ops/recover-state.json`
- 停止：结束该 python 进程即可

## 6. 经验教训（写进流程）

1. **"TCP 能连上"不等于"服务活着"**。以后所有连通性判断都要看应用层字节（SSH banner / HTTP 200），见 `watch-recover.py:probe_ssh`。
2. **自愈不能只放被自愈的机器上**。box 内 cron watchdog + 外部 GitHub 探测，两层才算闭环。
3. **磁盘是第一杀手**。日志只追加不轮转 + 每天 4 次 digest + 每周报告 + 备份，迟早写满 → 现在有 diskguard + deploy 预检双保险。
4. 部署脚本要先"体检"再"投药"：磁盘不足时中止，比部署到一半把机器压死要好。
