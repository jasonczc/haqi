import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    Navigate,
    Outlet,
    createRootRoute,
    createRoute,
    createRouter,
    useLocation,
    useMatchRoute,
    useNavigate,
    useParams,
    useSearch,
} from '@tanstack/react-router'
import { App } from '@/App'
import { SessionChat } from '@/components/SessionChat'
import type { NewSessionPreset } from '@/components/SessionList'
import { NewSession } from '@/components/NewSession'
import {
    loadLastSessionConfig,
    loadPreferredAgent,
    loadPreferredCustomModel,
    loadPreferredModel,
    loadPreferredServiceTier,
    loadPreferredThinkEffort,
    loadPreferredYoloMode
} from '@/components/NewSession/preferences'
import { resolveSpawnModel, resolveSpawnServiceTier, resolveSpawnSessionSettings, resolveSpawnThinkEffort } from '@/components/NewSession/spawnPayload'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useMessages } from '@/hooks/queries/useMessages'
import { useConversationTurns } from '@/hooks/queries/useConversationTurns'
import { useMachines } from '@/hooks/queries/useMachines'
import { useSession } from '@/hooks/queries/useSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { useGroupActions } from '@/hooks/mutations/useGroupActions'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/use-translation'
import { fetchLatestMessages, seedMessageWindowFromSession } from '@/lib/message-window-store'
import { useSessionListDensity, type SessionListDensity } from '@/hooks/useSessionListDensity'
import { useSessionSidebarWidth } from '@/hooks/useSessionSidebarWidth'
import { useSessionSidebarVisibility } from '@/hooks/useSessionSidebarVisibility'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import { useChatViewMode } from '@/hooks/useChatViewMode'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/button'
import type { GroupDetail, SessionSummary } from '@/types/api'
import { filterSessionsBySearch } from '@/lib/session-search'
import FilesPage from '@/routes/sessions/files'
import FilePage from '@/routes/sessions/file'
import PreviewPage from '@/routes/sessions/preview'
import DesktopPage from '@/routes/sessions/desktop'
import TerminalPage from '@/routes/sessions/terminal'
import SettingsLayout from '@/routes/settings/layout'
import SettingsOverviewPage from '@/routes/settings/overview'
import SettingsCloudAgentsPage from '@/routes/settings/cloud-agents'
import SettingsGeneralPage from '@/routes/settings/general'
import SettingsIntegrationsPage from '@/routes/settings/integrations'
import SettingsBugbotPage from '@/routes/settings/bugbot'
import SettingsPluginsPage from '@/routes/settings/plugins'
import SettingsMembersPage from '@/routes/settings/members'
import SettingsUsagePage from '@/routes/settings/usage'
import SettingsSpendingPage from '@/routes/settings/spending'
import SettingsBillingPage from '@/routes/settings/billing'
import SettingsAdvancedPage from '@/routes/settings/advanced'
import { CloudRequestDetailContent } from '@/routes/settings/request-detail'
import { CloudWorkspaceDetailContent } from '@/routes/settings/workspace-detail'
import CloudContainersPage from '@/routes/settings/containers'
import CloudCheckpointsPage from '@/routes/settings/checkpoints'
import CloudRequestsPage from '@/routes/settings/requests'
import CloudWorkspacesPage from '@/routes/settings/workspaces'
import CloudOnboardPage from '@/routes/settings/onboard'
import CloudAutomationsPage from '@/routes/settings/automations'
import DebugDiffPage from '@/routes/debug/diff'
import GroupDetailPage from '@/routes/groups/detail'
import ReviewLoopsIndexPage from '@/routes/review-loops/index'
import ReviewLoopDetailPage from '@/routes/review-loops/detail'
import { RunWorkbench } from '@/components/RunWorkbench'
import { useGitHubPr } from '@/hooks/useGitHubPr'
import { useGroups } from '@/hooks/queries/useGroups'
import { useReviewLoops } from '@/hooks/queries/useReviewLoops'
import type { ReviewLoop } from '@/types/api'
import { ReviewLoopStatusBadge, CreateLoopModal, type CreateLoopData } from '@/components/ReviewLoop'
import type { SpawnResponse } from '@/types/api'

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function PlusIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

function SettingsIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    )
}

function GroupsIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <path d="M20 8v6" />
            <path d="M23 11h-6" />
        </svg>
    )
}

function DensityIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
    )
}

function SidebarIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
        </svg>
    )
}

function CloseIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

function CloudIndexPage() {
    return <Navigate to="/settings/cloud-agents" replace />
}

function CloudDashboardRedirectPage() {
    return <Navigate to="/settings/overview" replace />
}

function CloudWorkersRedirectPage() {
    return <Navigate to="/settings/cloud-agents" replace />
}

function CloudSecretsRedirectPage() {
    return <Navigate to="/settings/cloud-agents" replace />
}

function CloudContainersRedirectPage() {
    return <Navigate to="/settings/containers" replace />
}

function CloudCheckpointsRedirectPage() {
    return <Navigate to="/settings/checkpoints" replace />
}

function CloudRequestsRedirectPage() {
    return <Navigate to="/settings/requests" replace />
}

function CloudWorkspacesRedirectPage() {
    return <Navigate to="/settings/workspaces" replace />
}

function CloudAutomationsRedirectPage() {
    return <Navigate to="/settings/automations" replace />
}

function CloudAdvancedRedirectPage() {
    return <Navigate to="/settings/advanced" replace />
}

function CloudOnboardRedirectPage() {
    return <Navigate to="/settings/onboard" replace />
}

function SettingsIndexPage() {
    return <Navigate to="/settings/overview" replace />
}

function BugbotPlaceholderPage() {
    return <SettingsBugbotPage />
}

function IntegrationsPlaceholderPage() {
    return <SettingsIntegrationsPage />
}

function PluginsPlaceholderPage() {
    return <SettingsPluginsPage />
}

function MembersPlaceholderPage() {
    return <SettingsMembersPage />
}

function UsagePlaceholderPage() {
    return <SettingsUsagePage />
}

function SpendingPlaceholderPage() {
    return <SettingsSpendingPage />
}

function BillingPlaceholderPage() {
    return <SettingsBillingPage />
}

type NewSessionSearch = {
    directory?: string
    machineId?: string
    checkpointId?: string
    sessionType?: string
}

type SessionsLayoutContextValue = {
    toggleSidebarFromHeader: () => void
    showDesktopSidebar: boolean
    density: SessionListDensity
}

const SessionsLayoutContext = createContext<SessionsLayoutContextValue | null>(null)

function useSessionsLayoutContext() {
    return useContext(SessionsLayoutContext)
}

function toNewSessionSearch(preset?: NewSessionPreset): NewSessionSearch {
    const directory = preset?.directory
    const machineId = preset?.machineId
    const next: NewSessionSearch = {}
    if (directory) {
        next.directory = directory
    }
    if (machineId) {
        next.machineId = machineId
    }
    return next
}

function formatHomeTime(updatedAt: number): string {
    const ms = updatedAt < 1e12 ? updatedAt * 1000 : updatedAt
    const delta = Date.now() - ms
    const mins = Math.floor(delta / 60000)
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
}

function getSessionDisplayTitle(session: SessionSummary): string {
    return session.metadata?.name
        || session.metadata?.summary?.text
        || session.metadata?.path?.split('/').filter(Boolean).pop()
        || session.id.slice(0, 8)
}

function getSessionHistoryState(session: SessionSummary): 'draft' | 'merged' | 'open' {
    const metadata = session.metadata as Record<string, unknown> | null | undefined
    if (metadata?.pullRequestUrl || metadata?.prUrl) {
        return 'open'
    }
    if (session.active || session.thinking) {
        return 'draft'
    }
    return 'merged'
}

function SessionStatusIcon(props: { state: 'draft' | 'merged' | 'open'; className?: string }) {
    if (props.state === 'open') {
        return (
            <svg className={props.className} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 3.25a2.75 2.75 0 115.5 0 2.75 2.75 0 01-1.75 2.56v4.19a2.251 2.251 0 11-1.5 0V5.81A2.75 2.75 0 011.5 3.25zm2.75-1.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm0 9.5a.75.75 0 100 1.5.75.75 0 000-1.5zm7.5-8.25a2.75 2.75 0 10-1.5 2.44v3.06h-1a2.75 2.75 0 100 1.5h1a1.5 1.5 0 001.5-1.5V5.69a2.75 2.75 0 001-2.19zm-2.75-1.25a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zm-1.25 8.25a1.25 1.25 0 102.5 0 1.25 1.25 0 00-2.5 0z" />
            </svg>
        )
    }
    return (
        <svg className={props.className} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M5 3.25a2.75 2.75 0 11-1.5 2.44v4.06a2.251 2.251 0 11-1.5 0V5.69A2.75 2.75 0 015 3.25zm-2.75 1.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zm0 8.5a.75.75 0 100-1.5.75.75 0 000 1.5zm9.5-3.25a2.75 2.75 0 10-1.5 0v.5a2.25 2.25 0 11-1.5 0V5.81A4.251 4.251 0 015.75 1.8V.75a.75.75 0 011.5 0V1.8a2.75 2.75 0 002.75 2.75h.25a2.75 2.75 0 011.5 5.19zM11 6.5a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm-1.25 6.25a.75.75 0 101.5 0 .75.75 0 00-1.5 0z" />
        </svg>
    )
}

