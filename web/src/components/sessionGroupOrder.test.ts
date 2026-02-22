import { describe, expect, it } from 'vitest'
import {
    applySessionGroupOrder,
    loadSessionProjectOffline,
    moveSessionGroup,
    normalizeSessionGroupOrder,
    persistSessionProjectOffline,
    reconcileSessionGroupOrder
} from './sessionGroupOrder'

describe('sessionGroupOrder helpers', () => {
    it('normalizes persisted order payload', () => {
        expect(normalizeSessionGroupOrder('["/a"," /b ","/a",1,null]')).toEqual(['/a', '/b'])
        expect(normalizeSessionGroupOrder('invalid')).toEqual([])
        expect(normalizeSessionGroupOrder(null)).toEqual([])
    })

    it('reconciles order with available directories', () => {
        expect(reconcileSessionGroupOrder(
            ['/b', '/missing', '/a'],
            ['/a', '/b', '/c']
        )).toEqual(['/b', '/a', '/c'])
    })

    it('applies custom order while keeping unknown groups at end', () => {
        const groups = [
            { directory: '/a', value: 'A' },
            { directory: '/b', value: 'B' },
            { directory: '/c', value: 'C' }
        ]
        const ordered = applySessionGroupOrder(groups, ['/c', '/a'])
        expect(ordered.map((g) => g.directory)).toEqual(['/c', '/a', '/b'])
    })

    it('moves source group to target position', () => {
        expect(moveSessionGroup(['/a', '/b', '/c', '/d'], '/a', '/d')).toEqual(['/b', '/c', '/d', '/a'])
        expect(moveSessionGroup(['/a', '/b', '/c', '/d'], '/d', '/b')).toEqual(['/a', '/d', '/b', '/c'])
    })

    it('persists and loads project offline overrides', () => {
        persistSessionProjectOffline(['/a', ' /b ', '/a', ''])
        expect(loadSessionProjectOffline()).toEqual(['/a', '/b'])
    })
})
