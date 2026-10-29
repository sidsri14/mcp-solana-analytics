import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpToolSchema,
  type McpToolResult,
} from "./mcp-types.js";

export class SolanaAnalyticsMcpServer {
  private tools: McpToolSchema[] = [
    {
      name: "get_bonding_curve_state",
      description:
        "Computes Pump.fun bonding curve reserves, token price in SOL, market cap, and progress toward the 85 SOL Raydium migration threshold.",
      inputSchema: {
        type: "object",
        properties: {
          mint: { type: "string", description: "Solana token mint address" },
          virtualSolLamports: { type: "string", description: "Virtual SOL reserves in lamports (default: 30000000000)" },
          virtualTokenUnits: { type: "string", description: "Virtual token reserves in base units (default: 1073000000000000)" },
          realSolLamports: { type: "string", description: "Real SOL deposited in curve in lamports" },
        },
        required: ["mint", "realSolLamports"],
      },
    },
    {
      name: "simulate_raydium_swap",
      description:
        "Simulates a post-graduation Raydium CPMM constant-product swap with standard 0.25% fee (25 bps) and exact price impact percentage.",
      inputSchema: {
        type: "object",
        properties: {
          mint: { type: "string", description: "Solana token mint address" },
          direction: { type: "string", enum: ["SOL_TO_TOKEN", "TOKEN_TO_SOL"], description: "Swap direction" },
          amountIn: { type: "string", description: "Amount of input asset (lamports for SOL, base units for Token)" },
          poolSolLamports: { type: "string", description: "Pool SOL reserves in lamports (default: 79000000000)" },
          poolTokenUnits: { type: "string", description: "Pool token reserves in base units (default: 206900000000000)" },
        },
        required: ["mint", "direction", "amountIn"],
      },
    },
    {
      name: "profile_trader_wallet",
      description:
        "Evaluates a Solana trader wallet's historical performance, calculating win rate, realized PnL in SOL, and composite smart-money tier (Elite, Profitable, Neutral, Unprofitable).",
      inputSchema: {
        type: "object",
        properties: {
          wallet: { type: "string", description: "Trader wallet public key" },
          trades: {
            type: "array",
            description: "List of trade events to score",
            items: {
              type: "object",
              properties: {
                isBuy: { type: "boolean" },
                solAmountLamports: { type: "string" },
              },
              required: ["isBuy", "solAmountLamports"],
            },
          },
        },
        required: ["wallet", "trades"],
      },
    },
    {
      name: "evaluate_copy_trade_signal",
      description:
        "Evaluates whether a new trade from a profiled trader qualifies as a high-confidence copy-trade signal.",
      inputSchema: {
        type: "object",
        properties: {
          mint: { type: "string", description: "Solana token mint address" },
          trader: { type: "string", description: "Trader wallet public key" },
          traderScore: { type: "number", description: "Composite score of the trader (0-100)" },
          winRate: { type: "number", description: "Trader win rate (0.0 - 1.0)" },
          isBuy: { type: "boolean", description: "Whether the trade is a Buy" },
          curveProgressPercent: { type: "number", description: "Current bonding curve progress percentage (0-100)" },
        },
        required: ["mint", "trader", "traderScore", "winRate", "isBuy"],
      },
    },
  ];

  public getTools(): McpToolSchema[] {
    return this.tools;
  }

  public handleRequest(req: JsonRpcRequest): JsonRpcResponse {
    try {
      if (req.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: {
              name: "mcp-solana-analytics",
              version: "1.0.0",
            },
          },
        };
      }

