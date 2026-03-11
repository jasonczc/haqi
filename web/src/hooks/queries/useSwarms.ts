import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Swarm } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSwarms(api: ApiClient | null): {
    swarms: Swarm[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.swarms,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getSwarms()
        },
        enabled: Boolean(api)
    })

    return {
        swarms: query.data?.swarms ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load swarms' : null,
        refetch: query.refetch
    }
}
