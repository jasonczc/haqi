import { describe, expect, it, vi } from 'vitest';
import { updateAgentCliInContainer } from './updateAgentCliInContainer';
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli';

type ExecArg = Parameters<DockerCliRuntime['exec']>[0];

function makeRuntime(exec: DockerCliRuntime['exec']): DockerCliRuntime {
    // Only .exec is used by updateAgentCliInContainer — cast the minimal
    // surface through unknown to avoid stubbing every DockerCliRuntime
    // method we don't touch.
    return { exec } as unknown as DockerCliRuntime;
}

describe('updateAgentCliInContainer', () => {
    it('runs npm install -g @anthropic-ai/claude-code@latest for claude agent, as root', async () => {
        const calls: ExecArg[] = [];
        const exec: DockerCliRuntime['exec'] = async (arg) => {
            calls.push(arg);
            return { stdout: 'added 42 packages', stderr: '' };
        };
        const result = await updateAgentCliInContainer(makeRuntime(exec), 'abc123', 'claude');
        expect(result).toEqual({ updated: true, agent: 'claude', package: '@anthropic-ai/claude-code' });
        expect(calls).toHaveLength(1);
        expect(calls[0].user).toBe('root');
        expect(calls[0].containerId).toBe('abc123');
        expect(calls[0].command).toEqual(['sh', '-lc', 'npm install -g @anthropic-ai/claude-code@latest']);
    });

    it('runs npm install for @openai/codex for codex agent', async () => {
        const calls: ExecArg[] = [];
        const exec: DockerCliRuntime['exec'] = async (arg) => {
            calls.push(arg);
            return { stdout: '', stderr: '' };
        };
        const result = await updateAgentCliInContainer(makeRuntime(exec), 'abc', 'codex');
        expect(result).toEqual({ updated: true, agent: 'codex', package: '@openai/codex' });
        expect(calls[0].command).toEqual(['sh', '-lc', 'npm install -g @openai/codex@latest']);
    });

    it('returns unsupported (and does not run docker exec) for flavors with no npm package', async () => {
        const exec = vi.fn();
        const result = await updateAgentCliInContainer(makeRuntime(exec as unknown as DockerCliRuntime['exec']), 'abc', 'gemini');
        expect(result).toEqual({ updated: false, agent: 'gemini', reason: 'unsupported' });
        expect(exec).not.toHaveBeenCalled();
    });

    it('swallows a non-zero docker exec error and reports reason=error', async () => {
        const exec: DockerCliRuntime['exec'] = async () => {
            throw new Error('ENETUNREACH: npm registry unreachable');
        };
        const result = await updateAgentCliInContainer(makeRuntime(exec), 'abc', 'claude');
        expect(result.updated).toBe(false);
        expect(result).toMatchObject({
            agent: 'claude',
            package: '@anthropic-ai/claude-code',
            reason: 'error'
        });
        if (result.updated === false) {
            expect(result.error).toContain('ENETUNREACH');
        }
    });

    it('returns reason=timeout and does not throw when exec hangs past timeoutMs', async () => {
        const exec: DockerCliRuntime['exec'] = () => new Promise(() => { /* never resolves */ });
        // 100ms is enough for the setTimeout to fire reliably even on a
        // loaded CI runner, while still keeping the test fast.
        const result = await updateAgentCliInContainer(makeRuntime(exec), 'abc', 'claude', { timeoutMs: 100 });
        expect(result).toEqual({
            updated: false,
            agent: 'claude',
            package: '@anthropic-ai/claude-code',
            reason: 'timeout'
        });
    });
});
