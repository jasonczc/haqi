/**
 * OpenCode computer-use adapter.
 *
 * OpenCode is model-agnostic and exposes no native computer-use primitive.
 * Route through the MCP bridge.
 */
import { BridgeComputerUseAdapter } from '@/computerUse/bridgeAdapter'

export const opencodeComputerUseAdapter = new BridgeComputerUseAdapter('opencode')
