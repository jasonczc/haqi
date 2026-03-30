import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useCloudCheckpoints(api: ApiClient | null, enabled: boolean): {
    checkpoints: Awaited<ReturnType<ApiClient['getCloudCheckpoints']>>['checkpoints']
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.cloudCheckpoints,
        enabled: Boolean(api) && enabled,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudCheckpoints()
        },
        staleTime: 30_000
    })

    return {
        checkpoints: query.data?.checkpoints ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : null
    }
}
