import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
    CursorSettingsRow,
    CursorSettingsSection,
    CursorTabButton,
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

type ActivityLinkKind = 'request' | 'workspace'

function ActivityRowBody(props: {
    kind: ActivityLinkKind
    statusBadge: ReactNode
    title: ReactNode
    secondary?: ReactNode
    tertiary?: ReactNode
    error?: ReactNode
    showKindBadge?: boolean
}) {
    const kindLabel = props.kind === 'request' ? 'Request' : 'Workspace'
    const kindTone: 'default' | 'accent' = props.kind === 'request' ? 'default' : 'accent'
    return (
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
                {props.statusBadge}
                {props.showKindBadge ? (
                    <CursorSettingsBadge tone={kindTone}>{kindLabel}</CursorSettingsBadge>
                ) : null}
                <span className="truncate font-mono text-[12px] text-[var(--cursor-text-primary)]">{props.title}</span>
            </div>
            {props.secondary ? (
                <div className="mt-1 truncate text-[13px] text-[var(--cursor-text-secondary)]">{props.secondary}</div>
            ) : null}
            {props.tertiary ? (
                <div className="mt-1 text-[12px] text-[var(--cursor-text-tertiary)]">{props.tertiary}</div>
            ) : null}
            {props.error ? (
                <div className="mt-2 text-[12px] text-[var(--danger)]">{props.error}</div>
            ) : null}
        </div>
    )
}

