import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'

import { createSettingsRoutes } from './settings'
import { Store } from '../../store'

function createAuthedApp(store: Store, getSyncEngine: () => unknown, userId: number) {
    const app = new Hono<{ Variables: { namespace: string; userId: number } }>()
    app.use('/api/*', async (c, next) => {
        c.set('namespace', 'default')
        c.set('userId', userId)
        await next()
    })
    app.route('/api', createSettingsRoutes(store, getSyncEngine as never))
    return app
}

describe('createSettingsRoutes', () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
        globalThis.fetch = originalFetch
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    it('stores cloud agent defaults per user', async () => {
        const store = new Store(':memory:')
        const user = store.users.addUser('telegram', '123', 'default')
        const app = createAuthedApp(store, () => null, user.id)

        const update = await app.request('http://localhost/api/settings/cloud-agents', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                gitName: 'Jane Doe',
                gitEmail: 'jane@example.com'
            })
        })

        expect(update.status).toBe(200)
        expect(await update.json()).toEqual({
            settings: {
                gitName: 'Jane Doe',
                gitEmail: 'jane@example.com',
                githubUsername: ''
            }
        })

        const get = await app.request('http://localhost/api/settings/cloud-agents')
        expect(get.status).toBe(200)
        expect(await get.json()).toEqual({
            settings: {
                gitName: 'Jane Doe',
                gitEmail: 'jane@example.com',
                githubUsername: ''
            },
            github: {
                connected: false,
                profile: null,
                secretId: null,
                envName: null
            }
        })
    })

    it('connects and disconnects GitHub through GITHUB_TOKEN secret', async () => {
        const store = new Store(':memory:')
        const user = store.users.addUser('telegram', '123', 'default')
        const secrets: Array<Record<string, unknown>> = []

        globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
            const token = new Headers(init?.headers).get('Authorization')
            if (token === 'Bearer bad-token') {
                return new Response(JSON.stringify({ message: 'Bad credentials' }), {
                    status: 401,
                    headers: { 'content-type': 'application/json' }
                })
            }
            return new Response(JSON.stringify({
                login: 'octocat',
                name: 'The Octocat',
                avatar_url: 'https://avatars.githubusercontent.com/u/1'
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        }) as unknown as typeof fetch

        const app = createAuthedApp(store, () => ({
            listCloudSecrets: () => secrets,
            resolveCloudSecretValue: (_namespace: string, name: string) => {
                const secret = secrets.find((item) => item.name === name)
                return typeof secret?.value === 'string' ? secret.value : null
            },
            createCloudSecret: (payload: Record<string, unknown>) => {
                const secret = {
                    id: 'secret-1',
                    namespace: 'default',
                    ...payload
                }
                secrets.push(secret)
                return secret
            },
            updateCloudSecret: (payload: Record<string, unknown>) => {
                Object.assign(secrets[0]!, payload)
                return secrets[0]
            },
            deleteCloudSecret: () => {
                secrets.splice(0, secrets.length)
                return true
            }
        }), user.id)

        const connect = await app.request('http://localhost/api/settings/cloud-agents/github', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: 'good-token' })
        })

        expect(connect.status).toBe(200)
        const connectJson = await connect.json() as {
            github: {
                connected: boolean
                profile: { login: string }
            }
        }
        expect(connectJson.github.connected).toBe(true)
        expect(connectJson.github.profile.login).toBe('octocat')
        expect(secrets[0]?.name).toBe('GITHUB_TOKEN')
        expect(secrets[0]?.envName).toBe('GITHUB_TOKEN')

        const get = await app.request('http://localhost/api/settings/cloud-agents')
        const getJson = await get.json() as {
            github: {
                connected: boolean
                profile: { login: string }
            }
            settings: {
                githubUsername: string
            }
        }
        expect(getJson.github.connected).toBe(true)
        expect(getJson.github.profile.login).toBe('octocat')
        expect(getJson.settings.githubUsername).toBe('octocat')

        const disconnect = await app.request('http://localhost/api/settings/cloud-agents/github', {
            method: 'DELETE'
        })
        expect(disconnect.status).toBe(200)
        expect(await disconnect.json()).toEqual({
            github: {
                connected: false,
                profile: null,
                envName: null
            }
        })
        expect(secrets).toHaveLength(0)
    })

    it('lists GitHub repos from the connected token', async () => {
        const store = new Store(':memory:')
        const user = store.users.addUser('telegram', '123', 'default')

        globalThis.fetch = mock(async (_input: string | URL | Request) => {
            return new Response(JSON.stringify([
                {
                    full_name: 'acme/demo',
                    name: 'demo',
                    private: true,
                    html_url: 'https://github.com/acme/demo',
                    clone_url: 'https://github.com/acme/demo.git',
                    default_branch: 'main',
                    updated_at: '2026-04-15T00:00:00Z',
                    owner: { login: 'acme' }
                }
            ]), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        }) as unknown as typeof fetch

        const app = createAuthedApp(store, () => ({
            listCloudSecrets: () => [{
                id: 'secret-1',
                namespace: 'default',
                name: 'GITHUB_TOKEN',
                envName: 'GITHUB_TOKEN'
            }],
            resolveCloudSecretValue: () => 'good-token'
        }), user.id)

        const response = await app.request('http://localhost/api/settings/cloud-agents/github/repos')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            repos: [{
                fullName: 'acme/demo',
                name: 'demo',
                owner: 'acme',
                private: true,
                url: 'https://github.com/acme/demo',
                cloneUrl: 'https://github.com/acme/demo.git',
                defaultBranch: 'main',
                updatedAt: '2026-04-15T00:00:00Z'
            }]
        })
    })
})
