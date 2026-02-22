import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetPathProbeStoreForTests, getOrLoadPathProbeResult } from '@/lib/filePathProbe'

afterEach(() => {
    __resetPathProbeStoreForTests()
    vi.useRealTimers()
})

describe('filePathProbe', () => {
    it('deduplicates concurrent probe loaders for the same key', async () => {
        const loader = vi.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
            return { state: 'available' as const }
        })

        const [a, b, c] = await Promise.all([
            getOrLoadPathProbeResult('same-key', loader),
            getOrLoadPathProbeResult('same-key', loader),
            getOrLoadPathProbeResult('same-key', loader)
        ])

        expect(loader).toHaveBeenCalledTimes(1)
        expect(a.state).toBe('available')
        expect(b.state).toBe('available')
        expect(c.state).toBe('available')
    })

    it('uses cached probe result before ttl expiry and refreshes after ttl', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-02-20T00:00:00.000Z'))

        const loader = vi.fn(async () => ({ state: 'missing' as const }))

        await getOrLoadPathProbeResult('ttl-key', loader)
        await getOrLoadPathProbeResult('ttl-key', loader)
        expect(loader).toHaveBeenCalledTimes(1)

        vi.setSystemTime(new Date('2026-02-20T00:00:09.000Z'))
        await getOrLoadPathProbeResult('ttl-key', loader)
        expect(loader).toHaveBeenCalledTimes(2)
    })

    it('limits global probe concurrency', async () => {
        let active = 0
        let maxActive = 0

        const keys = Array.from({ length: 12 }).map((_, index) => `k-${index}`)
        const tasks = keys.map((key) => getOrLoadPathProbeResult(key, async () => {
            active += 1
            maxActive = Math.max(maxActive, active)
            await new Promise((resolve) => setTimeout(resolve, 30))
            active = Math.max(0, active - 1)
            return { state: 'available' as const }
        }))

        const results = await Promise.all(tasks)
        expect(maxActive).toBeLessThanOrEqual(6)
        expect(results.every((item) => item.state === 'available')).toBe(true)
    })
})
