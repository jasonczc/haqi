import { describe, expect, it, vi } from 'vitest';
import { BridgeComputerUseAdapter } from './bridgeAdapter';
import type { ComputerUseApplyContext } from './adapter';
import type { McpServerStdio } from '@/agent/types';

function makeCtx(overrides: Partial<ComputerUseApplyContext> = {}): ComputerUseApplyContext {
    const mcpServers: McpServerStdio[] = [];
    return {
        runtime: { execute: vi.fn(), getDisplayInfo: vi.fn() },
        mcpServers,
        extraEnv: {},
        extraArgs: [],
        modelHint: { current: undefined },
        log: vi.fn(),
        ...overrides
    };
}

describe('BridgeComputerUseAdapter', () => {
    it('reports bridge strategy and the flavor it was constructed with', () => {
        const adapter = new BridgeComputerUseAdapter('opencode');
        expect(adapter.capability.flavor).toBe('opencode');
        expect(adapter.capability.strategy).toBe('bridge');
    });

    it('pushes a computer-use MCP stdio entry into ctx.mcpServers', () => {
        const adapter = new BridgeComputerUseAdapter('codex');
        const ctx = makeCtx();
        adapter.apply(ctx);
        expect(ctx.mcpServers).toHaveLength(1);
        const entry = ctx.mcpServers[0];
        expect(entry.name).toBe('computer-use');
        expect(typeof entry.command).toBe('string');
        expect(Array.isArray(entry.args)).toBe(true);
        expect(entry.args).toContain('computer-use');
        expect(entry.env).toEqual([]);
    });

    it('forwards HAQI_DAEMON_URL as a --daemon argument', () => {
        const prev = process.env.HAQI_DAEMON_URL;
        process.env.HAQI_DAEMON_URL = 'http://daemon-test:7777';
        try {
            const adapter = new BridgeComputerUseAdapter('codex');
            const ctx = makeCtx();
            adapter.apply(ctx);
            const args = ctx.mcpServers[0].args;
            const daemonIdx = args.indexOf('--daemon');
            expect(daemonIdx).toBeGreaterThanOrEqual(0);
            expect(args[daemonIdx + 1]).toBe('http://daemon-test:7777');
        } finally {
            if (prev === undefined) delete process.env.HAQI_DAEMON_URL;
            else process.env.HAQI_DAEMON_URL = prev;
        }
    });

    it('does not double-inject if another adapter already added it', () => {
        const adapter = new BridgeComputerUseAdapter('gemini');
        const ctx = makeCtx({
            mcpServers: [{ name: 'computer-use', command: 'prior', args: [], env: [] }]
        });
        adapter.apply(ctx);
        expect(ctx.mcpServers).toHaveLength(1);
        expect(ctx.mcpServers[0].command).toBe('prior');
    });

    it('logs a diagnostic line with the flavor tag', () => {
        const log = vi.fn();
        const adapter = new BridgeComputerUseAdapter('cursor');
        adapter.apply(makeCtx({ log }));
        expect(log).toHaveBeenCalledOnce();
        const msg = (log.mock.calls[0][0] as string) ?? '';
        expect(msg).toContain('[computerUse:cursor]');
    });
});
