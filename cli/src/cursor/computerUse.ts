/**
 * Cursor computer-use adapter.
 *
 * Status: bridge-ready, but the Cursor launcher (`cursorLocal.ts`) does
 * not currently pass MCP config to the `cursor-agent` CLI. That means
 * `apply()` below will only take effect once the Cursor launcher is
 * updated to call `buildHapiMcpBridge` like Codex/Gemini/OpenCode and
 * forward `mcpServers` to the Cursor process.
 *
 * Keeping the registration in place so that:
 *   1. Capability listings show cursor has a planned path (bridge).
 *   2. Wiring MCP into the Cursor launcher later is a single-line change.
 */
import { BridgeComputerUseAdapter } from '@/computerUse/bridgeAdapter'

export const cursorComputerUseAdapter = new BridgeComputerUseAdapter('cursor')
