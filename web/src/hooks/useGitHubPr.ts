import { useState, useEffect, useCallback } from 'react'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'
import type { PrInfo, CiCheck, CommitInfo, FileChange, BranchStatus } from '@/components/RunWorkbench/types'

type GitHubPrData = {
    prInfo: PrInfo | null
    checks: CiCheck[]
    commits: CommitInfo[]
    files: FileChange[]
    branchStatus: BranchStatus | null
    isLoading: boolean
    error: string | null
    refetch: () => void
}

/**
 * Hook to fetch GitHub PR data for a session via the hub API proxy.
 */
export function useGitHubPr(api: ApiClient | null, session: Session | null): GitHubPrData {
    const [prInfo, setPrInfo] = useState<PrInfo | null>(null)
    const [checks, setChecks] = useState<CiCheck[]>([])
    const [commits, setCommits] = useState<CommitInfo[]>([])
    const [files, setFiles] = useState<FileChange[]>([])
    const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const repositoryUrl = session?.metadata?.repositoryUrl
    const branch = session?.metadata?.workspaceBranch ?? session?.metadata?.worktree?.branch
    const sessionId = session?.id

    const fetchPrData = useCallback(async () => {
        if (!api || !sessionId || !repositoryUrl) return

        setIsLoading(true)
        setError(null)

        try {
            const data = await api.getGitHubPr(sessionId)

            if (data.error && !data.pr) {
                // Non-fatal — just means no PR data available
                setIsLoading(false)
                return
            }

            if (data.pr) {
                setPrInfo({
                    number: data.pr.number,
                    title: data.pr.title,
                    state: data.pr.merged ? 'merged' : data.pr.draft ? 'draft' : data.pr.state,
                    url: data.pr.html_url,
                    branch: data.pr.head?.ref ?? branch ?? '',
                    baseBranch: data.pr.base?.ref ?? 'main',
                    additions: data.pr.additions ?? 0,
                    deletions: data.pr.deletions ?? 0,
                    changedFiles: data.pr.changed_files ?? 0,
                    mergeable: data.pr.mergeable ?? false,
                    mergeBlockedReason: data.pr.mergeable_state === 'blocked'
                        ? 'Merge blocked: required status checks are failing'
                        : undefined
                })
            }

            if (data.checks?.length) {
                setChecks(data.checks.map((c: any) => ({
                    name: c.name ?? c.context,
                    status: c.conclusion === 'success' ? 'success'
                        : c.conclusion === 'failure' ? 'failure'
                        : c.status === 'completed' ? 'neutral'
                        : 'pending',
                    url: c.details_url ?? c.target_url
                })))
            }

            if (data.commits?.length) {
                setCommits(data.commits.map((c: any) => ({
                    sha: c.sha,
                    message: c.commit?.message ?? c.message ?? '',
                    author: c.commit?.author?.name ?? c.author?.login ?? '',
                    date: c.commit?.author?.date
                        ? new Date(c.commit.author.date).toLocaleDateString()
                        : ''
                })))
            }

            if (data.files?.length) {
                setFiles(data.files.map((f: any) => ({
                    filename: f.filename,
                    status: f.status === 'added' ? 'added'
                        : f.status === 'removed' ? 'removed'
                        : f.status === 'renamed' ? 'renamed'
                        : 'modified',
                    additions: f.additions ?? 0,
                    deletions: f.deletions ?? 0,
                    patch: f.patch
                })))
            }

            if (data.branchStatus) {
                setBranchStatus({
                    behind: data.branchStatus.behind_by ?? 0,
                    ahead: data.branchStatus.ahead_by ?? 0
                })
            }
        } catch (err) {
            // Silently handle — PR data is optional
            setError(err instanceof Error ? err.message : 'Failed to fetch PR data')
        } finally {
            setIsLoading(false)
        }
    }, [api, sessionId, repositoryUrl, branch])

    useEffect(() => {
        void fetchPrData()
    }, [fetchPrData])

    return { prInfo, checks, commits, files, branchStatus, isLoading, error, refetch: fetchPrData }
}
