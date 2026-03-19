import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { ReviewLoop, ReviewRound } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useReviewLoop(api: ApiClient | null, loopId: string | null) {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: queryKeys.reviewLoop(loopId ?? ''),
        queryFn: async () => {
            if (!api || !loopId) {
                throw new Error('No API client or loop ID')
            }
            return await api.getReviewLoop(loopId)
        },
        enabled: Boolean(api && loopId),
        refetchInterval: 5000,
    })

    return {
        loop: (data?.loop ?? null) as ReviewLoop | null,
        rounds: (data?.rounds ?? []) as ReviewRound[],
        isLoading,
        error: error ? (error instanceof Error ? error.message : 'Failed to load loop') : null,
        refetch,
    }
}
