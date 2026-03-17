import { randomUUID, createHash } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { configuration } from '@/configuration'
import type {
    CodexCredentialExportResponse,
    CodexCredentialProfile,
    CodexCredentialStateResponse,
    CodexCredentialSummary
} from '@hapi/protocol'

const INDEX_VERSION = 1
const LOCK_RETRY_INTERVAL_MS = 100
const MAX_LOCK_ATTEMPTS = 50
const STALE_LOCK_TIMEOUT_MS = 10_000

type StoredCredentialProfile = Omit<CodexCredentialProfile, 'isActive'> & {
    contentHash: string
}

type StoredCredentialIndex = {
    version: number
    activeProfileId: string | null
    profiles: StoredCredentialProfile[]
}

type ParsedCredentialRecord = Record<string, unknown>

const EMPTY_INDEX: StoredCredentialIndex = {
    version: INDEX_VERSION,
    activeProfileId: null,
    profiles: []
}

function getCodexHomeDir(): string {
    return process.env.CODEX_HOME ?? join(homedir(), '.codex')
}

function getCurrentAuthPath(): string {
    return join(getCodexHomeDir(), 'auth.json')
}

function getCredentialLockPath(): string {
    return `${configuration.codexCredentialsIndexFile}.lock`
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

function normalizeCredentialContent(content: string): { canonical: string; parsed: ParsedCredentialRecord } {
    let parsed: unknown
    try {
        parsed = JSON.parse(content)
    } catch {
        throw new Error('Credential file is not valid JSON')
    }

    if (!isRecord(parsed)) {
        throw new Error('Credential file must be a JSON object')
    }

    const recognizedKeys = ['auth_mode', 'OPENAI_API_KEY', 'tokens', 'last_refresh']
    if (!recognizedKeys.some((key) => key in parsed)) {
        throw new Error('Credential file does not look like a Codex auth.json')
    }

    return {
        canonical: JSON.stringify(parsed),
        parsed
    }
}

function hashCredentialContent(canonical: string): string {
    return createHash('sha256').update(canonical).digest('hex')
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
    if (!token) {
        return null
    }
    const parts = token.split('.')
    if (parts.length < 2) {
        return null
    }

    try {
        const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
        const parsed = JSON.parse(payload)
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

function maskEmail(email: string | undefined): string | undefined {
    if (!email) {
        return undefined
    }
    const [localPart, domain] = email.split('@')
    if (!localPart || !domain) {
        return undefined
    }
    if (localPart.length <= 2) {
        return `${localPart[0] ?? '*'}*@${domain}`
    }
    return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`
}

function buildCredentialSummary(parsed: ParsedCredentialRecord): CodexCredentialSummary {
    const tokens = isRecord(parsed.tokens) ? parsed.tokens : null
    const idTokenPayload = decodeJwtPayload(toOptionalString(tokens?.id_token))
    const accessTokenPayload = decodeJwtPayload(toOptionalString(tokens?.access_token))
    const authPayload = (idTokenPayload?.['https://api.openai.com/auth'] ?? accessTokenPayload?.['https://api.openai.com/auth'])
    const authRecord = isRecord(authPayload) ? authPayload : null
    const organizations = Array.isArray(authRecord?.organizations) ? authRecord.organizations : []
    const firstOrganization = organizations.find(isRecord) ?? null
    const email = maskEmail(
        toOptionalString(idTokenPayload?.email)
        ?? toOptionalString(accessTokenPayload?.['https://api.openai.com/profile'] && isRecord(accessTokenPayload['https://api.openai.com/profile'])
            ? (accessTokenPayload['https://api.openai.com/profile'] as Record<string, unknown>).email
            : undefined)
    )

    return {
        authMode: toOptionalString(parsed.auth_mode),
        email,
        organizationTitle: toOptionalString(firstOrganization?.title),
        planType: toOptionalString(authRecord?.chatgpt_plan_type),
        lastRefresh: toOptionalString(parsed.last_refresh),
        hasOpenAiApiKey: parsed.OPENAI_API_KEY !== undefined,
        hasTokens: tokens !== null
    }
}

function buildDefaultProfileName(summary: CodexCredentialSummary, profileCount: number): string {
    if (summary.email) {
        return summary.email
    }
    if (summary.organizationTitle) {
        return summary.organizationTitle
    }
    if (summary.planType) {
        return `Codex ${summary.planType}`
    }
    return `Codex credential ${profileCount + 1}`
}

async function ensureCredentialStore(): Promise<void> {
    await mkdir(configuration.codexCredentialsDir, { recursive: true })
    await mkdir(configuration.codexCredentialsProfilesDir, { recursive: true })
}

async function ensureCurrentAuthParent(): Promise<void> {
    await mkdir(getCodexHomeDir(), { recursive: true })
}

function profilePath(profileId: string): string {
    return join(configuration.codexCredentialsProfilesDir, `${profileId}.json`)
}

async function readCredentialIndex(): Promise<StoredCredentialIndex> {
    if (!existsSync(configuration.codexCredentialsIndexFile)) {
        return { ...EMPTY_INDEX, profiles: [] }
    }

    try {
        const content = await readFile(configuration.codexCredentialsIndexFile, 'utf8')
        const parsed = JSON.parse(content)
        if (!isRecord(parsed) || !Array.isArray(parsed.profiles)) {
            return { ...EMPTY_INDEX, profiles: [] }
        }

        const profiles = parsed.profiles
            .filter(isRecord)
            .map((profile): StoredCredentialProfile | null => {
                const id = toOptionalString(profile.id)
                const name = toOptionalString(profile.name)
                const importSource = profile.importSource === 'current-auth' ? 'current-auth' : profile.importSource === 'imported-file' ? 'imported-file' : null
                const contentHash = toOptionalString(profile.contentHash)
                const summary = isRecord(profile.summary) ? {
                    authMode: toOptionalString(profile.summary.authMode),
                    email: toOptionalString(profile.summary.email),
                    organizationTitle: toOptionalString(profile.summary.organizationTitle),
                    planType: toOptionalString(profile.summary.planType),
                    lastRefresh: toOptionalString(profile.summary.lastRefresh),
                    hasOpenAiApiKey: profile.summary.hasOpenAiApiKey === true,
                    hasTokens: profile.summary.hasTokens === true
                } : null
                const createdAt = typeof profile.createdAt === 'number' ? profile.createdAt : null
                const updatedAt = typeof profile.updatedAt === 'number' ? profile.updatedAt : null
                if (!id || !name || !importSource || !contentHash || !summary || createdAt === null || updatedAt === null) {
                    return null
                }
                return {
                    id,
                    name,
                    importSource,
                    contentHash,
                    summary,
                    createdAt,
                    updatedAt
                }
            })
            .filter((profile): profile is StoredCredentialProfile => profile !== null)

        const activeProfileId = typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null
        return {
            version: typeof parsed.version === 'number' ? parsed.version : INDEX_VERSION,
            activeProfileId,
            profiles
        }
    } catch {
        return { ...EMPTY_INDEX, profiles: [] }
    }
}

async function writeCredentialIndex(index: StoredCredentialIndex): Promise<void> {
    await ensureCredentialStore()
    const tmpPath = `${configuration.codexCredentialsIndexFile}.tmp`
    await writeFile(tmpPath, JSON.stringify(index, null, 2))
    await rename(tmpPath, configuration.codexCredentialsIndexFile)
}

async function withCredentialLock<T>(callback: () => Promise<T>): Promise<T> {
    await ensureCredentialStore()
    const lockPath = getCredentialLockPath()
    let handle: Awaited<ReturnType<typeof open>> | null = null

    for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt += 1) {
        try {
            handle = await open(lockPath, 'wx')
            break
        } catch (error: any) {
            if (error?.code !== 'EEXIST') {
                throw error
            }

            await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS))

            try {
                const lockStats = await stat(lockPath)
                if (Date.now() - lockStats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
                    await unlink(lockPath).catch(() => {})
                }
            } catch {
                // Ignore stale lock inspection failures.
            }
        }
    }

    if (!handle) {
        throw new Error('Failed to acquire Codex credential lock')
    }

    try {
        return await callback()
    } finally {
        await handle.close()
        await unlink(lockPath).catch(() => {})
    }
}

async function readCurrentAuthFile(): Promise<{ raw: string; canonical: string; parsed: ParsedCredentialRecord } | null> {
    const authPath = getCurrentAuthPath()
    if (!existsSync(authPath)) {
        return null
    }

    const raw = await readFile(authPath, 'utf8')
    const normalized = normalizeCredentialContent(raw)
    return {
        raw,
        canonical: normalized.canonical,
        parsed: normalized.parsed
    }
}

async function resolveState(indexOverride?: StoredCredentialIndex): Promise<CodexCredentialStateResponse> {
    const index = indexOverride ?? await readCredentialIndex()
    const current = await readCurrentAuthFile().catch(() => null)
    const currentHash = current ? hashCredentialContent(current.canonical) : null
    const matchedProfileId = currentHash
        ? (index.profiles.find((profile) => profile.contentHash === currentHash)?.id ?? null)
        : null

    return {
        current: {
            exists: Boolean(current),
            activeProfileId: matchedProfileId,
            summary: current ? buildCredentialSummary(current.parsed) : null
        },
        profiles: index.profiles
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((profile) => ({
                id: profile.id,
                name: profile.name,
                createdAt: profile.createdAt,
                updatedAt: profile.updatedAt,
                importSource: profile.importSource,
                isActive: profile.id === matchedProfileId,
                summary: profile.summary
            }))
    }
}

async function writeProfileFile(profileId: string, content: string): Promise<void> {
    await ensureCredentialStore()
    await writeFile(profilePath(profileId), content)
}

async function readProfileFile(profileId: string): Promise<string> {
    return await readFile(profilePath(profileId), 'utf8')
}

async function importCredentialContent(
    content: string,
    options?: { name?: string; importSource?: 'current-auth' | 'imported-file' }
): Promise<CodexCredentialStateResponse> {
    return await withCredentialLock(async () => {
        const normalized = normalizeCredentialContent(content)
        const contentHash = hashCredentialContent(normalized.canonical)
        const index = await readCredentialIndex()
        const existingProfile = index.profiles.find((profile) => profile.contentHash === contentHash)
        const summary = buildCredentialSummary(normalized.parsed)

        if (existingProfile) {
            const renamed = toOptionalString(options?.name)
            if (renamed && renamed !== existingProfile.name) {
                existingProfile.name = renamed
                existingProfile.updatedAt = Date.now()
                await writeCredentialIndex(index)
            }
            return await resolveState(index)
        }

        const now = Date.now()
        const profileId = randomUUID()
        const name = toOptionalString(options?.name) ?? buildDefaultProfileName(summary, index.profiles.length)
        const profile: StoredCredentialProfile = {
            id: profileId,
            name,
            createdAt: now,
            updatedAt: now,
            importSource: options?.importSource ?? 'imported-file',
            contentHash,
            summary
        }

        await writeProfileFile(profileId, content)
        index.profiles.push(profile)
        await writeCredentialIndex(index)
        return await resolveState(index)
    })
}

export async function getCodexCredentialState(): Promise<CodexCredentialStateResponse> {
    return await resolveState()
}

export async function exportCurrentCodexCredentials(): Promise<CodexCredentialExportResponse> {
    const current = await readCurrentAuthFile()
    if (!current) {
        throw new Error('Current Codex auth.json not found')
    }

    return {
        content: current.raw,
        summary: buildCredentialSummary(current.parsed)
    }
}

export async function importCodexCredentials(content: string, name?: string): Promise<CodexCredentialStateResponse> {
    return await importCredentialContent(content, {
        name,
        importSource: 'imported-file'
    })
}

export async function saveCurrentCodexCredentials(name?: string): Promise<CodexCredentialStateResponse> {
    const current = await readCurrentAuthFile()
    if (!current) {
        throw new Error('Current Codex auth.json not found')
    }

    return await importCredentialContent(current.raw, {
        name,
        importSource: 'current-auth'
    })
}

export async function activateCodexCredential(profileId: string): Promise<CodexCredentialStateResponse> {
    return await withCredentialLock(async () => {
        const index = await readCredentialIndex()
        const profile = index.profiles.find((entry) => entry.id === profileId)
        if (!profile) {
            throw new Error('Credential profile not found')
        }

        const content = await readProfileFile(profileId)
        normalizeCredentialContent(content)
        await ensureCurrentAuthParent()
        await writeFile(getCurrentAuthPath(), content)
        index.activeProfileId = profileId
        profile.updatedAt = Date.now()
        await writeCredentialIndex(index)
        return await resolveState(index)
    })
}

export async function deleteCodexCredential(profileId: string): Promise<CodexCredentialStateResponse> {
    return await withCredentialLock(async () => {
        const index = await readCredentialIndex()
        const current = await resolveState(index)
        if (current.current.activeProfileId === profileId) {
            throw new Error('Cannot delete the active credential profile')
        }

        const nextProfiles = index.profiles.filter((profile) => profile.id !== profileId)
        if (nextProfiles.length === index.profiles.length) {
            throw new Error('Credential profile not found')
        }

        index.profiles = nextProfiles
        if (index.activeProfileId === profileId) {
            index.activeProfileId = null
        }
        await rm(profilePath(profileId), { force: true })
        await writeCredentialIndex(index)
        return await resolveState(index)
    })
}
