import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildThreadStartParams, buildTurnStartParams } from './appServerConfig';
import { codexSystemPrompt } from './systemPrompt';

describe('appServerConfig', () => {
    let tempRoot: string;
    let previousHapiHome: string | undefined;
    const mcpServers = { hapi: { command: 'node', args: ['mcp'] } };

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'app-server-config-'));
        previousHapiHome = process.env.HAPI_HOME;
        process.env.HAPI_HOME = tempRoot;
    });

    afterEach(() => {
        if (previousHapiHome === undefined) {
            delete process.env.HAPI_HOME;
        } else {
            process.env.HAPI_HOME = previousHapiHome;
        }
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('applies CLI overrides when permission mode is default', () => {
        const params = buildThreadStartParams({
            mode: { permissionMode: 'default' },
            mcpServers,
            cliOverrides: { sandbox: 'danger-full-access', approvalPolicy: 'never' },
            cwd: '/tmp/workspace'
        });

        expect(params.sandbox).toBe('danger-full-access');
        expect(params.approvalPolicy).toBe('never');
        expect(params.baseInstructions).toBe(codexSystemPrompt);
        expect(params.cwd).toBe('/tmp/workspace');
        expect(params.config).toEqual({
            'mcp_servers.hapi': {
                command: 'node',
                args: ['mcp']
            }
        });
    });

    it('ignores CLI overrides when permission mode is not default', () => {
        const params = buildThreadStartParams({
            mode: { permissionMode: 'yolo' },
            mcpServers,
            cliOverrides: { sandbox: 'read-only', approvalPolicy: 'never' }
        });

        expect(params.sandbox).toBe('danger-full-access');
        expect(params.approvalPolicy).toBe('on-failure');
    });

    it('uses never approval in auto-approve mode for thread start', () => {
        const params = buildThreadStartParams({
            mode: { permissionMode: 'auto-approve' },
            mcpServers,
            cliOverrides: { sandbox: 'read-only', approvalPolicy: 'on-request' }
        });

        expect(params.sandbox).toBe('danger-full-access');
        expect(params.approvalPolicy).toBe('never');
    });

    it('omits base instructions when empty', () => {
        const params = buildThreadStartParams({
            mode: { permissionMode: 'default' },
            mcpServers,
            baseInstructions: ''
        });

        expect(params.baseInstructions).toBeUndefined();
    });

    it('builds turn params with mode defaults', () => {
        const params = buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            cwd: '/tmp/repo',
            mode: { permissionMode: 'read-only', model: 'o3', effort: 'high', serviceTier: 'fast' }
        });

        expect(params.threadId).toBe('thread-1');
        expect(params.input).toEqual([{ type: 'text', text: 'hello' }]);
        expect(params.cwd).toBe('/tmp/repo');
        expect(params.approvalPolicy).toBe('never');
        expect(params.sandboxPolicy).toEqual({ type: 'readOnly' });
        expect(params.model).toBe('o3');
        expect(params.effort).toBe('high');
        expect(params.serviceTier).toBe('fast');
    });

    it('passes service tier for thread start', () => {
        const params = buildThreadStartParams({
            mode: { permissionMode: 'default', serviceTier: 'flex' },
            mcpServers
        });

        expect(params.serviceTier).toBe('flex');
    });

    it('puts collaboration mode in turn params with model settings', () => {
        const params = buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            mode: { permissionMode: 'default', model: 'o3', collaborationMode: 'plan' }
        });

        expect(params.collaborationMode).toEqual({ mode: 'plan', settings: { model: 'o3' } });
        expect(params.model).toBeUndefined();
    });

    it('throws when collaboration mode is set but model is absent', () => {
        expect(() => buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            mode: { permissionMode: 'default', collaborationMode: 'plan' }
        })).toThrowError('Collaboration mode requires model');
    });

    it('allows non-plan collaboration mode without model', () => {
        const params = buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            mode: { permissionMode: 'default' },
            overrides: { collaborationMode: 'code' }
        });

        expect(params.collaborationMode).toEqual({ mode: 'code' });
        expect(params.model).toBeUndefined();
    });

    it('applies CLI overrides for turns when permission mode is default', () => {
        const params = buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            mode: { permissionMode: 'default' },
            cliOverrides: { sandbox: 'danger-full-access', approvalPolicy: 'never' }
        });

        expect(params.approvalPolicy).toBe('never');
        expect(params.sandboxPolicy).toEqual({ type: 'dangerFullAccess' });
    });

    it('ignores CLI overrides for turns when permission mode is not default', () => {
        const params = buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            mode: { permissionMode: 'safe-yolo' },
            cliOverrides: { sandbox: 'read-only', approvalPolicy: 'never' }
        });

        expect(params.approvalPolicy).toBe('on-failure');
        expect(params.sandboxPolicy).toEqual({ type: 'workspaceWrite' });
    });

    it('uses never approval in auto-approve mode for turns', () => {
        const params = buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            mode: { permissionMode: 'auto-approve' },
            cliOverrides: { sandbox: 'read-only', approvalPolicy: 'on-request' }
        });

        expect(params.approvalPolicy).toBe('never');
        expect(params.sandboxPolicy).toEqual({ type: 'dangerFullAccess' });
    });

    it('prefers turn overrides', () => {
        const params = buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            mode: { permissionMode: 'default' },
            overrides: { approvalPolicy: 'on-request', model: 'gpt-5', effort: 'low', serviceTier: 'flex' }
        });

        expect(params.approvalPolicy).toBe('on-request');
        expect(params.model).toBe('gpt-5');
        expect(params.effort).toBe('low');
        expect(params.serviceTier).toBe('flex');
    });
});
