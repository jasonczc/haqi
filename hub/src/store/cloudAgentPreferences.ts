import type { Database } from 'bun:sqlite'

export type StoredCloudAgentPreferences = {
    namespace: string
    userId: number
    gitName: string | null
    gitEmail: string | null
    githubUsername: string | null
    branchPrefix: string | null
    baseBranch: string | null
    defaultRepositoryUrl: string | null
    createdAt: number
    updatedAt: number
}

type PreferenceRow = {
    namespace: string
    user_id: number
    git_name: string | null
    git_email: string | null
    github_username: string | null
    branch_prefix: string | null
    base_branch: string | null
    default_repository_url: string | null
    created_at: number
    updated_at: number
}

function trimOrNull(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function mapRow(row: PreferenceRow | null | undefined): StoredCloudAgentPreferences | null {
    if (!row) return null
    return {
        namespace: row.namespace,
        userId: row.user_id,
        gitName: row.git_name,
        gitEmail: row.git_email,
        githubUsername: row.github_username,
        branchPrefix: row.branch_prefix,
        baseBranch: row.base_branch,
        defaultRepositoryUrl: row.default_repository_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function getCloudAgentPreferences(
    db: Database,
    namespace: string,
    userId: number
): StoredCloudAgentPreferences | null {
    const row = db.prepare(`
        SELECT
            namespace,
            user_id,
            git_name,
            git_email,
            github_username,
            branch_prefix,
            base_branch,
            default_repository_url,
            created_at,
            updated_at
        FROM cloud_agent_preferences
        WHERE namespace = ? AND user_id = ?
    `).get(namespace, userId) as PreferenceRow | null | undefined
    return mapRow(row)
}

export function upsertCloudAgentPreferences(
    db: Database,
    namespace: string,
    userId: number,
    updates: {
        gitName?: string | null
        gitEmail?: string | null
        githubUsername?: string | null
        branchPrefix?: string | null
        baseBranch?: string | null
        defaultRepositoryUrl?: string | null
    }
): StoredCloudAgentPreferences {
    const now = Date.now()
    const current = getCloudAgentPreferences(db, namespace, userId)

    db.prepare(`
        INSERT INTO cloud_agent_preferences (
            namespace,
            user_id,
            git_name,
            git_email,
            github_username,
            branch_prefix,
            base_branch,
            default_repository_url,
            created_at,
            updated_at
        ) VALUES (
            @namespace,
            @user_id,
            @git_name,
            @git_email,
            @github_username,
            @branch_prefix,
            @base_branch,
            @default_repository_url,
            @created_at,
            @updated_at
        )
        ON CONFLICT(namespace, user_id) DO UPDATE SET
            git_name = excluded.git_name,
            git_email = excluded.git_email,
            github_username = excluded.github_username,
            branch_prefix = excluded.branch_prefix,
            base_branch = excluded.base_branch,
            default_repository_url = excluded.default_repository_url,
            updated_at = excluded.updated_at
    `).run({
        namespace,
        user_id: userId,
        git_name: updates.gitName !== undefined ? trimOrNull(updates.gitName) : (current?.gitName ?? null),
        git_email: updates.gitEmail !== undefined ? trimOrNull(updates.gitEmail) : (current?.gitEmail ?? null),
        github_username: updates.githubUsername !== undefined ? trimOrNull(updates.githubUsername) : (current?.githubUsername ?? null),
        branch_prefix: updates.branchPrefix !== undefined ? trimOrNull(updates.branchPrefix) : (current?.branchPrefix ?? null),
        base_branch: updates.baseBranch !== undefined ? trimOrNull(updates.baseBranch) : (current?.baseBranch ?? null),
        default_repository_url: updates.defaultRepositoryUrl !== undefined ? trimOrNull(updates.defaultRepositoryUrl) : (current?.defaultRepositoryUrl ?? null),
        created_at: current?.createdAt ?? now,
        updated_at: now,
    })

    return getCloudAgentPreferences(db, namespace, userId) ?? {
        namespace,
        userId,
        gitName: trimOrNull(updates.gitName),
        gitEmail: trimOrNull(updates.gitEmail),
        githubUsername: trimOrNull(updates.githubUsername),
        branchPrefix: trimOrNull(updates.branchPrefix),
        baseBranch: trimOrNull(updates.baseBranch),
        defaultRepositoryUrl: trimOrNull(updates.defaultRepositoryUrl),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
    }
}
