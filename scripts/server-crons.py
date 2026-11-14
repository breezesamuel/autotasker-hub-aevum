"""
server-crons.py — 给 ECS 服务器装 AutoTasker Hub 的自愈/预热/备份/快照 cron。

原则（硬约束）：
  - 追加式：服务器 crontab 已有其他项目任务（bingdashan/bds24/hq_ops），只追加
    带 `# autotasker-hub` 标注的行，绝不改动/删除既有行。
  - 幂等：已存在相同标注+命令的行则跳过，不重复安装。
  - 转义：crontab 里 `%` 有特殊含义（换行），命令中的 date +%F 必须把 % 转义为反斜杠+百分号。
  - 装完执行 `crontab -l` 回读验证，并打印最终 crontab 供人工复核。

任务：
  1) watchdog  每 5 分钟：systemd 服务不在就重启（自愈）
  2) warmup    每 10 分钟：预热 /trending 与 /feed.xml 缓存（触达内容常新）
  3) backup    每天 4:30：打包 /www/autotasker/data → backups/，保留最近 14 份
  4) rebates   每周一 5:01：快照 payoutPlan JSON（返利付款审计底稿）
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
APP = "/www/autotasker"
MARK = "# autotasker-hub"

CRON_LINES = [
    # 1) 自愈 watchdog：服务死了立即拉起（systemctl is-active --quiet 不抛输出）
    "*/5 * * * * systemctl is-active --quiet autotasker || systemctl restart autotasker  " + MARK + " watchdog",
    # 2) 缓存预热：10 分钟缓存窗口内提前打一遍，保证抓取永远命中热缓存
    "*/10 * * * * curl -fsS -o /dev/null -m 20 http://127.0.0.1:8795/trending ; curl -fsS -o /dev/null -m 20 http://127.0.0.1:8795/feed.xml  " + MARK + " warmup",
    # 3) 每日备份 4:30，保留 14 份（注意 \\% 转义）
    "30 4 * * * cd " + APP + " && tar czf backups/data-$(date +\\%F).tar.gz data 2>/dev/null && ls -1t backups/data-*.tar.gz | tail -n +15 | xargs -r rm -f  " + MARK + " daily-backup",
    # 4) 每周一 5:01 返利付款计划快照（\\% 转义）
    "1 5 * * 1 cd " + APP + " && mkdir -p data/rebates && node -e \"console.log(JSON.stringify(require('./lib/referrals').payoutPlan()))\" > data/rebates/plan-$(date +\\%F).json 2>>data/service.log  " + MARK + " weekly-rebate-snapshot",
]


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", key_filename=KEY)

    def run(cmd, label):
        i, o, e = c.exec_command(cmd)
        out = o.read().decode(errors="replace")
        err = e.read().decode(errors="replace")
        rc = o.channel.recv_exit_status()
        if rc != 0:
            print(f"✗ {label} rc={rc}\n{err[:400]}")
            sys.exit(1)
        return out

    # 0) 目录准备：backups 与 data/rebates（幂等）
    run(f"mkdir -p {APP}/backups {APP}/data/rebates", "prepare dirs")

    # 1) 读现有 crontab
    current = run("crontab -l 2>/dev/null || true", "read crontab")
    lines = [l.rstrip("\n") for l in current.splitlines() if l.strip() != ""]
    before = len(lines)

    # 2) 追加缺失任务（按标注+命令前缀判重）
    added = []
    for ln in CRON_LINES:
        cmd_key = ln.split("  " + MARK)[0].strip()
        dup = any(cmd_key in existing and MARK in existing for existing in lines)
        if not dup:
            lines.append(ln)
            added.append(ln.split(MARK)[-1].strip())

    if added:
        new_crontab = "\n".join(lines) + "\n"
        sftp = c.open_sftp()
        with sftp.open("/tmp/crontab.autotasker", "w") as f:
            f.write(new_crontab)
        run("crontab /tmp/crontab.autotasker && rm -f /tmp/crontab.autotasker", "install crontab")
        print(f"✓ 已追加 {len(added)} 个任务: {', '.join(added)}")
    else:
        print("✓ 全部任务已存在，未做任何改动")

    # 3) 回读验证：确认其他项目任务原样保留 + 新任务在列
    final = run("crontab -l", "verify crontab")
    kept = sum(1 for l in final.splitlines() if ("bingdashan" in l or "bds24" in l or "hq_ops" in l))
    ours = sum(1 for l in final.splitlines() if MARK in l)
    print(f"✓ crontab 回读：既有其他项目任务保留 {kept} 行（安装前 {before} 行总量），autotasker 任务 {ours} 行")
    print("--- 最终 crontab ---")
    print(final)
    c.close()


if __name__ == "__main__":
    main()
