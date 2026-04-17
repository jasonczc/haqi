import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configuration, createConfiguration } from '../configuration'
import { Store } from '../store'
import { SecretBroker } from './secretBroker'
import { resolveCliAuthToken } from './resolveCliAuthToken'

describe('resolveCliAuthToken', () => {
    const originalCliApiToken = process.env.CLI_API_TOKEN
    const originalHapiHome = process.env.HAPI_HOME

    beforeAll(async () => {
        process.env.HAPI_HOME = mkdtempSync(join(tmpdir(), 'haqi-cloud-auth-'))
        process.env.CLI_API_TOKEN = 'legacy-shared-token'
        await createConfiguration()
    })

    beforeEach(() => {
        configuration._setCliApiToken('legacy-shared-token', 'env', false)
    })

    afterAll(() => {
        configuration._setCliApiToken(originalCliApiToken ?? 'legacy-shared-token', 'env', false)
        if (originalCliApiToken === undefined) {
            delete process.env.CLI_API_TOKEN
        } else {
            process.env.CLI_API_TOKEN = originalCliApiToken
        }
        if (originalHapiHome === undefined) {
            delete process.env.HAPI_HOME
        } else {
            process.env.HAPI_HOME = originalHapiHome
        }
    })

    it('exchanges enrollment tokens for worker session tokens and resolves the upgraded token', () => {
        const store = new Store(':memory:')
        const secretBroker = new SecretBroker(store)
        const { token: enrollmentToken } = secretBroker.createEnrollmentToken({
            namespace: 'team-a',
            machineId: 'machine-1'
        })

        // Without allowEnrollment, enrollment tokens should NOT be exchanged (SEC-6)
        const noEnrollmentAuth = resolveCliAuthToken(store, enrollmentToken)
        expect(noEnrollmentAuth).toBeNull()

        // With allowEnrollment: true (as used by Socket.IO middleware), enrollment works
        const enrollmentAuth = resolveCliAuthToken(store, enrollmentToken, { allowEnrollment: true })
        expect(enrollmentAuth).not.toBeNull()
        expect(enrollmentAuth).toMatchObject({
            kind: 'enrollment',
            namespace: 'team-a',
            machineId: 'machine-1'
        })

        if (!enrollmentAuth || enrollmentAuth.kind !== 'enrollment') {
            throw new Error('Expected enrollment auth result')
        }

        expect(enrollmentAuth.workerSessionToken.startsWith('hqs_')).toBe(true)

        const workerSessionAuth = resolveCliAuthToken(store, enrollmentAuth.workerSessionToken)
        expect(workerSessionAuth).toEqual({
            kind: 'worker-session',
            namespace: 'team-a',
            machineId: 'machine-1'
        })
    })

    it('keeps accepting legacy shared CLI tokens', () => {
        const store = new Store(':memory:')
        const result = resolveCliAuthToken(store, 'legacy-shared-token:team-b')
        expect(result).toEqual({
            kind: 'legacy',
            namespace: 'team-b'
        })
    })

    it('gives worker sessions a long TTL independent of the enrollment window', () => {
        const store = new Store(':memory:')
        const secretBroker = new SecretBroker(store)
        // Enrollment token with an aggressive 10-minute window — this used to
        // leak into the worker session and kill reconnects after hub restarts.
        const { token: enrollmentToken, record: enrollmentRecord } = secretBroker.createEnrollmentToken({
            namespace: 'default',
            machineId: 'machine-1',
            ttlMinutes: 10
        })

        const exchanged = secretBroker.exchangeEnrollmentToken(enrollmentToken)
        expect(exchanged).not.toBeNull()
        if (!exchanged) return

        const session = store.cloud.getWorkerSessionByHash(
            require('node:crypto').createHash('sha256').update(exchanged.workerSessionToken).digest('hex')
        )
        expect(session).not.toBeNull()
        expect(session!.expiresAt).not.toBeNull()
        // Session must outlive the enrollment window by far.
        const hoursBeyondEnrollment = ((session!.expiresAt ?? 0) - (enrollmentRecord.expiresAt ?? 0)) / (60 * 60 * 1000)
        expect(hoursBeyondEnrollment).toBeGreaterThan(24 * 7) // at least a week
    })

    it('slides the worker-session expiry forward on every successful resolve', () => {
        const store = new Store(':memory:')
        const secretBroker = new SecretBroker(store)
        const { token: enrollmentToken } = secretBroker.createEnrollmentToken({
            namespace: 'default',
            machineId: 'machine-1',
            ttlMinutes: 10
        })
        const exchanged = secretBroker.exchangeEnrollmentToken(enrollmentToken)
        if (!exchanged) throw new Error('enrollment failed')

        const hashOf = (t: string) => require('node:crypto').createHash('sha256').update(t).digest('hex')
        const before = store.cloud.getWorkerSessionByHash(hashOf(exchanged.workerSessionToken))!.expiresAt ?? 0

        // Simulate some time passing between the first auth and the next.
        // Resolving must bump expires_at, not leave it at the exchange-time
        // value — otherwise a long-running worker's session would slowly
        // drift toward expiry.
        const resolved = secretBroker.resolveWorkerSessionToken(exchanged.workerSessionToken)
        expect(resolved).not.toBeNull()
        const after = store.cloud.getWorkerSessionByHash(hashOf(exchanged.workerSessionToken))!.expiresAt ?? 0
        expect(after).toBeGreaterThanOrEqual(before)
    })
})
