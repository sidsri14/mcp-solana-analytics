# Solana DEX Analytics MCP Server

Production-ready [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server exposing real-time Solana Pump.fun bonding curve analytics, Raydium CPMM swap simulations, smart-money wallet profiling, and copy-trade signal generation to LLMs and autonomous AI agents.

[![CI](https://github.com/sidsri14/mcp-solana-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/sidsri14/mcp-solana-analytics/actions)
[![Test Status](https://img.shields.io/badge/tests-9%2F9%20passing-brightgreen)](#)
[![Protocol Version](https://img.shields.io/badge/MCP-2024--11--05-blue)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Exposed MCP Tools

| Tool Name | Description | Required Parameters |
| :--- | :--- | :--- |
| `get_bonding_curve_state` | Computes Pump.fun bonding curve reserves, token price in SOL, market cap, and Raydium migration progress (85 SOL threshold). | `mint`, `realSolLamports` |
| `simulate_raydium_swap` | Simulates a post-graduation Raydium CPMM swap with 0.25% fee (25 bps) and exact price impact percentage. | `mint`, `direction` (`SOL_TO_TOKEN` / `TOKEN_TO_SOL`), `amountIn` |
| `profile_trader_wallet` | Calculates win rate, realized PnL in SOL, and assigns composite smart-money tier (`Elite`, `Profitable`, `Neutral`, `Unprofitable`). | `wallet`, `trades` |
| `evaluate_copy_trade_signal` | Generates high-confidence `COPY_BUY` and `TAKE_PROFIT` copy-trade signals from smart money entries, filtering retail noise. | `mint`, `trader`, `traderScore`, `winRate`, `isBuy` |

---

## Client Integration

### Claude Desktop Configuration
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "solana-analytics": {
      "command": "npx",
      "args": ["-y", "tsx", "d:/mcp-solana-analytics/src/index.ts"]
    }
  }
}
```

### Cursor / Antigravity Custom MCP Server
```json
{
  "name": "solana-analytics",
  "command": "node",
  "args": ["dist/index.js"],
  "transport": "stdio"
}
```

---

## Installation & Verification

```bash
# Clone repository
git clone https://github.com/sidsri14/mcp-solana-analytics.git
cd mcp-solana-analytics

# Install dependencies
npm install

# Run automated test suite (9/9 tests pass)
npm test

# Typecheck TypeScript
npm run typecheck
```

---

## Developer Information
- **Author:** Siddharth Srivastava ([@sidsri14](https://github.com/sidsri14))
- **Email:** `sidsri1502@gmail.com`
- **GitHub:** [https://github.com/sidsri14](https://github.com/sidsri14)
- **License:** MIT