function HomeComposer(props: { onNewSession: () => void; onOpenSession: (sessionId: string) => void; sessions: SessionSummary[] }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-start px-8">
            <div className="content-wrapper w-full max-w-[800px] pt-[15vh]">
                <div className="home-hero">
                    <div className="home-eyebrow">New agent</div>

                    {/* Select repository button */}
                    <div className="repo-selector">
                        <button type="button" className="repo-btn">
                            Select repository
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </div>

                    {/* Prompt input area */}
                    <div className="prompt-container">
                        <div className="prompt-card">
                            <textarea
                                placeholder="Ask Cursor to build, fix bugs, explore"
                                rows={4}
                                className="prompt-input w-full resize-none bg-transparent focus:outline-none"
                            />
                            <div className="prompt-footer">
                                <div className="prompt-tools">
                                    <button className="tool-chip" type="button">
                                        Codex 5.3 High
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                    <button className="tool-chip" type="button">
                                        MCPs
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                </div>
                                <div className="prompt-actions">
                                    <button className="action-btn" type="button" aria-label="Add context">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                                    </button>
                                    <button className="action-btn active" type="button" aria-label="Start agent" onClick={props.onNewSession}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Suggested prompts */}
                    <div className="action-pills">
                        <button className="pill-btn" type="button" onClick={props.onNewSession}>
                            Run security audit
                        </button>
                        <button className="pill-btn" type="button" onClick={props.onNewSession}>
                            Improve AGENTS.md
                        </button>
                        <button className="pill-btn" type="button" onClick={props.onNewSession}>
                            Solve a TODO
                        </button>
                    </div>
                </div>

                <div className="home-section-header">
                    <div className="home-section-title">Recent runs</div>
                    <div className="home-section-meta">{Math.min(props.sessions.length, 8)} visible</div>
                </div>

                {/* Recent runs cards */}
                <div className="agent-list mt-2 w-full">
                    {props.sessions.slice(0, 8).map(s => {
                        const title = getSessionDisplayTitle(s)
                        const model = s.metadata?.model || s.modelMode || 'default'
                        const time = formatHomeTime(s.updatedAt)
                        const meta = s.metadata as any
                        const additions = meta?.prAdditions as number | undefined
                        const deletions = meta?.prDeletions as number | undefined
                        const state = getSessionHistoryState(s)
                        return (
                            <button key={s.id} type="button" className="agent-row w-full text-left" onClick={() => props.onOpenSession(s.id)}>
                                <div className="metadata-card">
                                    <div className="meta-row">
                                        <span className="meta-file-count">
                                            {meta?.changedFilesCount ? `${meta.changedFilesCount} files` : 'Session'}
                                        </span>
                                        {(additions || deletions) ? (
                                            <div className="meta-diff">
                                                {additions ? <span className="diff-add">+{additions}</span> : null}
                                                {deletions ? <span className="diff-sub">-{deletions}</span> : null}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className={`badge ${state === 'open' ? 'badge-open' : state === 'merged' ? 'badge-merged' : 'badge-draft'}`}>
                                        <SessionStatusIcon state={state} />
                                        {state === 'open' ? 'Open' : state === 'merged' ? 'Merged' : 'Draft'}
                                    </div>
                                </div>
                                <div className="agent-info">
                                    <div className="agent-title">{title}</div>
                                    <div className="agent-subtitle">
                                        <SessionStatusIcon state={state} className={state === 'open' ? 'icon-green' : state === 'merged' ? 'icon-purple' : 'icon-gray'} />
                                        <span>{model}</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>{s.metadata?.path?.split('/').filter(Boolean).pop() ?? 'haqi'}</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>{time}</span>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function SessionsPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const { addToast } = useToast()
    const { sessions, isLoading, error, refetch } = useSessions(api)
    const { spawnSession, isPending: isQuickCreatingSession } = useSpawnSession(api)
    const { density } = useSessionListDensity()
    const { sidebarWidth } = useSessionSidebarWidth()
    const { desktopSidebarHidden, setDesktopSidebarHidden, toggleDesktopSidebar } = useSessionSidebarVisibility()
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const [sessionSearchQuery] = useState('')
    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const chatRouteMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: false })
    const selectedSessionId = sessionMatch && sessionMatch.sessionId !== 'new' ? sessionMatch.sessionId : null

    const selectedSessionPreset = useMemo<NewSessionPreset | undefined>(() => {
        if (!selectedSessionId) {
            return undefined
        }
        const selected = sessions.find((session) => session.id === selectedSessionId)
        if (!selected) {
            return undefined
        }

        const directory = selected.metadata?.path?.trim()
        const machineId = selected.metadata?.machineId?.trim()
        if (!directory && !machineId) {
            return undefined
        }
        return {
            directory: directory || undefined,
            machineId: machineId || undefined
        }
    }, [selectedSessionId, sessions])

    const visibleSessions = useMemo(
        () => filterSessionsBySearch(sessions, sessionSearchQuery),
        [sessions, sessionSearchQuery]
    )

    const openNewSession = useCallback((preset?: NewSessionPreset) => {
        const resolvedPreset = preset ?? selectedSessionPreset
        setMobileSidebarOpen(false)
        navigate({
            to: '/sessions/new',
            search: toNewSessionSearch(resolvedPreset)
        })
    }, [navigate, selectedSessionPreset])

    const isSessionChatRoute = Boolean(chatRouteMatch && chatRouteMatch.sessionId !== 'new')
    const isSessionsIndex = pathname === '/sessions' || pathname === '/sessions/'
    const showDesktopSidebar = isSessionsIndex || !desktopSidebarHidden
    const sidebarStyle = { '--sessions-sidebar-width': `${sidebarWidth}px` } as CSSProperties

    useEffect(() => {
        if (isSessionsIndex) {
            setMobileSidebarOpen(false)
        }
    }, [isSessionsIndex])

    useEffect(() => {
        if (isSessionsIndex && desktopSidebarHidden) {
            setDesktopSidebarHidden(false)
        }
    }, [isSessionsIndex, desktopSidebarHidden, setDesktopSidebarHidden])

    useEffect(() => {
        if (!mobileSidebarOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setMobileSidebarOpen(false)
            }
        }

        window.addEventListener('resize', handleResize)
        return () => {
            window.removeEventListener('resize', handleResize)
            document.body.style.overflow = previousOverflow
        }
    }, [mobileSidebarOpen])

    const selectSession = useCallback((sessionId: string) => {
        setMobileSidebarOpen(false)
        navigate({
            to: '/sessions/$sessionId',
            params: { sessionId },
        })
    }, [navigate])

    const openSidebarOnMobile = useCallback(() => {
        setMobileSidebarOpen(true)
    }, [])

    const closeSidebarOnMobile = useCallback(() => {
        setMobileSidebarOpen(false)
    }, [])

    const toggleSidebarFromHeader = useCallback(() => {
        if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
            toggleDesktopSidebar()
            return
        }
        setMobileSidebarOpen(true)
    }, [toggleDesktopSidebar])

    const renderSidebarContent = (options?: { inDrawer?: boolean; onClose?: () => void }) => {
        const inDrawer = options?.inDrawer === true
        const onClose = options?.onClose

        return (
            <>
                <div className="sidebar bg-[var(--bg-chrome)] pt-[env(safe-area-inset-top)]">
                    {/* Top bar */}
                    <div className="sidebar-header flex items-center gap-1 px-2 pt-2 pb-0.5">
                        <button
                            type="button"
                            onClick={() => toggleDesktopSidebar?.()}
                            className="rounded-[6px] p-1.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Toggle sidebar"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
                        </button>
                        <button
                            type="button"
                            className="rounded-[6px] p-1.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Search agents (⌘K)"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        </button>
                    </div>
                    {/* Cursor-style nav */}
                    <nav className="sidebar-nav flex flex-col gap-0.5 px-2 pt-2 pb-1">
                        <button
                            type="button"
                            onClick={() => openNewSession()}
                            className="nav-item flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] font-[var(--font-weight-semibold)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            New Agent
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/settings/automations' })}
                            className="nav-item flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Automations
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/settings/overview' })}
                            className="nav-item flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                            Dashboard
                        </button>
                        <button
                            type="button"
                            className="nav-item flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>
                            Bugbot
                        </button>
                    </nav>
                    {inDrawer && onClose ? (
                        <div className="flex justify-end px-2 py-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-[6px] p-1.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                                title={t('sessions.sidebar.close')}
                                aria-label={t('sessions.sidebar.close')}
                            >
                                <CloseIcon className="h-4 w-4" />
                            </button>
                        </div>
                    ) : null}
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                    {error ? (
                        <div className="mx-auto w-full max-w-content px-3 py-2">
                            <div className="text-sm text-red-600">{error}</div>
                        </div>
                    ) : null}
                    <div className="sidebar-section min-h-0 flex-1 overflow-y-auto">
                        <div className="section-title">This Week</div>
                        {visibleSessions.slice(0, 20).map((session) => {
                            const state = getSessionHistoryState(session)
                            const title = getSessionDisplayTitle(session)
                            const selected = selectedSessionId === session.id
                            const meta = session.metadata as any
                            const additions = meta?.prAdditions as number | undefined
                            const deletions = meta?.prDeletions as number | undefined
                            const childTitle = typeof meta?.summary?.text === 'string' && meta.summary.text !== title
                                ? meta.summary.text
                                : undefined
                            return (
                                <div key={session.id}>
                                    <button
                                        type="button"
                                        onClick={() => selectSession(session.id)}
                                        className={`history-item w-[calc(100%-20px)] text-left ${selected ? 'active' : ''}`}
                                    >
                                        <div className="history-item-left">
                                            <SessionStatusIcon
                                                state={state}
                                                className={`history-icon ${state === 'open' ? 'green' : state === 'merged' ? 'purple' : 'gray'}`}
                                            />
                                            <span className="history-title">{title}</span>
                                        </div>
                                        <span className="history-stats">
                                            {additions ? `+${additions}` : formatHomeTime(session.updatedAt)}
                                            {deletions ? <span style={{ color: '#ef4444' }}> -{deletions}</span> : null}
                                        </span>
                                        <button type="button" className="history-archive" title="Archive" onClick={(event) => event.stopPropagation()}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z"/><path d="M10 12h4"/></svg>
                                        </button>
                                    </button>
                                    {childTitle ? (
                                        <button
                                            type="button"
                                            onClick={() => selectSession(session.id)}
                                            className="history-sub-item w-[calc(100%-20px)] text-left"
                                        >
                                            {childTitle}
                                        </button>
                                    ) : null}
                                </div>
                            )
                        })}
                        {visibleSessions.length === 0 && !isLoading ? (
                            <div className="px-4 py-3 text-[12px] text-[var(--text-tertiary)]">No sessions yet.</div>
                        ) : null}
                    </div>
                </div>
                {/* User card — bottom of sidebar */}
                <div className="sidebar-footer">
                    <div className="user-profile cursor-sidebar-user-profile">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--font-size-sm)] font-[var(--font-weight-semibold)] text-[var(--text-secondary)]">
                            H
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[var(--font-size-base)] text-[var(--text-primary)]">haqi</div>
                            <div className="text-[var(--font-size-xs)] text-[var(--text-tertiary)]">Self-hosted</div>
                        </div>
                        <button
                            type="button"
                            className="rounded-[6px] p-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="More options"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/settings' })}
                            className="rounded-[6px] p-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Customize thread list"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>
                        </button>
                    </div>
                </div>
            </>
        )
    }

    return (
        <SessionsLayoutContext.Provider value={{ toggleSidebarFromHeader, showDesktopSidebar, density }}>
            <div className="cursor-theme flex h-full min-h-0">
                <div
                    className={`${isSessionsIndex ? 'flex' : showDesktopSidebar ? 'hidden lg:flex' : 'hidden'} w-full lg:w-[var(--sessions-sidebar-width)] shrink-0 flex-col bg-[var(--bg-chrome)]`}
                    style={sidebarStyle}
                >
                    {renderSidebarContent()}
                </div>

                {!isSessionsIndex && !showDesktopSidebar && !isSessionChatRoute ? (
                    <button
                        type="button"
                        onClick={toggleDesktopSidebar}
                        className="fixed left-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-30 hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-hint)] shadow-sm transition-colors hover:text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)] lg:flex"
                        title={t('sessions.sidebar.showDesktop')}
                        aria-label={t('sessions.sidebar.showDesktop')}
                    >
                        <SidebarIcon className="h-5 w-5" />
                    </button>
                ) : null}

                {!isSessionsIndex && !isSessionChatRoute ? (
                    <button
                        type="button"
                        onClick={openSidebarOnMobile}
                        className="fixed left-3 top-[calc(4rem+env(safe-area-inset-top))] z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-hint)] shadow-sm transition-colors hover:text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)] lg:hidden"
                        title={t('sessions.sidebar.open')}
                        aria-label={t('sessions.sidebar.open')}
                    >
                        <SidebarIcon className="h-5 w-5" />
                    </button>
                ) : null}

                {mobileSidebarOpen ? (
                    <div className="fixed inset-0 z-40 flex lg:hidden">
                        <button
                            type="button"
                            onClick={closeSidebarOnMobile}
                            className="absolute inset-0 bg-black/35"
                            aria-label={t('sessions.sidebar.close')}
                        />
                        <div className="relative flex h-full w-[min(88vw,420px)] max-w-full flex-col border-r border-[var(--app-divider)] bg-[var(--app-bg)] shadow-xl">
                            {renderSidebarContent({ inDrawer: true, onClose: closeSidebarOnMobile })}
                        </div>
                    </div>
                ) : null}

                <div className={`${isSessionsIndex ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col bg-[var(--bg-editor)]`}>
                    {isSessionsIndex ? (
                        <HomeComposer onNewSession={openNewSession} onOpenSession={selectSession} sessions={visibleSessions} />
                    ) : (
                        <div className="flex-1 min-h-0">
                            <Outlet />
                        </div>
                    )}
                </div>
            </div>
        </SessionsLayoutContext.Provider>
    )
}

