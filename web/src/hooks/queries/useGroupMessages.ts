import { useCallback, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { GroupTimelineMessage } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

const PAGE_SIZE = 50

function sortAndDedupeMessages(messages: GroupTimelineMessage[]): GroupTimelineMessage[] {
    const byId = new Map<string, GroupTimelineMessage>()
    for (const message of messages) {
        byId.set(message.id, message)
    }
    return Array.from(byId.values()).sort((a, b) => {
        if (a.seq !== b.seq) {
            return a.seq - b.seq
        }
        if (a.createdAt !== b.createdAt) {
            return a.createdAt - b.createdAt
        }
        return a.id.localeCompare(b.id)
    })
}

export function useGroupMessages(
    api: ApiClient | null,
    groupId: string | null,
    options?: { enabled?: boolean }
): {
    messages: GroupTimelineMessage[]
    isLoading: boolean
    isLoadingMore: boolean
    hasMore: boolean
    error: string | null
    loadMore: () => Promise<void>
    refetch: () => Promise<unknown>
} {
    const enabled = (options?.enabled ?? true) && Boolean(api && groupId)
    const query = useInfiniteQuery({
        queryKey: groupId ? queryKeys.groupMessages(groupId) : ['group-messages', 'unknown'],
        queryFn: async ({ pageParam }: { pageParam: number | null }) => {
            if (!api || !groupId) {
                throw new Error('Group unavailable')
            }
            return await api.getGroupMessages(groupId, {
                limit: PAGE_SIZE,
                beforeSeq: pageParam
            })
        },
        initialPageParam: null as number | null,
        getNextPageParam: (lastPage) => {
            if (!lastPage.page.hasMore) {
                return undefined
            }
            return lastPage.page.nextBeforeSeq ?? undefined
        },
        enabled
    })

    const messages = useMemo(() => {
        const pages = query.data?.pages ?? []
        if (pages.length === 0) {
            return []
        }
        const ordered: GroupTimelineMessage[] = []
        for (let index = pages.length - 1; index >= 0; index -= 1) {
            ordered.push(...pages[index].messages)
        }
        return sortAndDedupeMessages(ordered)
    }, [query.data?.pages])

    const loadMore = useCallback(async () => {
        if (!query.hasNextPage || query.isFetchingNextPage) {
            return
        }
        await query.fetchNextPage()
    }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage])

    return {
        messages,
        isLoading: enabled ? query.isLoading : false,
        isLoadingMore: query.isFetchingNextPage,
        hasMore: enabled ? Boolean(query.hasNextPage) : false,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load group messages' : null,
        loadMore,
        refetch: query.refetch
    }
}
