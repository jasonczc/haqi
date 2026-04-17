import { Hono } from 'hono'
import { z } from 'zod'

import { configuration } from '../../configuration'
import { readSettingsOrThrow, writeSettings } from '../../config/settings'
import type { Store } from '../../store'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

const updateProjectOfflineSchema = z.object({
    directories: z.array(z.string()).max(500)
})

const updateExperimentalSettingsSchema = z.object({
    claudeLoginShell: z.boolean().optional()
}).superRefine((value, ctx) => {
    if (value.claudeLoginShell === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'claudeLoginShell must be provided'
        })
    }
})

const updateCloudAgentSettingsSchema = z.object({
    gitName: z.string().max(200).nullable().optional(),
    gitEmail: z.string().max(320).nullable().optional(),
    githubUsername: z.string().max(100).nullable().optional(),
})

const connectGitHubSchema = z.object({
    token: z.string().min(1)
})

const DEFAULT_EXPERIMENTAL_CLAUDE_LOGIN_SHELL = false

type GitHubProfile = {
    login: string
    name: string | null
    avatarUrl: string | null
}

type GitHubRepo = {
    fullName: string
    name: string
    owner: string
    private: boolean
    url: string
    cloneUrl: string
    defaultBranch: string
    updatedAt: string
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'haqi-hub'
        }
    })

    if (!response.ok) {
        throw new Error(`GitHub request failed (${response.status})`)
    }

    return await response.json() as T
}

async function fetchGitHubProfile(token: string): Promise<GitHubProfile> {
    const body = await githubFetch<{
        login?: unknown
        name?: unknown
        avatar_url?: unknown
    }>('/user', token)

    if (typeof body.login !== 'string' || body.login.trim().length === 0) {
        throw new Error('GitHub token validation failed (missing login)')
    }

    return {
        login: body.login,
        name: typeof body.name === 'string' ? body.name : null,
        avatarUrl: typeof body.avatar_url === 'string' ? body.avatar_url : null,
    }
}

async function fetchGitHubRepos(token: string): Promise<GitHubRepo[]> {
    const repos = await githubFetch<Array<{
        full_name?: unknown
        name?: unknown
        private?: unknown
        html_url?: unknown
        clone_url?: unknown
        default_branch?: unknown
        updated_at?: unknown
        owner?: { login?: unknown }
    }>>('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', token)

    return repos
        .filter((repo) => typeof repo.full_name === 'string' && typeof repo.name === 'string')
        .map((repo) => ({
            fullName: repo.full_name as string,
            name: repo.name as string,
            owner: typeof repo.owner?.login === 'string' ? repo.owner.login : '',
            private: Boolean(repo.private),
            url: typeof repo.html_url === 'string' ? repo.html_url : '',
            cloneUrl: typeof repo.clone_url === 'string' ? repo.clone_url : '',
            defaultBranch: typeof repo.default_branch === 'string' ? repo.default_branch : '',
            updatedAt: typeof repo.updated_at === 'string' ? repo.updated_at : '',
        }))
}