function SessionsIndexPage() {
    return null
}

function SessionPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const sessionsLayout = useSessionsLayoutContext()
    const density = sessionsLayout?.density ?? 'comfortable'
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const {
        session,
        refetch: refetchSession,
    } = useSession(api, sessionId)
    const { viewMode, setViewMode } = useChatViewMode()
    const {
        messages,
        warning: messagesWarning,
        isLoading: messagesLoading,
        isLoadingMore: messagesLoadingMore,
        hasMore: messagesHasMore,
        newestSeq,
        loadMore: loadMoreMessages,
        refetch: refetchMessages,
        pendingCount,
        messagesVersion,
        flushPending,
        setAtBottom,
    } = useMessages(api, sessionId, { enabled: viewMode === 'normal' || viewMode === 'cli' })
    const {
        turns,
        warning: turnsWarning,
        isLoading: turnsLoading,
        isLoadingMore: turnsLoadingMore,
        hasMore: turnsHasMore,
        loadMore: loadMoreTurns,
        refetch: refetchTurns
    } = useConversationTurns(api, sessionId, { enabled: viewMode === 'brief' })
    const {
        sendMessage,
        retryMessage,
        isSending,
    } = useSendMessage(api, sessionId, {
        resolveSessionId: async (currentSessionId) => {
            if (!api || !session || session.active) {
                return currentSessionId
            }
            try {
                return await api.resumeSession(currentSessionId)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Resume failed'
                addToast({
                    title: 'Resume failed',
                    body: message,
                    sessionId: currentSessionId,
                    url: ''
                })
                throw error
            }
        },
        onSessionResolved: (resolvedSessionId) => {
            void (async () => {
                if (api) {
                    if (session && resolvedSessionId !== session.id) {
                        seedMessageWindowFromSession(session.id, resolvedSessionId)
                        queryClient.setQueryData(queryKeys.session(resolvedSessionId), {
                            session: { ...session, id: resolvedSessionId, active: true }
                        })
                    }
                    try {
                        await Promise.all([
                            queryClient.prefetchQuery({
                                queryKey: queryKeys.session(resolvedSessionId),
                                queryFn: () => api.getSession(resolvedSessionId),
                            }),
                            fetchLatestMessages(api, resolvedSessionId),
                        ])
                    } catch {
                    }
                }
                navigate({
                    to: '/sessions/$sessionId',
                    params: { sessionId: resolvedSessionId },
                    replace: true
                })
            })()
        },
        onBlocked: (reason) => {
            if (reason === 'no-api') {
                addToast({
                    title: t('send.blocked.title'),
                    body: t('send.blocked.noConnection'),
                    sessionId: sessionId ?? '',
                    url: ''
                })
            }
            // 'no-session' and 'pending' don't need toast - either invalid state or expected behavior
        }
    })

    // Get agent type from session metadata for slash commands
    const agentType = session?.metadata?.flavor ?? 'claude'
    const {
        getSuggestions: getSlashSuggestions,
    } = useSlashCommands(api, sessionId, agentType)
    const {
        getSuggestions: getSkillSuggestions,
    } = useSkills(api, sessionId)

    const getAutocompleteSuggestions = useCallback(async (query: string) => {
        if (query.startsWith('$')) {
            return await getSkillSuggestions(query)
        }
        return await getSlashSuggestions(query)
    }, [getSkillSuggestions, getSlashSuggestions])

    const refreshSelectedSession = useCallback(() => {
        void refetchSession()
        void refetchMessages()
        void refetchTurns()
    }, [refetchMessages, refetchSession, refetchTurns])

    // ── Workbench panel state ──
    const isCloudSession = Boolean(
        session?.metadata?.executionBackend === 'cloud-self-hosted'
        || session?.metadata?.executionBackend === 'cloud-managed'
        || session?.metadata?.containerId
        || session?.metadata?.workspaceId
    )
    const [workbenchOpen, setWorkbenchOpen] = useState(isCloudSession)
    const { prInfo, checks, commits, files, branchStatus } = useGitHubPr(api, session ?? null)

    if (!session) {
        return (
            <div className="flex-1 flex items-center justify-center p-4">
                <LoadingState label="Loading session…" className="text-sm" />
            </div>
        )
    }

    return (
        <div className="chat-layout flex h-full min-h-0 bg-[var(--bg-editor)]">
            {/* Left: Chat */}
            <div className={`chat-main flex min-w-0 flex-col ${workbenchOpen ? 'flex-1' : 'w-full'}`}>
                <SessionChat
                    api={api}
                    session={session}
                    messages={messages}
                    messagesWarning={messagesWarning}
                    hasMoreMessages={messagesHasMore}
                    isLoadingMessages={messagesLoading}
                    isLoadingMoreMessages={messagesLoadingMore}
                    turns={turns}
                    turnsWarning={turnsWarning}
                    hasMoreTurns={turnsHasMore}
                    isLoadingTurns={turnsLoading}
                    isLoadingMoreTurns={turnsLoadingMore}
                    isSending={isSending}
                    pendingCount={pendingCount}
                    newestMessageSeq={newestSeq}
                    messagesVersion={messagesVersion}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onBack={goBack}
                    onRefresh={refreshSelectedSession}
                    onLoadMore={loadMoreMessages}
                    onLoadMoreTurns={loadMoreTurns}
                    onSend={sendMessage}
                    onFlushPending={flushPending}
                    onAtBottomChange={setAtBottom}
                    onRetryMessage={retryMessage}
                    autocompleteSuggestions={getAutocompleteSuggestions}
                    onToggleSidebar={sessionsLayout?.toggleSidebarFromHeader}
                    sidebarVisible={sessionsLayout?.showDesktopSidebar ?? false}
                    onToggleWorkbench={() => setWorkbenchOpen(v => !v)}
                    workbenchOpen={workbenchOpen}
                    density={density}
                />
            </div>

            {/* Right: RunWorkbench (Cursor-style panel) */}
            {workbenchOpen && (
                <div className="context-panel hidden w-[440px] min-w-[440px] max-w-[440px] shrink-0 lg:flex">
                    <RunWorkbench
                        session={session}
                        api={api}
                        prInfo={prInfo}
                        checks={checks}
                        commits={commits}
                        files={files}
                        branchStatus={branchStatus}
                        onClose={() => setWorkbenchOpen(false)}
                        onMerge={api ? async () => {
                            try {
                                const result = await api.mergeGitHubPr(session.id)
                                if (result.merged) {
                                    addToast({ title: 'PR Merged', body: `SHA: ${result.sha?.slice(0, 7)}`, sessionId: session.id, url: '' })
                                } else if (result.error) {
                                    addToast({ title: 'Merge failed', body: result.error, sessionId: session.id, url: '' })
                                }
                            } catch (err) {
                                addToast({ title: 'Merge failed', body: err instanceof Error ? err.message : 'Unknown error', sessionId: session.id, url: '' })
                            }
                        } : undefined}
                        onUpdateBranch={api ? async () => {
                            try {
                                const result = await api.updateGitHubBranch(session.id)
                                if (result.updated) {
                                    addToast({ title: 'Branch updated', body: 'Branch is now up to date.', sessionId: session.id, url: '' })
                                } else if (result.error) {
                                    addToast({ title: 'Update failed', body: result.error, sessionId: session.id, url: '' })
                                }
                            } catch (err) {
                                addToast({ title: 'Update failed', body: err instanceof Error ? err.message : 'Unknown error', sessionId: session.id, url: '' })
                            }
                        } : undefined}
                    />
                </div>
            )}
        </div>
    )
}

