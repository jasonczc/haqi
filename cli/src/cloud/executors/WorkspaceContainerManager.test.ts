import { describe, expect, it } from 'bun:test'
import { ensureWorkspaceContainer } from './WorkspaceContainerManager'

describe('ensureWorkspaceContainer', () => {
    const workspace = {
        workspaceId: 'ws-1',
        workspacePath: '/workspace',
        repoVolumePath: '/workspace',
        desktopStatePath: '/home/haqi/.haqi-desktop',
        desktopStateMountSource: 'haqi-ws-ws-1-desktop',
        innerDockerStatePath: '/home/haqi/.local/share/docker',
        workingDirectory: '/workspace',
        source: {
            type: 'repo',
            repository: {
                url: 'https://github.com/acme/demo.git'
            }
        },
        cleanupPaths: []
    }

    const environment = {
        runtimeKind: 'daemon-session' as const,
        services: [],
        environment: {
            ports: [
                {
                    containerPort: 3000,
                    expose: true
                }
            ]
        }
    }

    it('keeps daemon-session previews internal and avoids publishing workspace app ports', async () => {
        let capturedSpec: any = null
        const runtime = {
            pull: async () => undefined,
            run: async (spec: any) => {
                capturedSpec = spec
                return 'container-1234567890ab'
            },
            inspect: async () => ({
                id: 'container-1234567890ab',
                portBindings: {
                    9876: 41001,
                    6080: 41002
                }
            })
        }

        const result = await ensureWorkspaceContainer({
            runtime: runtime as any,
            workspace: workspace as any,
            environment,
            sessionLabel: 'sess-1',
            daemonMode: {
                daemonPort: 9876,
                authToken: 'token'
            }
        })

        expect(capturedSpec.entrypoint).toBe('haqi-daemon')
        expect(capturedSpec.user).toBe('haqi')
        expect(capturedSpec.command).toEqual(['--port', '9876', '--auth-token', 'token'])
        expect(capturedSpec.ports).toEqual([
            { containerPort: 9876, hostPort: undefined, protocol: 'tcp' },
            { containerPort: 6080, hostPort: undefined, protocol: 'tcp' }
        ])
        expect(capturedSpec.mounts.some((mount: string) => mount.endsWith(':/workspace'))).toBe(false)
        expect(capturedSpec.mounts).toContain('haqi-ws-ws-1-desktop:/home/haqi/.haqi-desktop')
        expect(capturedSpec.mounts).not.toContain('/home/haqi/.local/share/docker:/home/haqi/.local/share/docker')
        expect(capturedSpec.mounts.some((mount: string) => mount.endsWith(':/home/haqi/.local/share/docker'))).toBe(false)
        expect(capturedSpec.privileged).toBe(true)
        expect(capturedSpec.env).toEqual(expect.arrayContaining([
            'DOCKER_HOST=unix:///tmp/xdg-runtime-haqi/docker.sock',
            'XDG_RUNTIME_DIR=/tmp/xdg-runtime-haqi',
            'HAPI_CONTAINER_USER=haqi',
            'HAPI_CONTAINER_HOME=/home/haqi'
        ]))
        expect(capturedSpec.env.some((value: string) => value.startsWith('HAPI_RUNTIME_UID='))).toBe(false)
        expect(capturedSpec.groupAdd).toBeUndefined()
        expect(result.previewTargets).toEqual([
            expect.objectContaining({
                name: 'preview:3000',
                port: 3000,
                url: 'http://127.0.0.1:3000',
                visibility: 'private'
            })
        ])
    })

    it('keeps docker-session workspace previews host-published', async () => {
        let capturedSpec: any = null
        const runtime = {
            pull: async () => undefined,
            run: async (spec: any) => {
                capturedSpec = spec
                return 'container-abcdef123456'
            },
            inspect: async () => ({
                id: 'container-abcdef123456',
                portBindings: {
                    3000: 42000,
                    6080: 42080
                }
            })
        }

        const result = await ensureWorkspaceContainer({
            runtime: runtime as any,
            workspace: workspace as any,
            environment,
            sessionLabel: 'sess-2'
        })

        expect(capturedSpec.ports).toEqual([
            { containerPort: 3000, hostPort: undefined, protocol: undefined },
            { containerPort: 6080, hostPort: undefined, protocol: 'tcp' }
        ])
        expect(capturedSpec.privileged).toBe(false)
        expect(result.previewTargets).toEqual([
            expect.objectContaining({
                name: 'preview:3000',
                port: 42000,
                url: 'http://127.0.0.1:42000',
                visibility: 'private'
            })
        ])
    })
})
