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

        const enrollmentAuth = resolveCliAuthToken(store, enrollmentToken)
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
})
