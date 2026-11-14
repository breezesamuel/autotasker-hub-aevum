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
]
TAGS = {t for t, _ in CRON_TASKS}


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", key_filename=KEY, timeout=20)

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