function SessionDetailRoute() {
    const pathname = useLocation({ select: location => location.pathname })
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const basePath = `/sessions/${sessionId}`
    const isChat = pathname === basePath || pathname === `${basePath}/`

    return isChat ? <SessionPage /> : <Outlet />
}

function NewSessionPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const search = useSearch({ from: '/sessions/new' })
    const goBack = useAppGoBack()
    const queryClient = useQueryClient()
    const { machines, isLoading: machinesLoading, error: machinesError } = useMachines(api, true)

    const handleCancel = useCallback(() => {
        navigate({ to: '/sessions' })
    }, [navigate])

    const handleSuccess = useCallback((result: SpawnResponse) => {
        if (result.type === 'accepted') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequests })
            navigate({
                to: '/settings/requests/$requestId',
                params: { requestId: result.requestId }
            })
            return
        }

        if (result.type !== 'success') {
            return
        }

        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        navigate({ to: '/sessions', replace: true })
        requestAnimationFrame(() => {
            navigate({
                to: '/sessions/$sessionId',
                params: { sessionId: result.sessionId },
            })
        })
    }, [navigate, queryClient])
    const formId = 'new-session-page-form'
    const submitDisabled = Boolean(machinesLoading || machinesError)

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                {!isTelegramApp() && (
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                )}
                <div className="flex-1 font-semibold">Create Session</div>
                <Button
                    type="submit"
                    form={formId}
                    size="sm"
                    disabled={submitDisabled}
                    className="hidden sm:inline-flex"
                >
                    Create
                </Button>
                <Button
                    type="submit"
                    form={formId}
                    size="sm"
                    disabled={submitDisabled}
                    className="h-8 w-8 p-0 text-base sm:hidden"
                    aria-label="Create"
                    title="Create"
                >
                    <span aria-hidden>✅</span>
                </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
                {machinesError ? (
                    <div className="p-3 text-sm text-red-600">
                        {machinesError}
                    </div>
                ) : null}

                <NewSession
                    api={api}
                    machines={machines}
                    isLoading={machinesLoading}
                    initialDirectory={search.directory}
                    initialMachineId={search.machineId}
                    initialCheckpointId={search.checkpointId}
                    initialSessionType={search.sessionType}
                    formId={formId}
                    onCancel={handleCancel}
                    onSuccess={handleSuccess}
                />
            </div>
        </div>
    )
}

function GroupListItem(props: {
    item: GroupDetail
    selected: boolean
    density: SessionListDensity
    onSelect: (groupId: string) => void
    onOpenActions: (groupId: string, point: { x: number; y: number }) => void
}) {
    const { item, selected, density, onSelect, onOpenActions } = props
    const { haptic } = usePlatform()
    const isCompact = density === 'compact'

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            haptic.impact('medium')
            onOpenActions(item.group.id, point)
        },
        onClick: () => {
            onSelect(item.group.id)
        },
        threshold: 500
    })

    return (
        <button
            type="button"
            {...longPressHandlers}
            className={`session-list-item flex w-full flex-col text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] select-none hover:bg-[var(--app-subtle-bg)] ${isCompact ? 'gap-0.5 px-2.5 py-1.5' : 'gap-1.5 pl-5 pr-3 py-3'} ${selected ? 'bg-[var(--app-subtle-bg)]' : ''}`}
            style={{ WebkitTouchCallout: 'none' }}
            aria-current={selected ? 'page' : undefined}
        >
            <div className={`truncate font-medium text-[var(--app-fg)] ${isCompact ? 'text-sm' : 'text-base'}`}>
                {item.group.name}
            </div>
            <div className={`truncate text-[var(--app-hint)] ${isCompact ? 'text-[11px]' : 'text-xs'}`}>
                {item.members.length} {item.members.length === 1 ? 'member' : 'members'}
            </div>
        </button>
    )
}

function filterGroupsBySearch(groups: GroupDetail[], query: string): GroupDetail[] {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
        return groups
    }
    return groups.filter((item) => {
        const name = item.group.name.toLowerCase()
        const description = (item.group.description ?? '').toLowerCase()
        const groupId = item.group.id.toLowerCase()
        return name.includes(normalizedQuery)
            || description.includes(normalizedQuery)
            || groupId.includes(normalizedQuery)
    })
}

