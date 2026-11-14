import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

# Use node on ECS to call RPC directly (same as local treasury-allocate.js)
chan = c.get_transport().open_session()
chan.exec_command('''
node -e "
const RPCS=['https://base.drpc.org','https://base-rpc.publicnode.com'];
async function rpc(m,p){for(const u of RPCS){try{const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p}),signal:AbortSignal.timeout(8000)});const b=await r.json();if(b.result)return b.result;}catch(e){}}return null;}
(async()=>{
  const usdc='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const addrs=[
    ['金库 TREASURY','0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C'],
    ['平台 HOT','0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03'],
    ['GENESIS','0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38'],
    ['legacy','0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3'],
  ];
  console.log('=== Chain Balance Scan ===');
  for(const [label,a] of addrs){
    const data='0x70a08231'+a.toLowerCase().replace(/^0x/,'').padStart(64,'0');
    const bal = await rpc('eth_call',[{to:usdc,data},'latest']);
    const ethBal = await rpc('eth_getBalance',[a,'latest']);
    const usdcVal = bal && bal!=='0x0' ? (Number(BigInt(bal))/1e6).toFixed(4) : '0.0000';
    const ethVal = ethBal && ethBal!=='0x0' ? (Number(BigInt(ethBal))/1e18).toFixed(6) : '0.000000';
    console.log(label + ': USDC=$' + usdcVal + ' ETH=' + ethVal);
  }
})().catch(e=>console.error(e.message));
" 2>&1
''')
t0 = time.time()
while not chan.exit_status_ready() and time.time() - t0 < 20:
    time.sleep(0.3)
out = chan.recv(1000).decode(errors='replace')
print(out.strip())

# Also quick public check
chan2 = c.get_transport().open_session()
chan2.exec_command('curl -sk https://autotasker.highkingflower.com/api/status')
while not chan2.exit_status_ready() and time.time() - t0 < 8:
    time.sleep(0.2)
print(chan2.recv(300).decode().strip())
c.close()
