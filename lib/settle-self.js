/**
 * settle-self.js — our own x402 "exact" settlement engine.
 *
 * WHY THIS EXISTS
 * ---------------
 * Real revenue was stuck at $0 for one boring reason: the deployment pointed at
 * x402.org's facilitator, which only serves TESTNETS (eip155:84532), and
 * Coinbase's mainnet facilitator (api.cdp.coinbase.com) is unreachable from this
 * network. So payments could never be settled on Base mainnet (eip155:8453).
 *
 * x402's "exact" EVM scheme does not actually require a facilitator. It is just
 * an EIP-3009 `transferWithAuthorization`:
 *
 *   1. The payer signs an off-chain EIP-712 authorization:
 *        from, to, value, validAfter, validBefore, nonce  (+ signature)
 *   2. Anyone may submit it to the USDC contract. The signature guarantees the
 *      payer approved this exact transfer.
 *   3. A relayer pays the gas. The USDC goes payer -> payTo DIRECTLY.
 *
 * We therefore act as our own facilitator. The relayer only ever spends gas; it
 * never holds or can redirect funds, because `to` is baked into the signature.
 */

'use strict';

const { ethers } = require('ethers');

const CHAINS = {
  'eip155:8453': {
    key: 'base',
    chainId: 8453,
    rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorer: 'https://basescan.org/tx/',
    domain: { name: 'USD Coin', version: '2' },
  },
  'eip155:84532': {
    key: 'baseSepolia',
    chainId: 84532,
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    explorer: 'https://sepolia.basescan.org/tx/',
    domain: { name: 'USDC', version: '2' },
  },
};

const TRANSFER_WITH_AUTH = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

const USDC_ABI = [
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)',
  'function authorizationState(address authorizer,bytes32 nonce) view returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
];

// Replay protection for authorizations we have already broadcast.
const usedNonces = new Map(); // `${network}:${nonce}` -> { txHash, at }
// Replay protection for payer-broadcast settlements.
const usedTxHashes = new Map(); // `${network}:${txHash}` -> { at, amount }

function chainOf(network) {
  const c = CHAINS[network];
  if (!c) throw new Error(`unsupported network: ${network} (supported: ${Object.keys(CHAINS).join(', ')})`);
  return c;
}

/** Build the EIP-712 domain for a chain. */
function buildDomain(network) {
  const c = chainOf(network);
  return {
    name: c.domain.name,
    version: c.domain.version,
    chainId: c.chainId,
    verifyingContract: c.usdc,
  };
}

/**
 * Verify an x402 exact-EVM payment payload without touching the network.
 * Returns { ok, reason?, from, to, valueAtomic, signature, authorization, signer }.
 */
function verifyPayload(network, payload, opts) {
  const c = chainOf(network);
  const o = opts || {};
  const auth = payload && payload.authorization;
  const signature = payload && payload.signature;
  if (!auth || !signature) return { ok: false, reason: 'payload.authorization and payload.signature are required' };

  const required = ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'];
  for (const k of required) {
    if (auth[k] === undefined || auth[k] === null || auth[k] === '') return { ok: false, reason: `authorization.${k} is required` };
  }

  let signer;
  try {
    signer = ethers.verifyTypedData(buildDomain(network), TRANSFER_WITH_AUTH, auth, signature);
  } catch (e) {
    return { ok: false, reason: 'invalid signature encoding: ' + String(e.message).slice(0, 80) };
  }
  if (signer.toLowerCase() !== String(auth.from).toLowerCase()) {
    return { ok: false, reason: `signature does not match authorization.from (signer ${signer})` };
  }

  const value = BigInt(auth.value);
  const now = Math.floor(Date.now() / 1000);

  if (o.payTo && String(auth.to).toLowerCase() !== String(o.payTo).toLowerCase()) {
    return { ok: false, reason: `authorization.to ${auth.to} != expected payTo ${o.payTo}` };
  }
  if (o.minValueAtomic !== undefined && value < BigInt(o.minValueAtomic)) {
    return { ok: false, reason: `authorization.value ${value} < required ${o.minValueAtomic}` };
  }
  if (Number(auth.validBefore) !== 0 && Number(auth.validBefore) <= now) {
    return { ok: false, reason: 'authorization expired (validBefore in the past)' };
  }
  if (Number(auth.validAfter) > now) {
    return { ok: false, reason: 'authorization not yet valid (validAfter in the future)' };
  }

  return {
    ok: true,
    signer,
    from: auth.from,
    to: auth.to,
    valueAtomic: value.toString(),
    valueUsd: Number(value) / 1e6,
    signature,
    authorization: auth,
    network,
    asset: c.usdc,
    chainId: c.chainId,
  };
}