function GroupsLayout() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const { groups, isLoading } = useGroups(api)
    const { density, toggleDensity } = useSessionListDensity()
    const { desktopSidebarHidden, setDesktopSidebarHidden, toggleDesktopSidebar } = useSessionSidebarVisibility()
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [groupSearchQuery, setGroupSearchQuery] = useState('')
    const [newGroupName, setNewGroupName] = useState('')
    const [newGroupDesc, setNewGroupDesc] = useState('')
    const [createError, setCreateError] = useState<string | null>(null)
    const [isCreateSubmitting, setIsCreateSubmitting] = useState(false)
    const [actionMenuOpen, setActionMenuOpen] = useState(false)
    const [actionAnchorPoint, setActionAnchorPoint] = useState({ x: 0, y: 0 })
    const [actionGroupId, setActionGroupId] = useState<string | null>(null)
    const [renameModalOpen, setRenameModalOpen] = useState(false)
    const [renameDraft, setRenameDraft] = useState('')
    const [renameError, setRenameError] = useState<string | null>(null)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const { createGroup, isPending: isCreatingGroup } = useGroupActions(api, null)
    const { updateGroup, deleteGroup, isPending: isActionPending } = useGroupActions(api, actionGroupId)
    const { sidebarWidth, isResizing, startSidebarResize } = useSessionSidebarWidth()

    const groupMatch = matchRoute({ to: '/groups/$groupId', fuzzy: true })
    const selectedGroupId = groupMatch ? groupMatch.groupId : null
    const isGroupsIndex = pathname === '/groups' || pathname === '/groups/'
    const showDesktopSidebar = isGroupsIndex || !desktopSidebarHidden
    const selectedGroup = selectedGroupId
        ? groups.find((item) => item.group.id === selectedGroupId) ?? null
        : null
    const toggleDensityLabel = density === 'comfortable'
        ? t('sessions.display.toggleToCompact')
        : t('sessions.display.toggleToComfortable')
    const desktopSidebarToggleLabel = showDesktopSidebar
        ? t('sessions.sidebar.hideDesktop')
        : t('sessions.sidebar.showDesktop')
    const sidebarStyle = { '--sessions-sidebar-width': `${sidebarWidth}px` } as CSSProperties
    const visibleGroups = useMemo(
        () => filterGroupsBySearch(groups, groupSearchQuery),
        [groups, groupSearchQuery]
    )
    const actionTarget = actionGroupId
        ? groups.find((item) => item.group.id === actionGroupId) ?? null
        : null
    const isCreateRequestInFlight = isCreatingGroup || isCreateSubmitting

    // Calculate total member count across all groups
    const totalMemberCount = visibleGroups.reduce((acc, item) => acc + item.members.length, 0)

    useEffect(() => {
        if (!actionGroupId) {
            return
        }
        if (!groups.some((item) => item.group.id === actionGroupId)) {
            setActionMenuOpen(false)
            setRenameModalOpen(false)
            setDeleteModalOpen(false)
            setActionGroupId(null)
        }
    }, [actionGroupId, groups])

    useEffect(() => {
        if (isGroupsIndex) {
            setMobileSidebarOpen(false)
        }
    }, [isGroupsIndex])

    useEffect(() => {
        if (isGroupsIndex && desktopSidebarHidden) {
            setDesktopSidebarHidden(false)
        }
    }, [isGroupsIndex, desktopSidebarHidden, setDesktopSidebarHidden])

    useEffect(() => {
        if (!isGroupsIndex || isLoading || groups.length === 0) {
            return
        }
        const firstGroupId = groups[0]?.group.id
        if (!firstGroupId) {
            return
        }
        navigate({
            to: '/groups/$groupId',
            params: { groupId: firstGroupId },
            replace: true
        })
    }, [groups, isGroupsIndex, isLoading, navigate])

    useEffect(() => {
        if (!mobileSidebarOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setMobileSidebarOpen(false)
            }
        }

        window.addEventListener('resize', handleResize)
        return () => {
            window.removeEventListener('resize', handleResize)
            document.body.style.overflow = previousOverflow
        }
    }, [mobileSidebarOpen])

    const handleCreate = async () => {
        if (isCreateRequestInFlight) {
            return
        }
        const trimmedName = newGroupName.trim()
        if (!trimmedName) {
            setCreateError('Name is required')
            return
        }
        setCreateError(null)
        setIsCreateSubmitting(true)
        try {
            const groupId = await createGroup({
                name: trimmedName,
                description: newGroupDesc.trim() || undefined
            })
            setShowCreateModal(false)
            setNewGroupName('')
            setNewGroupDesc('')
            navigate({ to: '/groups/$groupId', params: { groupId } })
        } catch (error) {
            setCreateError(error instanceof Error ? error.message : 'Failed to create group')
        } finally {
            setIsCreateSubmitting(false)
        }
    }

    const handleOpenGroupActions = (groupId: string, point: { x: number; y: number }) => {
        setActionGroupId(groupId)
        setActionAnchorPoint(point)
        setActionMenuOpen(true)
    }

    const handleOpenRename = () => {
        if (!actionTarget) {
            return
        }
        setRenameError(null)
        setRenameDraft(actionTarget.group.name)
        setRenameModalOpen(true)
    }

    const handleRenameGroup = async () => {
        if (!actionTarget) {
            return
        }
        const nextName = renameDraft.trim()
        if (!nextName) {
            setRenameError('Name is required')
            return
        }
        if (nextName === actionTarget.group.name) {
            setRenameModalOpen(false)
            return
        }
        setRenameError(null)
        try {
            await updateGroup({ name: nextName })
            setRenameModalOpen(false)
        } catch (error) {
            setRenameError(error instanceof Error ? error.message : 'Failed to rename group')
        }
    }

    const handleDeleteGroup = async () => {
        if (!actionTarget) {
            return
        }
        const removedGroupId = actionTarget.group.id
        await deleteGroup()
        setDeleteModalOpen(false)
        setActionMenuOpen(false)
        if (selectedGroupId === removedGroupId) {
            navigate({ to: '/groups' })
        }
    }

    const closeSidebarOnMobile = useCallback(() => {
        setMobileSidebarOpen(false)
    }, [])

    const toggleSidebarFromBar = useCallback(() => {
        if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
            toggleDesktopSidebar()
            return
        }
        setMobileSidebarOpen(true)
    }, [toggleDesktopSidebar])

    const renderSidebarContent = (options?: { inDrawer?: boolean; onClose?: () => void }) => {
        const inDrawer = options?.inDrawer === true
        const onClose = options?.onClose

        return (
            <>
                <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                    {/* Tab switcher row - exactly matching SessionsPage */}
                    <div className="mx-auto w-full max-w-content flex items-center justify-between border-b border-[var(--app-divider)] px-3 py-2">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    onClose?.()
                                    navigate({ to: '/sessions' })
                                }}
                                className="rounded-md px-2.5 py-1.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                            >
                                Sessions
                            </button>
                            <button
                                type="button"
                                className="rounded-md px-2.5 py-1.5 text-xs bg-[var(--app-button)] text-[var(--app-button-text)] font-medium"
                            >
                                Groups
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onClose?.()
                                    navigate({ to: '/review-loops' })
                                }}
                                className="rounded-md px-2.5 py-1.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                            >
                                Loops
                            </button>
                            <button
                                type="button"
                                onClick={() => { onClose?.(); navigate({ to: '/settings/cloud-agents' }) }}
                                className="rounded-md px-2.5 py-1.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                            >
                                Cloud
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {!isGroupsIndex ? (
                                <button
                                    type="button"
                                    onClick={toggleDesktopSidebar}
                                    className="hidden lg:flex p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                    title={desktopSidebarToggleLabel}
                                    aria-label={desktopSidebarToggleLabel}
                                >
                                    <SidebarIcon className="h-4 w-4" />
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={toggleDensity}
                                className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                title={toggleDensityLabel}
                                aria-label={toggleDensityLabel}
                            >
                                <DensityIcon className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate({ to: '/settings' })}
                                className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                title={t('settings.title')}
                            >
                                <SettingsIcon className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(true)}
                                className="session-list-new-button p-1.5 rounded-full text-[var(--app-link)] transition-colors"
                                title="New Group"
                                aria-label="New Group"
                            >
                                <PlusIcon className="h-5 w-5" />
                            </button>
                            {inDrawer && onClose ? (
                                <>
                                    <span className="mx-0.5 h-5 w-px bg-[var(--app-divider)]" aria-hidden="true" />
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-1.5 rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                        title={t('sessions.sidebar.close')}
                                        aria-label={t('sessions.sidebar.close')}
                                    >
                                        <CloseIcon className="h-4 w-4" />
                                    </button>
                                </>
                            ) : null}
                        </div>
                    </div>
                    {/* Count info row - matching SessionsPage */}
                    <div className="mx-auto w-full max-w-content flex items-center justify-between px-3 py-1.5">
                        <div className="text-xs text-[var(--app-hint)]">
                            {visibleGroups.length} {visibleGroups.length === 1 ? 'group' : 'groups'} • {totalMemberCount} {totalMemberCount === 1 ? 'member' : 'members'}
                        </div>
                    </div>
                    <div className="mx-auto w-full max-w-content px-3 pb-2">
                        <input
                            value={groupSearchQuery}
                            onChange={(e) => setGroupSearchQuery(e.target.value)}
                            placeholder={t('groups.search.placeholder')}
                            className="w-full rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--app-link)]"
                        />
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {isLoading ? (
                        <div className="px-3 py-4 text-sm text-[var(--app-hint)]">Loading...</div>
                    ) : visibleGroups.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-[var(--app-hint)]">
                            {groupSearchQuery.trim() ? 'No groups match.' : 'No groups yet.'}
                        </div>
                    ) : (
                        <div className="py-1">
                            {visibleGroups.map((item) => (
                                <GroupListItem
                                    key={item.group.id}
                                    item={item}
                                    selected={selectedGroupId === item.group.id}
                                    density={density}
                                    onSelect={(groupId) => {
                                        setActionMenuOpen(false)
                                        setMobileSidebarOpen(false)
                                        navigate({ to: '/groups/$groupId', params: { groupId } })
                                    }}
                                    onOpenActions={handleOpenGroupActions}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </>
        )
    }

    return (
        <div className="flex h-full min-h-0">
            {/* Sidebar - matching SessionsPage width system */}
            <div
                className={`${isGroupsIndex ? 'flex' : showDesktopSidebar ? 'hidden lg:flex' : 'hidden'} w-full lg:w-[var(--sessions-sidebar-width)] shrink-0 flex-col border-r border-[var(--app-divider)] bg-[var(--app-bg)]`}
                style={sidebarStyle}
            >
                {renderSidebarContent()}
            </div>

            {/* Sidebar resize handle - matching SessionsPage */}
            <div
                className={`${showDesktopSidebar ? 'hidden lg:block' : 'hidden'} group relative w-2 shrink-0 cursor-col-resize`}
                role="separator"
                aria-orientation="vertical"
                aria-label={t('sessions.sidebar.resize')}
                title={t('sessions.sidebar.resize')}
                onPointerDown={startSidebarResize}
            >
                <div
                    className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${isResizing ? 'bg-[var(--app-link)]' : 'bg-transparent group-hover:bg-[var(--app-divider)]'}`}
                />
            </div>

            {/* Main area */}
            <div className={`${isGroupsIndex ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col bg-[var(--app-bg)]`}>
                {!isGroupsIndex ? (
                    <div className="flex items-center gap-2 border-b border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] lg:pt-2">
                        <button
                            type="button"
                            onClick={toggleSidebarFromBar}
                            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title={t('sessions.sidebar.open')}
                            aria-label={t('sessions.sidebar.open')}
                        >
                            <SidebarIcon className="h-5 w-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <span className="truncate text-sm font-semibold text-[var(--app-fg)]">
                                {selectedGroup?.group.name ?? 'Group'}
                            </span>
                            {selectedGroup?.group.description?.trim() ? (
                                <span className="ml-1.5 truncate text-xs text-[var(--app-hint)]">
                                    {selectedGroup.group.description}
                                </span>
                            ) : null}
                        </div>
                    </div>
                ) : null}
                <div className="flex-1 min-h-0">
                    <Outlet />
                </div>
            </div>

            {mobileSidebarOpen ? (
                <div
                    className="fixed inset-0 z-40 flex lg:hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Groups sidebar"
                >
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/35"
                        onClick={closeSidebarOnMobile}
                        aria-label={t('sessions.sidebar.close')}
                    />
                    <div className="relative flex h-full w-[min(88vw,420px)] max-w-full flex-col border-r border-[var(--app-divider)] bg-[var(--app-bg)] shadow-xl">
                        {renderSidebarContent({ inDrawer: true, onClose: closeSidebarOnMobile })}
                    </div>
                </div>
            ) : null}

            {/* Create group modal */}
            {showCreateModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-xl">
                        <div className="mb-3 font-semibold text-[var(--app-fg)]">New Group</div>
                        <input
                            autoFocus
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { void handleCreate() } }}
                            placeholder="Group name"
                            className="mb-2 w-full rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--app-link)]"
                        />
                        <input
                            value={newGroupDesc}
                            onChange={(e) => setNewGroupDesc(e.target.value)}
                            placeholder="Description (optional)"
                            className="mb-3 w-full rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--app-link)]"
                        />
                        {createError ? (
                            <div className="mb-2 text-xs text-red-600">{createError}</div>
                        ) : null}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { setShowCreateModal(false); setCreateError(null) }}
                                className="rounded-md border border-[var(--app-divider)] px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleCreate() }}
                                disabled={isCreateRequestInFlight}
                                className="rounded-md bg-[var(--app-link)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
                            >
                                {isCreateRequestInFlight ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <SessionActionMenu
                isOpen={actionMenuOpen && Boolean(actionTarget)}
                onClose={() => setActionMenuOpen(false)}
                sessionActive={false}
                onRename={handleOpenRename}
                onArchive={() => {}}
                onDelete={() => {
                    setRenameModalOpen(false)
                    setRenameError(null)
                    setDeleteModalOpen(true)
                }}
                anchorPoint={actionAnchorPoint}
            />

            {renameModalOpen && actionTarget ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-xl">
                        <div className="mb-3 font-semibold text-[var(--app-fg)]">Rename Group</div>
                        <input
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { void handleRenameGroup() } }}
                            placeholder="Group name"
                            className="mb-2 w-full rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--app-link)]"
                        />
                        {renameError ? (
                            <div className="mb-2 text-xs text-red-600">{renameError}</div>
                        ) : null}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setRenameModalOpen(false)
                                    setRenameError(null)
                                }}
                                className="rounded-md border border-[var(--app-divider)] px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleRenameGroup() }}
                                disabled={isActionPending}
                                className="rounded-md bg-[var(--app-link)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
                            >
                                {isActionPending ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <ConfirmDialog
                isOpen={deleteModalOpen && Boolean(actionTarget)}
                onClose={() => setDeleteModalOpen(false)}
                title="Delete Group"
                description={
                    actionTarget
                        ? `Are you sure you want to delete "${actionTarget.group.name}"? This action cannot be undone.`
                        : 'Are you sure you want to delete this group?'
                }
                confirmLabel="Delete"
                confirmingLabel="Deleting..."
                onConfirm={handleDeleteGroup}
                isPending={isActionPending}
                destructive
            />
        </div>
    )
}

function GroupsIndexPage() {
    return (
        <div className="flex h-full items-center justify-center text-sm text-[var(--app-hint)]">
            Select a group to get started
        </div>
    )
}

// ─── ReviewLoops ────────────────────────────────────────────────────────────────

function formatLoopAge(ts: number): string {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
}

function LoopListItem(props: {
    item: ReviewLoop
    selected: boolean
    density: SessionListDensity
    onSelect: (loopId: string) => void
}) {
    const { item, selected, density, onSelect } = props
    const isCompact = density === 'compact'
    const truncatedReq = item.requirement.length > 50
        ? item.requirement.slice(0, 50) + '...'
        : item.requirement

    return (
        <button
            type="button"
            onClick={() => onSelect(item.id)}
            className={`session-list-item flex w-full flex-col text-left font-mono transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--app-link)] select-none hover:bg-[var(--app-subtle-bg)] ${isCompact ? 'gap-0.5 px-2.5 py-1.5' : 'gap-1 pl-3 pr-3 py-2.5'} ${selected ? 'bg-[var(--app-subtle-bg)]' : ''}`}
            style={{ WebkitTouchCallout: 'none' }}
            aria-current={selected ? 'page' : undefined}
        >
            <div className={`flex items-center gap-2 min-w-0 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                <span className="truncate min-w-0 text-[var(--app-fg)]">{truncatedReq}</span>
            </div>
            <div className={`flex items-center gap-2 flex-wrap ${isCompact ? 'text-[10px]' : 'text-[11px]'}`}>
                <ReviewLoopStatusBadge status={item.status} />
                <span className="text-[var(--app-hint)]">
                    R{item.currentRound}/{item.maxRounds}
                </span>
                <span className="text-[var(--app-hint)]">
                    {formatLoopAge(item.updatedAt)}
                </span>
            </div>
        </button>
    )
}

