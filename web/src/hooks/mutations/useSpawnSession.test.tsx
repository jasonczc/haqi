import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import { useSpawnSession } from './useSpawnSession'

function createWrapper(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        )
    }
}

describe('useSpawnSession', () => {
    it('forwards executionBackend in spawn payload', async () => {
        const api = {
            spawnSession: vi.fn(async () => ({
                type: 'success',
                sessionId: 'session-1'
            }))
        } as unknown as ApiClient

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false }
            }
        })

        const { result } = renderHook(
            () => useSpawnSession(api),
            { wrapper: createWrapper(queryClient) }
        )

        await result.current.spawnSession({
            machineId: 'machine-1',
            directory: '/tmp/project',
            executionBackend: 'cloud-self-hosted',
            runtimeKind: 'daemon-session',
            environmentId: 'node-dev'
        })

        expect(api.spawnSession).toHaveBeenCalledWith('machine-1', expect.objectContaining({
            directory: '/tmp/project',
            executionBackend: 'cloud-self-hosted',
            runtimeKind: 'daemon-session',
            environmentId: 'node-dev'
        }))
    })
})
