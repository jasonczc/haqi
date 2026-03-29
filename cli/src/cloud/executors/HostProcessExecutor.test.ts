import { describe, expect, it } from 'vitest'
import { buildSpawnEnvironment } from './HostProcessExecutor'

describe('buildSpawnEnvironment', () => {
    it('propagates execution backend to spawned environment', async () => {
        const env = await buildSpawnEnvironment(
            {
                executionBackend: 'cloud-self-hosted',
                runtimeKind: 'docker-session'
            },
            {
                worktreeInfo: null
            }
        )

        expect(env.HAPI_EXECUTION_BACKEND).toBe('cloud-self-hosted')
    })

    it('does not set execution backend when unspecified', async () => {
        const env = await buildSpawnEnvironment(
            {
                runtimeKind: 'host-process'
            },
            {
                worktreeInfo: null
            }
        )

        expect(env.HAPI_EXECUTION_BACKEND).toBeUndefined()
    })
})
