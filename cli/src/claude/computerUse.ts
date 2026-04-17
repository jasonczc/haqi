/**
 * Claude computer-use adapter.
 *
 * Status: native (via the in-process HAPI MCP HTTP server).
 *
 * Claude Code CLI consumes MCP over HTTP in this codebase. Instead of
 * spawning a separate stdio bridge process, we register screenshot /
 * click / type / ... directly on the same `McpServer` that serves the
 * rest of the HAPI MCP (startHappyServer.ts). The CLI sees those tools
 * as `mcp__haqi__screenshot`, etc., and they're added to allowedTools
 * automatically via the `toolNames` array returned from startHappyServer.
 *
 * Because registration happens eagerly at server startup (gated on
 * `HAQI_COMPUTER_USE === '1'`), this adapter's `apply()` is a no-op:
 * the work is already done before `buildHapiMcpBridge` (which Claude
 * does not use) would ever be called.
 *
 * This file exists so the adapter registry can advertise Claude's
 * capability and strategy for diagnostics.
 */

import type { ComputerUseAdapter, ComputerUseApplyContext } from '@/computerUse/adapter'
import { capability } from '@/computerUse/adapter'

class ClaudeComputerUseAdapter implements ComputerUseAdapter {
    readonly capability = capability(
        'claude',
        'native',
        'Claude: tools registered directly on HAPI MCP HTTP server (startHappyServer)'
    )

    apply(_ctx: ComputerUseApplyContext): void {
        // No-op: Claude's MCP pipeline is assembled in runClaude.ts via
        // startHappyServer, and computer-use tools are registered there
        // directly. The apply() contract only matters for adapters whose
        // flavor consumes the buildHapiMcpBridge pathway.
    }
}

export const claudeComputerUseAdapter = new ClaudeComputerUseAdapter()
