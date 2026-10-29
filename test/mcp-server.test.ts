import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SolanaAnalyticsMcpServer } from "../src/server.js";

describe("Model Context Protocol (MCP) Solana Analytics Suite", () => {
  const server = new SolanaAnalyticsMcpServer();

  test("MCP Server: handles initialize handshake returning protocolVersion and capabilities", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });

    assert.strictEqual(res.jsonrpc, "2.0");
    assert.strictEqual(res.id, 1);
    assert.strictEqual(res.result.protocolVersion, "2024-11-05");
    assert.strictEqual(res.result.serverInfo.name, "mcp-solana-analytics");
    assert.ok(res.result.capabilities.tools);
  });

  test("MCP Server: handles tools/list returning 4 tool schemas with full property validation", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    assert.strictEqual(res.id, 2);
    const tools = res.result.tools;
    assert.strictEqual(tools.length, 4);

    const names = tools.map((t: any) => t.name);
    assert.ok(names.includes("get_bonding_curve_state"));
    assert.ok(names.includes("simulate_raydium_swap"));
    assert.ok(names.includes("profile_trader_wallet"));
    assert.ok(names.includes("evaluate_copy_trade_signal"));
  });

  test("MCP Server: executes get_bonding_curve_state tool", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_bonding_curve_state",
        arguments: {
          mint: "PumpMintTest1111111111111111111111111111111",
          realSolLamports: "42500000000", // 42.5 SOL (50%)
        },
      },
    });

    assert.strictEqual(res.id, 3);
    const data = JSON.parse(res.result.content[0].text);
    assert.strictEqual(data.progressPercent, "50%");
    assert.strictEqual(data.isComplete, false);
    assert.ok(data.priceSolPerToken);
  });

  test("MCP Server: executes simulate_raydium_swap tool with 0.25% fee calculation", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "simulate_raydium_swap",
        arguments: {
          mint: "RaydiumMint11111111111111111111111111111111",
          direction: "SOL_TO_TOKEN",
          amountIn: "5000000000", // 5 SOL
        },
      },
    });

    assert.strictEqual(res.id, 4);
    const data = JSON.parse(res.result.content[0].text);
    assert.strictEqual(data.direction, "SOL_TO_TOKEN");
    assert.strictEqual(data.feeAmount, "12500000"); // 5 SOL * 0.25%
    assert.ok(BigInt(data.amountOut) > 0n);
    assert.ok(data.priceImpactPercent);
  });

  test("MCP Server: executes profile_trader_wallet tool classifying Elite trader", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "profile_trader_wallet",
        arguments: {
          wallet: "EliteWallet11111111111111111111111111111111",
          trades: [
            { isBuy: true, solAmountLamports: "5000000000" },
            { isBuy: false, solAmountLamports: "25000000000" }, // +20 SOL
          ],
        },
      },
    });

    assert.strictEqual(res.id, 5);
    const data = JSON.parse(res.result.content[0].text);
    assert.strictEqual(data.winRate, "100%");
    assert.strictEqual(data.realizedPnlSol, "+20.00 SOL");
    assert.strictEqual(data.tier, "Elite");
    assert.ok(data.traderScore >= 80);
  });

  test("MCP Server: executes evaluate_copy_trade_signal emitting COPY_BUY for smart money", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "evaluate_copy_trade_signal",
        arguments: {
          mint: "NewAlphaMint1111111111111111111111111111111",
          trader: "EliteTrader11111111111111111111111111111111",
          traderScore: 90,
          winRate: 0.85,
          isBuy: true,
          curveProgressPercent: 12,
        },
      },
    });

    assert.strictEqual(res.id, 6);
    const data = JSON.parse(res.result.content[0].text);
    assert.strictEqual(data.signal, "COPY_BUY");
    assert.ok(data.confidencePercent);
    assert.ok(data.suggestedAction.includes("Buy recommended"));
  });

  test("MCP Server: suppresses copy-trade signal for low-score trader", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "evaluate_copy_trade_signal",
        arguments: {
          mint: "RetailMint11111111111111111111111111111111",
          trader: "RetailTrader111111111111111111111111111111",
          traderScore: 25,
          winRate: 0.2,
          isBuy: true,
        },
      },
    });

    assert.strictEqual(res.id, 7);
    const data = JSON.parse(res.result.content[0].text);
    assert.strictEqual(data.signal, "NONE");
    assert.ok(data.reason.includes("Retail noise filtered"));
  });

  test("MCP Server: returns JSON-RPC -32601 error for unknown method", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 8,
      method: "unknown/method",
    });

    assert.strictEqual(res.id, 8);
    assert.strictEqual(res.error?.code, -32601);
  });

  test("MCP Server: returns error for unknown tool call", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "non_existent_tool", arguments: {} },
    });

    assert.strictEqual(res.id, 9);
    assert.strictEqual(res.error?.code, -32603);
    assert.ok(res.error?.message.includes("Unknown tool"));
  });
});
