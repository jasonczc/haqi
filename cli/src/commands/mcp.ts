import { runHappyMcpStdioBridge } from '@/codex/happyMcpStdioBridge'
import { runComputerUseMcpStdio } from '@/mcp/computerUseMcpBridge'
import type { CommandDefinition } from './types'

export const mcpCommand: CommandDefinition = {
    name: 'mcp',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        // Subcommand routing: `haqi mcp computer-use` → computer-use bridge.
        // Default (`haqi mcp`) keeps the existing HAPI bridge behavior.
        const [first, ...rest] = commandArgs
        if (first === 'computer-use' || first === 'computer_use') {
            await runComputerUseMcpStdio(rest)
            return
        }
        await runHappyMcpStdioBridge(commandArgs)
    }
}
