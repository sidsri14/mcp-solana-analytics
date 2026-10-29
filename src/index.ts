import readline from "node:readline";
import { SolanaAnalyticsMcpServer } from "./server.js";
import { type JsonRpcRequest } from "./mcp-types.js";

export * from "./mcp-types.js";
export * from "./server.js";

const server = new SolanaAnalyticsMcpServer();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed) as JsonRpcRequest;
    const response = server.handleRequest(request);
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (err: any) {
    const errorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: "Parse error: invalid JSON",
      },
    };
    process.stdout.write(JSON.stringify(errorResponse) + "\n");
  }
});
