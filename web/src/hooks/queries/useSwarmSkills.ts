import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'

export function useSwarmSkills(api: ApiClient | null, swarmId: string | null): {
    skills: Array<{ name: string; description?: string }>
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: ['swarm-skills', swarmId],
        queryFn: async () => {
            if (!api || !swarmId) {
                throw new Error('Swarm unavailable')
            }
            return await api.getSwarmSkills(swarmId)
        },
        enabled: Boolean(api && swarmId),
        staleTime: 5 * 60 * 1000,
        retry: false
    })

    return {
        skills: query.data?.skills ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load swarm skills' : null
    }
}