      if (req.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: { tools: this.tools },
        };
      }

      if (req.method === "tools/call") {
        const { name, arguments: args } = req.params || {};
        const result = this.executeTool(name, args || {});
        return {
          jsonrpc: "2.0",
          id: req.id,
          result,
        };
      }

      return {
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: -32601,
          message: `Method not found: ${req.method}`,
        },
      };
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: -32603,
          message: err?.message || "Internal error",
        },
      };
    }
  }

  public executeTool(name: string, args: Record<string, any>): McpToolResult {
    switch (name) {
      case "get_bonding_curve_state": {
        const mint = String(args.mint);
        const realSol = BigInt(args.realSolLamports);
        const virtualSol = args.virtualSolLamports ? BigInt(args.virtualSolLamports) : 30_000_000_000n;
        const virtualToken = args.virtualTokenUnits ? BigInt(args.virtualTokenUnits) : 1_073_000_000_000_000n;

        const target = 85_000_000_000n;
        const progress = Math.min(100, Math.max(0, Math.round((Number(realSol) / Number(target)) * 10000) / 100));
        const price = (Number(virtualSol) / 1e9) / (Number(virtualToken) / 1e6);
        const marketCapSol = price * 1_000_000_000;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mint,
                progressPercent: `${progress}%`,
                isComplete: progress >= 100,
                priceSolPerToken: price.toExponential(6),
                marketCapSol: `${marketCapSol.toFixed(2)} SOL`,
                realSolReserves: `${Number(realSol) / 1e9} SOL`,
              }, null, 2),
            },
          ],
        };
      }

      case "simulate_raydium_swap": {
        const mint = String(args.mint);
        const direction = String(args.direction);
        const amountIn = BigInt(args.amountIn);
        const poolSol = args.poolSolLamports ? BigInt(args.poolSolLamports) : 79_000_000_000n;
        const poolToken = args.poolTokenUnits ? BigInt(args.poolTokenUnits) : 206_900_000_000_000n;

        const feeBps = 25n; // 0.25% fee
        const fee = (amountIn * feeBps) / 10000n;
        const netIn = amountIn - fee;

        let amountOut: bigint;
        let spotPriceBefore: number;
        let effectivePrice: number;

        if (direction === "SOL_TO_TOKEN") {
          amountOut = (netIn * poolToken) / (poolSol + netIn);
          spotPriceBefore = (Number(poolSol) / 1e9) / (Number(poolToken) / 1e6);
          effectivePrice = (Number(amountIn) / 1e9) / (Number(amountOut) / 1e6);
        } else {
          amountOut = (netIn * poolSol) / (poolToken + netIn);
          spotPriceBefore = (Number(poolSol) / 1e9) / (Number(poolToken) / 1e6);
          effectivePrice = (Number(amountOut) / 1e9) / (Number(amountIn) / 1e6);
        }

        const priceImpactPercent = Math.max(
          0,
          Math.abs(((effectivePrice - spotPriceBefore) / spotPriceBefore) * 100)
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mint,
                direction,
                amountIn: amountIn.toString(),
                amountOut: amountOut.toString(),
                feeAmount: fee.toString(),
                priceImpactPercent: `${priceImpactPercent.toFixed(2)}%`,
                effectivePrice: effectivePrice.toExponential(6),
              }, null, 2),
            },
          ],
        };
      }

      case "profile_trader_wallet": {
        const wallet = String(args.wallet);
        const trades = Array.isArray(args.trades) ? args.trades : [];

        let totalBuys = 0n;
        let totalSells = 0n;
        let buyCount = 0;
        let sellCount = 0;

        for (const t of trades) {
          const amt = BigInt(t.solAmountLamports);
          if (t.isBuy) {
            totalBuys += amt;
            buyCount++;
          } else {
            totalSells += amt;
            sellCount++;
          }
        }

        const netPnlSol = Number(totalSells - totalBuys) / 1e9;
        const totalVolumeSol = Number(totalBuys + totalSells) / 1e9;
        const winRate = sellCount > 0 ? (netPnlSol > 0 ? 1.0 : 0.0) : 0.5;

        // Composite score 0-100
        let score = Math.min(100, Math.max(0, Math.round(winRate * 40 + Math.min(40, netPnlSol * 4) + Math.min(20, totalVolumeSol))));
        let tier: "Elite" | "Profitable" | "Neutral" | "Unprofitable" = "Neutral";
        if (score >= 80) tier = "Elite";
        else if (score >= 60) tier = "Profitable";
        else if (score <= 30) tier = "Unprofitable";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                wallet,
                tier,
                traderScore: score,
                winRate: `${(winRate * 100).toFixed(0)}%`,
                realizedPnlSol: `${netPnlSol > 0 ? "+" : ""}${netPnlSol.toFixed(2)} SOL`,
                totalVolumeSol: `${totalVolumeSol.toFixed(2)} SOL`,
                totalTrades: buyCount + sellCount,
              }, null, 2),
            },
          ],
        };
      }

      case "evaluate_copy_trade_signal": {
        const mint = String(args.mint);
        const trader = String(args.trader);
        const score = Number(args.traderScore);
        const winRate = Number(args.winRate);
        const isBuy = Boolean(args.isBuy);
        const progress = args.curveProgressPercent ? Number(args.curveProgressPercent) : 15;

        if (score >= 60) {
          const confidence = Math.min(100, Math.round(score * 0.7 + winRate * 30));
          const signal = isBuy ? "COPY_BUY" : "TAKE_PROFIT";
          const action = isBuy
            ? `Buy recommended: Smart Money (${score}/100) entered early at ${progress}% curve progress`
            : `Sell recommended: Smart Money (${score}/100) closing position`;

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  signal,
                  mint,
                  trader,
                  confidencePercent: `${confidence}%`,
                  suggestedAction: action,
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                signal: "NONE",
                mint,
                trader,
                reason: `Trader score (${score}) below threshold (60). Retail noise filtered.`,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
