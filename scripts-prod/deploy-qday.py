# -*- coding: utf-8 -*-
"""Deploy AutoTaskerPaymentRouterV2 to QDay Aevum testnet (chainId 44005) and run
the demo payment sequence.

Usage:
    PRIVATE_KEY=0x... python scripts-prod/deploy-qday.py            # full run
    PRIVATE_KEY=0x... python scripts-prod/deploy-qday.py --dry-run  # compile only

The wallet needs tQDAY (gas) and tUSD8 (settlement). Faucet:
https://faucet.qday.info/en

Constructor is (address _tUSD8, address _houseWallet) — 2 args. `_houseWallet` is
the treasury: the 90% house cut lands there inside the fulfilment transaction, so
there is no sweep step and no intermediate address.
"""
import json
import os
import sys
import time
from pathlib import Path

from web3 import Web3
from eth_utils import to_checksum_address

ROOT = Path(__file__).resolve().parent.parent

RPC = os.environ.get("QDAY_RPC", "https://rpc-test.qday.info")
CHAIN_ID = 44005
TUSD8 = to_checksum_address("0x456569838f1d43009A91ebA4263147Afd7233483")
TREASURY = to_checksum_address("0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C")
ZERO = "0x" + "0" * 40
EXPL = "https://explorer-test.qday.info"

DRY_RUN = "--dry-run" in sys.argv

ERC20 = [
    {"inputs": [{"name": "_owner", "type": "address"}], "name": "balanceOf",
     "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "_spender", "type": "address"}, {"name": "_value", "type": "uint256"}],
     "name": "approve", "outputs": [{"name": "", "type": "bool"}],
     "stateMutability": "nonpayable", "type": "function"},
]


def compile_contract():
    import solcx

    solcx.install_solc("0.8.20")
    src = (ROOT / "contracts" / "AutoTaskerPaymentRouterV2.sol").read_text(encoding="utf-8")
    # NOTE: standard-JSON has no `compilationTarget` key inside `settings`.
    inp = {
        "language": "Solidity",
        "sources": {"AutoTaskerPaymentRouterV2.sol": {"content": src}},
        "settings": {
            "outputSelection": {"*": {"*": ["abi", "evm.bytecode.object"]}},
            "optimizer": {"enabled": True, "runs": 200},
            "evmVersion": "paris",
        },
    }
    res = solcx.compile_standard(inp, solc_version="0.8.20")
    c = res["contracts"]["AutoTaskerPaymentRouterV2.sol"]["AutoTaskerPaymentRouterV2"]
    return c["abi"], "0x" + c["evm"]["bytecode"]["object"]


def main():
    pk = os.environ.get("PRIVATE_KEY")
    if not pk and not DRY_RUN:
        print("PRIVATE_KEY not set")
        return 1

    abi, bytecode = compile_contract()
    print(f"compiled: {len(abi)} abi entries, {len(bytecode)} bytecode chars")
    if DRY_RUN:
        return 0

    w3 = Web3(Web3.HTTPProvider(RPC))
    if not w3.is_connected():
        print("cannot reach", RPC)
        return 1
    if w3.eth.chain_id != CHAIN_ID:
        print(f"wrong chain {w3.eth.chain_id}")
        return 1

    signer = w3.eth.account.from_key(pk)
    token = w3.eth.contract(address=TUSD8, abi=ERC20)
    bal = token.functions.balanceOf(signer.address).call()
    print(f"chain={CHAIN_ID} block={w3.eth.block_number}")
    print(f"wallet={signer.address} tQDAY={w3.eth.get_balance(signer.address)/1e18:.4f} "
          f"tUSD8={bal/1e6:.4f}")
    if w3.eth.get_balance(signer.address) < 10**14:
        print("no gas — faucet: https://faucet.qday.info/en")
        return 1

    rec = {"deployedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "chain": "qday-aevum-testnet", "chainId": CHAIN_ID, "rpc": RPC,
           "contract": "AutoTaskerPaymentRouterV2", "tUSD8": TUSD8,
           "houseWallet": TREASURY, "deployer": signer.address, "steps": []}

    def send(fn_call, label, record=True):
        for attempt in range(3):
            try:
                txd = fn_call.build_transaction({
                    "from": signer.address,
                    "nonce": w3.eth.get_transaction_count(signer.address),
                    "gasPrice": w3.eth.gas_price,
                    "value": 0,
                })
                txd["gas"] = int(w3.eth.estimate_gas(txd) * 1.35)
                signed = signer.sign_transaction(txd)
                h = w3.eth.send_raw_transaction(signed.raw_transaction)
                rc = w3.eth.wait_for_transaction_receipt(h, timeout=180)
                if rc.status == 1:
                    print(f"  {label} ok {h.hex()} block={rc.blockNumber}")
                    if record:
                        rec["steps"].append({"action": label, "hash": h.hex(),
                                             "block": rc.blockNumber})
                    return rc
            except Exception as e:
                print(f"  {label} attempt {attempt + 1}: {str(e)[:200]}")
            time.sleep(2)
        return None

    factory = w3.eth.contract(abi=abi, bytecode=bytecode)
    rc = send(factory.constructor(TUSD8, TREASURY), "deploy")
    if rc is None:
        print("deploy failed")
        return 1

    addr = rc.contractAddress
    router = w3.eth.contract(address=addr, abi=abi)
    rec.update({"address": addr, "txHash": rc.transactionHash.hex(),
                "blockNumber": rc.blockNumber, "explorer": f"{EXPL}/address/{addr}"})
    print(f"deployed {addr}")
    print(f"explorer {EXPL}/address/{addr}")
    print(f"  houseWallet() = {router.functions.houseWallet().call()}")

    send(token.functions.approve(addr, 5 * 10**6), "approve_tUSD8")

    for tool, ref in [("hotlist", ZERO), ("search", ZERO), ("price", TREASURY)]:
        rc2 = send(router.functions.submitPayment(tool, TREASURY, 60, ref),
                   f"submitPayment[{tool}]")
        if rc2 is None:
            continue
        rid = None
        for lg in rc2.logs:
            try:
                rid = router.events.RequestCreated().process_log(lg)["args"]["requestId"]
                break
            except Exception:
                continue
        if rid is not None:
            send(router.functions.fulfillRequest(rid, TREASURY), f"fulfill[{tool}]")

    final = {}
    for fn in ["totalRequests", "totalVolumeAtomic", "totalHouseRevenueAtomic"]:
        final[fn] = str(getattr(router.functions, fn)().call())
    for label, a in [("contract", addr), ("treasury", TREASURY), ("payer", signer.address)]:
        final[f"tUSD8_{label}"] = str(token.functions.balanceOf(a).call())
    rec["finalState"] = final
    print(json.dumps(final, indent=2))

    out = ROOT / "data" / "deployments" / "qday-testnet-deployment.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(json.dumps(rec, indent=2, ensure_ascii=False).encode("utf-8"))
    print(f"saved {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
