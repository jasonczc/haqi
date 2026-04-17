/**
 * Canonical computer-use action space.
 *
 * Every adapter (native or bridge) lowers into this set before touching
 * the runtime. This is the single contract both the agent-facing adapters
 * and the daemon-backed runtime agree on — add a new action here and
 * every adapter knows about it.
 */

import type { AgentFlavor } from '@hapi/protocol'

export type ComputerButton = 'left' | 'middle' | 'right'

export type ComputerAction =
    | { kind: 'screenshot' }
    | { kind: 'cursor_position' }
    | { kind: 'click'; x: number; y: number; button?: ComputerButton }
    | { kind: 'type'; text: string }
    | { kind: 'key'; key: string }
    | { kind: 'scroll'; direction: 'up' | 'down'; clicks?: number; x?: number; y?: number }
    | { kind: 'open_browser'; url: string }

export type ComputerActionResult =
    | { kind: 'screenshot'; imageBase64: string; width: number; height: number }
    | { kind: 'cursor_position'; x: number; y: number }
    | { kind: 'ok' }

export type ComputerActionError = {
    kind: 'error'
    action: ComputerAction['kind']
    message: string
}

export type ComputerActionOutcome = ComputerActionResult | ComputerActionError

export type DisplayInfo = {
    width: number
    height: number
}

export type AdapterStrategy = 'native' | 'bridge'

export type AdapterCapability = {
    /** What the adapter reports it can do for this agent flavor. */
    flavor: AgentFlavor
    /** How the adapter delivers computer use to the agent. */
    strategy: AdapterStrategy
    /** Human-readable summary, surfaced in diagnostics / debug logs. */
    description: string
}
