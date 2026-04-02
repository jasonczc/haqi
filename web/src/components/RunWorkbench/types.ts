export type WorkbenchTab = 'plan' | 'setup' | 'secrets' | 'git' | 'desktop' | 'terminal'
export type GitSubTab = 'diff' | 'review' | 'commits'

export type PrState = 'open' | 'closed' | 'merged' | 'draft'

export type PrInfo = {
    number: number
    title: string
    state: PrState
    url: string
    branch: string
    baseBranch: string
    additions: number
    deletions: number
    changedFiles: number
    mergeable: boolean
    mergeBlockedReason?: string
}

export type CiCheck = {
    name: string
    status: 'success' | 'failure' | 'pending' | 'neutral'
    url?: string
}

export type CommitInfo = {
    sha: string
    message: string
    author: string
    date: string
}

export type FileChange = {
    filename: string
    status: 'added' | 'modified' | 'removed' | 'renamed'
    additions: number
    deletions: number
    patch?: string
}

export type BranchStatus = {
    behind: number
    ahead: number
}
