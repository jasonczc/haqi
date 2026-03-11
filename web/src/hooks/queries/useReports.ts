import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { ReportSummary } from '@/types/api'

export function useReports(api: ApiClient | null): {
    reports: ReportSummary[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: ['reports'],
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getReports()
        },
        enabled: Boolean(api)
    })

    return {
        reports: query.data?.reports ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load reports' : null,
        refetch: query.refetch
    }
}
