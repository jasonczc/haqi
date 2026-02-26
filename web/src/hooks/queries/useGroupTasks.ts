import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { GroupTask } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useGroupTasks(api: ApiClient | null, groupId: string | null): {
    tasks: GroupTask[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: groupId ? queryKeys.groupTasks(groupId) : ['group-tasks', 'unknown'],
        queryFn: async () => {
            if (!api || !groupId) {
                throw new Error('Group unavailable')
            }
            return await api.getGroupTasks(groupId, { limit: 200 })
        },
        enabled: Boolean(api && groupId)
    })

    return {
        tasks: query.data?.tasks ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load group tasks' : null,
        refetch: query.refetch
    }
}
