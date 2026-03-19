import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { ReviewLoop } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useReviewLoops(api: ApiClient | null) {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: queryKeys.reviewLoops,
        queryFn: async () => {
            if (!api) {
                throw new Error('No API client')
            }
            return await api.getReviewLoops()
        },
        enabled: Boolean(api),
        refetchInterval: 5000,
    })

    return {
        loops: (data?.loops ?? []) as ReviewLoop[],
        isLoading,
        error: error ? (error instanceof Error ? error.message : 'Failed to load loops') : null,
        refetch,
    }
}
