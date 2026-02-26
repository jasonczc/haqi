import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { GroupDetail } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useGroups(api: ApiClient | null): {
    groups: GroupDetail[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.groups,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getGroups()
        },
        enabled: Boolean(api)
    })

    return {
        groups: query.data?.groups ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load groups' : null,
        refetch: query.refetch
    }
}
