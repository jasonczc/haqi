/**
 * Codex computer-use adapter.
 *
 * Status: bridge-only for now.
 *
 * OpenAI has computer-use-tuned models (e.g. `computer-use-preview`),
 * but haqi drives Codex through its CLI, which delivers tools via MCP
 * config. Ship the shared MCP bridge; leave model-specific upgrades to
 * a future iteration with verification.
 *
 * Upgrade path (single file — this one):
 *   - Once we verify which gpt-5-series model variants support tool
 *     schema compatible with our bridge, set ctx.modelHint.preferred.
 *   - If Codex CLI grows a native computer tool flag, push to extraArgs.
 */

import { BridgeComputerUseAdapter } from '@/computerUse/bridgeAdapter'
import type { ComputerUseAdapter, ComputerUseApplyContext } from '@/computerUse/adapter'
import { capability } from '@/computerUse/adapter'

class CodexComputerUseAdapter implements ComputerUseAdapter {
    readonly capability = capability(
        'codex',
        'bridge',
        'Codex: MCP tool channel via haqi mcp computer-use'
    )

    private readonly bridge = new BridgeComputerUseAdapter('codex')

    apply(ctx: ComputerUseApplyContext): void {
        this.bridge.apply(ctx)
    }
}

export const codexComputerUseAdapter = new CodexComputerUseAdapter()
