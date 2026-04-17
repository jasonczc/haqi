import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { issueFireToken, verifyFireToken, hashFireToken, previewFireToken, secureCompareTokenHashes } from './fireTokenService'

function setup(): { store: Store; routineId: string } {
    const store = new Store(':memory:')
    const routine = store.routines.createRoutine({
        id: 'r1',
        namespace: 'default',
        name: 'r',
        trigger: { kind: 'api' },
        spawn: {},
        concurrency: 'skip'
    })
    return { store, routineId: routine.id }
}

describe('hashFireToken / previewFireToken', () => {
    it('hash is deterministic and 64-char hex (sha256)', () => {
        const a = hashFireToken('hrf_abc')
        const b = hashFireToken('hrf_abc')
        expect(a).toBe(b)
        expect(a).toMatch(/^[0-9a-f]{64}$/)
    })

    it('preview shows first 6 + ... + last 4 chars', () => {
        const p = previewFireToken('hrf_abcdefghijklmnopqrstuv')
        expect(p).toBe('hrf_ab...stuv')
    })

    it('secureCompareTokenHashes is true for matching token/hash pair and false otherwise', () => {
        const token = 'hrf_equality'
        const h = hashFireToken(token)
        expect(secureCompareTokenHashes(token, h)).toBe(true)
        expect(secureCompareTokenHashes('hrf_other', h)).toBe(false)
        expect(secureCompareTokenHashes(token, 'deadbeef')).toBe(false) // wrong length
    })
})

describe('issueFireToken', () => {
    it('returns a secret starting with hrf_ and persists only the hash', () => {
        const { store, routineId } = setup()
        const issued = issueFireToken(store, {
            id: 't-1', namespace: 'default', routineId, name: 'ci'
        })
        expect(issued.secret).toMatch(/^hrf_/)
        // Find by hash succeeds
        const found = store.routines.getFireTokenByHash(hashFireToken(issued.secret))
        expect(found?.id).toBe('t-1')
        // Raw secret is never stored
        const tokens = store.routines.listFireTokens(routineId, 'default')
        expect(tokens[0].tokenPreview).not.toContain(issued.secret.slice(6, 15))
    })

    it('supports expiresAt', () => {
        const { store, routineId } = setup()
        const issued = issueFireToken(store, {
            id: 't', namespace: 'default', routineId, expiresAt: Date.now() + 1000
        })
        expect(issued.record.expiresAt).toBeGreaterThan(Date.now())
    })
})

describe('verifyFireToken', () => {
    it('returns ok=true for a valid active token on the right routine', () => {
        const { store, routineId } = setup()
        const issued = issueFireToken(store, {
            id: 't', namespace: 'default', routineId
        })
        const res = verifyFireToken(store, { routineId, presentedToken: issued.secret })
        expect(res.ok).toBe(true)
        if (res.ok) expect(res.token.id).toBe('t')
        // lastUsedAt is touched
        const record = store.routines.listFireTokens(routineId, 'default')[0]
        expect(record.lastUsedAt).toBeDefined()
    })

    it('returns not-found when the token has never been issued', () => {
        const { store, routineId } = setup()
        const res = verifyFireToken(store, { routineId, presentedToken: 'hrf_never' })
        expect(res).toEqual({ ok: false, reason: 'not_found' })
    })

    it('returns wrong-routine when token belongs to a different routine', () => {
        const { store, routineId } = setup()
        const other = store.routines.createRoutine({
            id: 'r2', namespace: 'default', name: 'other',
            trigger: { kind: 'api' }, spawn: {}, concurrency: 'skip'
        })
        const issued = issueFireToken(store, {
            id: 't', namespace: 'default', routineId: other.id
        })
        const res = verifyFireToken(store, { routineId, presentedToken: issued.secret })
        expect(res).toEqual({ ok: false, reason: 'wrong_routine' })
    })

    it('returns revoked after revokeFireToken', () => {
        const { store, routineId } = setup()
        const issued = issueFireToken(store, {
            id: 't', namespace: 'default', routineId
        })
        store.routines.revokeFireToken('t', 'default')
        const res = verifyFireToken(store, { routineId, presentedToken: issued.secret })
        expect(res).toEqual({ ok: false, reason: 'revoked' })
    })

    it('returns expired when expiresAt is in the past', () => {
        const { store, routineId } = setup()
        const issued = issueFireToken(store, {
            id: 't', namespace: 'default', routineId, expiresAt: Date.now() - 1000
        })
        const res = verifyFireToken(store, { routineId, presentedToken: issued.secret })
        expect(res).toEqual({ ok: false, reason: 'expired' })
    })
})
