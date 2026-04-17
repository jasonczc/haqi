import type { RepositorySpec, RepoSyncPolicy, ResolvedSecret } from '@hapi/protocol/types'
import { resolveRepositoryBaseBranch } from '@hapi/protocol'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, RepositorySyncResult } from '@/cloud/types'
import { applyRepositoryCredential } from '@/cloud/secrets/materializeSecrets'
import { logger } from '@/ui/logger'

/**
 * Fresh-clone contract
 * --------------------
 * Every session open wipes `$REPO_ROOT` and re-clones. This eliminates a
 * whole class of "stuck on main" bugs where a reused workspace container
 * carried a previous session's detached HEAD or managed-branch pointer
 * forward into the next session even after the user picked a new branch.
 *
 * Tradeoff: if a previous session left uncommitted work in the volume,
 * that work is destroyed. In daemon-session containers nobody else is
 * supposed to be writing there between sessions, so this is acceptable.
 * If this ever turns out to bite someone, revisit `repoSyncPolicy` as
 * the opt-in preserve-state path.
 */

function quoteShell(value: string): string {
    if (!value) {
        return "''"
    }
    return `'${value.replace(/'/g, `'\\''`)}'`
}

type ResolvedTarget = {
    target: string
    kind: 'tag' | 'commit' | 'pr' | 'branch' | 'head'
    label: string
    preFetch?: string
}

function resolveTargetExpression(repository: RepositorySpec): ResolvedTarget {
    if (repository.ref?.tag?.trim()) {
        const tag = repository.ref.tag.trim()
        return {
            kind: 'tag',
            label: `tag:${tag}`,
            preFetch: 'git -C "$REPO_ROOT" fetch --tags origin',
            target: `refs/tags/${tag}`
        }
    }
    if (repository.ref?.commit?.trim()) {
        const commit = repository.ref.commit.trim()
        return {
            kind: 'commit',
            label: `commit:${commit}`,
            preFetch: `git -C "$REPO_ROOT" fetch origin ${quoteShell(commit)}`,
            target: commit
        }
    }
    if (repository.ref?.pr?.trim()) {
        const pr = repository.ref.pr.trim()
        return {
            kind: 'pr',
            label: `pr:${pr}`,
            preFetch: `git -C "$REPO_ROOT" fetch origin ${quoteShell(`refs/pull/${pr}/head:refs/remotes/origin/haqi-pr-${pr}`)}`,
            target: `refs/remotes/origin/haqi-pr-${pr}`
        }
    }
    const baseBranch = resolveRepositoryBaseBranch(repository)
    if (baseBranch) {
        return {
            kind: 'branch',
            label: `branch:${baseBranch}`,
            preFetch: `git -C "$REPO_ROOT" fetch origin ${quoteShell(baseBranch)}`,
            target: `origin/${baseBranch}`
        }
    }
    return {
        kind: 'head',
        label: 'HEAD',
        target: 'HEAD'
    }
}

function buildRepositorySyncScript(params: {
    repository: RepositorySpec
    workspace: PreparedWorkspace
    authenticatedUrl: string
    resolved: ResolvedTarget
}): string {
    const repoRoot = params.workspace.repoVolumePath
    const workspaceBranch = params.workspace.workspaceBranch
    const baseBranch = resolveRepositoryBaseBranch(params.repository) ?? ''
    const { target, preFetch, label } = params.resolved

    const script: string[] = [
        'set -eu',
        `REPO_ROOT=${quoteShell(repoRoot)}`,
        `WORKSPACE_BRANCH=${quoteShell(workspaceBranch ?? '')}`,
        `BASE_BRANCH=${quoteShell(baseBranch)}`,
        `TARGET=${quoteShell(target)}`,
        `TARGET_LABEL=${quoteShell(label)}`,
        `REMOTE_URL=${quoteShell(params.repository.url)}`,
        `AUTH_REMOTE_URL=${quoteShell(params.authenticatedUrl)}`,
        // Breadcrumb so operators can grep the runner log and see exactly
        // what this session was supposed to land on before any git runs.
        'echo "[haqi-sync] repoRoot=$REPO_ROOT workspaceBranch=$WORKSPACE_BRANCH baseBranch=$BASE_BRANCH target=$TARGET_LABEL" >&2',
        // Fresh-clone contract: nuke whatever the previous session left
        // behind so sticky branch state never survives across opens.
        'if [ -d "$REPO_ROOT" ]; then',
        '  echo "[haqi-sync] removing existing $REPO_ROOT for fresh clone" >&2',
        '  rm -rf "$REPO_ROOT"',
        'fi',
        'mkdir -p "$REPO_ROOT"',
        `git clone ${params.repository.cloneDepth ? `--depth ${params.repository.cloneDepth} ` : ''}"$AUTH_REMOTE_URL" "$REPO_ROOT"`
    ]

    if (preFetch) {
        script.push(preFetch)
    }

    if (workspaceBranch) {
        script.push(`git -C "$REPO_ROOT" checkout -B "$WORKSPACE_BRANCH" ${quoteShell(target)}`)
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

    // Final breadcrumb: actual resolved commit + branch so we can confirm
    // what the agent will see without having to exec into the container.
    script.push(
        'RESOLVED_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"',
        'RESOLVED_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"',
        'echo "[haqi-sync] ready commit=$RESOLVED_COMMIT branch=$RESOLVED_BRANCH" >&2',
        'printf "%s" "$RESOLVED_COMMIT"'
    )
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
    const resolved = resolveTargetExpression(params.repository)
    const baseBranch = resolveRepositoryBaseBranch(params.repository)

    logger.debug(
        `[haqi-sync] starting sync container=${params.containerId.slice(0, 12)} workspaceBranch=${params.workspace.workspaceBranch ?? '(detached)'} baseBranch=${baseBranch ?? '(repo HEAD)'} target=${resolved.label}`
    )

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
                resolved
            })
        ]
    })

    const repositoryCommit = result.stdout.trim().split('\n').at(-1)?.trim()
    logger.debug(
        `[haqi-sync] done container=${params.containerId.slice(0, 12)} commit=${repositoryCommit ?? '?'} workspaceBranch=${params.workspace.workspaceBranch ?? '(detached)'}`
    )
    return {
        repoStatus: 'clean',
        repositoryCommit: repositoryCommit || undefined,
        branch: params.workspace.workspaceBranch ?? baseBranch
    }
}
