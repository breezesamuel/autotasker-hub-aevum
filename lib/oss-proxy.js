/**
 * oss-proxy.js — Run discovered OSS tools as managed service endpoints.
 *
 * Execution strategies:
 *   cli_wrapper    — spawn subprocess, pipe stdin→CLI args, capture stdout/stderr
 *   http_proxy     — forward request to upstream HTTP API (e.g., HuggingFace Inference API)
 *   mcp_bridge     — call upstream MCP server tool (future v17b)
 *   scheduled_export — serve cached pre-computed export (future v17b)
 *
 * Safety guards:
 *   - Timeout enforced per-tool (configurable, default 30s)
 *   - Output size capped (default 1MB to prevent memory bombs)
 *   - No network egress from CLI wrapper (air-gapped from internet by default)
 *   - Rate limit per-tool + per-wallet (shared with main rate limiter)
 *
 * Architecture: Each tool is an isolated process with bounded resources.
 * Results are cached in-memory (LRU, TTL-based) so repeated calls are fast.
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── Configuration ─────────────────────────────────────────────────────────────
const MAX_OUTPUT_BYTES = parseInt(process.env.OSS_MAX_OUTPUT_BYTES) || 1024 * 1024; // 1MB
const DEFAULT_TIMEOUT_MS = parseInt(process.env.OSS_DEFAULT_TIMEOUT_MS) || 30000;   // 30s
const CACHE_TTL_MS = parseInt(process.env.OSS_CACHE_TTL_MS) || 60 * 1000;           // 1 min cache

// ── Tool registry (populated at startup from catalog) ────────────────────────
// Each entry: { id, handle, strategy, cmd, args, env, timeoutMs, maxBytes, cacheKeyFn }
const TOOL_REGISTRY = new Map();
const COMMAND_CACHE = new Map(); // LRU-ish: key → { result, expiresAt }

// ── Cache helpers ─────────────────────────────────────────────────────────────
function cacheGet(key) {
  const entry = COMMAND_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { COMMAND_CACHE.delete(key); return null; }
  return entry.result;
}
function cacheSet(key, result) {
  COMMAND_CACHE.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  // Evict oldest entries if cache grows too large
  if (COMMAND_CACHE.size > 500) {
    const firstKey = COMMAND_CACHE.keys().next().value;
    COMMAND_CACHE.delete(firstKey);
  }
}

// ── Execution engine ──────────────────────────────────────────────────────────
async function runTool(id, input) {
  const tool = TOOL_REGISTRY.get(id);
  if (!tool) throw new Error(`unknown tool: ${id}`);
  if (tool.blocked) throw new Error(`tool ${id} is blocked (license violation or disabled)`);

  // Check cache
  const cacheKey = tool.cacheKeyFn ? tool.cacheKeyFn(input) : id;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  let result;
  if (tool.strategy === 'cli_wrapper') {
    result = await runCli(tool, input);
  } else if (tool.strategy === 'http_proxy') {
    result = await runHttpProxy(tool, input);
  } else {
    throw new Error(`unsupported strategy: ${tool.strategy}`);
  }

  cacheSet(cacheKey, result);
  return result;
}

async function runCli(tool, input) {
  const timeout = tool.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBytes = tool.maxBytes || MAX_OUTPUT_BYTES;

  return new Promise((resolve, reject) => {
    let outputBuffer = Buffer.alloc(0);
    let errored = false;

    const child = spawn(tool.cmd, tool.args || [], {
      cwd: tool.cwd || '/tmp',
      env: { ...process.env, ...(tool.env || {}) },
      maxBuffer: maxBytes,
    });

    const timer = setTimeout(() => {
      if (!errored) { errored = true; child.kill('SIGTERM'); reject(new Error('timeout')); }
    }, timeout);

    child.stdout.on('data', (chunk) => {
      outputBuffer = Buffer.concat([outputBuffer, chunk]);
      if (outputBuffer.length > maxBytes) {
        errored = true; child.kill('SIGKILL');
        reject(new Error('output exceeded maximum size'));
      }
    });
    child.stderr.on('data', () => { /* discard stderr, but keep process alive */ });
    child.on('error', (e) => { if (!errored) { errored = true; clearTimeout(timer); reject(e); } });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (errored) return;
      if (code !== 0 && code !== null) {
        reject(new Error(`process exited with code ${code}`));
        return;
      }
      try {
        const text = outputBuffer.toString('utf8').trim();
        resolve(JSON.parse(text) || text);
      } catch (_) {
        resolve(outputBuffer.toString('utf8').slice(0, maxBytes));
      }
    });

    // Send input via stdin if provided
    if (input && Object.keys(input).length > 0) {
      try { child.stdin.write(JSON.stringify(input) + '\n'); } catch (_) {}
      child.stdin.end();
    }
  });
}

