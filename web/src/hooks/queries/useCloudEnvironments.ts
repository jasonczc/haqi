import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CloudEnvironmentSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCloudEnvironments(
    api: ApiClient | null,
    enabled: boolean
): {
    environments: CloudEnvironmentSummary[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.cloudEnvironments,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudEnvironments()
        },
        enabled: Boolean(api && enabled),
    })

    return {
        environments: query.data?.environments ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load cloud environments' : null,
        refetch: query.refetch,
    }
}
