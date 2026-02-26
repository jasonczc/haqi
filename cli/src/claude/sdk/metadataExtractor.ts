/**
 * SDK Metadata Extractor
 * Captures available tools and slash commands from Claude SDK initialization
 */

import { query } from './query'
import type { SDKSystemMessage } from './types'
import { logger } from '@/ui/logger'

export interface SDKMetadata {
    tools?: string[]
    slashCommands?: string[]
    model?: string
    availableModels?: string[]
}

function resolveStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined
    }
    const cleaned = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    return cleaned.length > 0 ? cleaned : undefined
}

/**
 * Extract SDK metadata by running a minimal query and capturing the init message
 * @returns SDK metadata containing tools and slash commands
 */
export async function extractSDKMetadata(): Promise<SDKMetadata> {
    const abortController = new AbortController()
    
    try {
        logger.debug('[metadataExtractor] Starting SDK metadata extraction')
        
        // Run SDK with minimal tools allowed
        const sdkQuery = query({
            prompt: 'hello',
            options: {
                allowedTools: ['Bash(echo)'],
                maxTurns: 1,
                abort: abortController.signal
            }
        })

        // Wait for the first system message which contains tools and slash commands
        for await (const message of sdkQuery) {
            if (message.type === 'system' && message.subtype === 'init') {
                const systemMessage = message as SDKSystemMessage
                const availableModels = resolveStringArray(
                    systemMessage.available_models ?? (systemMessage as Record<string, unknown>).availableModels ?? systemMessage.models
                )
                
                const metadata: SDKMetadata = {
                    tools: systemMessage.tools,
                    slashCommands: systemMessage.slash_commands,
                    model: systemMessage.model,
                    availableModels
                }
                
                logger.debug('[metadataExtractor] Captured SDK metadata:', metadata)
                
                // Abort the query since we got what we need
                abortController.abort()
                
                return metadata
            }
        }
        
        logger.debug('[metadataExtractor] No init message received from SDK')
        return {}
        
    } catch (error) {
        // Check if it's an abort error (expected)
        if (error instanceof Error && error.name === 'AbortError') {
            logger.debug('[metadataExtractor] SDK query aborted after capturing metadata')
            return {}
        }
        logger.debug('[metadataExtractor] Error extracting SDK metadata:', error)
        return {}
    }
}

/**
 * Extract SDK metadata asynchronously without blocking
 * Fires the extraction and updates metadata when complete
 */
export function extractSDKMetadataAsync(onComplete: (metadata: SDKMetadata) => void): void {
    extractSDKMetadata()
        .then(metadata => {
            if (metadata.tools || metadata.slashCommands || metadata.model || metadata.availableModels) {
                onComplete(metadata)
            }
        })
        .catch(error => {
            logger.debug('[metadataExtractor] Async extraction failed:', error)
        })
}
