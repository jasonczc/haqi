/**
 * Gemini computer-use adapter.
 *
 * Status: bridge-only.
 *
 * Gemini CLI (as wired in haqi) consumes MCP via ACP backend config.
 * Native computer-use through Gemini's browser APIs is a future upgrade.
 */

import { BridgeComputerUseAdapter } from '@/computerUse/bridgeAdapter'
import type { ComputerUseAdapter, ComputerUseApplyContext } from '@/computerUse/adapter'
import { capability } from '@/computerUse/adapter'

class GeminiComputerUseAdapter implements ComputerUseAdapter {
    readonly capability = capability(
        'gemini',
        'bridge',
        'Gemini: MCP tool channel via haqi mcp computer-use'
    )

    private readonly bridge = new BridgeComputerUseAdapter('gemini')

    apply(ctx: ComputerUseApplyContext): void {
        this.bridge.apply(ctx)
    }
}

export const geminiComputerUseAdapter = new GeminiComputerUseAdapter()
