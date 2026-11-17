#!/bin/bash
# run-mcp-publisher.sh — 一键注册到 MCP Registry
#
# 用法: bash scripts/run-mcp-publisher.sh
#
# 前提条件:
#   1. 克隆自己的 fork: git clone https://github.com/breezesamuel/registry ~/modelcontextprotocol-registry
#   2. 切换到主分支并拉取最新: cd ~/modelcontextprotocol-registry && git checkout main && git pull origin main
#   3. gh cli 已登录 (GitHub OAuth): gh auth status

set -e

REGISTRY_DIR="${REGISTRY_DIR:-$HOME/modelcontextprotocol-registry}"

if [ ! -d "$REGISTRY_DIR" ]; then
  echo "Step 1: Clone your fork of modelcontextprotocol/registry"
  echo "Run: git clone https://github.com/breezesamuel/registry '$REGISTRY_DIR'"
  exit 1
fi

cd "$REGISTRY_DIR"

echo "Step 2: Pull latest code"
git pull origin main

echo "Step 3: Build mcp-publisher"
make publisher

echo ""
echo "=== Step 4: Run mcp-publisher ==="
echo ""
ORIGIN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('F:/2026/第二次点子/data/public-urls.json','utf8')).aevumTreasury)")
echo "Your server details:"
echo "  URL:          ${ORIGIN}/mcp"
echo "  Repository:   https://github.com/breezesamuel/autotasker-hub-aevum"
echo "  Transport:    streamable-http"
echo ""
echo "When prompted:"
echo "  server-url:       ${ORIGIN}/mcp"
echo "  display-name:     AutoTasker Hub — China Social Data"
echo "  description:      Real-time Chinese social media trending data with x402 paywall"
echo ""
echo "After success, your server appears in:"
echo "  • registry.modelcontextprotocol.io (official)"
echo "  • Smithery / Arcade (reads official registry)"
echo "  • PulseMCP (reads official registry)"
echo "  • Glama.ai (via glama.json in your repo — already submitted)"
echo ""

./bin/mcp-publisher
