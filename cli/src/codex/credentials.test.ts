import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type CredentialModule = typeof import('./credentials')

function buildJwt(payload: Record<string, unknown>): string {
    const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url')
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

function buildCredentialJson(overrides?: Record<string, unknown>): string {
    const idToken = buildJwt({
        email: 'alice@example.com',
        'https://api.openai.com/auth': {
            chatgpt_plan_type: 'pro',
            organizations: [{ title: 'Personal', is_default: true }]
        }
    })

    return JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
            id_token: idToken,
            access_token: buildJwt({})
        },
        last_refresh: '2026-03-17T10:00:00.000Z',
        ...overrides
    }, null, 2)
}

describe('codex credentials', () => {
    let rootDir = ''
    let hapiHome = ''
    let codexHome = ''

    beforeEach(async () => {
        rootDir = await mkdtemp(join(tmpdir(), 'haqi-codex-credentials-'))
        hapiHome = join(rootDir, 'hapi-home')
        codexHome = join(rootDir, 'codex-home')
        process.env.HAPI_HOME = hapiHome
        process.env.CODEX_HOME = codexHome
    })

    afterEach(async () => {
        delete process.env.HAPI_HOME
        delete process.env.CODEX_HOME
        await rm(rootDir, { recursive: true, force: true })
    })

    async function loadModule(): Promise<CredentialModule> {
        const credentials = await import('./credentials')
        const { configuration } = await import('@/configuration')
        Object.assign(configuration, {
            codexCredentialsDir: join(hapiHome, 'codex-credentials'),
            codexCredentialsProfilesDir: join(hapiHome, 'codex-credentials', 'profiles'),
            codexCredentialsIndexFile: join(hapiHome, 'codex-credentials', 'index.json')
        })
        return credentials
    }

    it('returns empty state when no current auth or saved profiles exist', async () => {
        const credentials = await loadModule()
        const state = await credentials.getCodexCredentialState()

        expect(state.current.exists).toBe(false)
        expect(state.current.activeProfileId).toBeNull()
        expect(state.current.summary).toBeNull()
        expect(state.profiles).toEqual([])
    })

    it('imports a credential profile and can activate and export it', async () => {
        const credentials = await loadModule()
        const imported = await credentials.importCodexCredentials(buildCredentialJson(), 'Alice')

        expect(imported.profiles).toHaveLength(1)
        expect(imported.profiles[0]?.name).toBe('Alice')
        expect(imported.profiles[0]?.summary.email).toBe('a***e@example.com')
        expect(imported.current.exists).toBe(false)

        const activated = await credentials.activateCodexCredential(imported.profiles[0]!.id)
        expect(activated.current.exists).toBe(true)
        expect(activated.current.activeProfileId).toBe(imported.profiles[0]!.id)
        expect(activated.profiles[0]?.isActive).toBe(true)

        const exported = await credentials.exportCurrentCodexCredentials()
        expect(exported.summary.planType).toBe('pro')
        expect(exported.content).toContain('"auth_mode": "chatgpt"')

        const authPath = join(codexHome, 'auth.json')
        expect(await readFile(authPath, 'utf8')).toBe(exported.content)
    })

    it('prevents deleting the active profile and allows deleting inactive profiles', async () => {
        const credentials = await loadModule()
        const first = await credentials.importCodexCredentials(buildCredentialJson(), 'First')
        const second = await credentials.importCodexCredentials(buildCredentialJson({
            last_refresh: '2026-03-18T10:00:00.000Z'
        }), 'Second')

        await credentials.activateCodexCredential(first.profiles[0]!.id)

        await expect(credentials.deleteCodexCredential(first.profiles[0]!.id))
            .rejects
            .toThrow('Cannot delete the active credential profile')

        const afterDelete = await credentials.deleteCodexCredential(second.profiles.find((profile) => profile.name === 'Second')!.id)
        expect(afterDelete.profiles).toHaveLength(1)
        expect(afterDelete.profiles[0]?.name).toBe('First')
    })

    it('saves the current auth.json as a managed profile', async () => {
        await mkdir(codexHome, { recursive: true })
        await writeFile(join(codexHome, 'auth.json'), buildCredentialJson({
            auth_mode: 'api_key',
            OPENAI_API_KEY: { label: 'default' }
        }))

        const credentials = await loadModule()
        const saved = await credentials.saveCurrentCodexCredentials('Current')

        expect(saved.current.exists).toBe(true)
        expect(saved.current.summary?.authMode).toBe('api_key')
        expect(saved.profiles).toHaveLength(1)
        expect(saved.profiles[0]?.name).toBe('Current')
    })

    it('rejects invalid credential files', async () => {
        const credentials = await loadModule()

        await expect(credentials.importCodexCredentials('{"foo":"bar"}'))
            .rejects
            .toThrow('Credential file does not look like a Codex auth.json')
    })
})
