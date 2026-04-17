import { describe, expect, it } from 'bun:test'
import { evaluateFilter, readPath } from './filterEvaluator'

describe('readPath', () => {
    it('returns the value at a dotted path', () => {
        expect(readPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
    })

    it('returns undefined for missing keys without throwing', () => {
        expect(readPath({ a: 1 }, 'x.y.z')).toBeUndefined()
    })

    it('indexes into arrays with numeric segments', () => {
        expect(readPath({ labels: [{ name: 'bug' }, { name: 'urgent' }] }, 'labels.1.name')).toBe('urgent')
    })

    it('returns undefined when piercing into a non-container', () => {
        expect(readPath({ a: 1 }, 'a.b.c')).toBeUndefined()
    })
})

describe('evaluateFilter — leaf operators', () => {
    it('no filter means always match', () => {
        expect(evaluateFilter(undefined, { any: 'thing' }).matched).toBe(true)
    })

    it('eq / ne', () => {
        const ctx = { pr: { state: 'open' } }
        expect(evaluateFilter({ op: 'eq', path: 'pr.state', value: 'open' }, ctx).matched).toBe(true)
        expect(evaluateFilter({ op: 'eq', path: 'pr.state', value: 'closed' }, ctx).matched).toBe(false)
        expect(evaluateFilter({ op: 'ne', path: 'pr.state', value: 'closed' }, ctx).matched).toBe(true)
    })

    it('includes matches substring for strings', () => {
        expect(evaluateFilter({ op: 'includes', path: 'title', value: 'fix' }, { title: 'fix broken test' }).matched).toBe(true)
        expect(evaluateFilter({ op: 'includes', path: 'title', value: 'feat' }, { title: 'fix broken test' }).matched).toBe(false)
    })

    it('includes matches arrays of primitives AND GitHub-shaped {name} arrays', () => {
        const labels = ['bug', 'urgent']
        const labelsObj = [{ name: 'bug' }, { name: 'urgent' }]
        expect(evaluateFilter({ op: 'includes', path: 'labels', value: 'urgent' }, { labels }).matched).toBe(true)
        expect(evaluateFilter({ op: 'includes', path: 'labels', value: 'urgent' }, { labels: labelsObj }).matched).toBe(true)
        expect(evaluateFilter({ op: 'includes', path: 'labels', value: 'nope' }, { labels }).matched).toBe(false)
    })

    it('startsWith / endsWith only match strings', () => {
        expect(evaluateFilter({ op: 'startsWith', path: 'ref', value: 'refs/heads/' }, { ref: 'refs/heads/main' }).matched).toBe(true)
        expect(evaluateFilter({ op: 'endsWith', path: 'ref', value: '/main' }, { ref: 'refs/heads/main' }).matched).toBe(true)
        expect(evaluateFilter({ op: 'startsWith', path: 'ref', value: 'nope' }, { ref: 42 }).matched).toBe(false)
    })

    it('matches uses regex; invalid patterns degrade to false (not throw)', () => {
        expect(evaluateFilter({ op: 'matches', path: 'title', value: '^fix' }, { title: 'fix thing' }).matched).toBe(true)
        expect(evaluateFilter({ op: 'matches', path: 'title', value: '[' }, { title: 'x' }).matched).toBe(false)
    })

    it('exists is true for any defined value including 0 and false', () => {
        expect(evaluateFilter({ op: 'exists', path: 'n' }, { n: 0 }).matched).toBe(true)
        expect(evaluateFilter({ op: 'exists', path: 'n' }, { n: false }).matched).toBe(true)
        expect(evaluateFilter({ op: 'exists', path: 'n' }, {}).matched).toBe(false)
        expect(evaluateFilter({ op: 'exists', path: 'n' }, { n: null }).matched).toBe(false)
    })
})

describe('evaluateFilter — logical composition', () => {
    it('and short-circuits and surfaces the first failing clause', () => {
        const res = evaluateFilter({
            op: 'and',
            clauses: [
                { op: 'eq', path: 'pr.state', value: 'open' },
                { op: 'includes', path: 'pr.labels', value: 'urgent' }
            ]
        }, { pr: { state: 'open', labels: ['bug'] } })
        expect(res.matched).toBe(false)
        expect(res.reason).toContain('includes')
    })

    it('or returns on first match', () => {
        const res = evaluateFilter({
            op: 'or',
            clauses: [
                { op: 'eq', path: 'pr.state', value: 'closed' },
                { op: 'eq', path: 'pr.state', value: 'open' }
            ]
        }, { pr: { state: 'open' } })
        expect(res.matched).toBe(true)
    })

    it('not inverts the inner clause', () => {
        const res = evaluateFilter({
            op: 'not',
            clause: { op: 'eq', path: 'draft', value: true }
        }, { draft: false })
        expect(res.matched).toBe(true)
    })

    it('nested composition — "PR open, not draft, labelled urgent"', () => {
        const filter = {
            op: 'and' as const,
            clauses: [
                { op: 'eq' as const, path: 'pr.state', value: 'open' },
                { op: 'not' as const, clause: { op: 'eq' as const, path: 'pr.draft', value: true } },
                { op: 'includes' as const, path: 'pr.labels', value: 'urgent' }
            ]
        }
        const yes = { pr: { state: 'open', draft: false, labels: [{ name: 'urgent' }] } }
        const noDraft = { pr: { state: 'open', draft: true, labels: [{ name: 'urgent' }] } }
        const noLabel = { pr: { state: 'open', draft: false, labels: [{ name: 'chore' }] } }
        expect(evaluateFilter(filter, yes).matched).toBe(true)
        expect(evaluateFilter(filter, noDraft).matched).toBe(false)
        expect(evaluateFilter(filter, noLabel).matched).toBe(false)
    })
})
