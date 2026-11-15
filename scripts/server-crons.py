"""
server-crons.py — 给 ECS 服务器装 AutoTasker Hub 的自愈/预热/备份/返利/对账 cron。

原则（硬约束）：
  - 只动自己的行：服务器 crontab 已有其他项目任务（bingdashan/bds24/hq_ops），
    本脚本只替换/追加带 `# autotasker-hub <tag>` 标注的行，其余原样保留。
  - 幂等：先摘掉已有 autotasker 行，再按期望整块写回（命令变更也能自动更新）。
  - 转义：crontab 里 `%` 有特殊含义（换行），date +%F 必须写成反斜杠+百分号。
  - 装完执行 `crontab -l` 回读验证，并打印最终 crontab 供人工复核。

真实路径（由 deploy-v6.py 决定）：
  APP     = /www/autotasker/app    代码 + 累计数据（data/payments、referrals…）
  LOGDIR  = /www/autotasker/data   服务日志与运维日志（service.log、reconcile.log）
  BACKUPS = /www/autotasker/backups

任务：
  1) watchdog  每 5 分钟：systemd 服务不在就重启（自愈）
  2) warmup    每 10 分钟：预热 /trending 与 /feed.xml 缓存（触达内容常新）
  3) backup    每天 4:30：打包 app/data → backups/，保留最近 14 份
  4) snapshot  每周一 5:01：返利付款计划 JSON 快照（审计底稿）
  5) rebate    每周一 5:10：auto-rebate-pay --execute --cap 50（双上限 + gas 守卫）
  6) reconcile 每天 5:15：账本 vs 链上对账，报告给 /api/x402/reconcile
"""
import os
import sys
import paramiko

# Windows GBK console can't print ✓/emoji — force UTF-8 with safe fallback
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = "8.155.53.12"
KEY = os.path.join(os.environ.get("USERPROFILE", ""), ".ssh", "id_ed25519")
APP = "/www/autotasker/app"
LOGDIR = "/www/autotasker/data"
BACKUPS = "/www/autotasker/backups"
MARK = "# autotasker-hub"

