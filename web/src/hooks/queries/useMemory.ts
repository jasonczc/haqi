import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useMemory(api: ApiClient | null) {
    const query = useQuery({
        queryKey: queryKeys.memory,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getMemory()
        },
        enabled: Boolean(api)
    })

    return {
        memory: query.data?.memory ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load memory' : null,
        refetch: query.refetch
    }
}
