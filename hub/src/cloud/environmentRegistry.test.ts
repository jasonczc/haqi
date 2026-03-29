import { describe, expect, it } from 'bun:test'
import { EnvironmentRegistry } from './environmentRegistry'

describe('EnvironmentRegistry', () => {
    it('stores and retrieves templates by id', () => {
        const registry = new EnvironmentRegistry()
        const entry = registry.register({
            id: 'node-dev',
            version: 'v1',
            source: 'user',
            runtime: {
                kind: 'docker-session',
                image: 'ghcr.io/acme/node:18'
            }
        })

        expect(registry.get('node-dev')).toEqual(entry)
        expect(registry.list()).toHaveLength(1)
    })

    it('replaces existing templates for same id', () => {
        const registry = new EnvironmentRegistry()
        registry.register({
            id: 'node-dev',
            version: 'v1'
        })

        const next = registry.register({
            id: 'node-dev',
            version: 'v2',
            runtime: {
                kind: 'host-process'
            }
        })

        expect(registry.list()).toHaveLength(1)
        expect(registry.get('node-dev')).toEqual(next)
    })

    it('clears all entries', () => {
        const registry = new EnvironmentRegistry()
        registry.register({ id: 'a', version: '1' })
        registry.register({ id: 'b', version: '1' })

        registry.clear()

        expect(registry.list()).toHaveLength(0)
        expect(registry.get('a')).toBeNull()
    })
})
