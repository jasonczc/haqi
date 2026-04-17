import type { AgentFlavor } from '@hapi/protocol'
import type { McpServerStdio } from '@/agent/types'
import type { AdapterCapability, AdapterStrategy } from './types'
import type { ComputerUseRuntime } from './runtime'

/**
 * Adapter contract per agent flavor.
 *
 * An adapter is a pure "config mutator": it receives the session's
 * pending MCP list / env vars / CLI args and adds whatever bits the
 * concrete agent needs to see computer-use tools. The adapter does NOT
 * execute actions itself — that's the runtime's job (called either
 * directly by a native in-process handler, or by the bridge MCP server).
 *
 * Every flavor registers exactly one adapter. Adding a 6th agent or
 * upgrading native support = editing / adding one file.
 */
export interface ComputerUseAdapter {
    readonly capability: AdapterCapability
    apply(ctx: ComputerUseApplyContext): Promise<void> | void
}

export type ComputerUseModelHint = {
    /** Model the user picked explicitly (may be empty/auto). */
    current: string | undefined
    /**
     * If set, the adapter recommends swapping to this model for best
     * computer-use performance. Caller decides whether to enforce.
     */
    preferred?: string
    /** Caller should warn/log when current ≠ preferred. */
    warnOnMismatch?: boolean
}

export type ComputerUseApplyContext = {
    /** Daemon-backed action runtime (shared by all adapters). */
    readonly runtime: ComputerUseRuntime
    /** MCP servers list the agent will be handed; adapters push into this. */
    readonly mcpServers: McpServerStdio[]
    /** Env vars passed to the agent CLI child process. */
    readonly extraEnv: Record<string, string>
    /** CLI args appended when launching the agent. */
    readonly extraArgs: string[]
    /** Model selection hint: adapters can propose a preferred model. */
    readonly modelHint: ComputerUseModelHint
    /** Diagnostic logger; writes to daemon logs. */
    readonly log: (msg: string) => void
}

/**
 * Per-flavor registry. Every `cli/src/<flavor>/computerUse.ts` registers
 * its adapter here at import time. The runner asks `getAdapter(flavor)`
 * once per session and calls `apply(ctx)`.
 */
class ComputerUseAdapterRegistry {
    private readonly map = new Map<AgentFlavor, ComputerUseAdapter>()

    register(adapter: ComputerUseAdapter): void {
        const existing = this.map.get(adapter.capability.flavor)
        if (existing) {
            // Last registration wins — lets a test override or a per-build
            // variant replace a default. We log to surface accidental dup.
            process.stderr.write(
                `[computerUse] Overriding adapter for ${adapter.capability.flavor} (${existing.capability.strategy} → ${adapter.capability.strategy})\n`
            )
        }
        this.map.set(adapter.capability.flavor, adapter)
    }

    getAdapter(flavor: AgentFlavor): ComputerUseAdapter | null {
        return this.map.get(flavor) ?? null
    }

    listCapabilities(): AdapterCapability[] {
        return [...this.map.values()].map((a) => a.capability)
    }
}

export const computerUseRegistry = new ComputerUseAdapterRegistry()

/** Convenience helper for adapters that need to declare capability. */
export function capability(
    flavor: AgentFlavor,
    strategy: AdapterStrategy,
    description: string
): AdapterCapability {
    return { flavor, strategy, description }
}
