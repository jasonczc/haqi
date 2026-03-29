import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CloudProviderSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCloudProviders(api: ApiClient | null, enabled: boolean): {
    providers: CloudProviderSummary[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.cloudProviders,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudProviders()
        },
        enabled: Boolean(api && enabled),
    })

    return {
        providers: query.data?.providers ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load cloud providers' : null,
        refetch: query.refetch,
    }
}