/**
 * Settle: broadcast transferWithAuthorization. Requires RELAYER_PRIVATE_KEY
 * (any address holding a little ETH on the target chain for gas).
 */
async function settle(network, payload, opts) {
  const o = opts || {};
  const check = verifyPayload(network, payload, o);
  if (!check.ok) return { settled: false, error: check.reason };

  const c = chainOf(network);
  const nonceKey = `${network}:${check.authorization.nonce}`;
  if (usedNonces.has(nonceKey)) {
    return { settled: false, error: 'authorization already submitted by this service', txHash: usedNonces.get(nonceKey).txHash };
  }

  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) return { settled: false, error: 'RELAYER_PRIVATE_KEY not configured (needed only for gas)' };

  const provider = new ethers.JsonRpcProvider(c.rpc, c.chainId);
  const wallet = new ethers.Wallet(pk, provider);
  const usdc = new ethers.Contract(c.usdc, USDC_ABI, wallet);

  // On-chain replay check — the contract is the source of truth.
  try {
    const already = await usdc.authorizationState(check.from, check.authorization.nonce);
    if (already) return { settled: false, error: 'authorization nonce already used on-chain' };
  } catch (e) {
    /* older token builds may not expose it; the tx itself will revert if replayed */
  }

  const a = check.authorization;
  let tx;
  try {
    tx = await usdc.transferWithAuthorization(a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, check.signature);
  } catch (e) {
    return { settled: false, error: 'broadcast failed: ' + String(e.shortMessage || e.message).slice(0, 160) };
  }

  usedNonces.set(nonceKey, { txHash: tx.hash, at: Date.now() });
  const receipt = await tx.wait(o.confirmations || 1);
  const ok = !!receipt && receipt.status === 1;

  return {
    settled: ok,
    txHash: tx.hash,
    explorer: c.explorer + tx.hash,
    block: receipt ? receipt.blockNumber : null,
    gasPaidByRelayer: receipt ? Number(receipt.gasUsed) : null,
    from: check.from,
    to: check.to,
    valueUsd: check.valueUsd,
    network,
    asset: c.usdc,
  };
}

/**
 * Verify a transfer that the PAYER already broadcast themselves.
 *
 * This is the zero-operator-key settlement path. It is exactly as trustworthy as
 * relaying, because we read the receipt from the chain: the tx must be mined,
 * successful, and must contain a USDC Transfer to `payTo` of at least the price.
 * The payer already paid gas, so we need no key at all.
 */
