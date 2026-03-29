import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import { useCloudEnvironments } from './useCloudEnvironments'
import { QueryClientProvider } from '@tanstack/react-query'

function createWrapper(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        )
    }
}

describe('useCloudEnvironments', () => {
    it('loads cloud environments when enabled', async () => {
        const api = {
            getCloudEnvironments: vi.fn(async () => ({
                environments: [
                    {
                        id: 'node-dev',
                        source: 'team',
                        runtimeKind: 'docker-session',
                        serviceCount: 2,
                        repositoryDependenciesCount: 1,
                        hasPreviewPorts: true
                    }
                ]
            }))
        } as unknown as ApiClient

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false
                }
            }
        })

        const { result } = renderHook(
            () => useCloudEnvironments(api, true),
            { wrapper: createWrapper(queryClient) }
        )

        await waitFor(() => {
            expect(result.current.environments).toHaveLength(1)
        })

        expect(result.current.environments[0]?.id).toBe('node-dev')
        expect(result.current.error).toBeNull()
    })
})
