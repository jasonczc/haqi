import { logger } from '@/ui/logger'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import {
    collectMcpServersForFlavor,
    type ListMcpServersRequest,
    type ListMcpServersResponse
} from '../mcp'
import { getErrorMessage } from '../rpcResponses'

export function registerMcpHandlers(
    rpcHandlerManager: RpcHandlerManager,
    options: {
        flavor?: string
    } = {}
): void {
    rpcHandlerManager.registerHandler<ListMcpServersRequest, ListMcpServersResponse>('listMcpServers', async (data) => {
        const flavor = typeof data?.flavor === 'string' && data.flavor.trim().length > 0
            ? data.flavor.trim()
            : options.flavor ?? 'unknown'

        logger.debug('List MCP servers request', { flavor })

        try {
            const result = await collectMcpServersForFlavor(flavor)
            if (result.commandFailed && result.servers.length === 0) {
                return {
                    success: false,
                    flavor: result.flavor,
                    checkedAt: Date.now(),
                    error: result.warning ?? 'Failed to list MCP servers'
                }
            }

            return {
                success: true,
                flavor: result.flavor,
                servers: result.servers,
                checkedAt: Date.now(),
                ...(result.warning ? { warning: result.warning } : {})
            }
        } catch (error) {
            logger.debug('Failed to list MCP servers:', error)
            return {
                success: false,
                flavor,
                checkedAt: Date.now(),
                error: getErrorMessage(error, 'Failed to list MCP servers')
            }
        }
    })
}
