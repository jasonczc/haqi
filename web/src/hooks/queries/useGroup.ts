import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { GroupDetail } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useGroup(api: ApiClient | null, groupId: string | null): {
    group: GroupDetail | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: groupId ? queryKeys.group(groupId) : ['group', 'unknown'],
        queryFn: async () => {
            if (!api || !groupId) {
                throw new Error('Group unavailable')
            }
            return await api.getGroup(groupId)
        },
        enabled: Boolean(api && groupId)
    })

    return {
        group: query.data?.group ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load group' : null,
        refetch: query.refetch
    }
}
