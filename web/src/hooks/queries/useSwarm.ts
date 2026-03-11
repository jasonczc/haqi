import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SwarmDetail } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSwarm(api: ApiClient | null, swarmId: string | null): {
    swarm: SwarmDetail | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: swarmId ? queryKeys.swarm(swarmId) : ['swarm', 'unknown'],
        queryFn: async () => {
            if (!api || !swarmId) {
                throw new Error('Swarm unavailable')
            }
            return await api.getSwarm(swarmId)
        },
        enabled: Boolean(api && swarmId)
    })

    return {
        swarm: query.data?.swarm ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load swarm' : null,
        refetch: query.refetch
    }
}
