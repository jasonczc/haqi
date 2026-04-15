import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { CloudSpawnRequest, CloudWorkspace } from '@hapi/protocol/types'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useCloudEnvironments } from '@/hooks/queries/useCloudEnvironments'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import CloudWorkersManager from '@/routes/settings/cloud-workers'
import CloudSecretsManager from '@/routes/settings/cloud-secrets'
import { CloudRequestDetailContent } from '@/routes/settings/request-detail'
import { CloudWorkspaceDetailContent } from '@/routes/settings/workspace-detail'
import {
    CursorButton,
    CursorDialogBody,
    CursorDialogFooter,
    CursorDialogHeader,
    CursorDialogShell,
    CursorEmptyState,
    CursorExpandableRow,
    CursorFieldHint,
    CursorFieldLabel,
    CursorNotice,
    CursorSelect,
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsSection,
    CursorTextArea,
    CursorTextField,
} from '@/components/settings/CursorSettingsPrimitives'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

type BranchMode = 'create' | 'reuse' | 'detached'
type AgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
type ActivityFilter = 'all' | 'requests' | 'workspaces'
type ActivityItem =
    | { kind: 'request'; id: string; updatedAt: number; request: CloudSpawnRequest }
    | { kind: 'workspace'; id: string; updatedAt: number; workspace: CloudWorkspace }

const DEFAULT_BRANCH_PREFIX = 'haqi/'
const DEFAULT_BASE_BRANCH = 'main'

const AGENT_OPTIONS: Array<{ value: AgentFlavor; label: string }> = [
    { value: 'cursor', label: 'Cursor' },
    { value: 'claude', label: 'Claude' },
    { value: 'codex', label: 'Codex' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'opencode', label: 'OpenCode' },
]

function formatDate(ts: number | undefined | null): string {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
        return 'unknown'
    }
    return new Date(ts).toLocaleString()
}

function formatRelativeTime(ts: number | undefined | null): string {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
        return 'unknown'
    }
    const deltaSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
    if (deltaSeconds < 60) return `${deltaSeconds}s ago`
    const deltaMinutes = Math.floor(deltaSeconds / 60)
    if (deltaMinutes < 60) return `${deltaMinutes}m ago`
    const deltaHours = Math.floor(deltaMinutes / 60)
    if (deltaHours < 24) return `${deltaHours}h ago`
    const deltaDays = Math.floor(deltaHours / 24)
    return `${deltaDays}d ago`
}

function RequestPhaseBadge(props: { phase: string }) {
    const toneMap: Record<string, 'default' | 'success' | 'danger' | 'accent'> = {
        succeeded: 'success',
        failed: 'danger',
        canceled: 'default',
        accepted: 'accent',
        pending: 'accent',
        scheduling: 'accent',
        provisioning: 'accent',
        starting: 'accent',
        'injecting-env': 'accent',
        'cloning-repo': 'accent',
        'creating-branch': 'accent',
        'configuring-git-identity': 'accent',
        'running-install': 'accent',
        'running-start': 'accent',
    }
    return (
        <CursorSettingsBadge tone={toneMap[props.phase] ?? 'default'} className="rounded-full">
            {props.phase}
        </CursorSettingsBadge>
    )
}

function WorkspaceStatusBadge(props: { status: string }) {
    const toneMap: Record<string, 'default' | 'success' | 'danger' | 'accent'> = {
        ready: 'success',
        active: 'success',
        provisioning: 'accent',
        starting: 'accent',
        stopped: 'default',
        failed: 'danger',
    }
    return (
        <CursorSettingsBadge tone={toneMap[props.status] ?? 'default'} className="rounded-full">
            {props.status}
        </CursorSettingsBadge>
    )
}

function SummaryMetric(props: {
    label: string
    value: string
    hint?: string
}) {
    return (
        <div className="rounded-xl border border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-card)] p-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">{props.label}</div>
            <div className="mt-2 text-[24px] font-semibold leading-8 text-[var(--cursor-text-primary)]">{props.value}</div>
            {props.hint ? (
                <div className="mt-1 text-[12px] leading-4 text-[var(--cursor-text-secondary)]">{props.hint}</div>
            ) : null}
        </div>
    )
}

function buildActivityItems(requests: CloudSpawnRequest[], workspaces: CloudWorkspace[]): ActivityItem[] {
    return [
        ...requests.map((request) => ({
            kind: 'request' as const,
            id: request.id,
            updatedAt: request.updatedAt,
            request
        })),
        ...workspaces.map((workspace) => ({
            kind: 'workspace' as const,
            id: workspace.id,
            updatedAt: workspace.updatedAt,
            workspace
        }))
    ].sort((a, b) => b.updatedAt - a.updatedAt)
}

