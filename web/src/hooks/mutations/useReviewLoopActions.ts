import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { ReviewLoopUserPreference } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useReviewLoopActions(api: ApiClient | null, loopId: string | null) {
    const queryClient = useQueryClient()
    const [isPending, setIsPending] = useState(false)

    const invalidate = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.reviewLoops })
        if (loopId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.reviewLoop(loopId) })
        }
    }, [queryClient, loopId])

    const continueLoop = useCallback(async (options?: {
        userPreference?: ReviewLoopUserPreference
        additionalInstruction?: string
    }) => {
        if (!api || !loopId) return
        setIsPending(true)
        try {
            await api.continueReviewLoop(loopId, options)
            invalidate()
        } finally {
            setIsPending(false)
        }
    }, [api, loopId, invalidate])

    const cancelLoop = useCallback(async () => {
        if (!api || !loopId) return
        setIsPending(true)
        try {
            await api.cancelReviewLoop(loopId)
            invalidate()
        } finally {
            setIsPending(false)
        }
    }, [api, loopId, invalidate])

    const pauseLoop = useCallback(async () => {
        if (!api || !loopId) return
        setIsPending(true)
        try {
            await api.pauseReviewLoop(loopId)
            invalidate()
        } finally {
            setIsPending(false)
        }
    }, [api, loopId, invalidate])

    const updateLoop = useCallback(async (options: {
        userPreference?: ReviewLoopUserPreference
        maxRounds?: number
    }) => {
        if (!api || !loopId) return
        setIsPending(true)
        try {
            await api.updateReviewLoop(loopId, options)
            invalidate()
        } finally {
            setIsPending(false)
        }
    }, [api, loopId, invalidate])

    const deleteLoop = useCallback(async () => {
        if (!api || !loopId) return
        setIsPending(true)
        try {
            await api.deleteReviewLoop(loopId)
            invalidate()
        } finally {
            setIsPending(false)
        }
    }, [api, loopId, invalidate])

    return {
        continueLoop,
        cancelLoop,
        pauseLoop,
        updateLoop,
        deleteLoop,
        isPending,
    }
}