async function verifySettledTx(network, txHash, opts) {
  const c = chainOf(network);
  const o = opts || {};
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash))) return { settled: false, error: 'invalid txHash' };
  const key = `${network}:${String(txHash).toLowerCase()}`;
  if (usedTxHashes.has(key)) return { settled: false, error: 'this transaction was already redeemed', txHash };

  const provider = new ethers.JsonRpcProvider(c.rpc, c.chainId);
  let rec = null;
  // Poll briefly: agents often submit the tx and retry immediately.
  for (let i = 0; i < (o.polls || 6); i++) {
    rec = await provider.getTransactionReceipt(txHash).catch(() => null);
    if (rec) break;
    await new Promise(r => setTimeout(r, o.pollMs || 2500));
  }
  if (!rec) return { settled: false, error: 'transaction not found on-chain yet (retry in a few seconds)' };
  if (rec.status !== 1) return { settled: false, error: 'transaction reverted' };

  const iface = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);
  const topic = iface.getEvent('Transfer').topicHash;
  let hit = null;
  for (const log of rec.logs || []) {
    if (String(log.address).toLowerCase() !== c.usdc.toLowerCase()) continue;
    if (log.topics[0] !== topic) continue;
    const to = '0x' + log.topics[2].slice(26);
    if (o.payTo && to.toLowerCase() !== String(o.payTo).toLowerCase()) continue;
    const value = BigInt(log.data);
    if (o.minValueAtomic !== undefined && value < BigInt(o.minValueAtomic)) continue;
    hit = { from: '0x' + log.topics[1].slice(26), to, value };
    break;
  }
  if (!hit) return { settled: false, error: `transaction contains no USDC transfer of the required amount to ${o.payTo}` };

  const confirmations = Number(rec.blockNumber ? (await provider.getBlockNumber()) - Number(rec.blockNumber) + 1 : 0);
  if (confirmations < (o.minConfirmations || 1)) return { settled: false, error: 'waiting for confirmation' };

  usedTxHashes.set(key, { at: Date.now(), amount: hit.value.toString() });

  return {
    settled: true,
    mode: 'payer-broadcast',
    txHash,
    explorer: c.explorer + txHash,
    block: Number(rec.blockNumber),
    confirmations,
    from: hit.from,
    to: hit.to,
    valueAtomic: hit.value.toString(),
    valueUsd: Number(hit.value) / 1e6,
    network,
    asset: c.usdc,
  };
}

/** Live readiness check for the self-settlement path. */
async function readiness() {
  const out = { relayerConfigured: !!process.env.RELAYER_PRIVATE_KEY, networks: {} };
  for (const [network, c] of Object.entries(CHAINS)) {
    const row = { chainId: c.chainId, usdc: c.usdc, rpc: c.rpc };
    try {
      const provider = new ethers.JsonRpcProvider(c.rpc, c.chainId);
      row.rpcOk = (await provider.getBlockNumber()) > 0;
      const usdc = new ethers.Contract(c.usdc, USDC_ABI, provider);
      row.tokenName = await usdc.name().catch(() => null);
      row.tokenVersion = await usdc.version().catch(() => null);
      if (out.relayerConfigured) {
        const w = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
        row.relayer = w.address;
        row.relayerGasEth = Number(ethers.formatEther(await provider.getBalance(w.address)));
      }
    } catch (e) {
      row.error = String(e.message).slice(0, 120);
    }
    out.networks[network] = row;
  }
  return out;
}

module.exports = { CHAINS, verifyPayload, settle, verifySettledTx, readiness, buildDomain, usedNonces, usedTxHashes, USDC_ABI };

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--self-test') {
    (async () => {
      console.log('Self-test: sign an authorization like a buyer would, then verify it.\n');
      const payer = ethers.Wallet.createRandom();
      const payTo = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';
      const value = '30000'; // $0.03
      const now = Math.floor(Date.now() / 1000);

      for (const network of Object.keys(CHAINS)) {
        const auth = {
          from: payer.address,
          to: payTo,
          value,
          validAfter: String(now - 60),
          validBefore: String(now + 300),
          nonce: ethers.hexlify(ethers.randomBytes(32)),
        };
        const signature = await payer.signTypedData(buildDomain(network), TRANSFER_WITH_AUTH, auth);
        const ok = verifyPayload(network, { authorization: auth, signature }, { payTo, minValueAtomic: value });
        console.log(`  ${network.padEnd(14)} verify=${ok.ok ? 'PASS' : 'FAIL'}  signer=${ok.signer || ok.reason}`);

        // Negative cases must be rejected.
        const wrongTo = verifyPayload(network, { authorization: { ...auth, to: payer.address }, signature }, { payTo });
        const tooSmall = verifyPayload(network, { authorization: auth, signature }, { payTo, minValueAtomic: '999999' });
        const expired = verifyPayload(network, { authorization: { ...auth, validBefore: String(now - 10) }, signature }, { payTo });
        const tampered = verifyPayload(network, { authorization: { ...auth, value: '999999999' }, signature }, { payTo });
        console.log(`    rejects wrong-payTo=${!wrongTo.ok} underpay=${!tooSmall.ok} expired=${!expired.ok} tampered=${!tampered.ok}`);
      }
    })();
  } else {
    (async () => {
      const r = await readiness();
      console.log(JSON.stringify(r, null, 2));
    })();
  }
}
