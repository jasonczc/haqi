import { afterEach, describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { triggerRegistry } from './triggerRegistry'
import type { TriggerDriver } from './triggerRegistry'

afterEach(() => triggerRegistry.clear())

function makeDriver(kind: 'api' | 'schedule' | 'github', describeText = 'X'): TriggerDriver<unknown> {
    return {
        kind,
        configSchema: z.any(),
        describe: () => describeText,
        start: () => ({ stop() {} })
    } as TriggerDriver<unknown>
}

describe('triggerRegistry', () => {
    it('register and get round-trip', () => {
        const d = makeDriver('api')
        triggerRegistry.register(d)
        expect(triggerRegistry.get('api')).toBe(d)
    })

    it('returns null for an unknown kind', () => {
        expect(triggerRegistry.get('api')).toBeNull()
    })

    it('list returns every registered driver', () => {
        triggerRegistry.register(makeDriver('api'))
        triggerRegistry.register(makeDriver('schedule'))
        triggerRegistry.register(makeDriver('github'))
        expect(triggerRegistry.list().map((d) => d.kind).sort()).toEqual(['api', 'github', 'schedule'])
    })

    it('registering the same kind overrides (last-wins, warn on stderr)', () => {
        const a = makeDriver('api', 'first')
        const b = makeDriver('api', 'second')
        triggerRegistry.register(a)
        triggerRegistry.register(b)
        expect(triggerRegistry.get('api')).toBe(b)
    })

    it('clear removes all drivers (test helper)', () => {
        triggerRegistry.register(makeDriver('api'))
        triggerRegistry.clear()
        expect(triggerRegistry.list()).toHaveLength(0)
    })
})
