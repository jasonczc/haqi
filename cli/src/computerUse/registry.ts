/**
 * Default adapter registrations.
 *
 * Import-only file — side-effect registers every per-flavor adapter with
 * the shared `computerUseRegistry`. Import once from the CLI entry point
 * (bootstrap) so every session-spawn path sees the same registry.
 *
 * Adding a new agent flavor:
 *   1. Create cli/src/<flavor>/computerUse.ts exporting an adapter.
 *   2. Import + register it here.
 * That's the whole change — no edits to runners, no if/else elsewhere.
 */

import { computerUseRegistry } from './adapter'
import { claudeComputerUseAdapter } from '@/claude/computerUse'
import { codexComputerUseAdapter } from '@/codex/computerUse'
import { cursorComputerUseAdapter } from '@/cursor/computerUse'
import { geminiComputerUseAdapter } from '@/gemini/computerUse'
import { opencodeComputerUseAdapter } from '@/opencode/computerUse'

let registered = false

export function registerDefaultComputerUseAdapters(): void {
    if (registered) return
    registered = true
    computerUseRegistry.register(claudeComputerUseAdapter)
    computerUseRegistry.register(codexComputerUseAdapter)
    computerUseRegistry.register(cursorComputerUseAdapter)
    computerUseRegistry.register(geminiComputerUseAdapter)
    computerUseRegistry.register(opencodeComputerUseAdapter)
}