const activityRowClass = 'flex items-start justify-between gap-3 border-b border-[var(--cursor-stroke-tertiary)] px-4 py-3 transition-colors hover:bg-[var(--cursor-bg-hover)] last:border-b-0'

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
    }, [cloudAgentSettingsQuery.data?.settings])

    useEffect(() => {
        const settings = cloudAgentSettingsQuery.data?.settings
        if (!settings || launchHydratedRef.current) {
            return
        }
        launchHydratedRef.current = true
        setRepositoryBranchDraft(DEFAULT_BASE_BRANCH)
        setBranchPrefixOverride(DEFAULT_BRANCH_PREFIX)
        setGitNameOverride(settings.gitName)
        setGitEmailOverride(settings.gitEmail)
    }, [cloudAgentSettingsQuery.data?.settings])

    const saveDefaultsMutation = useMutation({
        mutationFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.updateCloudAgentSettings({
                gitName: gitNameDraft,
                gitEmail: gitEmailDraft,
            })
        },
        onSuccess: async (result) => {
            setSettingsStatus('Identity saved')
            setGitNameDraft(result.settings.gitName)
            setGitEmailDraft(result.settings.gitEmail)
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudAgentSettings })
        },
        onError: (error) => {
            setSettingsStatus(error instanceof Error ? error.message : 'Failed to save identity')
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
                    to: '/settings/cloud-agents/requests/$requestId',
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

    if (props.selectedRequestId || props.selectedWorkspaceId) {
        const isRequest = Boolean(props.selectedRequestId)
        return (
            <>
                <div className="mb-4">
                    <Link
                        to="/settings/cloud-agents"
                        className="text-[12px] leading-4 text-[var(--cursor-text-secondary)] hover:text-[var(--cursor-text-primary)]"
                    >
                        ← Back to Cloud Agents
                    </Link>
                </div>
                <CursorSettingsHeader
                    title={isRequest ? 'Request detail' : 'Workspace detail'}
                    description={isRequest
                        ? 'Cloud spawn request lifecycle, bootstrap log, and worker assignment.'
                        : 'Daemon workspace status, runtime configuration, and recent leases.'}
                />
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
            </>
        )
    }

    const launchDisabled = !githubConnection?.connected

    return (
        <>
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <CursorSettingsHeader
                        title="Cloud Agents"
                        description="GitHub-first background agents. Connect GitHub, set defaults, and launch daemon-backed workspaces."
                    />
                </div>
                <CursorButton
                    type="button"
                    className="shrink-0"
                    onClick={() => setNewAgentOpen(true)}
                    disabled={launchDisabled}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New Agent
                </CursorButton>
            </div>

            <CursorSettingsSection title="GitHub">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title={githubConnection?.connected
                            ? `Connected as ${githubConnection.profile?.login ?? 'GitHub user'}`
                            : 'GitHub not connected'}
                        description="PAT-based for now. Used for private repo clone, branch push, and PR actions."
                        control={
                            <div className="flex items-center gap-2">
                                <CursorSettingsBadge tone={githubConnection?.connected ? 'success' : 'danger'}>
                                    {githubConnection?.connected ? 'Connected' : 'Disconnected'}
                                </CursorSettingsBadge>
                                {githubConnection?.connected ? (
                                    <CursorButton
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => disconnectGitHubMutation.mutate()}
                                        disabled={disconnectGitHubMutation.isPending}
                                    >
                                        {disconnectGitHubMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                                    </CursorButton>
                                ) : null}
                            </div>
                        }
                    />
                    <CursorSettingsRow
                        title="Personal access token"
                        description="Classic (ghp_…) or fine-grained (github_pat_…). Scopes: classic needs repo; fine-grained needs metadata read + contents read/write + pull requests read/write."
                        noBorder
                        control={
                            <div className="flex items-center gap-2">
                                <CursorTextField
                                    id="cloud-agents-github-token"
                                    type="password"
                                    value={githubTokenDraft}
                                    onChange={(event) => setGitHubTokenDraft(event.target.value)}
                                    placeholder={githubConnection?.connected ? 'Replace token' : 'ghp_… or github_pat_…'}
                                    className="w-[260px] max-w-full"
                                />
                                <CursorButton
                                    type="button"
                                    onClick={() => connectGitHubMutation.mutate()}
                                    disabled={connectGitHubMutation.isPending || !githubTokenDraft.trim()}
                                >
                                    {connectGitHubMutation.isPending
                                        ? 'Connecting…'
                                        : githubConnection?.connected ? 'Replace' : 'Connect'}
                                </CursorButton>
                            </div>
                        }
                    />
                </CursorSettingsCard>
                {githubStatus ? (
                    <div className="mt-3">
                        <CursorNotice>{githubStatus}</CursorNotice>
                    </div>
                ) : null}
                {githubConnection?.error ? (
                    <div className="mt-3">
                        <CursorNotice tone="danger">{githubConnection.error}</CursorNotice>
                    </div>
                ) : null}
            </CursorSettingsSection>

            <CursorSettingsSection title="Git identity" subtitle="Used for every commit made by cloud agents. Overridable per launch.">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Author name"
                        description="Appears on commits pushed by cloud agents."
                        control={
                            <CursorTextField
                                id="cloud-agents-default-git-name"
                                value={gitNameDraft}
                                onChange={(event) => setGitNameDraft(event.target.value)}
                                placeholder="Jane Doe"
                                className="w-[280px] max-w-full"
                            />
                        }
                    />
                    <CursorSettingsRow
                        title="Author email"
                        description="Matches the GitHub account where possible."
                        noBorder
                        control={
                            <CursorTextField
                                id="cloud-agents-default-git-email"
                                value={gitEmailDraft}
                                onChange={(event) => setGitEmailDraft(event.target.value)}
                                placeholder="jane@example.com"
                                className="w-[280px] max-w-full"
                            />
                        }
                    />
                </CursorSettingsCard>
                {settingsStatus ? (
                    <div className="mt-3">
                        <CursorNotice tone={saveDefaultsMutation.isError ? 'danger' : 'accent'}>
                            {settingsStatus}
                        </CursorNotice>
                    </div>
                ) : null}
                <div className="mt-3 flex justify-end">
                    <CursorButton
                        type="button"
                        onClick={() => saveDefaultsMutation.mutate()}
                        disabled={saveDefaultsMutation.isPending}
                    >
                        {saveDefaultsMutation.isPending ? 'Saving…' : 'Save identity'}
                    </CursorButton>
                </div>
            </CursorSettingsSection>

            <CursorSettingsSection
                title="Activity"
                subtitle="Recent spawn requests and daemon workspaces, newest first."
            >
                <div className="mb-3 flex items-center gap-4 border-b border-[var(--border-tertiary)]">
                    <CursorTabButton active={activityFilter === 'all'} onClick={() => setActivityFilter('all')}>
                        All
                    </CursorTabButton>
                    <CursorTabButton active={activityFilter === 'requests'} onClick={() => setActivityFilter('requests')}>
                        Requests
                    </CursorTabButton>
                    <CursorTabButton active={activityFilter === 'workspaces'} onClick={() => setActivityFilter('workspaces')}>
                        Workspaces
                    </CursorTabButton>
                </div>
                <CursorSettingsCard>
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
                                to="/settings/cloud-agents/requests/$requestId"
                                params={{ requestId: item.id }}
                                className={activityRowClass}
                            >
                                <ActivityRowBody
                                    kind="request"
                                    showKindBadge
                                    statusBadge={<RequestPhaseBadge phase={item.request.phase} />}
                                    title={item.request.id}
                                    secondary={`${item.request.request.workspaceSource?.repository?.url ?? 'No repo'} · ${item.request.request.agent ?? 'agent'}`}
                                    tertiary={formatRelativeTime(item.request.updatedAt)}
                                    error={item.request.error ? (item.request.error.message ?? item.request.error.code) : undefined}
                                />
                            </Link>
                        ) : (
                            <Link
                                key={`workspace:${item.id}`}
                                to="/settings/cloud-agents/workspaces/$workspaceId"
                                params={{ workspaceId: item.id }}
                                className={activityRowClass}
                            >
                                <ActivityRowBody
                                    kind="workspace"
                                    showKindBadge
                                    statusBadge={<WorkspaceStatusBadge status={item.workspace.status} />}
                                    title={item.workspace.id}
                                    secondary={`${item.workspace.machineId ?? 'pending worker'} · ${item.workspace.mode ?? 'ephemeral'} · ${item.workspace.path ?? 'workspace path pending'}`}
                                    tertiary={formatRelativeTime(item.workspace.updatedAt)}
                                />
                            </Link>
                        ))
                    )}
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Infrastructure" subtitle="Operational controls for workers, secrets, and environments.">
                <CursorSettingsCard>
                    <CursorExpandableRow
                        title="Workers"
                        description={`${activeWorkers.length} active · ${workers.length} total`}
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
                            <div className="flex flex-col">
                                {environments.map((environment) => (
                                    <div
                                        key={environment.id}
                                        className="flex items-center justify-between gap-3 border-b border-[var(--cursor-stroke-tertiary)] px-3 py-3 last:border-b-0"
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate text-[13px] font-medium text-[var(--cursor-text-primary)]">
                                                {environment.id.replace(/^repo:/, '')}
                                            </div>
                                            <div className="mt-1 truncate text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
                                                {environment.runtimeKind ?? 'daemon-session'} · {environment.serviceCount} services · {environment.repositoryDependenciesCount} bootstrap deps
                                            </div>
                                        </div>
                                        {environment.hasPreviewPorts ? (
                                            <CursorSettingsBadge tone="accent">Preview</CursorSettingsBadge>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CursorExpandableRow>
                </CursorSettingsCard>
            </CursorSettingsSection>

            <Dialog open={newAgentOpen} onOpenChange={setNewAgentOpen}>
                <DialogContent className="max-w-2xl border-0 bg-transparent p-0 shadow-none">
                    <DialogTitle className="sr-only">New Cloud Agent</DialogTitle>
                    <DialogDescription className="sr-only">
                        Configure repository, branch strategy, identity, and bootstrap options for a background daemon agent.
                    </DialogDescription>
                    <CursorDialogShell>
                        <CursorDialogHeader
                            title="New Cloud Agent"
                            description="Background launch, daemon-session runtime. The activity feed tracks provisioning."
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
                        <CursorDialogBody>
                            <div className="flex flex-col gap-1.5">
                                <CursorFieldLabel htmlFor="cloud-agents-prompt">Prompt</CursorFieldLabel>
                                <CursorTextArea
                                    id="cloud-agents-prompt"
                                    rows={4}
                                    value={promptDraft}
                                    onChange={(event) => setPromptDraft(event.target.value)}
                                    placeholder="What should this agent do?"
                                />
                                <CursorFieldHint>
                                    Runs in the background. Lands in the activity feed, then opens the session once running.
                                </CursorFieldHint>
                            </div>

                            {githubConnection?.connected ? (
                                <div className="flex flex-col gap-1.5">
                                    <CursorFieldLabel htmlFor="cloud-agents-repo-search">Repository</CursorFieldLabel>
                                    <CursorTextField
                                        id="cloud-agents-repo-search"
                                        value={repositorySearch}
                                        onChange={(event) => setRepositorySearch(event.target.value)}
                                        placeholder="Search connected GitHub repositories"
                                    />
                                    <div className="max-h-60 overflow-auto rounded-[8px] border border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-card)]">
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
                                                        className={`flex w-full items-start justify-between gap-3 border-b border-[var(--cursor-stroke-tertiary)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--cursor-bg-hover)] ${selected ? 'bg-[var(--cursor-bg-hover)]' : ''}`}
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="truncate text-[13px] font-medium text-[var(--cursor-text-primary)]">{repo.fullName}</div>
                                                            <div className="mt-0.5 truncate text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
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
                                </div>
                            ) : (
                                <CursorNotice>Connect GitHub to browse repositories. Manual URL still works below.</CursorNotice>
                            )}

                            <div className="flex flex-col gap-1.5">
                                <CursorFieldLabel htmlFor="cloud-agents-repo-url">Repository URL</CursorFieldLabel>
                                <CursorTextField
                                    id="cloud-agents-repo-url"
                                    type="url"
                                    value={repositoryUrlDraft}
                                    onChange={(event) => setRepositoryUrlDraft(event.target.value)}
                                    placeholder="https://github.com/org/repo.git"
                                />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                    <CursorFieldLabel htmlFor="cloud-agents-base-branch">Base branch</CursorFieldLabel>
                                    <CursorTextField
                                        id="cloud-agents-base-branch"
                                        value={repositoryBranchDraft}
                                        onChange={(event) => setRepositoryBranchDraft(event.target.value)}
                                        placeholder={selectedRepo?.defaultBranch || DEFAULT_BASE_BRANCH}
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
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                        <CursorFieldLabel htmlFor="cloud-agents-branch-prefix">Branch prefix</CursorFieldLabel>
                                        <CursorTextField
                                            id="cloud-agents-branch-prefix"
                                            value={branchPrefixOverride}
                                            onChange={(event) => setBranchPrefixOverride(event.target.value)}
                                            placeholder={DEFAULT_BRANCH_PREFIX}
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

                            <div className="grid gap-3 sm:grid-cols-2">
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
                            </div>

                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
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
                            <div className="mr-auto text-[12px] leading-4 text-[var(--cursor-text-tertiary)]">
                                Runtime: daemon-session · launch: background · sync: fetch-reset
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
        </>
    )
}
