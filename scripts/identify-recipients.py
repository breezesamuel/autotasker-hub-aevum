import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

# Use cast to identify the big recipients on Base chain
addrs = [
    ('MAIN TREASURY (目标)',   '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C'),
    ('PLANET HOT WALLET',      '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03'),
    ('GENESIS AGENT',          '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38'),
    ('LEGACY',                 '0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3'),
    ('RECIPIENT #1 ($128)',    '0xab1fda930d4f35085d471cc78c61fbfdaca37b37'),
    ('RECIPIENT #2 ($36)',     '0xbd16b985685a09b11c7ccc0d2d2e820a0f774286'),
    ('ZERO VALUE POISON',      '0x20667da73222867b61f2940be40baeaccd5cb865'),
]

usdc_contract = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
rpc = 'https://base.drpc.org'

for label, addr in addrs:
    short = addr[:10] + '...' + addr[-6:]
    # Get ETH balance
    eth_cmd = f"cast balance {addr} --rpc-url {rpc} 2>/dev/null | tail -1"
    # Get USDC balance
    usdc_cmd = f"cast call {usdc_contract} \"balanceOf(address)({addr})\" --rpc-url {rpc} 2>/dev/null | tail -1"
    # Check if contract (code size > 0)
    code_cmd = f"cast code {addr} --rpc-url {rpc} 2>/dev/null | wc -c"

    chan = c.get_transport().open_session()
    full_cmd = f"{eth_cmd}; echo '---'; {usdc_cmd}; echo '---'; echo 'code_size:'; {code_cmd}"
    chan.exec_command(full_cmd)
    t0 = time.time()
    while not chan.exit_status_ready() and time.time() - t0 < 15:
        time.sleep(0.3)
    out = chan.recv(500).decode(errors='replace').strip()
    lines = out.split('\n')
    eth_bal = lines[0] if len(lines) > 0 else '?'
    usdc_bal = lines[2] if len(lines) > 2 else '?'
    code_sz = lines[4] if len(lines) > 4 else '?'
    print(f'{short:<22} ETH={eth_bal:>12}  USDC={usdc_bal:>10}  code={code_sz}')

c.close()