export default function SettingsCloudAgentsPage(props: {
    selectedRequestId?: string
    selectedWorkspaceId?: string
}) {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { environments, isLoading: environmentsLoading } = useCloudEnvironments(api, true)
    const { spawnSession, isPending: spawnPending, error: spawnError } = useSpawnSession(api)

    const [gitNameDraft, setGitNameDraft] = useState('')
    const [gitEmailDraft, setGitEmailDraft] = useState('')
    const [branchPrefixDraft, setBranchPrefixDraft] = useState(DEFAULT_BRANCH_PREFIX)
    const [baseBranchDraft, setBaseBranchDraft] = useState('')
    const [defaultRepositoryUrlDraft, setDefaultRepositoryUrlDraft] = useState('')
    const [settingsStatus, setSettingsStatus] = useState<string | null>(null)
    const [githubTokenDraft, setGitHubTokenDraft] = useState('')
    const [githubStatus, setGitHubStatus] = useState<string | null>(null)

    const [promptDraft, setPromptDraft] = useState('')
    const [selectedAgent, setSelectedAgent] = useState<AgentFlavor>('cursor')
    const [repositorySearch, setRepositorySearch] = useState('')
    const [repositoryUrlDraft, setRepositoryUrlDraft] = useState('')
    const [repositoryBranchDraft, setRepositoryBranchDraft] = useState('')
    const [branchModeDraft, setBranchModeDraft] = useState<BranchMode>('create')
    const [branchPrefixOverride, setBranchPrefixOverride] = useState(DEFAULT_BRANCH_PREFIX)
    const [branchNameDraft, setBranchNameDraft] = useState('')
    const [gitNameOverride, setGitNameOverride] = useState('')
    const [gitEmailOverride, setGitEmailOverride] = useState('')
    const [environmentIdDraft, setEnvironmentIdDraft] = useState('')
    const [checkpointIdDraft, setCheckpointIdDraft] = useState('')
    const [launchStatus, setLaunchStatus] = useState<string | null>(null)
    const [newAgentOpen, setNewAgentOpen] = useState(false)
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
    const detailOpen = Boolean(props.selectedRequestId || props.selectedWorkspaceId)

    const settingsHydratedRef = useRef(false)
    const launchHydratedRef = useRef(false)

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api),
        refetchInterval: 10_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkers()
        }
    })

    const requestsQuery = useQuery({
        queryKey: queryKeys.cloudRequests,
        enabled: Boolean(api),
        refetchInterval: 5_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudRequests(12)
        }
    })

    const workspacesQuery = useQuery({
        queryKey: queryKeys.cloudWorkspaces,
        enabled: Boolean(api),
        refetchInterval: 10_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkspaces(12)
        }
    })

    const checkpointsQuery = useQuery({
        queryKey: queryKeys.cloudCheckpoints,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudCheckpoints()
        }
    })

    const cloudAgentSettingsQuery = useQuery({
        queryKey: queryKeys.cloudAgentSettings,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudAgentSettings()
        }
    })

    const githubReposQuery = useQuery({
        queryKey: queryKeys.cloudAgentGitHubRepos,
        enabled: Boolean(api) && Boolean(cloudAgentSettingsQuery.data?.github?.connected),
        staleTime: 60_000,
        retry: false,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudAgentGitHubRepos()
        }
    })

    useEffect(() => {
        const settings = cloudAgentSettingsQuery.data?.settings
        if (!settings || settingsHydratedRef.current) {
            return
        }
        settingsHydratedRef.current = true
        setGitNameDraft(settings.gitName)
        setGitEmailDraft(settings.gitEmail)
        setBranchPrefixDraft(settings.branchPrefix || DEFAULT_BRANCH_PREFIX)
        setBaseBranchDraft(settings.baseBranch)
        setDefaultRepositoryUrlDraft(settings.defaultRepositoryUrl)
    }, [cloudAgentSettingsQuery.data?.settings])

    useEffect(() => {
        const settings = cloudAgentSettingsQuery.data?.settings
        if (!settings || launchHydratedRef.current) {
            return
        }
        launchHydratedRef.current = true
        setRepositoryUrlDraft(settings.defaultRepositoryUrl)
        setRepositoryBranchDraft(settings.baseBranch || DEFAULT_BASE_BRANCH)
        setBranchPrefixOverride(settings.branchPrefix || DEFAULT_BRANCH_PREFIX)
        setGitNameOverride(settings.gitName)
        setGitEmailOverride(settings.gitEmail)
    }, [cloudAgentSettingsQuery.data?.settings])

    const saveDefaultsMutation = useMutation({
        mutationFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.updateCloudAgentSettings({
                gitName: gitNameDraft,
                gitEmail: gitEmailDraft,
                branchPrefix: branchPrefixDraft,
                baseBranch: baseBranchDraft,
                defaultRepositoryUrl: defaultRepositoryUrlDraft,
            })
        },
        onSuccess: async (result) => {
            setSettingsStatus('Defaults saved')
            setGitNameDraft(result.settings.gitName)
            setGitEmailDraft(result.settings.gitEmail)
            setBranchPrefixDraft(result.settings.branchPrefix || DEFAULT_BRANCH_PREFIX)
            setBaseBranchDraft(result.settings.baseBranch)
            setDefaultRepositoryUrlDraft(result.settings.defaultRepositoryUrl)
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudAgentSettings })
        },
        onError: (error) => {
            setSettingsStatus(error instanceof Error ? error.message : 'Failed to save defaults')
        }
    })

    const connectGitHubMutation = useMutation({
        mutationFn: async () => {
            if (!api) throw new Error('API unavailable')
            const token = githubTokenDraft.trim()
            if (!token) {
                throw new Error('GitHub token required')
            }
            return await api.connectGitHubForCloudAgents({ token })
        },
        onSuccess: async () => {
            setGitHubTokenDraft('')
            setGitHubStatus('GitHub connected')
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudAgentSettings })
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudAgentGitHubRepos })
        },
        onError: (error) => {
            setGitHubStatus(error instanceof Error ? error.message : 'Failed to connect GitHub')
        }
    })

    const disconnectGitHubMutation = useMutation({
        mutationFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.disconnectGitHubForCloudAgents()
        },
        onSuccess: async () => {
            setGitHubStatus('GitHub disconnected')
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudAgentSettings })
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudAgentGitHubRepos })
        },
        onError: (error) => {
            setGitHubStatus(error instanceof Error ? error.message : 'Failed to disconnect GitHub')
        }
    })

    const requests = (requestsQuery.data?.requests ?? []) as CloudSpawnRequest[]
    const workspaces = (workspacesQuery.data?.workspaces ?? []) as CloudWorkspace[]
    const workers = workersQuery.data?.workers ?? []
    const activeWorkers = workers.filter((worker) => worker.active)
    const githubConnection = cloudAgentSettingsQuery.data?.github
    const githubRepos = githubReposQuery.data?.repos ?? []
    const activityItems = useMemo(() => buildActivityItems(requests, workspaces), [requests, workspaces])
    const filteredActivityItems = useMemo(() => {
        if (activityFilter === 'requests') {
            return activityItems.filter((item) => item.kind === 'request')
        }
        if (activityFilter === 'workspaces') {
            return activityItems.filter((item) => item.kind === 'workspace')
        }
        return activityItems
    }, [activityFilter, activityItems])

    const filteredRepos = useMemo(() => {
        const needle = repositorySearch.trim().toLowerCase()
        if (!needle) {
            return githubRepos.slice(0, 8)
        }
        return githubRepos
            .filter((repo) =>
                repo.fullName.toLowerCase().includes(needle)
                || repo.name.toLowerCase().includes(needle)
                || repo.owner.toLowerCase().includes(needle)
            )
            .slice(0, 8)
    }, [githubRepos, repositorySearch])

    const selectedRepo = useMemo(() => {
        const normalized = repositoryUrlDraft.trim()
        if (!normalized) {
            return null
        }
        return githubRepos.find((repo) => repo.cloneUrl === normalized || repo.url === normalized) ?? null
    }, [githubRepos, repositoryUrlDraft])

    const launchMutation = useMutation({
        mutationFn: async () => {
            const trimmedPrompt = promptDraft.trim()
            const trimmedRepositoryUrl = repositoryUrlDraft.trim()
            const trimmedBranch = repositoryBranchDraft.trim()
            const trimmedCheckpointId = checkpointIdDraft.trim()
            if (!trimmedPrompt) {
                throw new Error('Prompt required')
            }
            if (!trimmedRepositoryUrl && !trimmedCheckpointId && !environmentIdDraft.trim()) {
                throw new Error('Choose a repository, checkpoint, or environment')
            }

            const workspaceSource = trimmedRepositoryUrl
                ? {
                    type: 'repo' as const,
                    repository: {
                        url: trimmedRepositoryUrl,
                        ref: trimmedBranch ? { branch: trimmedBranch } : undefined,
                        branchStrategy: {
                            mode: branchModeDraft,
                            ...(trimmedBranch ? { baseBranch: trimmedBranch } : {}),
                            ...(branchModeDraft === 'create' && branchPrefixOverride.trim()
                                ? { prefix: branchPrefixOverride.trim() }
                                : {}),
                            ...(branchModeDraft === 'create' && branchNameDraft.trim()
                                ? { name: branchNameDraft.trim() }
                                : {})
                        }
                    }
                }
                : undefined

            const environment = environmentIdDraft.trim()
                ? {
                    id: environmentIdDraft.trim(),
                    runtime: {
                        kind: 'daemon-session' as const,
                        checkpointId: trimmedCheckpointId || undefined
                    }
                }
                : {
                    runtime: {
                        kind: 'daemon-session' as const,
                        checkpointId: trimmedCheckpointId || undefined
                    }
                }

            return await spawnSession({
                machineId: 'auto',
                agent: selectedAgent,
                executionBackend: 'cloud-self-hosted',
                runtimeKind: 'daemon-session',
                launchMode: 'background',
                environmentId: environmentIdDraft.trim() || undefined,
                environment,
                checkpointId: trimmedCheckpointId || undefined,
                repoSyncPolicy: 'fetch-reset',
                workspaceSource,
                workspace: { mode: 'ephemeral' },
                initialPrompt: trimmedPrompt,
                gitIdentity: {
                    ...(gitNameOverride.trim() ? { name: gitNameOverride.trim() } : {}),
                    ...(gitEmailOverride.trim() ? { email: gitEmailOverride.trim() } : {}),
                    ...(cloudAgentSettingsQuery.data?.settings.githubUsername?.trim()
                        ? { githubUsername: cloudAgentSettingsQuery.data.settings.githubUsername.trim() }
                        : {})
                }
            })
        },
        onSuccess: async (result) => {
            setLaunchStatus(result.type === 'accepted' ? 'Agent queued' : 'Agent started')
            setNewAgentOpen(false)
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequests })
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkspaces })
            if (result.type === 'accepted') {
                navigate({
                    to: '/agents/requests/$requestId',
                    params: { requestId: result.requestId }
                })
                return
            }
            if (result.type === 'success') {
                navigate({
                    to: '/sessions/$sessionId',
                    params: { sessionId: result.sessionId }
                })
            }
        },
        onError: (error) => {
            setLaunchStatus(error instanceof Error ? error.message : 'Failed to start agent')
        }
    })

    const defaultEnvironment = environments[0]
    const defaultRepo = cloudAgentSettingsQuery.data?.settings.defaultRepositoryUrl
        || defaultEnvironment?.id?.replace(/^repo:/, '')
        || 'No default repository'

    return (
        <>
            <CursorSettingsHeader
                title="Cloud Agents"
                description="GitHub-first background agents. Connect GitHub, choose a repo, bootstrap a branch, and launch daemon-backed workspaces."
            />

            <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1.35fr)_minmax(320px,0.85fr)]">
                <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
                    <CursorSettingsCard className="p-4">
                        <div className="flex flex-col gap-4">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">Workspace</div>
                                <div className="mt-2 text-[16px] font-semibold text-[var(--cursor-text-primary)]">Cloud Agents</div>
                                <div className="mt-1 text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
                                    Standalone background-agent workspace. GitHub-first, daemon-session only.
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <CursorButton type="button" onClick={() => setNewAgentOpen(true)}>
                                    New Agent
                                </CursorButton>
                                <CursorButton
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        if (githubConnection?.connected) {
                                            void githubReposQuery.refetch()
                                            return
                                        }
                                        const field = document.getElementById('cloud-agents-github-token') as HTMLInputElement | null
                                        field?.focus()
                                    }}
                                >
                                    {githubConnection?.connected ? 'Refresh GitHub Repos' : 'Connect GitHub'}
                                </CursorButton>
                            </div>

                            <div className="border-t border-[var(--cursor-stroke-tertiary)] pt-4">
                                <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">Activity views</div>
                                <div className="grid gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActivityFilter('all')}
                                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${activityFilter === 'all' ? 'border-[var(--accent)] bg-[var(--bg-accent-tertiary)] text-[var(--cursor-text-primary)]' : 'border-[var(--cursor-stroke-tertiary)] text-[var(--cursor-text-secondary)] hover:bg-[var(--cursor-bg-hover)]'}`}
                                    >
                                        <span className="text-[13px] font-medium">All activity</span>
                                        <CursorSettingsBadge tone="default">{activityItems.length}</CursorSettingsBadge>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActivityFilter('requests')}
                                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${activityFilter === 'requests' ? 'border-[var(--accent)] bg-[var(--bg-accent-tertiary)] text-[var(--cursor-text-primary)]' : 'border-[var(--cursor-stroke-tertiary)] text-[var(--cursor-text-secondary)] hover:bg-[var(--cursor-bg-hover)]'}`}
                                    >
                                        <span className="text-[13px] font-medium">Requests</span>
                                        <CursorSettingsBadge tone="default">{requests.length}</CursorSettingsBadge>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActivityFilter('workspaces')}
                                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${activityFilter === 'workspaces' ? 'border-[var(--accent)] bg-[var(--bg-accent-tertiary)] text-[var(--cursor-text-primary)]' : 'border-[var(--cursor-stroke-tertiary)] text-[var(--cursor-text-secondary)] hover:bg-[var(--cursor-bg-hover)]'}`}
                                    >
                                        <span className="text-[13px] font-medium">Workspaces</span>
                                        <CursorSettingsBadge tone="default">{workspaces.length}</CursorSettingsBadge>
                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-[var(--cursor-stroke-tertiary)] pt-4">
                                <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">Recent</div>
                                <div className="grid gap-2">
                                    {activityItems.slice(0, 6).map((item) => item.kind === 'request' ? (
                                        <Link
                                            key={`sidebar-request:${item.id}`}
                                            to="/agents/requests/$requestId"
                                            params={{ requestId: item.id }}
                                            className="rounded-lg border border-[var(--cursor-stroke-tertiary)] px-3 py-2 hover:bg-[var(--cursor-bg-hover)]"
                                        >
                                            <div className="flex items-center gap-2">
                                                <RequestPhaseBadge phase={item.request.phase} />
                                                <span className="truncate font-mono text-[11px] text-[var(--cursor-text-primary)]">{item.id}</span>
                                            </div>
                                            <div className="mt-1 truncate text-[12px] text-[var(--cursor-text-secondary)]">
                                                {item.request.request.workspaceSource?.repository?.url ?? 'No repo'}
                                            </div>
                                        </Link>
                                    ) : (
                                        <Link
                                            key={`sidebar-workspace:${item.id}`}
                                            to="/agents/workspaces/$workspaceId"
                                            params={{ workspaceId: item.id }}
                                            className="rounded-lg border border-[var(--cursor-stroke-tertiary)] px-3 py-2 hover:bg-[var(--cursor-bg-hover)]"
                                        >
                                            <div className="flex items-center gap-2">
                                                <WorkspaceStatusBadge status={item.workspace.status} />
                                                <span className="truncate font-mono text-[11px] text-[var(--cursor-text-primary)]">{item.id}</span>
                                            </div>
                                            <div className="mt-1 truncate text-[12px] text-[var(--cursor-text-secondary)]">
                                                {item.workspace.machineId ?? 'pending worker'}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CursorSettingsCard>
                </div>

                <div className="flex min-w-0 flex-col gap-6">
                    <CursorSettingsSection title="GitHub" subtitle="Connection first. Repo picker unlocks after a valid token is stored.">
                        <CursorSettingsCard className="p-5">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-[15px] font-semibold text-[var(--cursor-text-primary)]">
                                                {githubConnection?.connected
                                                    ? `Connected as ${githubConnection.profile?.login ?? 'GitHub user'}`
                                                    : 'GitHub not connected'}
                                            </div>
                                            <CursorSettingsBadge tone={githubConnection?.connected ? 'success' : 'danger'}>
                                                {githubConnection?.connected ? 'Connected' : 'Disconnected'}
                                            </CursorSettingsBadge>
                                        </div>
                                        <div className="mt-1 text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">
                                            PAT-based for now. Used for private repo clone, branch push, and later PR actions.
                                        </div>
                                    </div>
                                    {githubConnection?.connected && githubRepos.length > 0 ? (
                                        <div className="rounded-lg border border-[var(--cursor-stroke-tertiary)] px-3 py-2 text-right">
                                            <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">Repos visible</div>
                                            <div className="text-[18px] font-semibold text-[var(--cursor-text-primary)]">{githubRepos.length}</div>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                    <div className="flex flex-col gap-1.5">
                                        <CursorFieldLabel htmlFor="cloud-agents-github-token">GitHub token</CursorFieldLabel>
                                        <CursorTextField
                                            id="cloud-agents-github-token"
                                            type="password"
                                            value={githubTokenDraft}
                                            onChange={(event) => setGitHubTokenDraft(event.target.value)}
                                            placeholder={githubConnection?.connected ? 'Replace token' : 'github_pat_...'}
                                        />
                                        <CursorFieldHint>
                                            Fine-grained PAT recommended. Minimum: metadata read, contents read/write, pull requests read/write.
                                        </CursorFieldHint>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <CursorButton
                                            type="button"
                                            onClick={() => connectGitHubMutation.mutate()}
                                            disabled={connectGitHubMutation.isPending}
                                        >
                                            {connectGitHubMutation.isPending ? 'Connecting…' : (githubConnection?.connected ? 'Replace Token' : 'Connect GitHub')}
                                        </CursorButton>
                                        {githubConnection?.connected ? (
                                            <CursorButton
                                                type="button"
                                                variant="outline"
                                                onClick={() => disconnectGitHubMutation.mutate()}
                                                disabled={disconnectGitHubMutation.isPending}
                                            >
                                                {disconnectGitHubMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                                            </CursorButton>
                                        ) : null}
                                    </div>
                                </div>

                                {githubStatus ? (
                                    <CursorNotice>{githubStatus}</CursorNotice>
                                ) : null}
                                {githubConnection?.error ? (
                                    <CursorNotice tone="danger">{githubConnection.error}</CursorNotice>
                                ) : null}
                            </div>
                        </CursorSettingsCard>
                    </CursorSettingsSection>

                    <CursorSettingsSection title="Quick Actions" subtitle="Cursor-style flow: connect GitHub, then launch agents from a focused modal instead of a giant settings form.">
                        <CursorSettingsCard className="p-5">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="text-[15px] font-semibold text-[var(--cursor-text-primary)]">New background agent</div>
                                        <div className="mt-1 text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">
                                            Pick repo, branch policy, identity, and bootstrap details in one focused flow.
                                        </div>
                                    </div>
                                    <CursorButton
                                        type="button"
                                        onClick={() => setNewAgentOpen(true)}
                                        disabled={!githubConnection?.connected && !cloudAgentSettingsQuery.data?.settings.defaultRepositoryUrl.trim()}
                                    >
                                        New Agent
                                    </CursorButton>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="rounded-lg border border-[var(--cursor-stroke-tertiary)] px-3 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">Default repo</div>
                                        <div className="mt-2 truncate text-[13px] font-medium text-[var(--cursor-text-primary)]">{defaultRepo}</div>
                                    </div>
                                    <div className="rounded-lg border border-[var(--cursor-stroke-tertiary)] px-3 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">Git identity</div>
                                        <div className="mt-2 truncate text-[13px] font-medium text-[var(--cursor-text-primary)]">
                                            {cloudAgentSettingsQuery.data?.settings.gitName || 'Not set'}
                                        </div>
                                        <div className="mt-1 truncate text-[12px] text-[var(--cursor-text-secondary)]">
                                            {cloudAgentSettingsQuery.data?.settings.gitEmail || 'Set defaults on the right'}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-[var(--cursor-stroke-tertiary)] px-3 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">Branch policy</div>
                                        <div className="mt-2 text-[13px] font-medium text-[var(--cursor-text-primary)]">Create from {baseBranchDraft || DEFAULT_BASE_BRANCH}</div>
                                        <div className="mt-1 text-[12px] text-[var(--cursor-text-secondary)]">{branchPrefixDraft || DEFAULT_BRANCH_PREFIX}*</div>
                                    </div>
                                </div>
                            </div>
                        </CursorSettingsCard>
                    </CursorSettingsSection>

                    <CursorSettingsSection
                        title="Activity"
                        subtitle="Unified feed for queued agents and daemon workspaces, closer to a real background-agent sidebar."
                        action={<span className="text-[12px] text-[var(--cursor-text-secondary)]">Primary activity surface</span>}
                    >
                        <CursorSettingsCard>
                            <div className="flex items-center gap-2 border-b border-[var(--cursor-stroke-tertiary)] px-4 py-3">
                                <CursorButton type="button" size="sm" variant={activityFilter === 'all' ? 'primary' : 'outline'} onClick={() => setActivityFilter('all')}>
                                    All
                                </CursorButton>
                                <CursorButton type="button" size="sm" variant={activityFilter === 'requests' ? 'primary' : 'outline'} onClick={() => setActivityFilter('requests')}>
                                    Requests
                                </CursorButton>
                                <CursorButton type="button" size="sm" variant={activityFilter === 'workspaces' ? 'primary' : 'outline'} onClick={() => setActivityFilter('workspaces')}>
                                    Workspaces
                                </CursorButton>
                            </div>
                            {requestsQuery.isLoading || workspacesQuery.isLoading ? (
                                <div className="px-4 py-6 text-[13px] text-[var(--cursor-text-secondary)]">Loading activity…</div>
                            ) : filteredActivityItems.length === 0 ? (
                                <div className="px-4 py-6">
                                    <CursorEmptyState
                                        title="No activity yet"
                                        description="Launch an agent and provisioning state will appear here."
                                    />
                                </div>
                            ) : (
                                filteredActivityItems.slice(0, 14).map((item) => item.kind === 'request' ? (
                                    <Link
                                        key={`request:${item.id}`}
                                        to="/agents/requests/$requestId"
                                        params={{ requestId: item.id }}
                                        className="flex items-start justify-between gap-3 border-b border-[var(--cursor-stroke-tertiary)] px-4 py-4 transition-colors hover:bg-[var(--cursor-bg-hover)] last:border-b-0"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <RequestPhaseBadge phase={item.request.phase} />
                                                <CursorSettingsBadge tone="default">Request</CursorSettingsBadge>
                                                <span className="font-mono text-[12px] text-[var(--cursor-text-primary)]">{item.request.id}</span>
                                            </div>
                                            <div className="mt-1 truncate text-[13px] text-[var(--cursor-text-secondary)]">
                                                {item.request.request.workspaceSource?.repository?.url ?? 'No repo'} · {item.request.request.agent ?? 'agent'}
                                            </div>
                                            <div className="mt-1 text-[12px] text-[var(--cursor-text-tertiary)]">{formatRelativeTime(item.request.updatedAt)}</div>
                                            {item.request.error ? (
                                                <div className="mt-2 text-[12px] text-[var(--danger)]">{item.request.error.message ?? item.request.error.code}</div>
                                            ) : null}
                                        </div>
                                    </Link>
                                ) : (
                                    <Link
                                        key={`workspace:${item.id}`}
                                        to="/agents/workspaces/$workspaceId"
                                        params={{ workspaceId: item.id }}
                                        className="flex items-start justify-between gap-3 border-b border-[var(--cursor-stroke-tertiary)] px-4 py-4 transition-colors hover:bg-[var(--cursor-bg-hover)] last:border-b-0"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <WorkspaceStatusBadge status={item.workspace.status} />
                                                <CursorSettingsBadge tone="accent">Workspace</CursorSettingsBadge>
                                                <span className="font-mono text-[12px] text-[var(--cursor-text-primary)]">{item.workspace.id}</span>
                                            </div>
                                            <div className="mt-1 truncate text-[13px] text-[var(--cursor-text-secondary)]">
                                                {item.workspace.machineId ?? 'pending worker'} · {item.workspace.mode ?? 'ephemeral'} · {item.workspace.path ?? 'workspace path pending'}
                                            </div>
                                            <div className="mt-1 text-[12px] text-[var(--cursor-text-tertiary)]">{formatRelativeTime(item.workspace.updatedAt)}</div>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </CursorSettingsCard>
                    </CursorSettingsSection>
                </div>

                <div className="flex min-w-0 flex-col gap-6">
                    <CursorSettingsSection title="Overview" subtitle="Queue, workers, and daemon workspaces at a glance.">
                        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                            <SummaryMetric
                                label="Active workers"
                                value={`${activeWorkers.length}`}
                                hint={`${workers.length} total connected`}
                            />
                            <SummaryMetric
                                label="Queued or running"
                                value={`${requests.filter((request) => !['failed', 'canceled', 'succeeded'].includes(request.phase)).length}`}
                                hint={`${requests.length} recent requests`}
                            />
                            <SummaryMetric
                                label="Tracked workspaces"
                                value={`${workspaces.length}`}
                                hint={`${workspaces.filter((workspace) => workspace.status === 'ready' || workspace.status === 'leased').length} usable`}
                            />
                        </div>
                    </CursorSettingsSection>

                    <CursorSettingsSection
                        title="Workspaces"
                        subtitle="Recent daemon workspaces and their current lifecycle state."
                        action={<span className="text-[12px] text-[var(--cursor-text-secondary)]">Also appears in activity feed</span>}
                    >
                        <CursorSettingsCard>
                            {workspacesQuery.isLoading ? (
                                <div className="px-4 py-6 text-[13px] text-[var(--cursor-text-secondary)]">Loading workspaces…</div>
                            ) : workspaces.length === 0 ? (
                                <div className="px-4 py-6">
                                    <CursorEmptyState
                                        title="No workspaces tracked"
                                        description="Daemon workspaces appear here once an agent starts provisioning."
                                    />
                                </div>
                            ) : (
                                workspaces.map((workspace) => (
                                    <Link
                                        key={workspace.id}
                                        to="/agents/workspaces/$workspaceId"
                                        params={{ workspaceId: workspace.id }}
                                        className="flex items-start justify-between gap-3 border-b border-[var(--cursor-stroke-tertiary)] px-4 py-4 transition-colors hover:bg-[var(--cursor-bg-hover)] last:border-b-0"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <WorkspaceStatusBadge status={workspace.status} />
                                                <span className="font-mono text-[12px] text-[var(--cursor-text-primary)]">{workspace.id}</span>
                                            </div>
                                            <div className="mt-1 text-[13px] text-[var(--cursor-text-secondary)]">
                                                {workspace.machineId ?? 'pending worker'} · {workspace.mode ?? 'ephemeral'} · {formatRelativeTime(workspace.updatedAt)}
                                            </div>
                                            {workspace.path ? (
                                                <div className="mt-1 truncate font-mono text-[12px] text-[var(--cursor-text-tertiary)]">{workspace.path}</div>
                                            ) : null}
                                        </div>
                                    </Link>
                                ))
                            )}
                        </CursorSettingsCard>
                    </CursorSettingsSection>

                    <CursorSettingsSection title="Defaults" subtitle="Used to prefill new agents. Session UI can still override them.">
                        <CursorSettingsCard className="p-5">
                            <div className="grid gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <CursorFieldLabel htmlFor="cloud-agents-default-git-name">Git author name</CursorFieldLabel>
                                    <CursorTextField
                                        id="cloud-agents-default-git-name"
                                        value={gitNameDraft}
                                        onChange={(event) => setGitNameDraft(event.target.value)}
                                        placeholder="Jane Doe"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <CursorFieldLabel htmlFor="cloud-agents-default-git-email">Git author email</CursorFieldLabel>
                                    <CursorTextField
                                        id="cloud-agents-default-git-email"
                                        value={gitEmailDraft}
                                        onChange={(event) => setGitEmailDraft(event.target.value)}
                                        placeholder="jane@example.com"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <CursorFieldLabel htmlFor="cloud-agents-default-repo">Default repository</CursorFieldLabel>
                                    <CursorTextField
                                        id="cloud-agents-default-repo"
                                        value={defaultRepositoryUrlDraft}
                                        onChange={(event) => setDefaultRepositoryUrlDraft(event.target.value)}
                                        placeholder="https://github.com/org/repo.git"
                                    />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                        <CursorFieldLabel htmlFor="cloud-agents-default-base-branch">Base branch</CursorFieldLabel>
                                        <CursorTextField
                                            id="cloud-agents-default-base-branch"
                                            value={baseBranchDraft}
                                            onChange={(event) => setBaseBranchDraft(event.target.value)}
                                            placeholder={DEFAULT_BASE_BRANCH}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <CursorFieldLabel htmlFor="cloud-agents-default-branch-prefix">Branch prefix</CursorFieldLabel>
                                        <CursorTextField
                                            id="cloud-agents-default-branch-prefix"
                                            value={branchPrefixDraft}
                                            onChange={(event) => setBranchPrefixDraft(event.target.value)}
                                            placeholder={DEFAULT_BRANCH_PREFIX}
                                        />
                                    </div>
                                </div>
                                {settingsStatus ? (
                                    <CursorNotice tone={saveDefaultsMutation.isError ? 'danger' : 'accent'}>
                                        {settingsStatus}
                                    </CursorNotice>
                                ) : null}
                                <div className="flex justify-end">
                                    <CursorButton
                                        type="button"
                                        onClick={() => saveDefaultsMutation.mutate()}
                                        disabled={saveDefaultsMutation.isPending}
                                    >
                                        {saveDefaultsMutation.isPending ? 'Saving…' : 'Save Defaults'}
                                    </CursorButton>
                                </div>
                            </div>
                        </CursorSettingsCard>
                    </CursorSettingsSection>

                    <CursorSettingsSection title="Infrastructure" subtitle="Operational controls still available, but no longer the main entrypoint.">
                        <CursorSettingsCard className="p-0">
                            <CursorExpandableRow
                                title="Workers"
                                description={`${activeWorkers.length} active / ${workers.length} total`}
                            >
                                <CloudWorkersManager />
                            </CursorExpandableRow>
                            <CursorExpandableRow
                                title="Secrets"
                                description="Namespace cloud secrets"
                            >
                                <CloudSecretsManager />
                            </CursorExpandableRow>
                            <CursorExpandableRow
                                title="Environments"
                                description={`${environments.length} configured`}
                            >
                                {environments.length === 0 ? (
                                    <CursorEmptyState
                                        title="No environments"
                                        description="Add a repository environment to preconfigure bootstrap, runtime, and previews."
                                    />
                                ) : (
                                    <div className="grid gap-3">
                                        {environments.map((environment) => (
                                            <div
                                                key={environment.id}
                                                className="rounded-lg border border-[var(--cursor-stroke-tertiary)] px-3 py-3"
                                            >
                                                <div className="text-[13px] font-semibold text-[var(--cursor-text-primary)]">
                                                    {environment.id.replace(/^repo:/, '')}
                                                </div>
                                                <div className="mt-1 text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
                                                    {environment.runtimeKind ?? 'daemon-session'} · {environment.serviceCount} services · {environment.repositoryDependenciesCount} bootstrap deps
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CursorExpandableRow>
                        </CursorSettingsCard>
                    </CursorSettingsSection>
                </div>
            </div>

            <Dialog open={newAgentOpen} onOpenChange={setNewAgentOpen}>
                <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
                    <DialogTitle className="sr-only">New Cloud Agent</DialogTitle>
                    <DialogDescription className="sr-only">
                        Configure repository, branch strategy, identity, and bootstrap options for a background daemon agent.
                    </DialogDescription>
                    <CursorDialogShell>
                        <CursorDialogHeader
                            title="New Cloud Agent"
                            description="GitHub-first background launch. Repo, branch strategy, identity, checkpoint, then daemon-session bootstrap."
                            action={
                                <CursorButton
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setNewAgentOpen(false)}
                                >
                                    Close
                                </CursorButton>
                            }
                        />
                        <CursorDialogBody className="gap-5">
                            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <CursorFieldLabel htmlFor="cloud-agents-prompt">Prompt</CursorFieldLabel>
                                        <CursorTextArea
                                            id="cloud-agents-prompt"
                                            rows={6}
                                            value={promptDraft}
                                            onChange={(event) => setPromptDraft(event.target.value)}
                                            placeholder="What should this agent do?"
                                        />
                                        <CursorFieldHint>
                                            Starts in background, lands in the activity feed, then opens the session once running.
                                        </CursorFieldHint>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                                        <div className="flex flex-col gap-1.5">
                                            <CursorFieldLabel htmlFor="cloud-agents-repo-search">Repository</CursorFieldLabel>
                                            {githubConnection?.connected ? (
                                                <>
                                                    <CursorTextField
                                                        id="cloud-agents-repo-search"
                                                        value={repositorySearch}
                                                        onChange={(event) => setRepositorySearch(event.target.value)}
                                                        placeholder="Search connected GitHub repositories"
                                                    />
                                                    <div className="max-h-64 overflow-auto rounded-lg border border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-card)]">
                                                        {githubReposQuery.isLoading ? (
                                                            <div className="px-3 py-3 text-[13px] text-[var(--cursor-text-secondary)]">Loading repositories…</div>
                                                        ) : filteredRepos.length === 0 ? (
                                                            <div className="px-3 py-3 text-[13px] text-[var(--cursor-text-secondary)]">No repositories match.</div>
                                                        ) : (
                                                            filteredRepos.map((repo) => {
                                                                const selected = selectedRepo?.cloneUrl === repo.cloneUrl
                                                                return (
                                                                    <button
                                                                        key={repo.cloneUrl}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setRepositoryUrlDraft(repo.cloneUrl)
                                                                            if (!repositoryBranchDraft.trim()) {
                                                                                setRepositoryBranchDraft(repo.defaultBranch || DEFAULT_BASE_BRANCH)
                                                                            }
                                                                        }}
                                                                        className={`flex w-full items-start justify-between gap-3 border-b border-[var(--cursor-stroke-tertiary)] px-3 py-3 text-left last:border-b-0 hover:bg-[var(--cursor-bg-hover)] ${selected ? 'bg-[var(--cursor-bg-hover)]' : ''}`}
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <div className="truncate text-[13px] font-semibold text-[var(--cursor-text-primary)]">{repo.fullName}</div>
                                                                            <div className="mt-1 truncate text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
                                                                                default {repo.defaultBranch || 'branch'} · updated {new Date(repo.updatedAt).toLocaleDateString()}
                                                                            </div>
                                                                        </div>
                                                                        {repo.private ? (
                                                                            <CursorSettingsBadge tone="accent">Private</CursorSettingsBadge>
                                                                        ) : null}
                                                                    </button>
                                                                )
                                                            })
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <CursorNotice>
                                                    Connect GitHub first to browse repositories. Manual URL still works below.
                                                </CursorNotice>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex flex-col gap-1.5">
                                                <CursorFieldLabel htmlFor="cloud-agents-agent">Agent</CursorFieldLabel>
                                                <CursorSelect
                                                    id="cloud-agents-agent"
                                                    value={selectedAgent}
                                                    onChange={(event) => setSelectedAgent(event.target.value as AgentFlavor)}
                                                >
                                                    {AGENT_OPTIONS.map((option) => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </CursorSelect>
                                            </div>
                                            <div className="rounded-lg border border-[var(--cursor-stroke-tertiary)] px-3 py-3 text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
                                                Runtime fixed to <span className="font-medium text-[var(--cursor-text-primary)]">daemon-session</span> and launch fixed to <span className="font-medium text-[var(--cursor-text-primary)]">background</span>.
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
                                        <div className="flex flex-col gap-1.5">
                                            <CursorFieldLabel htmlFor="cloud-agents-repo-url">Repository URL</CursorFieldLabel>
                                            <CursorTextField
                                                id="cloud-agents-repo-url"
                                                type="url"
                                                value={repositoryUrlDraft}
                                                onChange={(event) => setRepositoryUrlDraft(event.target.value)}
                                                placeholder="https://github.com/org/repo.git"
                                            />
                                            <CursorFieldHint>
                                                Clone target. Default is {defaultRepo}.
                                            </CursorFieldHint>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <CursorFieldLabel htmlFor="cloud-agents-base-branch">Base branch</CursorFieldLabel>
                                            <CursorTextField
                                                id="cloud-agents-base-branch"
                                                value={repositoryBranchDraft}
                                                onChange={(event) => setRepositoryBranchDraft(event.target.value)}
                                                placeholder={selectedRepo?.defaultBranch || baseBranchDraft || DEFAULT_BASE_BRANCH}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <CursorFieldLabel htmlFor="cloud-agents-branch-mode">Branch strategy</CursorFieldLabel>
                                            <CursorSelect
                                                id="cloud-agents-branch-mode"
                                                value={branchModeDraft}
                                                onChange={(event) => setBranchModeDraft(event.target.value as BranchMode)}
                                            >
                                                <option value="create">Create new branch</option>
                                                <option value="reuse">Reuse base branch</option>
                                                <option value="detached">Detached checkout</option>
                                            </CursorSelect>
                                        </div>
                                    </div>

                                    {branchModeDraft === 'create' ? (
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="flex flex-col gap-1.5">
                                                <CursorFieldLabel htmlFor="cloud-agents-branch-prefix">Branch prefix</CursorFieldLabel>
                                                <CursorTextField
                                                    id="cloud-agents-branch-prefix"
                                                    value={branchPrefixOverride}
                                                    onChange={(event) => setBranchPrefixOverride(event.target.value)}
                                                    placeholder={branchPrefixDraft || DEFAULT_BRANCH_PREFIX}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <CursorFieldLabel htmlFor="cloud-agents-branch-name">Branch name override</CursorFieldLabel>
                                                <CursorTextField
                                                    id="cloud-agents-branch-name"
                                                    value={branchNameDraft}
                                                    onChange={(event) => setBranchNameDraft(event.target.value)}
                                                    placeholder="optional-slug"
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="grid gap-4">
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                                        <div className="flex flex-col gap-1.5">
                                            <CursorFieldLabel htmlFor="cloud-agents-environment">Environment</CursorFieldLabel>
                                            <CursorSelect
                                                id="cloud-agents-environment"
                                                value={environmentIdDraft}
                                                onChange={(event) => setEnvironmentIdDraft(event.target.value)}
                                            >
                                                <option value="">Workspace default</option>
                                                {environments.map((environment) => (
                                                    <option key={environment.id} value={environment.id}>
                                                        {environment.id.replace(/^repo:/, '')}
                                                    </option>
                                                ))}
                                            </CursorSelect>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <CursorFieldLabel htmlFor="cloud-agents-checkpoint">Checkpoint</CursorFieldLabel>
                                            <CursorSelect
                                                id="cloud-agents-checkpoint"
                                                value={checkpointIdDraft}
                                                onChange={(event) => setCheckpointIdDraft(event.target.value)}
                                            >
                                                <option value="">None</option>
                                                {(checkpointsQuery.data?.checkpoints ?? []).map((checkpoint) => (
                                                    <option key={checkpoint.id} value={checkpoint.id}>
                                                        {checkpoint.name}
                                                    </option>
                                                ))}
                                            </CursorSelect>
                                        </div>
                                    </div>

                                    <div className="grid gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <CursorFieldLabel htmlFor="cloud-agents-git-name">Git author name</CursorFieldLabel>
                                            <CursorTextField
                                                id="cloud-agents-git-name"
                                                value={gitNameOverride}
                                                onChange={(event) => setGitNameOverride(event.target.value)}
                                                placeholder="Jane Doe"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <CursorFieldLabel htmlFor="cloud-agents-git-email">Git author email</CursorFieldLabel>
                                            <CursorTextField
                                                id="cloud-agents-git-email"
                                                value={gitEmailOverride}
                                                onChange={(event) => setGitEmailOverride(event.target.value)}
                                                placeholder="jane@example.com"
                                            />
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-card)] px-4 py-4">
                                        <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-tertiary)]">Bootstrap summary</div>
                                        <div className="mt-2 text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">
                                            Repo sync policy: <span className="font-medium text-[var(--cursor-text-primary)]">fetch-reset</span>
                                        </div>
                                        <div className="mt-1 text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">
                                            Workspace mode: <span className="font-medium text-[var(--cursor-text-primary)]">ephemeral</span>
                                        </div>
                                        <div className="mt-1 text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">
                                            GitHub identity: <span className="font-medium text-[var(--cursor-text-primary)]">{cloudAgentSettingsQuery.data?.settings.githubUsername || 'not inferred'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {launchStatus ? (
                                <CursorNotice tone={launchMutation.isError ? 'danger' : 'accent'}>
                                    {launchStatus}
                                </CursorNotice>
                            ) : null}
                            {spawnError ? (
                                <CursorNotice tone="danger">{spawnError}</CursorNotice>
                            ) : null}
                        </CursorDialogBody>
                        <CursorDialogFooter className="px-5 pb-5">
                            <div className="mr-auto text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
                                Launches through self-hosted cloud workers only. Full daemon-session bootstrap lifecycle remains intact.
                            </div>
                            <CursorButton
                                type="button"
                                variant="outline"
                                onClick={() => setNewAgentOpen(false)}
                            >
                                Cancel
                            </CursorButton>
                            <CursorButton
                                type="button"
                                onClick={() => launchMutation.mutate()}
                                disabled={spawnPending || launchMutation.isPending || environmentsLoading}
                            >
                                {spawnPending || launchMutation.isPending ? 'Starting…' : 'Start Agent'}
                            </CursorButton>
                        </CursorDialogFooter>
                    </CursorDialogShell>
                </DialogContent>
            </Dialog>

            <Dialog
                open={detailOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        navigate({ to: '/agents' })
                    }
                }}
            >
                <DialogContent className="left-auto right-0 top-0 h-[100dvh] w-[min(840px,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-l border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-app)] p-0 shadow-2xl">
                    <DialogTitle className="sr-only">Cloud agent detail</DialogTitle>
                    <DialogDescription className="sr-only">
                        Request and workspace details for the selected cloud agent activity item.
                    </DialogDescription>
                    <div className="flex h-full min-h-0 flex-col bg-[var(--cursor-bg-app)]">
                        <div className="flex items-center justify-between border-b border-[var(--cursor-stroke-secondary)] px-5 py-4">
                            <div>
                                <div className="text-[15px] font-semibold text-[var(--cursor-text-primary)]">
                                    {props.selectedRequestId ? 'Request detail' : 'Workspace detail'}
                                </div>
                                <div className="mt-1 text-[12px] text-[var(--cursor-text-secondary)]">
                                    Stay in the agent workspace while inspecting background state.
                                </div>
                            </div>
                            <CursorButton type="button" variant="outline" size="sm" onClick={() => navigate({ to: '/agents' })}>
                                Close
                            </CursorButton>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto">
                            {props.selectedRequestId ? (
                                <CloudRequestDetailContent
                                    requestId={props.selectedRequestId}
                                    routeScope="agents"
                                    embedded
                                />
                            ) : props.selectedWorkspaceId ? (
                                <CloudWorkspaceDetailContent
                                    workspaceId={props.selectedWorkspaceId}
                                    embedded
                                />
                            ) : null}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
