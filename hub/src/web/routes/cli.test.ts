import { beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { configuration, createConfiguration } from '../../configuration'
import { Store } from '../../store'
import { SecretBroker } from '../../cloud/secretBroker'
import { createCliRoutes } from './cli'

describe('createCliRoutes', () => {
    beforeAll(async () => {
        process.env.HAPI_HOME = mkdtempSync(join(tmpdir(), 'haqi-cli-routes-'))
        process.env.CLI_API_TOKEN = 'legacy-shared-token'
        await createConfiguration()
        configuration._setCliApiToken('legacy-shared-token', 'env', false)
    })

    it('upgrades enrollment tokens to worker session tokens via response headers', async () => {
        const store = new Store(':memory:')
        const secretBroker = new SecretBroker(store)
        const { token: enrollmentToken } = secretBroker.createEnrollmentToken({
            namespace: 'default',
            machineId: 'machine-1'
        })

        const machine = {
            id: 'machine-1',
            namespace: 'default',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: 1,
            metadata: null,
            metadataVersion: 1,
            runnerState: null,
            runnerStateVersion: 1
        }

        const app = new Hono()
        app.route('/cli', createCliRoutes(() => ({
            getMachine: () => machine,
            getMachineByNamespace: () => machine,
            getOrCreateMachine: () => machine
        }) as never, store))

        const createResponse = await app.request('http://localhost/cli/machines', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${enrollmentToken}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                id: 'machine-1',
                metadata: {},
                runnerState: null
            })
        })

        expect(createResponse.status).toBe(200)
        const workerSessionToken = createResponse.headers.get('x-hapi-worker-session-token')
        expect(workerSessionToken).toBeTruthy()
        expect(workerSessionToken?.startsWith('hqs_')).toBe(true)

        const getResponse = await app.request('http://localhost/cli/machines/machine-1', {
            headers: {
                authorization: `Bearer ${workerSessionToken}`
            }
        })

        expect(getResponse.status).toBe(200)
        expect(await getResponse.json()).toEqual({ machine })
    })
})
