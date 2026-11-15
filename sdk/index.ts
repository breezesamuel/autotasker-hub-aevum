/**
 * AutoTasker SDK — TypeScript/JS client for agent integration
 * 
 * Usage:
 *   import { AutoTasker } from '@autotasker/sdk';
 *   const at = new AutoTasker({ apiKey: 'sk-...', network: 'base' });
 *   const result = await at.hotlist({ limit: 50, source: '百度热搜' });
 */

const BASE_URL = 'https://autotasker-hub.vercel.app';

export interface AgentConfig {
  /** API key from /api/agents/register (free tier: 10 calls/day, paid: unlimited) */
  apiKey?: string;
  /** Wallet address for signing payments (optional for free tier) */
  walletAddress?: string;
  /** Network: 'base' | 'base-sepolia' */
  network?: 'base' | 'base-sepolia';
  /** Facilitator URL */
  facilitatorUrl?: string;
}

export interface HotlistParams {
  limit?: number;
  source?: string;
  q?: string;
}

export interface SearchParams {
  q: string;
  limit?: number;
  source?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    network: string;
    transaction?: string | null;
    payer?: string | null;
    errorReason?: string | null;
    dataMode: 'live' | 'snapshot';
    fetchedAt: string | null;
  };
}

/**
 * Sign a payment using EIP-712 for USDC transfers on Base
 */
async function signPayment(params: {
  amount: bigint;
  payTo: string;
  nonce: bigint;
  expiry: number;
  walletPrivateKey: string;
}): Promise<string> {
  // Implementation depends on available crypto libs
  // For now, return placeholder — real impl needs viem/ethers
  throw new Error('signPayment requires viem or ethers.js');
}

/**
 * Make an authenticated API call
 */
async function fetchWithAuth(url: string, config: {
  headers?: Record<string, string>;
  apiKey?: string;
}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };
  if (config.apiKey) {
    headers['X-Agent-Key'] = config.apiKey;
  }
  return fetch(url, { headers });
}

export class AutoTasker {
  private config: AgentConfig;
  private baseUrl: string;

  constructor(config: AgentConfig = {}) {
    this.config = config;
    this.baseUrl = config.facilitatorUrl || BASE_URL;
  }

  /**
   * Register a new agent (creates API key)
   */
  static async register(name: string, walletAddress: string): Promise<{
    agentId: string;
    apiKey: string;
    dailyFreeCalls: number;
    rateLimit: number;
  }> {
    const res = await fetch(`${BASE_URL}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, wallet: walletAddress }),
    });
    if (!res.ok) throw new Error(`Registration failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Get hotlist data (paid via x402, or free if within daily quota)
   */
  async hotlist(params: HotlistParams = {}): Promise<ApiResponse<any>> {
    const url = new URL('/api/x402/hotlist', this.baseUrl);
    if (params.limit) url.searchParams.set('limit', String(params.limit));
    if (params.source) url.searchParams.set('source', params.source);
    
    const res = await fetchWithAuth(url.toString(), { apiKey: this.config.apiKey });
    
    if (res.status === 402) {
      // x402 payment required — would need wallet integration here
      throw new Error('Payment required. Connect wallet to proceed.');
    }
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    
    return res.json();
  }

  /**
   * Search across all boards
   */
  async search(params: SearchParams): Promise<ApiResponse<any>> {
    const url = new URL('/api/x402/search', this.baseUrl);
    url.searchParams.set('q', params.q);
    if (params.limit) url.searchParams.set('limit', String(params.limit));
    if (params.source) url.searchParams.set('source', params.source);
    
    const res = await fetchWithAuth(url.toString(), { apiKey: this.config.apiKey });
    if (res.status === 402) throw new Error('Payment required');
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    return res.json();
  }

  /**
   * Free sample — no auth needed
   */
  async sample(limit = 5): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/x402/sample?limit=${limit}`);
    if (!res.ok) throw new Error(`Sample failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get usage stats for current agent
   */
  async getStats(): Promise<{
    callsToday: number;
    callsTotal: number;
    usdcSpent: number;
    remainingFreeCalls: number;
  }> {
    const res = await fetchWithAuth(`${this.baseUrl}/api/agents/stats`, {
      apiKey: this.config.apiKey,
    });
    if (!res.ok) throw new Error(`Stats failed: ${res.status}`);
    return res.json();
  }
}

// ESM default export
export default AutoTasker;
