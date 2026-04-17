import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { EventPublisher } from '../sync/eventPublisher'
import type { SSEManager } from '../sse/sseManager'
import { FirePipeline } from './firePipeline'
import {
    scheduleTriggerDriver,
    shouldFireAt,
    buildDedupKey
} from './triggers/scheduleTrigger'
import type { TriggerContext } from './triggerRegistry'

function ctxSetup() {
    const store = new Store(':memory:')
    const spawns: Array<{ request: unknown }> = []
    const coordinator = {
        enqueue(_ns: string, _m: string, request: unknown) {
            spawns.push({ request })
            return { id: `sp-${spawns.length}` }
        }
    }
    const sse = { broadcast() {} } as unknown as SSEManager
    const publisher = new EventPublisher(sse, () => 'default')
    const firePipeline = new FirePipeline(store, coordinator, publisher)
    const ctx: TriggerContext = { store, firePipeline, eventPublisher: publisher, log: () => {} }
    return { store, ctx, spawns }
}

describe('shouldFireAt', () => {
    it("every=hour: matches when now's UTC minute equals config.minute", () => {
        const ok = new Date(Date.UTC(2026, 0, 1, 12, 30))
        const no = new Date(Date.UTC(2026, 0, 1, 12, 31))
        expect(shouldFireAt({ kind: 'schedule', every: 'hour', minute: 30 }, ok)).toBe(true)
        expect(shouldFireAt({ kind: 'schedule', every: 'hour', minute: 30 }, no)).toBe(false)
    })

    it('every=day + UTC: matches on exact hour+minute', () => {
        const ok = new Date(Date.UTC(2026, 0, 1, 9, 0))
        const no = new Date(Date.UTC(2026, 0, 1, 9, 1))
        expect(shouldFireAt({ kind: 'schedule', every: 'day', minute: 0, hour: 9 }, ok)).toBe(true)
        expect(shouldFireAt({ kind: 'schedule', every: 'day', minute: 0, hour: 9 }, no)).toBe(false)
    })

    it('every=day + timezone: respects IANA tz', () => {
        // January → EST (UTC-5). NY 00:00 EST = 05:00 UTC.
        const instant = new Date('2026-01-15T05:00:00Z')
        expect(shouldFireAt({ kind: 'schedule', every: 'day', minute: 0, hour: 0, timezone: 'America/New_York' }, instant)).toBe(true)
        // And 12:30 Tokyo (UTC+9) = 03:30 UTC.
        const tokyo = new Date('2026-06-15T03:30:00Z')
        expect(shouldFireAt({ kind: 'schedule', every: 'day', minute: 30, hour: 12, timezone: 'Asia/Tokyo' }, tokyo)).toBe(true)
    })

    it('every=day + bogus timezone falls back to UTC without throwing', () => {
        const utc0900 = new Date(Date.UTC(2026, 0, 1, 9, 0))
        expect(shouldFireAt({ kind: 'schedule', every: 'day', minute: 0, hour: 9, timezone: 'Not/A/Zone' }, utc0900)).toBe(true)
    })
})

describe('buildDedupKey', () => {
    it('is per-routine per-minute and stable across re-entries in the same minute', () => {
        const t = new Date('2026-03-04T09:30:05Z')
        const a = buildDedupKey('r1', t)
        const b = buildDedupKey('r1', new Date('2026-03-04T09:30:59Z'))
        const differentMinute = buildDedupKey('r1', new Date('2026-03-04T09:31:00Z'))
        expect(a).toBe(b)
        expect(a).not.toBe(differentMinute)
    })
})

describe('scheduleTriggerDriver.tick', () => {
    it('fires only the routines whose schedule matches now, and deduplicates within a minute', async () => {
        const { store, ctx, spawns } = ctxSetup()
        // Two active schedule routines: one matches at :30, one at :45.
        store.routines.createRoutine({
            id: 'match',
            namespace: 'default', name: 'match',
            trigger: { kind: 'schedule', every: 'hour', minute: 30 },
            spawn: {}, concurrency: 'skip'
        })
        store.routines.createRoutine({
            id: 'nomatch',
            namespace: 'default', name: 'nomatch',
            trigger: { kind: 'schedule', every: 'hour', minute: 45 },
            spawn: {}, concurrency: 'skip'
        })
        const at = new Date(Date.UTC(2026, 0, 1, 12, 30))
        await scheduleTriggerDriver.tick(ctx, at)
        expect(spawns).toHaveLength(1)
        // Re-tick within the same minute — dedup should prevent a second fire.
        await scheduleTriggerDriver.tick(ctx, at)
        expect(spawns).toHaveLength(1)
    })

    it('skips paused routines', async () => {
        const { store, ctx, spawns } = ctxSetup()
        const r = store.routines.createRoutine({
            id: 'r', namespace: 'default', name: 'r',
            trigger: { kind: 'schedule', every: 'hour', minute: 0 },
            spawn: {}, concurrency: 'skip'
        })
        store.routines.updateRoutine(r.id, r.namespace, { status: 'paused' })
        await scheduleTriggerDriver.tick(ctx, new Date(Date.UTC(2026, 0, 1, 12, 0)))
        expect(spawns).toHaveLength(0)
    })

    it('skips api-triggered routines (trigger kind mismatch)', async () => {
        const { store, ctx, spawns } = ctxSetup()
        store.routines.createRoutine({
            id: 'r', namespace: 'default', name: 'api-only',
            trigger: { kind: 'api' },
            spawn: {}, concurrency: 'skip'
        })
        await scheduleTriggerDriver.tick(ctx, new Date(Date.UTC(2026, 0, 1, 12, 0)))
        expect(spawns).toHaveLength(0)
    })
})
