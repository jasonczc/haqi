import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    CursorSearchField,
    CursorSelectButton,
    CursorSettingsCard,
    CursorTextLink,
    CursorTextField,
} from '@/components/settings/CursorSettingsPrimitives'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'

type RepoItem = {
    fullName: string
    name: string
    owner: string
    private: boolean
    url: string
    cloneUrl: string
    defaultBranch: string
    updatedAt: string
}

type RepoGroup = {
    owner: string
    repos: RepoItem[]
}

/**
 * Cursor-style repository picker dropdown.
 * Fetches repos via GitHub API, groups by owner/org, supports search.
 * Falls back to manual URL input if no GitHub token is configured.
 */
export function RepoPicker(props: {
    value: string
    onChange: (url: string) => void
    disabled?: boolean
    /** Session ID to use for the GitHub API call. Optional — falls back to manual input. */
    sessionId?: string
}) {
    const { api } = useAppContext()
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [manualMode, setManualMode] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)

    // Fetch repos from GitHub via hub proxy
    const reposQuery = useQuery({
        queryKey: [...queryKeys.cloudRequests, 'github-repos', props.sessionId],
        enabled: Boolean(api) && Boolean(props.sessionId) && isOpen && !manualMode,
        queryFn: async () => {
            if (!api || !props.sessionId) throw new Error('Unavailable')
            return await api.listGitHubRepos(props.sessionId)
        },
        staleTime: 60_000,
        retry: false
    })

    const hasRepos = Boolean(reposQuery.data?.repos?.length)
    const isError = Boolean(reposQuery.error)

    // If GitHub API fails (no token), auto-switch to manual mode
    useEffect(() => {
        if (isError && !manualMode) {
            setManualMode(true)
        }
    }, [isError, manualMode])

    // Group repos by owner
    const groups = useMemo<RepoGroup[]>(() => {
        const repos = reposQuery.data?.repos ?? []
        const filtered = search
            ? repos.filter(r =>
                r.fullName.toLowerCase().includes(search.toLowerCase()) ||
                r.name.toLowerCase().includes(search.toLowerCase())
            )
            : repos

        const groupMap = new Map<string, RepoItem[]>()
        for (const repo of filtered) {
            const existing = groupMap.get(repo.owner)
            if (existing) existing.push(repo)
            else groupMap.set(repo.owner, [repo])
        }
        return Array.from(groupMap.entries()).map(([owner, repos]) => ({ owner, repos }))
    }, [reposQuery.data, search])

    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [isOpen])

    // Focus search on open
    useEffect(() => {
        if (isOpen && searchRef.current) {
            searchRef.current.focus()
        }
    }, [isOpen])

    const selectedName = useMemo(() => {
        if (!props.value) return null
        // Try to extract repo name from URL
        const match = props.value.match(/github\.com[/:]([^/]+\/[^/.]+)/)
        return match ? match[1] : props.value
    }, [props.value])

    const handleSelect = (repo: RepoItem) => {
        props.onChange(repo.cloneUrl)
        setIsOpen(false)
        setSearch('')
    }

    // Manual mode — just show a text input
    if (manualMode || !props.sessionId) {
        return (
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className="text-[12px] leading-4 font-medium text-[var(--text-secondary)]">
                        Repository URL
                    </label>
                    {props.sessionId && (
                        <CursorTextLink
                            href="#"
                            onClick={(event) => {
                                event.preventDefault()
                                setManualMode(false)
                                setIsOpen(true)
                            }}
                        >
                            Browse repos
                        </CursorTextLink>
                    )}
                </div>
                <CursorTextField
                    type="url"
                    value={props.value}
                    onChange={(e) => props.onChange(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    disabled={props.disabled}
                />
            </div>
        )
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="flex flex-col gap-1.5">
                <label className="text-[12px] leading-4 font-medium text-[var(--text-secondary)]">
                    Repository
                </label>
                {/* Trigger button — Cursor style */}
                <CursorSelectButton
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    disabled={props.disabled}
                    className="w-full"
                >
                    <span className={selectedName ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}>
                        {selectedName ?? 'Select repository'}
                    </span>
                </CursorSelectButton>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <CursorSettingsCard className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[320px] overflow-hidden border-[var(--border-secondary)] shadow-[0_16px_40px_var(--shadow-tertiary)]">
                    {/* Search */}
                    <div className="border-b border-[var(--border-tertiary)] px-3 py-2">
                        <CursorSearchField
                            ref={searchRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search repositories..."
                            compact
                            className="border-0 px-0 py-0"
                        />
                    </div>

                    {/* Repo list */}
                    <div className="max-h-[240px] overflow-y-auto">
                        {reposQuery.isLoading ? (
                            <div className="flex items-center justify-center py-6 text-sm text-[var(--text-tertiary)]">
                                Loading repositories...
                            </div>
                        ) : !hasRepos ? (
                            <div className="flex items-center justify-center py-6 text-sm text-[var(--text-tertiary)]">
                                No repositories found.
                            </div>
                        ) : (
                            groups.map(group => (
                                <div key={group.owner}>
                                    {groups.length > 1 && (
                                        <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-[var(--text-tertiary)]">
                                            {group.owner}
                                        </div>
                                    )}
                                    {group.repos.map(repo => (
                                        <button
                                            key={repo.fullName}
                                            type="button"
                                            onClick={() => handleSelect(repo)}
                                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-quaternary)] ${
                                                props.value === repo.cloneUrl ? 'bg-[var(--bg-quaternary)]' : ''
                                            }`}
                                        >
                                            <span className="flex-1 truncate font-medium text-[var(--text-primary)]">
                                                {repo.name}
                                            </span>
                                            {repo.private && (
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                    <path d="M7 11V7a5 5 0 0110 0v4" />
                                                </svg>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer actions */}
                    <div className="border-t border-[var(--border-tertiary)] px-3 py-2">
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setManualMode(true)}
                                className="text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                            >
                                Enter URL manually
                            </button>
                            <CursorTextLink
                                href="https://github.com/settings/installations"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                                </svg>
                                Add repositories
                            </CursorTextLink>
                        </div>
                    </div>
                </CursorSettingsCard>
            )}
        </div>
    )
}
