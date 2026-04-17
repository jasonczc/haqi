import { describe, expect, it } from 'vitest';
import { registerDefaultComputerUseAdapters } from './registry';
import { computerUseRegistry } from './adapter';
import type { AgentFlavor } from '@hapi/protocol';

const FLAVORS: AgentFlavor[] = ['claude', 'codex', 'cursor', 'gemini', 'opencode'];

describe('computerUseRegistry defaults', () => {
    it('registers an adapter for every known agent flavor', () => {
        registerDefaultComputerUseAdapters();
        for (const flavor of FLAVORS) {
            const adapter = computerUseRegistry.getAdapter(flavor);
            expect(adapter, `missing adapter for ${flavor}`).not.toBeNull();
            expect(adapter!.capability.flavor).toBe(flavor);
        }
    });

    it('registerDefaultComputerUseAdapters is idempotent', () => {
        const first = computerUseRegistry.listCapabilities().length;
        registerDefaultComputerUseAdapters();
        registerDefaultComputerUseAdapters();
        const second = computerUseRegistry.listCapabilities().length;
        expect(second).toBe(first);
    });

    it('claude uses native strategy (direct HTTP MCP registration)', () => {
        registerDefaultComputerUseAdapters();
        const adapter = computerUseRegistry.getAdapter('claude');
        expect(adapter?.capability.strategy).toBe('native');
    });

    it('codex/cursor/gemini/opencode use the stdio bridge strategy', () => {
        registerDefaultComputerUseAdapters();
        for (const flavor of ['codex', 'cursor', 'gemini', 'opencode'] as const) {
            const adapter = computerUseRegistry.getAdapter(flavor);
            expect(adapter?.capability.strategy, `unexpected strategy for ${flavor}`).toBe('bridge');
        }
    });

    it('returns null for an unknown flavor', () => {
        registerDefaultComputerUseAdapters();
        const adapter = computerUseRegistry.getAdapter('bogus' as AgentFlavor);
        expect(adapter).toBeNull();
    });
});
