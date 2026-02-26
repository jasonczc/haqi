import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { GroupNote } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useGroupNote(api: ApiClient | null, groupId: string | null): {
    note: GroupNote | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: groupId ? queryKeys.groupNote(groupId) : ['group-note', 'unknown'],
        queryFn: async () => {
            if (!api || !groupId) {
                throw new Error('Group unavailable')
            }
            return await api.getGroupNote(groupId)
        },
        enabled: Boolean(api && groupId)
    })

    return {
        note: query.data?.note ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load group note' : null,
        refetch: query.refetch
    }
}
