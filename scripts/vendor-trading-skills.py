# -*- coding: utf-8 -*-
"""vendor-trading-skills.py — vendor selected MIT-licensed trading skill packs
into skills-trading/ via GitHub API tarball (GFW-safe), pinning commit SHAs.
Usage: python scripts/vendor-trading-skills.py
"""
import base64, io, json, os, sys, tarfile, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'skills-trading')
TMP = r'C:/Users/Think/AppData/Local/Temp/opencode'
TOKEN = open(os.path.join(TMP, 'gh_token.txt'), encoding='utf-8').read().strip()
H = {'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'autotasker-hub'}

# extension filter: docs + code only (skip images/binaries to keep repo lean)
KEEP_EXT = ('.md', '.py', '.yaml', '.yml', '.json', '.txt', '.sh', '.csv', '.toml', '.cfg', '.example')

# repo -> (out dir, member-prefix filter, license)
PLANS = [
    dict(repo='tradermonty/claude-trading-skills', out='tradermonty',
         keep=lambda p: p.startswith('skills/') and p.split('/')[1] in {
             'pre-trade-discipline-gate', 'drawdown-circuit-breaker', 'trader-memory-core',
             'signal-postmortem', 'position-sizer', 'residual-edge-analyzer', 'backtest-expert',
             'edge-pipeline-orchestrator', 'edge-candidate-agent', 'edge-hint-extractor',
             'edge-concept-synthesizer', 'edge-strategy-designer', 'edge-strategy-reviewer'},
         files=['LICENSE']),
    dict(repo='agiprolabs/claude-trading-skills', out='agiprolabs',
         keep=lambda p: p.startswith('skills/') and p.split('/')[1] in {
             'kelly-criterion', 'risk-management', 'walk-forward-validation', 'regime-detection',
             'volatility-modeling', 'whale-tracking', 'mean-reversion'},
         files=['LICENSE']),
    dict(repo='JerryLiu369/awesome-quant-skills', out='awesome-quant',
         keep=lambda p: p.startswith('skills/') or p in ('NOTICE.md', 'SECURITY.md'),
         files=['LICENSE', 'NOTICE.md', 'SECURITY.md']),
    dict(repo='galleonlabs/hypergrok-trading-desk', out='hypergrok',
         keep=lambda p: p.startswith('skills/'),
         files=['LICENSE', 'README.md']),
]

def api_json(url):
    req = urllib.request.Request(url, headers=H)
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8'))

def resolve_head(repo):
    j = api_json('https://api.github.com/repos/%s' % repo)
    br = j.get('default_branch', 'main')
    lic = (j.get('license') or {}).get('spdx_id', 'none')
    c = api_json('https://api.github.com/repos/%s/commits/%s' % (repo, br))
    return c['sha'], br, lic

def fetch_tarball(repo, ref, dest):
    url = 'https://api.github.com/repos/%s/tarball/%s' % (repo, ref)
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    return os.path.getsize(dest)

manifest = []
for plan in PLANS:
    repo, outdir = plan['repo'], plan['out']
    print('==', repo)
    sha, branch, lic = resolve_head(repo)
    print('   head=%s branch=%s license=%s' % (sha[:10], branch, lic))
    tgz = os.path.join(TMP, outdir + '.tar.gz')
    size = fetch_tarball(repo, sha, tgz)
    print('   tarball %d KB' % (size // 1024))
    kept = 0
    with tarfile.open(tgz, 'r:gz') as tf:
        for m in tf.getmembers():
            if not m.isfile():
                continue
            # strip leading repo-sha dir component
            parts = m.name.split('/', 1)
            if len(parts) < 2:
                continue
            rel = parts[1]
            keep = False
            target_rel = None
            if rel in plan['files']:
                keep, target_rel = True, rel
            elif plan['keep'](rel):
                base = os.path.basename(rel)
                keep = base.endswith(KEEP_EXT) or base == 'LICENSE'
                if keep:
                    target_rel = rel
            if not keep:
                continue
            dest = os.path.join(OUT, outdir, target_rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            src = tf.extractfile(m)
            with open(dest, 'wb') as f:
                f.write(src.read())
            kept += 1
    print('   kept %d files -> skills-trading/%s' % (kept, outdir))
    manifest.append(dict(repo=repo, sha=sha, branch=branch, license=lic, files=kept, vendoredAt=__import__('datetime').datetime.utcnow().isoformat() + 'Z'))
    os.remove(tgz)

# reference-only packs (not vendored — heavy or license unclear)
manifest.append(dict(repo='roman-rr/trading-skills', sha=None, branch=None, license='NOASSERTION',
                     files=0, vendoredAt=None, note='external MCP signal source: https://signals.x70.ai/mcp (3 free signals, verified hit rate)'))
manifest.append(dict(repo='YichengYang-Ethan/oracle3-prediction-market-agent', sha=None, branch=None, license='Apache-2.0',
                     files=0, vendoredAt=None, note='reference: pip install oracle3; MCP server for Kalshi/Polymarket, zero-key public reads, fee-inclusive net-edge calc'))
manifest.append(dict(repo='51bitquant/ai-hedge-fund-crypto', sha=None, branch=None, license='MIT',
                     files=0, vendoredAt=None, note='reference: LangGraph DAG multi-timeframe ensemble architecture study'))
manifest.append(dict(repo='virattt/ai-hedge-fund', sha=None, branch=None, license='MIT',
                     files=0, vendoredAt=None, note='reference: paper-trading ledger + backtest replay patterns (64k stars)'))
manifest.append(dict(repo='TauricResearch/TradingAgents', sha=None, branch=None, license='Apache-2.0',
                     files=0, vendoredAt=None, note='reference: multi-agent debate framework (122k stars)'))

with open(os.path.join(OUT, 'VENDORED-SKILLS.json'), 'w', encoding='utf-8') as f:
    json.dump(dict(pinned=True, packs=manifest), f, indent=2)
print('\nWROTE skills-trading/VENDORED-SKILLS.json (%d packs)' % len(manifest))

# final size report
total = 0
for d, _, files in os.walk(OUT):
    for f in files:
        total += os.path.getsize(os.path.join(d, f))
print('skills-trading total: %.2f MB' % (total / 1048576))
