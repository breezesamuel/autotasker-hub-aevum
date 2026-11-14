/**
 * x402scan Auto-Probe — periodically probe x402scan for our listing
 * When our endpoint appears in search results, it means auto-recognition happened
 */
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', 'data', 'recon');
fs.mkdirSync(OUT, { recursive: true });

const OUR_ORIGIN = 'https://autotasker-hub.vercel.app';

async function probeX402Scan() {
  try {
    // Try GET with browser headers (the way the frontend calls it)
    const r = await fetch(`https://x402scan.com/api/trpc/public.origins.search?input=${encodeURIComponent(JSON.stringify({search:'autotasker',limit:5}))}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'accept': 'application/json,text/html,*/*',
        'referer': 'https://x402scan.com/',
        'x-trpc-source': 'react',
      },
      signal: AbortSignal.timeout(20000),
    });
    
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch(e) {}
    
    console.log(`[x402scan] origins.search → ${r.status}`);
    if (j?.result?.data?.data) {
      console.log('   Found:', JSON.stringify(j.result.data.data).slice(0, 300));
    } else if (j?.error) {
      const msg = typeof j.error === 'string' ? j.error : (j.error.json && j.error.json.message) || JSON.stringify(j.error).slice(0, 200);
      console.log('   Error:', msg);
    }
    
    fs.writeFileSync(path.join(OUT, 'x402scan-probe.json'), JSON.stringify({
      at: new Date().toISOString(), status: r.status, result: j, raw: text.slice(0, 500)
    }, null, 2));
    
    return { status: r.status, found: !!(j?.result?.data?.data) };
  } catch (e) {
    console.log(`[x402scan] Probe failed: ${e.message}`);
    return { error: e.message };
  }
}

// Also check facilitator heatmap for any sign of us
async function checkHeatmap() {
  try {
    const r = await fetch('https://x402-agent-pay.com/facilitator/heatmap', {
      headers: { 'user-agent': 'autotasker-checker' },
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    console.log(`[facilitator] heatmap age=${j.age_hours}h external_settled=${j.external_settled} usdc=$${j.external_usdc}`);
    
    // Save
    fs.writeFileSync(path.join(OUT, 'facilitator-heatmap.json'), JSON.stringify({ at: new Date().toISOString(), ...j }, null, 2));
    return j;
  } catch (e) {
    console.log(`[facilitator] heatmap error: ${e.message}`);
    return null;
  }
}

(async () => {
  console.log('=== AutoProber v1 ===\n');
  const scan = await probeX402Scan();
  const hm = await checkHeatmap();
  
  console.log('\nSummary:');
  console.log(`  x402scan probe: ${scan.found ? 'FOUND ✓' : 'NOT YET (auto-recognition pending)'}`);
  console.log(`  Facilitator idle: ${(hm?.idle_minutes / 60).toFixed(1)} days since last settlement`);
})();