# (tag, cron line) —— tag 用于精确识别/替换我们自己的行
CRON_TASKS = [
    ("watchdog",
     "*/5 * * * * systemctl is-active --quiet autotasker || systemctl restart autotasker  " + MARK + " watchdog"),
    ("warmup",
     "*/10 * * * * curl -fsS -o /dev/null -m 20 http://127.0.0.1:8795/trending ; curl -fsS -o /dev/null -m 20 http://127.0.0.1:8795/feed.xml  " + MARK + " warmup"),
    ("daily-backup",
     "30 4 * * * cd /www/autotasker && tar czf backups/appdata-$(date +\\%F).tar.gz app/data 2>/dev/null && ls -1t backups/appdata-*.tar.gz | tail -n +15 | xargs -r rm -f  " + MARK + " daily-backup"),
    ("weekly-rebate-snapshot",
     "1 5 * * 1 cd " + APP + " && mkdir -p data/rebates && node -e \"console.log(JSON.stringify(require('./lib/referrals').payoutPlan()))\" > data/rebates/plan-$(date +\\%F).json 2>>" + LOGDIR + "/service.log  " + MARK + " weekly-rebate-snapshot"),
    ("weekly-rebate-pay",
     "10 5 * * 1 cd " + APP + " && mkdir -p " + LOGDIR + "/rebates && node scripts/auto-rebate-pay.js --execute --cap 50 >> " + LOGDIR + "/rebates/pay.log 2>&1  " + MARK + " weekly-rebate-pay"),
    ("daily-reconcile",
     "15 5 * * * cd " + APP + " && node scripts/reconcile-onchain.js --json >> " + LOGDIR + "/reconcile.log 2>&1  " + MARK + " daily-reconcile"),
    ("weekly-report-export",
     "20 5 * * 1 cd " + APP + " && mkdir -p data/reports && node scripts/export-weekly-report.js >> " + LOGDIR + "/service.log 2>&1  " + MARK + " weekly-report-export"),
    ("daily-digest-0h",
     "0 16 * * * cd " + APP + " && node scripts/auto-digest.js >> " + LOGDIR + "/digest.log 2>&1  " + MARK + " daily-digest-0h"),
    ("daily-digest-6h",
     "0 22 * * * cd " + APP + " && node scripts/auto-digest.js >> " + LOGDIR + "/digest.log 2>&1  " + MARK + " daily-digest-6h"),
    ("daily-digest-12h",
     "0 4 * * * cd " + APP + " && node scripts/auto-digest.js >> " + LOGDIR + "/digest.log 2>&1  " + MARK + " daily-digest-12h"),
    ("daily-digest-18h",
     "0 10 * * * cd " + APP + " && node scripts/auto-digest.js >> " + LOGDIR + "/digest.log 2>&1  " + MARK + " daily-digest-18h"),
    ("weekly-channel-analysis",
     "25 5 * * 1 cd " + APP + " && node scripts/channel-tracker.js --ingest >> " + LOGDIR + "/service.log 2>&1; node scripts/channel-tracker.js >> " + LOGDIR + "/channels.log 2>&1  " + MARK + " weekly-channel-analysis"),
    ("daily-hn-submit",
     '30 16 * * * cd ' + APP + " && node scripts/auto-submit.js hn --title 'Real-time Chinese trending data API (x402 USDC)' --url https://autotasker.highkingflower.com/trending >> " + LOGDIR + "/submit.log 2>&1  " + MARK + " daily-hn-submit"),
    ("sweep-monitor",
     "15 */6 * * * curl -fsS -o /dev/null -m 30 -X POST http://127.0.0.1:8795/api/sweep/trigger >> " + LOGDIR + "/service.log 2>&1  " + MARK + " sweep-monitor"),
    ("asset-refresh",
     "45 */6 * * * curl -fsS -o /dev/null -m 90 -X POST http://127.0.0.1:8795/api/assets/scan >> " + LOGDIR + "/service.log 2>&1  " + MARK + " asset-refresh"),
    ("dormant-refresh",
     "5 3 * * * cd " + APP + " && node scripts/dormant-finder.js >> " + LOGDIR + "/service.log 2>&1  " + MARK + " dormant-refresh"),
    ("bounty-bump",
     "35 */6 * * * curl -fsS -o /dev/null -m 30 -X POST http://127.0.0.1:8795/api/bounty/bump-stale >> " + LOGDIR + "/service.log 2>&1  " + MARK + " bounty-bump"),
    ("social-queue",
     "40 5 * * * curl -fsS -o /dev/null -m 30 -X POST http://127.0.0.1:8795/api/social/generate >> " + LOGDIR + "/service.log 2>&1  " + MARK + " social-queue"),
    ("trading-loop",
     "20 */4 * * * curl -fsS -o /dev/null -m 120 -X POST http://127.0.0.1:8795/api/trading/cron >> " + LOGDIR + "/service.log 2>&1  " + MARK + " trading-loop"),
    # diskguard: the 2026-11-15 outage signature (TCP accepts, no banner/TLS, all
    # nodes time out) is what a full disk looks like from outside. Keep the box
    # from ever reaching 100% again: prune backups to 14, trim any log > 50MB,
    # vacuum journal > 200MB, and leave an audit line whenever usage >= 85%.
    ("diskguard",
     "*/30 * * * * U=$(df -P / | tail -1 | tr -s ' ' | cut -d' ' -f5 | tr -d '\\%'); "
     "case \"$U\" in ''|*[!0-9]*) U=0;; esac; "
     "if [ \"$U\" -ge 85 ]; then echo \"$(date +\\%F_\\%T) disk ${U}\\%\" >> " + LOGDIR + "/disk.log; fi; "
     "find " + BACKUPS + " -type f -name 'appdata-*.tar.gz' | sort | head -n -14 | xargs -r rm -f; "
     "for f in " + LOGDIR + "/*.log; do [ -f \"$f\" ] || continue; sz=$(stat -c\\%s \"$f\" 2>/dev/null || echo 0); "
     "[ \"$sz\" -gt 50000000 ] && tail -c 3000000 \"$f\" > \"$f.tmp\" && mv \"$f.tmp\" \"$f\"; done; "
     "journalctl --vacuum-size=200M >/dev/null 2>&1 || true  " + MARK + " diskguard"),
]
TAGS = {t for t, _ in CRON_TASKS}


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last = None
    for attempt in range(4):
        try:
            c.connect(HOST, username="root", key_filename=KEY,
                      timeout=60, banner_timeout=60, auth_timeout=60)
            break
        except Exception as e:
            last = e
            print(f"[WARN] SSH attempt {attempt+1} failed: {type(e).__name__}: {str(e)[:80]}; retry in 20s")
            import time
            time.sleep(20)
    else:
        raise last

    def run(cmd, label):
        _, o, e = c.exec_command(cmd, timeout=120)
        out = o.read().decode(errors="replace")
        err = e.read().decode(errors="replace")
        rc = o.channel.recv_exit_status()
        if rc != 0:
            print(f"[FAIL] {label} rc={rc}\n{err[:400]}")
            sys.exit(1)
        return out

    run(f"mkdir -p {BACKUPS} {LOGDIR}/rebates {APP}/data/rebates", "prepare dirs")

    current = run("crontab -l 2>/dev/null || true", "read crontab")
    lines = [l.rstrip("\n") for l in current.splitlines() if l.strip() != ""]

    # 摘掉我们自己的旧行（按 tag 精确识别），其他项目一行不碰
    kept, removed = [], []
    for ln in lines:
        if MARK in ln and any((" " + t) in ln for t in TAGS):
            removed.append(ln)
        else:
            kept.append(ln)

    desired = [ln for _, ln in CRON_TASKS]
    new_lines = kept + desired
    changed = removed != desired or len(kept) + len(desired) != len(lines)
    if changed:
        payload = "\n".join(new_lines) + "\n"
        sftp = c.open_sftp()
        with sftp.open("/tmp/crontab.autotasker", "w") as f:
            f.write(payload)
        sftp.close()
        run("crontab /tmp/crontab.autotasker && rm -f /tmp/crontab.autotasker", "install crontab")
        print(f"[OK] crontab 已更新：替换/新增 {len(desired)} 条 autotasker 任务，移除旧版 {len(removed)} 条")
    else:
        print("[OK] crontab 已是最新，未做任何改动")

    final = run("crontab -l", "verify crontab")
    others = [l for l in final.splitlines() if l.strip() and MARK not in l]
    ours = [l for l in final.splitlines() if MARK in l]
    print(f"[OK] 回读：其他项目任务 {len(others)} 行原样保留；autotasker 任务 {len(ours)} 行")
    for l in ours:
        print("  " + l)


if __name__ == "__main__":
    main()
