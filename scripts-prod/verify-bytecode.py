# -*- coding: utf-8 -*-
"""verify-bytecode.py — prove a deployed QDay contract matches its source.

The QDay testnet explorer runs a Blockscout build whose verifier publishes
nothing: https://explorer-test.qday.info/api/v2/smart-contracts/counters reports
`verified_smart_contracts: 0` next to `smart_contracts: 592`. Claiming an
explorer badge is therefore impossible on that network, so this script does the
same job locally and prints the comparison:

  * recompiles contracts/<Name>.sol with the exact compiler + settings used for
    the deployment,
  * fetches the deployed creation code from the explorer API,
  * checks the init code is identical once the ABI-encoded constructor words are
    removed,
  * zeroes the immutable slots that solc reports in `immutableReferences` and
    checks the runtime code is identical too.

Usage
-----
    python scripts-prod/verify-bytecode.py
    python scripts-prod/verify-bytecode.py --export      # write verify/<net>/ bundle

Exit code 0 means both comparisons matched.
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DEFAULTS = {
    "name": "AutoTaskerPaymentRouterV2",
    "source": "contracts/AutoTaskerPaymentRouterV2.sol",
    "address": "0x9FA2771297aE08F994D5516ea62Be1ED02b5Bdd9",
    "explorer": "https://explorer-test.qday.info",
    "solc": "0.8.20",
    "runs": 200,
    "evm_version": "paris",
    "network": "qday",
}


def compile_contract(source_rel, solc_version, runs, evm_version):
    import solcx

    solcx.install_solc(solc_version)
    src = (ROOT / source_rel).read_text(encoding="utf-8")
    file_key = Path(source_rel).name
    std = {
        "language": "Solidity",
        "sources": {file_key: {"content": src}},
        "settings": {
            "outputSelection": {
                "*": {
                    "*": [
                        "abi",
                        "evm.bytecode.object",
                        "evm.deployedBytecode.object",
                        "evm.deployedBytecode.immutableReferences",
                    ]
                }
            },
            "optimizer": {"enabled": True, "runs": runs},
            "evmVersion": evm_version,
        },
    }
    out = solcx.compile_standard(std, solc_version=solc_version)
    contract_name = Path(source_rel).stem
    c = out["contracts"][file_key][contract_name]
    return {
        "source": src,
        "file_key": file_key,
        "contract_name": contract_name,
        "standard_json": std,
        "creation": "0x" + c["evm"]["bytecode"]["object"],
        "runtime": "0x" + c["evm"]["deployedBytecode"]["object"],
        "immutables": c["evm"]["deployedBytecode"].get("immutableReferences") or {},
    }


def chain_bytecode(explorer, address):
    url = f"{explorer}/api/v2/smart-contracts/{address}"
    req = urllib.request.Request(url, headers={"User-Agent": "verify-bytecode/1.0"})
    data = json.load(urllib.request.urlopen(req, timeout=60))
    return (data.get("creation_bytecode") or ""), (data.get("deployed_bytecode") or "")


def zero_immutables(hex_code, immutables):
    """Blank the byte ranges solc marks as immutable placeholders."""
    raw = hex_code[2:] if hex_code.startswith("0x") else hex_code
    buf = bytearray.fromhex(raw)
    spans = []
    for _name, refs in immutables.items():
        for r in refs:
            start, length = int(r["start"]), int(r["length"])  # byte offsets into the runtime code
            buf[start:start + length] = b"\x00" * length
            spans.append((start, length))
    return "0x" + buf.hex(), spans


def decode_word_values(hex_code, immutables):
    """Read the 20-byte tail of every immutable slot out of the deployed code."""
    raw = hex_code[2:] if hex_code.startswith("0x") else hex_code
    seen = {}
    for _name, refs in immutables.items():
        for r in refs:
            start = int(r["start"]) * 2
            length = int(r["length"]) * 2
            word = raw[start:start + length]
            seen[word[-40:]] = seen.get(word[-40:], 0) + 1
    return sorted(seen)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--address", default=DEFAULTS["address"])
    ap.add_argument("--explorer", default=DEFAULTS["explorer"])
    ap.add_argument("--source", default=DEFAULTS["source"])
    ap.add_argument("--solc", default=DEFAULTS["solc"])
    ap.add_argument("--runs", type=int, default=DEFAULTS["runs"])
    ap.add_argument("--evm-version", default=DEFAULTS["evm_version"])
    ap.add_argument("--network", default=DEFAULTS["network"])
    ap.add_argument("--export", action="store_true", help="write verify/<network>/ bundle")
    args = ap.parse_args()

    print(f"source    : {args.source}")
    print(f"solidity  : {args.solc}  optimizer runs={args.runs}  evmVersion={args.evm_version}")
    built = compile_contract(args.source, args.solc, args.runs, args.evm_version)
    print(f"compiled  : {len(built['creation']) // 2 - 1} bytes init, "
          f"{len(built['runtime']) // 2 - 1} bytes runtime")

    chain_creation, chain_runtime = chain_bytecode(args.explorer, args.address)
    if not chain_creation:
        print("FAIL: explorer returned no creation bytecode for that address")
        return 1
    print(f"on chain  : {len(chain_creation) // 2 - 1} bytes init, "
          f"{len(chain_runtime) // 2 - 1} bytes runtime")

    # 1) init code: strip the ABI-encoded constructor arguments from the tail
    args_len = max(0, len(chain_creation) - len(built["creation"]))
    ctor_hex = chain_creation[len(chain_creation) - args_len:] if args_len else ""
    stripped = chain_creation[:len(chain_creation) - args_len] if args_len else chain_creation
    creation_ok = stripped.lower() == built["creation"].lower()
    print(f"\n[1] creation code (excluding {args_len // 64} constructor word(s))")
    print(f"    match: {creation_ok}")

    # 2) runtime code: blank immutable placeholders, then compare
    zeroed, spans = zero_immutables(chain_runtime, built["immutables"])
    runtime_ok = zeroed.lower() == built["runtime"].lower()
    print(f"\n[2] runtime code ({len(spans)} immutable slot(s) blanked)")
    print(f"    match: {runtime_ok}")
    if spans:
        for addr in decode_word_values(chain_runtime, built["immutables"]):
            print(f"    immutable value: 0x{addr}")

    if not (creation_ok and runtime_ok):
        print("\nRESULT: MISMATCH — the deployed code was not produced by this source/settings")
        return 1
    print("\nRESULT: MATCH — deployed bytecode is reproduced exactly by this source")

    if args.export:
        out_dir = ROOT / "verify" / args.network
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "standard-input.json").write_bytes(
            json.dumps(built["standard_json"], indent=2, ensure_ascii=False).encode("utf-8"))
        (out_dir / "constructor-args.txt").write_text(
            ctor_hex + "\n", encoding="utf-8", newline="\n")
        (out_dir / "compile-summary.json").write_bytes(json.dumps({
            "contract": built["contract_name"],
            "address": args.address,
            "explorer": args.explorer,
            "solc": f"v{args.solc}",
            "optimizer": {"enabled": True, "runs": args.runs},
            "evmVersion": args.evm_version,
            "creationMatch": creation_ok,
            "runtimeMatch": runtime_ok,
            "immutableSlots": len(spans),
            "immutableValues": ["0x" + a for a in decode_word_values(chain_runtime, built["immutables"])],
        }, indent=2).encode("utf-8"))
        print(f"\nexported bundle -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
