import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { prepareWorkspace } from './prepareWorkspace'

describe('prepareWorkspace', () => {
    it('keeps daemon-session repository and inner docker state inside the container filesystem', async () => {
        const prepared = await prepareWorkspace({
            runtimeKind: 'daemon-session',
            workspaceSource: {
                repository: {
                    url: 'https://github.com/acme/demo.git'
                }
            },
            workspaceLease: {
                leaseId: 'lease-a',
                workspaceId: 'ws-a',
                machineId: 'machine-a',
                mode: 'persistent'
            }
        })

        expect(prepared.repoVolumePath).toBe('/workspace')
        expect(prepared.repoMountSource).toBeUndefined()
        expect(prepared.desktopStatePath).toBe('/home/haqi/.haqi-desktop')
        expect(prepared.desktopStateMountSource).toBeUndefined()
        expect(prepared.innerDockerStatePath).toBe('/home/haqi/.local/share/docker')
        expect(prepared.innerDockerStateMountSource).toBeUndefined()
        expect(prepared.cleanupPaths).toEqual([])
        expect(prepared.cleanupVolumeNames).toEqual([])
    })

    it('allocates host-side inner docker state per workspace id for non-daemon repo workspaces', async () => {
        const baseDir = await fs.mkdtemp(join(os.tmpdir(), 'haqi-prepare-workspace-'))
        const repoVolumePath = join(baseDir, 'repo')

        try {
            const preparedA = await prepareWorkspace({
                runtimeKind: 'docker-session',
                workspaceSource: {
                    repository: {
                        url: 'https://github.com/acme/demo.git'
                    }
                },
                workspaceLease: {
                    leaseId: 'lease-a',
                    workspaceId: 'ws-a',
                    machineId: 'machine-a',
                    repoVolumePath,
                    mode: 'persistent'
                }
            })

            const preparedB = await prepareWorkspace({
                runtimeKind: 'docker-session',
                workspaceSource: {
                    repository: {
                        url: 'https://github.com/acme/demo.git'
                    }
                },
                workspaceLease: {
                    leaseId: 'lease-b',
                    workspaceId: 'ws-b',
                    machineId: 'machine-b',
                    repoVolumePath,
                    mode: 'persistent'
                }
            })

            expect(preparedA.innerDockerStatePath).toBe(join(baseDir, '.haqi-inner-docker', 'ws-a'))
            expect(preparedB.innerDockerStatePath).toBe(join(baseDir, '.haqi-inner-docker', 'ws-b'))
            expect(preparedA.innerDockerStatePath).not.toBe(preparedB.innerDockerStatePath)
            expect(preparedA.cleanupVolumeNames).toEqual([])
        } finally {
            await fs.rm(baseDir, { recursive: true, force: true })
        }
    })

    it('keeps daemon-session inner docker state inside the container filesystem for path workspaces', async () => {
        const directory = await fs.mkdtemp(join(os.tmpdir(), 'haqi-path-workspace-'))
        const prepared = await prepareWorkspace({
            runtimeKind: 'daemon-session',
            directory
        })

        expect(prepared.workspacePath).toBe('/workspace')
        expect(prepared.repoVolumePath).toBe('/workspace')
        expect(prepared.workingDirectory).toBe('/workspace')
        expect(prepared.innerDockerStatePath).toBe('/home/haqi/.local/share/docker')
        expect(prepared.innerDockerStateMountSource).toBeUndefined()
        expect(prepared.cleanupPaths).toEqual([])
        await fs.rm(directory, { recursive: true, force: true })
    })
})
