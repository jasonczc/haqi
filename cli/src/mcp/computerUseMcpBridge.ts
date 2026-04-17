/**
 * Computer-use MCP STDIO bridge.
 *
 * Exposes the canonical computer-use action set over MCP stdio so any
 * agent (via its MCP client) can screenshot / click / type / scroll on
 * the session desktop. The bridge is *deliberately thin*:
 *
 *   agent ←MCP stdio→ this process ←runtime→ daemon HTTP
 *
 * Separation of concerns:
 *   - `computerUseTools.ts`: tool name / description / input zod schema.
 *   - `@/computerUse/runtime`: the only place that knows how to actually
 *     perform a click (delegates to daemon HTTP; could be swapped).
 *   - `registerComputerUseTools`: tool registration shared with Claude's
 *     in-process HTTP MCP server.
 *   - This file: boots the stdio transport and wires in the shared helper.
 *
 * Never print to stdout (that's the MCP transport). Use stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { DaemonComputerUseRuntime, type ComputerUseRuntime } from '@/computerUse/runtime'
import { registerComputerUseTools } from '@/mcp/registerComputerUseTools'

function parseDaemonUrl(argv: string[]): string | undefined {
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i]
        if ((flag === '--daemon' || flag === '--url') && i + 1 < argv.length) {
            return argv[i + 1]
        }
    }
    return undefined
}

export async function runComputerUseMcpStdio(argv: string[]): Promise<void> {
    try {
        const daemonOverride = parseDaemonUrl(argv)
        const runtime: ComputerUseRuntime = new DaemonComputerUseRuntime(daemonOverride)

        const server = new McpServer({
            name: 'haqi-computer-use',
            version: '0.1.0'
        })

        registerComputerUseTools(server, runtime)

        const transport = new StdioServerTransport()
        await server.connect(transport)
    } catch (err) {
        process.stderr.write(
            `[haqi-computer-use] Fatal: ${err instanceof Error ? err.message : String(err)}\n`
        )
        process.exit(1)
    }
}
