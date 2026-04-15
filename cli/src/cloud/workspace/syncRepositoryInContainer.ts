import type { RepositorySpec, RepoSyncPolicy, ResolvedSecret } from '@hapi/protocol/types'
import { resolveRepositoryBaseBranch } from '@hapi/protocol'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, RepositorySyncResult } from '@/cloud/types'
import { applyRepositoryCredential } from '@/cloud/secrets/materializeSecrets'

const DIRTY_WORKSPACE_EXIT_CODE = 91
const DIRTY_WORKSPACE_MARKER = '__HAQI_WORKSPACE_DIRTY__'

function quoteShell(value: string): string {
    if (!value) {
        return "''"
    }
    return `'${value.replace(/'/g, `'\\''`)}'`
}

function resolveTargetExpression(repository: RepositorySpec): {
    target: string
    preFetch?: string
} {
    if (repository.ref?.tag?.trim()) {
        const tag = repository.ref.tag.trim()
        return {
            preFetch: 'git -C "$REPO_ROOT" fetch --tags origin',
            target: `refs/tags/${tag}`
        }
    }
    if (repository.ref?.commit?.trim()) {
        const commit = repository.ref.commit.trim()
        return {
            preFetch: `git -C "$REPO_ROOT" fetch origin ${quoteShell(commit)}`,
            target: commit
        }
    }
    if (repository.ref?.pr?.trim()) {
        const pr = repository.ref.pr.trim()
        return {
            preFetch: `git -C "$REPO_ROOT" fetch origin ${quoteShell(`refs/pull/${pr}/head:refs/remotes/origin/haqi-pr-${pr}`)}`,
            target: `refs/remotes/origin/haqi-pr-${pr}`
        }
    }
    const baseBranch = resolveRepositoryBaseBranch(repository)
    if (baseBranch) {
        return {
            preFetch: `git -C "$REPO_ROOT" fetch origin ${quoteShell(baseBranch)}`,
            target: `origin/${baseBranch}`
        }
    }
    return {
        target: 'HEAD'
    }
}

function buildRepositorySyncScript(params: {
    repository: RepositorySpec
    workspace: PreparedWorkspace
    authenticatedUrl: string
    repoSyncPolicy: RepoSyncPolicy
}): string {
    const repoRoot = params.workspace.repoVolumePath
    const workspaceBranch = params.workspace.workspaceBranch
    const { target, preFetch } = resolveTargetExpression(params.repository)
    const script: string[] = [
        'set -eu',
        `REPO_ROOT=${quoteShell(repoRoot)}`,
        `WORKSPACE_BRANCH=${quoteShell(workspaceBranch ?? '')}`,
        `REMOTE_URL=${quoteShell(params.repository.url)}`,
        `AUTH_REMOTE_URL=${quoteShell(params.authenticatedUrl)}`,
        'mkdir -p "$REPO_ROOT"',
        'if [ ! -d "$REPO_ROOT/.git" ]; then',
        '  rm -rf "$REPO_ROOT"/* "$REPO_ROOT"/.[!.]* 2>/dev/null || true',
        `  git clone ${params.repository.cloneDepth ? `--depth ${params.repository.cloneDepth} ` : ''}"$AUTH_REMOTE_URL" "$REPO_ROOT"`,
        'else',
        '  git -C "$REPO_ROOT" update-index -q --refresh || true',
        '  if ! git -C "$REPO_ROOT" diff --quiet --ignore-submodules -- || ! git -C "$REPO_ROOT" diff --cached --quiet --ignore-submodules -- || [ -n "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard)" ]; then',
        `    echo ${quoteShell(DIRTY_WORKSPACE_MARKER)} >&2`,
        `    exit ${DIRTY_WORKSPACE_EXIT_CODE}`,
        '  fi',
        '  if [ "$AUTH_REMOTE_URL" != "$REMOTE_URL" ]; then',
        '    git -C "$REPO_ROOT" remote set-url origin "$AUTH_REMOTE_URL"',
        '  fi',
        '  git -C "$REPO_ROOT" fetch --all --prune',
        'fi'
    ]

    if (preFetch) {
        script.push(preFetch)
    }

    if (workspaceBranch) {
        if (params.repoSyncPolicy === 'fetch-reset') {
            script.push(
                `git -C "$REPO_ROOT" checkout -B "$WORKSPACE_BRANCH" ${quoteShell(target)}`,
                `git -C "$REPO_ROOT" reset --hard ${quoteShell(target)}`
            )
        } else {
            script.push(`git -C "$REPO_ROOT" checkout -B "$WORKSPACE_BRANCH" ${quoteShell(target)}`)
        }
    } else if (params.repoSyncPolicy === 'fetch-reset') {
        script.push(
            `git -C "$REPO_ROOT" checkout --detach ${quoteShell(target)}`,
            `git -C "$REPO_ROOT" reset --hard ${quoteShell(target)}`
        )
    } else {
        script.push(`git -C "$REPO_ROOT" checkout --detach ${quoteShell(target)}`)
    }

    if (params.repository.withSubmodules) {
        script.push('git -C "$REPO_ROOT" submodule update --init --recursive')
    }

    if (params.repository.withLfs) {
        script.push(
            'git -C "$REPO_ROOT" lfs install --local',
            'git -C "$REPO_ROOT" lfs pull'
        )
    }

    script.push(
        'if [ "$AUTH_REMOTE_URL" != "$REMOTE_URL" ]; then',
        '  git -C "$REPO_ROOT" remote set-url origin "$REMOTE_URL"',
        'fi'
    )

    script.push('git -C "$REPO_ROOT" rev-parse HEAD')
    return script.join('\n')
}

export async function syncRepositoryInContainer(params: {
    runtime: DockerCliRuntime
    containerId: string
    workspace: PreparedWorkspace
    repository: RepositorySpec
    repoSyncPolicy?: RepoSyncPolicy
    repositoryCredential?: ResolvedSecret
    user?: string
    home?: string
}): Promise<RepositorySyncResult> {
    const authenticatedUrl = applyRepositoryCredential(params.repository.url, params.repositoryCredential)
    const result = await params.runtime.exec({
        containerId: params.containerId,
        user: params.user,
        workingDir: params.workspace.repoVolumePath,
        env: [
            ...(params.home ? [`HOME=${params.home}`] : []),
            ...(params.user ? [`USER=${params.user}`, `LOGNAME=${params.user}`] : [])
        ],
        command: [
            'sh',
            '-lc',
            buildRepositorySyncScript({
                repository: params.repository,
                workspace: params.workspace,
                authenticatedUrl,
                repoSyncPolicy: params.repoSyncPolicy ?? 'fetch-reset'
            })
        ]
    }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        if (
            message.includes(DIRTY_WORKSPACE_MARKER)
            || message.includes(`exit ${DIRTY_WORKSPACE_EXIT_CODE}`)
            || message.includes(`status ${DIRTY_WORKSPACE_EXIT_CODE}`)
        ) {
            const dirtyError = new Error('workspace_dirty_requires_resume')
            ;(dirtyError as Error & { code?: string }).code = 'workspace_dirty_requires_resume'
            throw dirtyError
        }
        throw error
    })

    const repositoryCommit = result.stdout.trim().split('\n').at(-1)?.trim()
    return {
        repoStatus: 'clean',
        repositoryCommit: repositoryCommit || undefined,
        branch: params.workspace.workspaceBranch ?? resolveRepositoryBaseBranch(params.repository)
    }
}
