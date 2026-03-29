import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CloudWorkerSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCloudWorkers(
    api: ApiClient | null,
    enabled: boolean,
    provider?: string
): {
    workers: CloudWorkerSummary[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.cloudWorkers(provider),
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudWorkers(provider)
        },
        enabled: Boolean(api && enabled),
    })

    return {
        workers: query.data?.workers ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load cloud workers' : null,
        refetch: query.refetch,
    }
}
