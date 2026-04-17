/**
 * Unified MCP bridge setup for Codex / Gemini / OpenCode local + remote.
 *
 * Single source of truth for:
 *   1. Starting the hapi MCP bridge server (for session-scoped tools).
 *   2. Generating MCP server config per agent flavor.
 *   3. Injecting optional computer-use MCP when the session opts in
 *      (delegated to per-flavor ComputerUseAdapter).
 */

import type { AgentFlavor } from '@hapi/protocol';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { getHappyCliCommand } from '@/utils/spawnHappyCLI';
import type { ApiSessionClient } from '@/api/apiSession';
import { logger } from '@/ui/logger';
import { computerUseRegistry } from '@/computerUse/adapter';
import { DaemonComputerUseRuntime } from '@/computerUse/runtime';
import { registerDefaultComputerUseAdapters } from '@/computerUse/registry';
import type { McpServerStdio } from '@/agent/types';

export interface McpServerEntry {
    command: string;
    args: string[];
}

export type McpServersConfig = Record<string, McpServerEntry>;

export interface HapiMcpBridge {
    server: {
        url: string;
        stop: () => void;
    };
    mcpServers: McpServersConfig;
}

/**
 * Computer-use MCP is injected when `HAQI_COMPUTER_USE=1` is present in
 * the environment (set at spawn time by HostProcessExecutor based on the
 * session's metadata). The adapter decides whether to push via the MCP
 * bridge, set extra env vars, or recommend a specific model.
 *
 * Returns the full mcpServers record ready to feed to the agent CLI/SDK.
 */
function applyComputerUseIfEnabled(
    base: McpServersConfig,
    flavor: AgentFlavor | null
): McpServersConfig {
    if (process.env.HAQI_COMPUTER_USE !== '1') return base;
    if (!flavor) return base;

    registerDefaultComputerUseAdapters();
    const adapter = computerUseRegistry.getAdapter(flavor);
    if (!adapter) {
        logger.info(`[computerUse] no adapter registered for ${flavor}; skipping`);
        return base;
    }

    const mcpList: McpServerStdio[] = Object.entries(base).map(([name, entry]) => ({
        name,
        command: entry.command,
        args: entry.args,
        env: []
    }));
    const extraEnv: Record<string, string> = {};
    const extraArgs: string[] = [];
    const modelHint = { current: undefined, preferred: undefined, warnOnMismatch: false };

    void adapter.apply({
        runtime: new DaemonComputerUseRuntime(),
        mcpServers: mcpList,
        extraEnv,
        extraArgs,
        modelHint,
        log: (msg: string) => logger.info(msg)
    });

    return Object.fromEntries(
        mcpList.map((s) => [s.name, { command: s.command, args: s.args }])
    );
}

/**
 * Start the hapi MCP bridge server and return the configuration
 * needed to connect the agent to it.
 *
 * @param flavor Optional — pass the agent flavor to let us inject
 * computer-use MCP when the session opts in.
 */
export async function buildHapiMcpBridge(
    client: ApiSessionClient,
    flavor: AgentFlavor | null = null
): Promise<HapiMcpBridge> {
    const happyServer = await startHappyServer(client);
    const bridgeCommand = getHappyCliCommand(['mcp', '--url', happyServer.url]);

    const base: McpServersConfig = {
        haqi: {
            command: bridgeCommand.command,
            args: bridgeCommand.args
        },
        hapi: {
            command: bridgeCommand.command,
            args: bridgeCommand.args
        }
    };

    const mcpServers = applyComputerUseIfEnabled(base, flavor);

    return {
        server: {
            url: happyServer.url,
            stop: happyServer.stop
        },
        mcpServers
    };
}
