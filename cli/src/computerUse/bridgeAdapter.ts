import type { AgentFlavor } from '@hapi/protocol'
import { getHappyCliCommand } from '@/utils/spawnHappyCLI'
import type { ComputerUseAdapter, ComputerUseApplyContext } from './adapter'
import { capability } from './adapter'

/**
 * Generic bridge adapter.
 *
 * Use this when the agent has no native computer-use support (or the
 * support is worse than going through MCP). It injects the stdio MCP
 * server `haqi mcp computer-use` into the session's mcpServers list so
 * the agent discovers screenshot / click / type / ... as ordinary tools.
 *
 * This is the final fallback for any flavor. Specific flavors should
 * export a more specialized adapter (native) when their SDK / CLI has a
 * better path.
 */
export class BridgeComputerUseAdapter implements ComputerUseAdapter {
    readonly capability

    constructor(flavor: AgentFlavor) {
        this.capability = capability(
            flavor,
            'bridge',
            `MCP bridge (haqi mcp computer-use → daemon HTTP) for ${flavor}`
        )
    }

    apply(ctx: ComputerUseApplyContext): void {
        // Avoid double-inject if a previous adapter already pushed the
        // same MCP (e.g. a native adapter that still wants the bridge
        // as a supplementary channel).
        if (ctx.mcpServers.some((srv) => srv.name === 'computer-use')) return

        const daemonUrl = process.env.HAQI_DAEMON_URL?.trim() || 'http://127.0.0.1:9876'
        const command = getHappyCliCommand(['mcp', 'computer-use', '--daemon', daemonUrl])

        ctx.mcpServers.push({
            name: 'computer-use',
            command: command.command,
            args: command.args,
            env: []
        })
        ctx.log(`[computerUse:${this.capability.flavor}] attached MCP bridge (daemon=${daemonUrl})`)
    }
}