async function fetchGitHubBranches(
    token: string,
    owner: string,
    repo: string
): Promise<Array<{ name: string; protected: boolean }>> {
    const branches = await githubFetch<Array<{
        name?: unknown
        protected?: unknown
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`, token)

    return branches
        .filter((b) => typeof b.name === 'string')
        .map((b) => ({
            name: b.name as string,
            protected: Boolean(b.protected),
        }))
}

function getCloudAgentSettingsPayload(store: Store, namespace: string, userId: number) {
    const preferences = store.cloudAgentPreferences.getPreferences(namespace, userId)
    return {
        gitName: preferences?.gitName ?? '',
        gitEmail: preferences?.gitEmail ?? '',
        githubUsername: preferences?.githubUsername ?? '',
    }
}

function findGitHubSecret(engine: SyncEngine, namespace: string) {
    return engine.listCloudSecrets(namespace).find((secret) => secret.name === 'GITHUB_TOKEN' || secret.name === 'GH_TOKEN') ?? null
}

function normalizeDirectories(directories: string[]): string[] {
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const directory of directories) {
        const trimmed = directory.trim()
        if (!trimmed || seen.has(trimmed)) {
            continue
        }
        seen.add(trimmed)
        normalized.push(trimmed)
    }
    return normalized
}

export function createSettingsRoutes(
    store: Store,
    getSyncEngine: () => SyncEngine | null
): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/settings/experimental', async (c) => {
        try {
            const settings = await readSettingsOrThrow(configuration.settingsFile)
            return c.json({
                settings: {
                    claudeLoginShell: settings.experimentalClaudeLoginShell ?? DEFAULT_EXPERIMENTAL_CLAUDE_LOGIN_SHELL
                }
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to load experimental settings'
            }, 500)
        }
    })

    app.patch('/settings/experimental', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateExperimentalSettingsSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const settings = await readSettingsOrThrow(configuration.settingsFile)
            settings.experimentalClaudeLoginShell = parsed.data.claudeLoginShell
            await writeSettings(configuration.settingsFile, settings)
            return c.json({
                settings: {
                    claudeLoginShell: settings.experimentalClaudeLoginShell ?? DEFAULT_EXPERIMENTAL_CLAUDE_LOGIN_SHELL
                }
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to update experimental settings'
            }, 500)
        }
    })

    app.get('/settings/project-offline', (c) => {
        try {
            const namespace = c.get('namespace')
            const userId = c.get('userId')
            const directories = store.projectPreferences.getProjectOfflineDirectories(namespace, userId)
            return c.json({ directories })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to load project offline settings'
            }, 500)
        }
    })

    app.put('/settings/project-offline', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateProjectOfflineSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const namespace = c.get('namespace')
            const userId = c.get('userId')
            const directories = store.projectPreferences.replaceProjectOfflineDirectories(
                namespace,
                userId,
                normalizeDirectories(parsed.data.directories)
            )
            return c.json({ directories })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to update project offline settings'
            }, 500)
        }
    })

    app.get('/settings/cloud-agents', async (c) => {
        try {
            const namespace = c.get('namespace')
            const userId = c.get('userId')
            const engine = getSyncEngine()
            const settings = getCloudAgentSettingsPayload(store, namespace, userId)
            const githubSecret = engine ? findGitHubSecret(engine, namespace) : null

            let github: {
                connected: boolean
                profile: GitHubProfile | null
                secretId: string | null
                envName: string | null
                error?: string
            } = {
                connected: false,
                profile: null,
                secretId: githubSecret?.id ?? null,
                envName: githubSecret?.envName ?? null,
            }

            if (engine && githubSecret) {
                const token = engine.resolveCloudSecretValue(namespace, githubSecret.name)
                if (token) {
                    try {
                        github = {
                            connected: true,
                            profile: await fetchGitHubProfile(token),
                            secretId: githubSecret.id,
                            envName: githubSecret.envName ?? null,
                        }
                    } catch (error) {
                        github = {
                            connected: false,
                            profile: null,
                            secretId: githubSecret.id,
                            envName: githubSecret.envName ?? null,
                            error: error instanceof Error ? error.message : 'Failed to validate GitHub token'
                        }
                    }
                }
            }

            return c.json({ settings, github })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to load cloud agent settings'
            }, 500)
        }
    })

    app.patch('/settings/cloud-agents', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateCloudAgentSettingsSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const namespace = c.get('namespace')
            const userId = c.get('userId')
            const preferences = store.cloudAgentPreferences.upsertPreferences(namespace, userId, parsed.data)
            return c.json({
                settings: {
                    gitName: preferences.gitName ?? '',
                    gitEmail: preferences.gitEmail ?? '',
                    githubUsername: preferences.githubUsername ?? '',
                }
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to update cloud agent settings'
            }, 500)
        }
    })

    app.put('/settings/cloud-agents/github', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = connectGitHubSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const namespace = c.get('namespace')
            const userId = c.get('userId')
            const profile = await fetchGitHubProfile(parsed.data.token)
            const existing = findGitHubSecret(engine, namespace)
            if (existing) {
                engine.updateCloudSecret({
                    namespace,
                    id: existing.id,
                    name: 'GITHUB_TOKEN',
                    value: parsed.data.token,
                    description: 'GitHub personal access token for repo access, branch push, and PR operations.',
                    mountAs: 'env',
                    envName: 'GITHUB_TOKEN',
                    adapter: 'git'
                })
            } else {
                engine.createCloudSecret({
                    namespace,
                    name: 'GITHUB_TOKEN',
                    value: parsed.data.token,
                    description: 'GitHub personal access token for repo access, branch push, and PR operations.',
                    mountAs: 'env',
                    envName: 'GITHUB_TOKEN',
                    adapter: 'git'
                })
            }
            const preferences = store.cloudAgentPreferences.upsertPreferences(namespace, userId, {
                githubUsername: profile.login
            })
            return c.json({
                settings: {
                    gitName: preferences.gitName ?? '',
                    gitEmail: preferences.gitEmail ?? '',
                    githubUsername: preferences.githubUsername ?? '',
                },
                github: {
                    connected: true,
                    profile,
                    envName: 'GITHUB_TOKEN'
                }
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to connect GitHub'
            }, 400)
        }
    })

    app.delete('/settings/cloud-agents/github', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        try {
            const namespace = c.get('namespace')
            const existing = findGitHubSecret(engine, namespace)
            if (existing) {
                engine.deleteCloudSecret(existing.id, namespace)
            }
            return c.json({
                github: {
                    connected: false,
                    profile: null,
                    envName: null
                }
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to disconnect GitHub'
            }, 500)
        }
    })

    app.get('/settings/cloud-agents/github/repos', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        try {
            const namespace = c.get('namespace')
            const githubSecret = findGitHubSecret(engine, namespace)
            if (!githubSecret) {
                return c.json({ error: 'No GitHub token configured' }, 401)
            }

            const token = engine.resolveCloudSecretValue(namespace, githubSecret.name)
            if (!token) {
                return c.json({ error: 'No GitHub token configured' }, 401)
            }

            return c.json({
                repos: await fetchGitHubRepos(token)
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to list GitHub repositories'
            }, 502)
        }
    })

    app.get('/settings/cloud-agents/github/repos/:owner/:repo/branches', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const owner = c.req.param('owner')
        const repo = c.req.param('repo')
        if (!owner || !repo) {
            return c.json({ error: 'Missing owner or repo' }, 400)
        }

        try {
            const namespace = c.get('namespace')
            const githubSecret = findGitHubSecret(engine, namespace)
            if (!githubSecret) {
                return c.json({ error: 'No GitHub token configured' }, 401)
            }

            const token = engine.resolveCloudSecretValue(namespace, githubSecret.name)
            if (!token) {
                return c.json({ error: 'No GitHub token configured' }, 401)
            }

            return c.json({
                branches: await fetchGitHubBranches(token, owner, repo)
            })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to list GitHub branches'
            }, 502)
        }
    })

    return app
}
