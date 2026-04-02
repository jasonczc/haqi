import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

type SessionMetadataShape = {
    repositoryUrl?: string
    workspaceBranch?: string
    worktree?: { branch?: string }
    pullRequestUrl?: string
    containerId?: string
}

/**
 * Extract owner/repo from a GitHub URL.
 * Supports: https://github.com/owner/repo.git, git@github.com:owner/repo.git
 */
function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
    // HTTPS format
    const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
    if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
    return null
}

/**
 * Resolve the GitHub token for a session's namespace.
 * Checks cloud secrets named 'GITHUB_TOKEN' or 'GH_TOKEN'.
 */
function resolveGitHubToken(engine: SyncEngine, namespace: string): string | null {
    for (const name of ['GITHUB_TOKEN', 'GH_TOKEN']) {
        const value = engine.resolveCloudSecretValue(namespace, name)
        if (value) return value
    }
    return null
}

async function githubFetch(path: string, token: string): Promise<any> {
    const res = await fetch(`https://api.github.com${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'haqi-hub'
        }
    })
    if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}

export function createGitHubRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    /**
     * GET /sessions/:id/github/pr
     * Returns PR info, checks, commits, files, and branch status for the session's repository.
     */
    app.get('/sessions/:id/github/pr', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const result = requireSessionFromParam(c, engine)
        if (result instanceof Response) return result

        const { session } = result
        const namespace = c.get('namespace')
        const metadata = session.metadata as SessionMetadataShape | undefined

        // Resolve repository info
        const repoUrl = metadata?.repositoryUrl
        if (!repoUrl) {
            return c.json({ error: 'Session has no repository URL' }, 404)
        }

        const parsed = parseGitHubRepo(repoUrl)
        if (!parsed) {
            return c.json({ error: 'Not a GitHub repository' }, 400)
        }

        const token = resolveGitHubToken(engine, namespace)
        if (!token) {
            return c.json({ error: 'No GitHub token configured. Add a GITHUB_TOKEN secret.' }, 401)
        }

        const { owner, repo } = parsed
        const branch = metadata?.workspaceBranch ?? metadata?.worktree?.branch

        try {
            // Try to find PR by branch or by pullRequestUrl
            let pr: any = null

            if (metadata?.pullRequestUrl) {
                // Extract PR number from URL
                const prMatch = metadata.pullRequestUrl.match(/\/pull\/(\d+)/)
                if (prMatch) {
                    pr = await githubFetch(`/repos/${owner}/${repo}/pulls/${prMatch[1]}`, token)
                }
            }

            if (!pr && branch) {
                // Search for PR by head branch
                const prs = await githubFetch(
                    `/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=all&per_page=1`,
                    token
                )
                if (Array.isArray(prs) && prs.length > 0) {
                    pr = prs[0]
                }
            }

            if (!pr) {
                return c.json({ pr: null, checks: [], commits: [], files: [], branchStatus: null })
            }

            // Fetch checks, commits, files in parallel
            const prNumber = pr.number
            const [checks, commits, files, comparison] = await Promise.allSettled([
                githubFetch(`/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs`, token),
                githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`, token),
                githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, token),
                githubFetch(`/repos/${owner}/${repo}/compare/${pr.base.ref}...${pr.head.ref}`, token)
            ])

            return c.json({
                pr,
                checks: checks.status === 'fulfilled' ? (checks.value?.check_runs ?? []) : [],
                commits: commits.status === 'fulfilled' ? commits.value : [],
                files: files.status === 'fulfilled' ? files.value : [],
                branchStatus: comparison.status === 'fulfilled'
                    ? { behind_by: comparison.value.behind_by, ahead_by: comparison.value.ahead_by }
                    : null
            })
        } catch (err) {
            return c.json({
                error: err instanceof Error ? err.message : 'GitHub API error',
                pr: null, checks: [], commits: [], files: [], branchStatus: null
            }, 502)
        }
    })

    /**
     * POST /sessions/:id/github/merge
     * Merge the PR associated with the session.
     */
    app.post('/sessions/:id/github/merge', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const result = requireSessionFromParam(c, engine)
        if (result instanceof Response) return result

        const { session } = result
        const namespace = c.get('namespace')
        const metadata = session.metadata as SessionMetadataShape | undefined

        const repoUrl = metadata?.repositoryUrl
        if (!repoUrl) return c.json({ error: 'No repository URL' }, 400)

        const parsed = parseGitHubRepo(repoUrl)
        if (!parsed) return c.json({ error: 'Not a GitHub repository' }, 400)

        const token = resolveGitHubToken(engine, namespace)
        if (!token) return c.json({ error: 'No GitHub token' }, 401)

        const { owner, repo } = parsed
        const branch = metadata?.workspaceBranch ?? metadata?.worktree?.branch

        // Find the PR
        let prNumber: number | null = null
        if (metadata?.pullRequestUrl) {
            const match = metadata.pullRequestUrl.match(/\/pull\/(\d+)/)
            if (match) prNumber = parseInt(match[1], 10)
        }
        if (!prNumber && branch) {
            const prs = await githubFetch(
                `/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open&per_page=1`,
                token
            )
            if (Array.isArray(prs) && prs.length > 0) prNumber = prs[0].number
        }

        if (!prNumber) return c.json({ error: 'No PR found to merge' }, 404)

        try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'haqi-hub',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ merge_method: 'squash' })
            })

            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                return c.json({ error: (body as any).message ?? `HTTP ${res.status}` }, res.status as any)
            }

            const body = await res.json()
            return c.json({ merged: true, sha: (body as any).sha })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Merge failed' }, 502)
        }
    })

    /**
     * POST /sessions/:id/github/update-branch
     * Update the PR branch with the latest base branch changes.
     */
    app.post('/sessions/:id/github/update-branch', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const result = requireSessionFromParam(c, engine)
        if (result instanceof Response) return result

        const { session } = result
        const namespace = c.get('namespace')
        const metadata = session.metadata as SessionMetadataShape | undefined

        const repoUrl = metadata?.repositoryUrl
        if (!repoUrl) return c.json({ error: 'No repository URL' }, 400)

        const parsed = parseGitHubRepo(repoUrl)
        if (!parsed) return c.json({ error: 'Not a GitHub repository' }, 400)

        const token = resolveGitHubToken(engine, namespace)
        if (!token) return c.json({ error: 'No GitHub token' }, 401)

        const { owner, repo } = parsed
        const branch = metadata?.workspaceBranch ?? metadata?.worktree?.branch

        let prNumber: number | null = null
        if (metadata?.pullRequestUrl) {
            const match = metadata.pullRequestUrl.match(/\/pull\/(\d+)/)
            if (match) prNumber = parseInt(match[1], 10)
        }
        if (!prNumber && branch) {
            const prs = await githubFetch(
                `/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open&per_page=1`,
                token
            )
            if (Array.isArray(prs) && prs.length > 0) prNumber = prs[0].number
        }

        if (!prNumber) return c.json({ error: 'No PR found' }, 404)

        try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/update-branch`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'haqi-hub',
                    'Content-Type': 'application/json'
                }
            })

            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                return c.json({ error: (body as any).message ?? `HTTP ${res.status}` }, res.status as any)
            }

            return c.json({ updated: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Update failed' }, 502)
        }
    })

    /**
     * GET /sessions/:id/github/repos
     * List repositories accessible with the namespace's GitHub token.
     * Used for the repo picker UI.
     */
    app.get('/sessions/:id/github/repos', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const namespace = c.get('namespace')
        const token = resolveGitHubToken(engine, namespace)
        if (!token) return c.json({ error: 'No GitHub token' }, 401)

        try {
            const repos = await githubFetch('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', token)
            return c.json({
                repos: (repos as any[]).map(r => ({
                    fullName: r.full_name,
                    name: r.name,
                    owner: r.owner?.login,
                    private: r.private,
                    url: r.html_url,
                    cloneUrl: r.clone_url,
                    defaultBranch: r.default_branch,
                    updatedAt: r.updated_at
                }))
            })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Failed to list repos' }, 502)
        }
    })

    return app
}