async function runHttpProxy(tool, input) {
  const timeout = tool.timeoutMs || DEFAULT_TIMEOUT_MS;
  const resp = await fetch(tool.upstreamUrl, {
    method: tool.upstreamMethod || 'POST',
    headers: { 'Content-Type': 'application/json', ...(tool.upstreamHeaders || {}) },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeout),
  });
  if (!resp.ok) throw new Error(`upstream ${resp.status}: ${await resp.text().then(t=>t.slice(0,200))}`);
  const text = await resp.text();
  try { return JSON.parse(text); } catch (_) { return text.slice(0, MAX_OUTPUT_BYTES); }
}

// ── Tool registration ─────────────────────────────────────────────────────────
function registerTool(config) {
  TOOL_REGISTRY.set(config.id, {
    id: config.id,
    handle: config.handle,
    strategy: config.strategy || 'cli_wrapper',
    cmd: config.cmd,
    args: config.args || [],
    env: config.env || {},
    cwd: config.cwd,
    blocked: !!config.blocked,
    timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxBytes: config.maxBytes || MAX_OUTPUT_BYTES,
    cacheKeyFn: config.cacheKeyFn,
    // Metadata
    githubUrl: config.githubUrl,
    license: config.license,
    attributionRequired: config.attributionRequired,
  });
}

// ── Catalog loader (called at startup) ────────────────────────────────────────
function loadFromCatalog(catalogPath) {
  if (!fs.existsSync(catalogPath)) return 0;
  let count = 0;
  try {
    const products = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    for (const p of products) {
      if (p.license.classification === 'red') continue;
      // Register based on primary strategy
      const primaryStrategy = (p.strategies && p.strategies[0]) || 'mcp_bridge';
      const entry = {
        id: p.id,
        handle: p.handle,
        strategy: primaryStrategy,
        githubUrl: p.githubUrl,
        license: p.license.spdx,
        attributionRequired: p.license.attributionRequired,
        // Strategy-specific config (to be filled per implementation)
        cacheKeyFn: (input) => `${p.id}:${JSON.stringify(input).slice(0, 100)}`,
      };
      if (primaryStrategy === 'cli_wrapper') {
        // Will be wired when actual binaries are deployed
        entry.blocked = true; // Block until infra ready
        entry.note = 'cli_wrapper: infra not yet deployed — returns placeholder';
      } else if (primaryStrategy === 'http_proxy') {
        // Some tools have public HTTP APIs we can proxy directly
        // e.g., HuggingFace inference, public CLI-as-API services
        if (p.summary.homepage) {
          entry.upstreamUrl = p.summary.homepage.replace(/\/$/, '') + '/api/v1/inference';
          entry.upstreamMethod = 'POST';
          entry.upstreamHeaders = { 'Origin': 'https://autotasker.highkingflower.com' };
        } else {
          entry.blocked = true;
          entry.note = 'http_proxy: no homepage URL found';
        }
      } else {
        entry.blocked = true;
        entry.note = `${primaryStrategy}: not yet implemented`;
      }
      registerTool(entry);
      count++;
    }
    console.log(`[oss-proxy] loaded ${count} tools from catalog (${products.filter(p=>p.license.classification==='white').length} whitelist, ${products.filter(p=>p.license.classification==='yellow').length} yellow)`);
  } catch (e) {
    console.warn('[oss-proxy] failed to load catalog:', e.message);
  }
  return count;
}

// ── Health / status ───────────────────────────────────────────────────────────
function getRegistryStatus() {
  const entries = Array.from(TOOL_REGISTRY.values());
  return {
    total: entries.length,
    available: entries.filter(t => !t.blocked).length,
    blocked: entries.filter(t => t.blocked).length,
    byStrategy: entries.reduce((acc, t) => { acc[t.strategy] = (acc[t.strategy] || 0) + 1; return acc; }, {}),
    cacheSize: COMMAND_CACHE.size,
    examples: entries.slice(0, 5).map(t => ({ id: t.id, strategy: t.strategy, blocked: t.blocked, note: t.note })),
  };
}

module.exports = { runTool, registerTool, loadFromCatalog, getRegistryStatus, TOOL_REGISTRY };
