import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { GroupTimelineMessage } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useGroupMessages(api: ApiClient | null, groupId: string | null): {
    messages: GroupTimelineMessage[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: groupId ? queryKeys.groupMessages(groupId) : ['group-messages', 'unknown'],
        queryFn: async () => {
            if (!api || !groupId) {
                throw new Error('Group unavailable')
            }
            return await api.getGroupMessages(groupId, { limit: 200 })
        },
        enabled: Boolean(api && groupId)
    })

    return {
        messages: query.data?.messages ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load group messages' : null,
        refetch: query.refetch
    }
}