function filterLoopsBySearch(loops: ReviewLoop[], query: string): ReviewLoop[] {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
        return loops
    }
    return loops.filter((item) => {
        const req = item.requirement.toLowerCase()
        const criteria = item.acceptanceCriteria.toLowerCase()
        const loopId = item.id.toLowerCase()
        const status = item.status.toLowerCase()
        return req.includes(normalizedQuery)
            || criteria.includes(normalizedQuery)
            || loopId.includes(normalizedQuery)
            || status.includes(normalizedQuery)
    })
}

function ReviewLoopsLayout() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const { loops, isLoading } = useReviewLoops(api)
    const { sessions } = useSessions(api)
    const { density, toggleDensity } = useSessionListDensity()
    const { desktopSidebarHidden, setDesktopSidebarHidden, toggleDesktopSidebar } = useSessionSidebarVisibility()
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const [loopSearchQuery, setLoopSearchQuery] = useState('')
    const [createModalOpen, setCreateModalOpen] = useState(false)
    const { sidebarWidth, isResizing, startSidebarResize } = useSessionSidebarWidth()

    const handleCreateLoop = useCallback(async (data: CreateLoopData) => {
        if (!api) return
        try {
            const result = await api.createReviewLoop({
                workerSessionId: data.workerSessionId,
                reviewerSessionId: data.reviewerSessionId,
                requirement: data.requirement,
                acceptanceCriteria: data.acceptanceCriteria,
                maxRounds: data.maxRounds,
                userPreference: data.userPreference,
            })
            setCreateModalOpen(false)
            const loopId = result.loop?.id
            if (loopId) {
                // Initiate the first round
                try {
                    await api.initiateReviewLoop(loopId)
                } catch {
                    // Loop created but initiation failed — user can retry from detail page
                }
                navigate({ to: '/review-loops/$loopId', params: { loopId } })
            }
        } catch (e) {
            console.error('Failed to create loop:', e)
        }
    }, [api, navigate])

    const loopMatch = matchRoute({ to: '/review-loops/$loopId', fuzzy: true })
    const selectedLoopId = loopMatch ? loopMatch.loopId : null
    const isLoopsIndex = pathname === '/review-loops' || pathname === '/review-loops/'
    const showDesktopSidebar = isLoopsIndex || !desktopSidebarHidden
    const toggleDensityLabel = density === 'comfortable'
        ? t('sessions.display.toggleToCompact')
        : t('sessions.display.toggleToComfortable')
    const desktopSidebarToggleLabel = showDesktopSidebar
        ? t('sessions.sidebar.hideDesktop')
        : t('sessions.sidebar.showDesktop')
    const sidebarStyle = { '--sessions-sidebar-width': `${sidebarWidth}px` } as CSSProperties

    const visibleLoops = useMemo(
        () => filterLoopsBySearch(loops, loopSearchQuery),
        [loops, loopSearchQuery]
    )

    const activeCount = visibleLoops.filter((l) => l.status === 'executing' || l.status === 'reviewing' || l.status === 'waiting_user').length

    useEffect(() => {
        if (isLoopsIndex) {
            setMobileSidebarOpen(false)
        }
    }, [isLoopsIndex])

    useEffect(() => {
        if (isLoopsIndex && desktopSidebarHidden) {
            setDesktopSidebarHidden(false)
        }
    }, [isLoopsIndex, desktopSidebarHidden, setDesktopSidebarHidden])

    useEffect(() => {
        if (!mobileSidebarOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setMobileSidebarOpen(false)
            }
        }

        window.addEventListener('resize', handleResize)
        return () => {
            window.removeEventListener('resize', handleResize)
            document.body.style.overflow = previousOverflow
        }
    }, [mobileSidebarOpen])

    const closeSidebarOnMobile = useCallback(() => {
        setMobileSidebarOpen(false)
    }, [])

    const toggleSidebarFromBar = useCallback(() => {
        if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
            toggleDesktopSidebar()
            return
        }
        setMobileSidebarOpen(true)
    }, [toggleDesktopSidebar])

    const selectedLoop = selectedLoopId
        ? loops.find((item) => item.id === selectedLoopId) ?? null
        : null

    const renderSidebarContent = (options?: { inDrawer?: boolean; onClose?: () => void }) => {
        const inDrawer = options?.inDrawer === true
        const onClose = options?.onClose

        return (
            <>
                <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)] font-mono">
                    {/* Tab switcher row - terminal style */}
                    <div className="mx-auto w-full max-w-content flex items-center justify-between border-b border-[var(--app-divider)] px-3 py-2">
                        <div className="flex items-center gap-0.5 text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    onClose?.()
                                    navigate({ to: '/sessions' })
                                }}
                                className="border border-[var(--app-divider)] rounded-sm px-2 py-1 text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                            >
                                Sessions
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onClose?.()
                                    navigate({ to: '/groups' })
                                }}
                                className="border border-[var(--app-divider)] rounded-sm px-2 py-1 text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                            >
                                Groups
                            </button>
                            <button
                                type="button"
                                className="border border-[var(--app-fg)] rounded-sm px-2 py-1 bg-[var(--app-fg)] text-[var(--app-bg)] font-medium"
                            >
                                Loops
                            </button>
                            <button
                                type="button"
                                onClick={() => { onClose?.(); navigate({ to: '/settings/cloud-agents' }) }}
                                className="border border-[var(--app-divider)] rounded-sm px-2 py-1 text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                            >
                                Cloud
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {!isLoopsIndex ? (
                                <button
                                    type="button"
                                    onClick={toggleDesktopSidebar}
                                    className="hidden lg:flex p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                    title={desktopSidebarToggleLabel}
                                    aria-label={desktopSidebarToggleLabel}
                                >
                                    <SidebarIcon className="h-4 w-4" />
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={toggleDensity}
                                className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                title={toggleDensityLabel}
                                aria-label={toggleDensityLabel}
                            >
                                <DensityIcon className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate({ to: '/settings' })}
                                className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                title={t('settings.title')}
                            >
                                <SettingsIcon className="h-5 w-5" />
                            </button>
                            {inDrawer && onClose ? (
                                <>
                                    <span className="mx-0.5 h-5 w-px bg-[var(--app-divider)]" aria-hidden="true" />
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-1.5 rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                        title={t('sessions.sidebar.close')}
                                        aria-label={t('sessions.sidebar.close')}
                                    >
                                        <CloseIcon className="h-4 w-4" />
                                    </button>
                                </>
                            ) : null}
                        </div>
                    </div>
                    {/* Count info row */}
                    <div className="mx-auto w-full max-w-content flex items-center justify-between px-3 py-1.5">
                        <div className="text-xs text-[var(--app-hint)]">
                            {visibleLoops.length} {visibleLoops.length === 1 ? 'loop' : 'loops'} {activeCount > 0 ? `\u2022 ${activeCount} active` : ''}
                        </div>
                        <button
                            type="button"
                            onClick={() => setCreateModalOpen(true)}
                            className="rounded-sm border border-[var(--app-divider)] px-2 py-0.5 font-mono text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:border-[var(--app-fg)] transition-colors"
                        >
                            + new
                        </button>
                    </div>
                    <div className="mx-auto w-full max-w-content px-3 pb-2">
                        <input
                            value={loopSearchQuery}
                            onChange={(e) => setLoopSearchQuery(e.target.value)}
                            placeholder="/ search..."
                            className="w-full rounded-sm border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-1.5 text-xs font-mono outline-none focus:border-[var(--app-link)]"
                        />
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {isLoading ? (
                        <div className="px-3 py-4 text-sm text-[var(--app-hint)]">Loading...</div>
                    ) : visibleLoops.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-[var(--app-hint)]">
                            {loopSearchQuery.trim() ? 'No loops match.' : 'No review loops yet.'}
                        </div>
                    ) : (
                        <div className="py-1">
                            {visibleLoops.map((item) => (
                                <LoopListItem
                                    key={item.id}
                                    item={item}
                                    selected={selectedLoopId === item.id}
                                    density={density}
                                    onSelect={(loopId) => {
                                        setMobileSidebarOpen(false)
                                        navigate({ to: '/review-loops/$loopId', params: { loopId } })
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </>
        )
    }

    return (
        <div className="flex h-full min-h-0">
            {/* Sidebar */}
            <div
                className={`${isLoopsIndex ? 'flex' : showDesktopSidebar ? 'hidden lg:flex' : 'hidden'} w-full lg:w-[var(--sessions-sidebar-width)] shrink-0 flex-col border-r border-[var(--app-divider)] bg-[var(--app-bg)]`}
                style={sidebarStyle}
            >
                {renderSidebarContent()}
            </div>

            {/* Sidebar resize handle */}
            <div
                className={`${showDesktopSidebar ? 'hidden lg:block' : 'hidden'} group relative w-2 shrink-0 cursor-col-resize`}
                role="separator"
                aria-orientation="vertical"
                aria-label={t('sessions.sidebar.resize')}
                title={t('sessions.sidebar.resize')}
                onPointerDown={startSidebarResize}
            >
                <div
                    className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${isResizing ? 'bg-[var(--app-link)]' : 'bg-transparent group-hover:bg-[var(--app-divider)]'}`}
                />
            </div>

            {/* Main area */}
            <div className={`${isLoopsIndex ? 'hidden lg:flex' : 'flex'} min-w-0 min-h-0 flex-1 flex-col bg-[var(--app-bg)]`}>
                {!isLoopsIndex ? (
                    <div className="flex items-center gap-2 border-b border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] lg:pt-2">
                        <button
                            type="button"
                            onClick={toggleSidebarFromBar}
                            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title={t('sessions.sidebar.open')}
                            aria-label={t('sessions.sidebar.open')}
                        >
                            <SidebarIcon className="h-5 w-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <span className="truncate text-sm font-mono text-[var(--app-fg)]">
                                {selectedLoop
                                    ? (selectedLoop.requirement.length > 60
                                        ? selectedLoop.requirement.slice(0, 60) + '...'
                                        : selectedLoop.requirement)
                                    : 'review-loop'}
                            </span>
                        </div>
                    </div>
                ) : null}
                <div className="flex-1 min-h-0">
                    <Outlet />
                </div>
            </div>

            {mobileSidebarOpen ? (
                <div
                    className="fixed inset-0 z-40 flex lg:hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Loops sidebar"
                >
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/35"
                        onClick={closeSidebarOnMobile}
                        aria-label={t('sessions.sidebar.close')}
                    />
                    <div className="relative flex h-full w-[min(88vw,420px)] max-w-full flex-col border-r border-[var(--app-divider)] bg-[var(--app-bg)] shadow-xl">
                        {renderSidebarContent({ inDrawer: true, onClose: closeSidebarOnMobile })}
                    </div>
                </div>
            ) : null}

            <CreateLoopModal
                open={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                onSubmit={handleCreateLoop}
                sessions={sessions}
            />
        </div>
    )
}

const rootRoute = createRootRoute({
    component: App,
})

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Navigate to="/sessions" replace />,
})

const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions',
    component: SessionsPage,
})

const sessionsIndexRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '/',
    component: SessionsIndexPage,
})

const sessionDetailRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '$sessionId',
    component: SessionDetailRoute,
})

const sessionFilesRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'files',
    validateSearch: (search: Record<string, unknown>): { tab?: 'changes' | 'directories' } => {
        const tabValue = typeof search.tab === 'string' ? search.tab : undefined
        const tab = tabValue === 'directories'
            ? 'directories'
            : tabValue === 'changes'
                ? 'changes'
                : undefined

        return tab ? { tab } : {}
    },
    component: FilesPage,
})

const sessionTerminalRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'terminal',
    component: TerminalPage,
})

const sessionPreviewRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'preview',
    component: PreviewPage,
})

const sessionDesktopRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'desktop',
    component: DesktopPage,
})

type SessionFileSearch = {
    path: string
    staged?: boolean
    tab?: 'changes' | 'directories'
}

const sessionFileRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'file',
    validateSearch: (search: Record<string, unknown>): SessionFileSearch => {
        const path = typeof search.path === 'string' ? search.path : ''
        const staged = search.staged === true || search.staged === 'true'
            ? true
            : search.staged === false || search.staged === 'false'
                ? false
                : undefined

        const tabValue = typeof search.tab === 'string' ? search.tab : undefined
        const tab = tabValue === 'directories'
            ? 'directories'
            : tabValue === 'changes'
                ? 'changes'
                : undefined

        const result: SessionFileSearch = { path }
        if (staged !== undefined) {
            result.staged = staged
        }
        if (tab !== undefined) {
            result.tab = tab
        }
        return result
    },
    component: FilePage,
})

const newSessionRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: 'new',
    validateSearch: (search: Record<string, unknown>): NewSessionSearch => {
        const directoryRaw = typeof search.directory === 'string' ? search.directory : undefined
        const machineIdRaw = typeof search.machineId === 'string' ? search.machineId : undefined
        const checkpointIdRaw = typeof search.checkpointId === 'string' ? search.checkpointId : undefined
        const sessionTypeRaw = typeof search.sessionType === 'string' ? search.sessionType : undefined

        const result: NewSessionSearch = {}
        if (directoryRaw && directoryRaw.trim().length > 0) {
            result.directory = directoryRaw
        }
        if (machineIdRaw && machineIdRaw.trim().length > 0) {
            result.machineId = machineIdRaw
        }
        if (checkpointIdRaw && checkpointIdRaw.trim().length > 0) {
            result.checkpointId = checkpointIdRaw
        }
        if (sessionTypeRaw && sessionTypeRaw.trim().length > 0) {
            result.sessionType = sessionTypeRaw
        }
        return result
    },
    component: NewSessionPage,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsLayout,
})

const settingsIndexRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/',
    component: SettingsIndexPage,
})

const settingsOverviewRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'overview',
    component: SettingsOverviewPage,
})

const settingsGeneralRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'general',
    component: SettingsGeneralPage,
})

const settingsCloudAgentsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'cloud-agents',
    component: SettingsCloudAgentsPage,
})

const settingsBugbotRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'bugbot',
    component: BugbotPlaceholderPage,
})

const settingsPluginsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'plugins',
    component: PluginsPlaceholderPage,
})

const settingsIntegrationsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'integrations',
    component: IntegrationsPlaceholderPage,
})

const settingsMembersRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'members',
    component: MembersPlaceholderPage,
})

const settingsUsageRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'usage',
    component: UsagePlaceholderPage,
})

const settingsSpendingRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'spending',
    component: SpendingPlaceholderPage,
})

const settingsBillingRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'billing',
    component: BillingPlaceholderPage,
})

const settingsAdvancedRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'advanced',
    component: SettingsAdvancedPage,
})

const settingsContainersRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'containers',
    component: CloudContainersPage,
})

const settingsCheckpointsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'checkpoints',
    component: CloudCheckpointsPage,
})

const settingsRequestsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'requests',
    component: CloudRequestsPage,
})

const settingsRequestDetailRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'requests/$requestId',
    component: () => {
        const { requestId } = useParams({ from: '/settings/requests/$requestId' })
        return <CloudRequestDetailContent requestId={requestId} />
    },
})

const settingsWorkspacesRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'workspaces',
    component: CloudWorkspacesPage,
})

const settingsWorkspaceDetailRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'workspaces/$workspaceId',
    component: () => {
        const { workspaceId } = useParams({ from: '/settings/workspaces/$workspaceId' })
        return <CloudWorkspaceDetailContent workspaceId={workspaceId} />
    },
})

const settingsOnboardRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'onboard',
    component: CloudOnboardPage,
})

const settingsAutomationsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'automations',
    component: CloudAutomationsPage,
})

const debugDiffRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/debug/diff',
    component: DebugDiffPage,
})

const cloudRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cloud',
    component: Outlet,
})

const cloudIndexRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: '/',
    component: CloudIndexPage,
})

const cloudRequestDetailRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'requests/$requestId',
    component: () => {
        const { requestId } = useParams({ from: '/cloud/requests/$requestId' })
        return <Navigate to="/settings/requests/$requestId" params={{ requestId }} replace />
    },
})

const cloudWorkspaceDetailRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'workspaces/$workspaceId',
    component: () => {
        const { workspaceId } = useParams({ from: '/cloud/workspaces/$workspaceId' })
        return <Navigate to="/settings/workspaces/$workspaceId" params={{ workspaceId }} replace />
    },
})

const cloudSecretsRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'secrets',
    component: CloudSecretsRedirectPage,
})

const cloudWorkersRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'workers',
    component: CloudWorkersRedirectPage,
})

const cloudContainersRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'containers',
    component: CloudContainersRedirectPage,
})

const cloudCheckpointsRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'checkpoints',
    component: CloudCheckpointsRedirectPage,
})

const cloudRequestsRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'requests',
    component: CloudRequestsRedirectPage,
})

const cloudWorkspacesRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'workspaces',
    component: CloudWorkspacesRedirectPage,
})

const cloudOnboardRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'onboard',
    component: CloudOnboardRedirectPage,
})

const cloudAutomationsRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'automations',
    component: CloudAutomationsRedirectPage,
})

const cloudAdvancedRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'advanced',
    component: CloudAdvancedRedirectPage,
})

const cloudDashboardRoute = createRoute({
    getParentRoute: () => cloudRoute,
    path: 'dashboard',
    component: CloudDashboardRedirectPage,
})

const groupsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/groups',
    component: GroupsLayout,
})

const groupsIndexRoute = createRoute({
    getParentRoute: () => groupsRoute,
    path: '/',
    component: GroupsIndexPage,
})

const groupDetailRoute = createRoute({
    getParentRoute: () => groupsRoute,
    path: '$groupId',
    component: GroupDetailPage,
})

const reviewLoopsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/review-loops',
    component: ReviewLoopsLayout,
})

const reviewLoopsIndexRoute = createRoute({
    getParentRoute: () => reviewLoopsRoute,
    path: '/',
    component: ReviewLoopsIndexPage,
})

const reviewLoopDetailRoute = createRoute({
    getParentRoute: () => reviewLoopsRoute,
    path: '$loopId',
    component: ReviewLoopDetailPage,
})

export const routeTree = rootRoute.addChildren([
    indexRoute,
    debugDiffRoute,
    cloudRoute.addChildren([
        cloudIndexRoute,
        cloudWorkersRoute,
        cloudContainersRoute,
        cloudCheckpointsRoute,
        cloudSecretsRoute,
        cloudRequestsRoute,
        cloudRequestDetailRoute,
        cloudWorkspacesRoute,
        cloudWorkspaceDetailRoute,
        cloudOnboardRoute,
        cloudAutomationsRoute,
        cloudAdvancedRoute,
        cloudDashboardRoute,
    ]),
    sessionsRoute.addChildren([
        sessionsIndexRoute,
        newSessionRoute,
        sessionDetailRoute.addChildren([
            sessionPreviewRoute,
            sessionDesktopRoute,
            sessionTerminalRoute,
            sessionFilesRoute,
            sessionFileRoute,
        ]),
    ]),
    groupsRoute.addChildren([
        groupsIndexRoute,
        groupDetailRoute,
    ]),
    reviewLoopsRoute.addChildren([
        reviewLoopsIndexRoute,
        reviewLoopDetailRoute,
    ]),
    settingsRoute.addChildren([
        settingsIndexRoute,
        settingsOverviewRoute,
        settingsGeneralRoute,
        settingsCloudAgentsRoute,
        settingsBugbotRoute,
        settingsPluginsRoute,
        settingsIntegrationsRoute,
        settingsMembersRoute,
        settingsUsageRoute,
        settingsSpendingRoute,
        settingsBillingRoute,
        settingsAdvancedRoute,
        settingsContainersRoute,
        settingsCheckpointsRoute,
        settingsOnboardRoute,
        settingsRequestsRoute,
        settingsRequestDetailRoute,
        settingsWorkspacesRoute,
        settingsWorkspaceDetailRoute,
        settingsAutomationsRoute,
    ]),
])

type RouterHistory = Parameters<typeof createRouter>[0]['history']

export function createAppRouter(history?: RouterHistory) {
    return createRouter({
        routeTree,
        history,
        scrollRestoration: true,
    })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
    interface Register {
        router: AppRouter
    }
}
