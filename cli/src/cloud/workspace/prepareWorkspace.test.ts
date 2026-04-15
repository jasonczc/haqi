import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { prepareWorkspace } from './prepareWorkspace'

describe('prepareWorkspace', () => {
    it('uses named volumes for daemon-session repository workspaces', async () => {
        const prepared = await prepareWorkspace({
            runtimeKind: 'daemon-session',
            workspaceSource: {
                repository: {
                    url: 'https://github.com/acme/demo.git'
                }
            },
            workspaceLease: {
                workspaceId: 'ws-a',
                mode: 'persistent'
            }
        })

        expect(prepared.repoVolumePath).toBe('/workspace')
        expect(prepared.repoMountSource).toBe('haqi-ws-ws-a-repo')
        expect(prepared.desktopStatePath).toBe('/home/haqi/.haqi-desktop')
        expect(prepared.desktopStateMountSource).toBeUndefined()
        expect(prepared.innerDockerStatePath).toBe('/home/haqi/.local/share/docker')
        expect(prepared.innerDockerStateMountSource).toBe('haqi-ws-ws-a-inner-docker')
        expect(prepared.cleanupPaths).toEqual([])
        expect(prepared.cleanupVolumeNames).toEqual([])
    })

    it('allocates inner docker state per workspace id for repo workspaces', async () => {
        const baseDir = await fs.mkdtemp(join(os.tmpdir(), 'haqi-prepare-workspace-'))
        const repoVolumePath = join(baseDir, 'repo')

        try {
            const preparedA = await prepareWorkspace({
                workspaceSource: {
                    repository: {
                        url: 'https://github.com/acme/demo.git'
                    }
                },
                workspaceLease: {
                    workspaceId: 'ws-a',
                    repoVolumePath,
                    mode: 'persistent'
                }
            })

            const preparedB = await prepareWorkspace({
                workspaceSource: {
                    repository: {
                        url: 'https://github.com/acme/demo.git'
                    }
                },
                workspaceLease: {
                    workspaceId: 'ws-b',
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
})
