import { afterEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import { buildLocalWorkerMachineId, createCloudRoutes } from './cloud'

function createAuthedApp(getSyncEngine: () => unknown) {
    const app = new Hono<{ Variables: { namespace: string } }>()
    app.use('/api/*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createCloudRoutes(getSyncEngine as never))
    return app
}

const originalKill = process.kill.bind(process)

afterEach(() => {
    process.kill = originalKill
})

describe('createCloudRoutes', () => {
    it('builds a stable local worker machine id', () => {
        expect(buildLocalWorkerMachineId('Default Namespace', 'Worker Dev Host')).toBe(
            'local-worker-worker-dev-host-default-namespace'
        )
    })

    it('returns worker summaries by provider', async () => {
        let calledNamespace: string | undefined
        const app = createAuthedApp(() => ({
            listCloudWorkers: (provider?: string, namespace?: string) => {
                calledNamespace = namespace
                return [{
                    machineId: 'machine-1',
                    provider: provider ?? 'auto',
                    active: true,
                    selectable: true,
                    executorType: 'cloud-self-hosted',
                    lifecycle: 'idle',
                    region: 'us-east-1',
                    labels: ['docker', 'warm-cache'],
                    runnerState: {
                        lifecycle: 'idle'
                    },
                    updatedAt: 1
                }]
            }
        }))

        const response = await app.request('http://localhost/api/cloud/workers?provider=docker')
        const json = await response.json()

        expect(response.status).toBe(200)
        expect(json).toEqual({
            workers: [
                {
                    machineId: 'machine-1',
                    provider: 'docker',
                    active: true,
                    selectable: true,
                    executorType: 'cloud-self-hosted',
                    lifecycle: 'idle',
                    region: 'us-east-1',
                    labels: ['docker', 'warm-cache'],
                    runnerState: {
                        lifecycle: 'idle'
                    },
                    updatedAt: 1
                }
            ]
        })
        expect(calledNamespace).toBe('default')
    })

    it('rejects invalid provider queries', async () => {
        const app = createAuthedApp(() => ({
            listCloudWorkers: () => []
        }))

        const response = await app.request('http://localhost/api/cloud/workers?provider=bogus')

        expect(response.status).toBe(400)
    })

    it('returns cloud providers summary', async () => {
        let calledNamespace: string | undefined
        const app = createAuthedApp(() => ({
            listCloudWorkers: () => [],
            listCloudProviders: (namespace?: string) => {
                calledNamespace = namespace
                return [
                    { id: 'docker', type: 'self-hosted', count: 2, activeCount: 2, availableCount: 1 },
                    { id: 'managed', type: 'managed', count: 1, activeCount: 1, availableCount: 1 }
                ]
            }
        }))

        const response = await app.request('http://localhost/api/cloud/providers')
        const json = await response.json()

        expect(response.status).toBe(200)
        expect(json).toEqual({
            providers: [
                { id: 'docker', type: 'self-hosted', count: 2, activeCount: 2, availableCount: 1 },
                { id: 'managed', type: 'managed', count: 1, activeCount: 1, availableCount: 1 }
            ]
        })
        expect(calledNamespace).toBe('default')
    })

    it('returns request listings and request details', async () => {
        let listedLimit: number | undefined
        let listedNamespace: string | undefined
        let detailNamespace: string | undefined

        const request = {
            id: 'req-1',
            namespace: 'default',
            phase: 'queued',
            request: {
                executionBackend: 'cloud-self-hosted'
            },
            createdAt: 1,
            updatedAt: 1
        }

        const app = createAuthedApp(() => ({
            listCloudRequests: (namespace?: string, limit?: number) => {
                listedNamespace = namespace
                listedLimit = limit
                return [request]
            },
            getCloudRequestByNamespace: (_id: string, namespace?: string) => {
                detailNamespace = namespace
                return request
            }
        }))

        const listResponse = await app.request('http://localhost/api/cloud/requests?limit=5')
        expect(listResponse.status).toBe(200)
        expect(await listResponse.json()).toEqual({ requests: [request] })
        expect(listedNamespace).toBe('default')
        expect(listedLimit).toBe(5)

        const detailResponse = await app.request('http://localhost/api/cloud/requests/req-1')
        expect(detailResponse.status).toBe(200)
        expect(await detailResponse.json()).toEqual({ request })
        expect(detailNamespace).toBe('default')
    })

    it('handles cloud secret CRUD and worker enrollment token routes', async () => {
        const createdSecret = {
            id: 'secret-1',
            namespace: 'default',
            name: 'repo-token',
            mountAs: 'env',
            adapter: 'git',
            createdAt: 1,
            updatedAt: 1
        }
        const updatedSecret = {
            ...createdSecret,
            description: 'updated',
            updatedAt: 2
        }
        const tokenRecord = {
            id: 'token-1',
            namespace: 'default',
            tokenPreview: 'hqe_12...abcd',
            createdAt: 1
        }

        const app = createAuthedApp(() => ({
            listCloudSecrets: () => [createdSecret],
            createCloudSecret: (payload: Record<string, unknown>) => ({
                ...createdSecret,
                name: payload.name
            }),
            getCloudSecretByNamespace: () => createdSecret,
            updateCloudSecret: () => updatedSecret,
            deleteCloudSecret: () => true,
            listCloudWorkerEnrollmentTokens: () => [tokenRecord],
            createCloudWorkerEnrollmentToken: () => ({
                token: 'hqe_example',
                record: tokenRecord
            }),
            revokeCloudWorkerEnrollmentToken: () => tokenRecord
        }))

        const listSecretsResponse = await app.request('http://localhost/api/cloud/secrets')
        expect(listSecretsResponse.status).toBe(200)
        expect(await listSecretsResponse.json()).toEqual({ secrets: [createdSecret] })

        const createSecretResponse = await app.request('http://localhost/api/cloud/secrets', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'repo-token', value: 'secret-value', adapter: 'git' })
        })
        expect(createSecretResponse.status).toBe(200)
        expect(await createSecretResponse.json()).toEqual({
            secret: {
                ...createdSecret,
                name: 'repo-token'
            }
        })

        const updateSecretResponse = await app.request('http://localhost/api/cloud/secrets/secret-1', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ description: 'updated' })
        })
        expect(updateSecretResponse.status).toBe(200)
        expect(await updateSecretResponse.json()).toEqual({ secret: updatedSecret })

        const deleteSecretResponse = await app.request('http://localhost/api/cloud/secrets/secret-1', {
            method: 'DELETE'
        })
        expect(deleteSecretResponse.status).toBe(200)
        expect(await deleteSecretResponse.json()).toEqual({ ok: true })

        const listTokensResponse = await app.request('http://localhost/api/cloud/worker-enrollment-tokens')
        expect(listTokensResponse.status).toBe(200)
        expect(await listTokensResponse.json()).toEqual({ tokens: [tokenRecord] })

        const createTokenResponse = await app.request('http://localhost/api/cloud/worker-enrollment-tokens', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'runner-1', ttlMinutes: 30 })
        })
        expect(createTokenResponse.status).toBe(200)
        expect(await createTokenResponse.json()).toEqual({
            token: 'hqe_example',
            record: tokenRecord
        })

        const revokeTokenResponse = await app.request('http://localhost/api/cloud/worker-enrollment-tokens/token-1', {
            method: 'DELETE'
        })
        expect(revokeTokenResponse.status).toBe(200)
        expect(await revokeTokenResponse.json()).toEqual({ token: tokenRecord })
    })

    it('returns 503 when sync engine is unavailable', async () => {
        const app = createAuthedApp(() => null)
        const response = await app.request('http://localhost/api/cloud/workers')
        expect(response.status).toBe(503)
    })

    it('reports an attached local worker from machine summary', async () => {
        process.kill = mock(((pid: number, signal?: number | NodeJS.Signals) => {
            if (signal === 0 || signal === undefined) {
                return true as never
            }
            return true as never
        }) as typeof process.kill)

        const app = createAuthedApp(() => ({
            listCloudWorkers: () => [{
                machineId: buildLocalWorkerMachineId('default'),
                provider: 'manual',
                active: true,
                selectable: true,
                executorType: 'cloud-self-hosted',
                lifecycle: 'idle',
                runnerState: {
                    pid: 43210,
                    startedAt: 123,
                    lifecycle: 'idle'
                },
                updatedAt: 1
            }]
        }))

        const response = await app.request('http://localhost/api/cloud/local-worker')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            running: true,
            pid: 43210,
            exitCode: null,
            startedAt: 123,
            logs: ['[hub] Attached to existing local worker process from machine summary']
        })
    })
})
