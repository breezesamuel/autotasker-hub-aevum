"""check-onchain-report.py — 确认 reconcile 报告已落盘且 fresh（<=12h）"""
import os, sys, json, time
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
report = os.path.join(os.path.dirname(__file__), '..', 'data', 'onchain-reconcile-report.json')
if not os.path.exists(report):
    print('report missing'); sys.exit(1)
d = json.load(open(report, encoding='utf-8'))
iso = d.get('checkedAt', '')
# naive parse ISO with timezone or without
from datetime import datetime, timezone
try:
    ts_str = iso.replace('Z', '+00:00')
    t = datetime.fromisoformat(ts_str)
    age_min = (datetime.now(timezone.utc) - t).total_seconds() / 60
except Exception as e:
    print(f'bad timestamp {iso!r}: {e}')
    sys.exit(1)
print(f'reconciled ok={d.get("ok")} age={age_min:.1f}m | {d.get("verdict","")}')
sys.exit(0 if d.get('ok') and age_min < 720 else 1)
