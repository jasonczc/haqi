import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties } from 'react'
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
import { SessionList, type NewSessionPreset } from '@/components/SessionList'
import { NewSession } from '@/components/NewSession'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useMessages } from '@/hooks/queries/useMessages'
import { useMachines } from '@/hooks/queries/useMachines'
import { useSession } from '@/hooks/queries/useSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/use-translation'
import { fetchLatestMessages, seedMessageWindowFromSession } from '@/lib/message-window-store'
import { useSessionListDensity } from '@/hooks/useSessionListDensity'
import { useSessionSidebarWidth } from '@/hooks/useSessionSidebarWidth'
import { useSessionSidebarVisibility } from '@/hooks/useSessionSidebarVisibility'
import FilesPage from '@/routes/sessions/files'
import FilePage from '@/routes/sessions/file'
import TerminalPage from '@/routes/sessions/terminal'
import SettingsPage from '@/routes/settings'

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

type NewSessionSearch = {
    directory?: string
    machineId?: string
}

type SessionsLayoutContextValue = {
    toggleSidebarFromHeader: () => void
    showDesktopSidebar: boolean
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

function SessionsPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const { sessions, isLoading, error, refetch } = useSessions(api)
    const { density, toggleDensity } = useSessionListDensity()
    const { sidebarWidth, isResizing, startSidebarResize } = useSessionSidebarWidth()
    const { desktopSidebarHidden, setDesktopSidebarHidden, toggleDesktopSidebar } = useSessionSidebarVisibility()
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

    const handleRefresh = useCallback(() => {
        void refetch()
    }, [refetch])

    const openNewSession = useCallback((preset?: NewSessionPreset) => {
        setMobileSidebarOpen(false)
        navigate({
            to: '/sessions/new',
            search: toNewSessionSearch(preset)
        })
    }, [navigate])

    const projectCount = new Set(sessions.map(s => s.metadata?.worktree?.basePath ?? s.metadata?.path ?? 'Other')).size
    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const chatRouteMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: false })
    const selectedSessionId = sessionMatch && sessionMatch.sessionId !== 'new' ? sessionMatch.sessionId : null
    const isSessionChatRoute = Boolean(chatRouteMatch && chatRouteMatch.sessionId !== 'new')
    const isSessionsIndex = pathname === '/sessions' || pathname === '/sessions/'
    const showDesktopSidebar = isSessionsIndex || !desktopSidebarHidden
    const toggleDensityLabel = density === 'comfortable'
        ? t('sessions.display.toggleToCompact')
        : t('sessions.display.toggleToComfortable')
    const desktopSidebarToggleLabel = showDesktopSidebar
        ? t('sessions.sidebar.hideDesktop')
        : t('sessions.sidebar.showDesktop')
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
                <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                    <div className="mx-auto w-full max-w-content flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <div className="text-xs text-[var(--app-hint)]">
                                {t('sessions.count', { n: sessions.length, m: projectCount })}
                            </div>
                            {!isSessionsIndex ? (
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
                        </div>
                        <div className="flex items-center gap-1.5">
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
                                onClick={() => openNewSession()}
                                className="session-list-new-button p-1.5 rounded-full text-[var(--app-link)] transition-colors"
                                title={t('sessions.new')}
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
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto desktop-scrollbar-left">
                    {error ? (
                        <div className="mx-auto w-full max-w-content px-3 py-2">
                            <div className="text-sm text-red-600">{error}</div>
                        </div>
                    ) : null}
                    <SessionList
                        sessions={sessions}
                        selectedSessionId={selectedSessionId}
                        onSelect={selectSession}
                        onNewSession={openNewSession}
                        onRefresh={handleRefresh}
                        isLoading={isLoading}
                        renderHeader={false}
                        api={api}
                        density={density}
                    />
                </div>
            </>
        )
    }

    return (
        <SessionsLayoutContext.Provider value={{ toggleSidebarFromHeader, showDesktopSidebar }}>
            <div className="flex h-full min-h-0">
                <div
                    className={`${isSessionsIndex ? 'flex' : showDesktopSidebar ? 'hidden lg:flex' : 'hidden'} w-full lg:w-[var(--sessions-sidebar-width)] shrink-0 flex-col bg-[var(--app-bg)] lg:border-r lg:border-[var(--app-divider)]`}
                    style={sidebarStyle}
                >
                    {renderSidebarContent()}
                </div>

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

                <div className={`${isSessionsIndex ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col bg-[var(--app-bg)]`}>
                    <div className="flex-1 min-h-0">
                        <Outlet />
                    </div>
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
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const {
        session,
        refetch: refetchSession,
    } = useSession(api, sessionId)
    const {
        messages,
        warning: messagesWarning,
        isLoading: messagesLoading,
        isLoadingMore: messagesLoadingMore,
        hasMore: messagesHasMore,
        loadMore: loadMoreMessages,
        refetch: refetchMessages,
        pendingCount,
        messagesVersion,
        flushPending,
        setAtBottom,
    } = useMessages(api, sessionId)
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
    }, [refetchMessages, refetchSession])

    if (!session) {
        return (
            <div className="flex-1 flex items-center justify-center p-4">
                <LoadingState label="Loading session…" className="text-sm" />
            </div>
        )
    }

    return (
        <SessionChat
            api={api}
            session={session}
            messages={messages}
            messagesWarning={messagesWarning}
            hasMoreMessages={messagesHasMore}
            isLoadingMessages={messagesLoading}
            isLoadingMoreMessages={messagesLoadingMore}
            isSending={isSending}
            pendingCount={pendingCount}
            messagesVersion={messagesVersion}
            onBack={goBack}
            onRefresh={refreshSelectedSession}
            onLoadMore={loadMoreMessages}
            onSend={sendMessage}
            onFlushPending={flushPending}
            onAtBottomChange={setAtBottom}
            onRetryMessage={retryMessage}
            autocompleteSuggestions={getAutocompleteSuggestions}
            onToggleSidebar={sessionsLayout?.toggleSidebarFromHeader}
            sidebarVisible={sessionsLayout?.showDesktopSidebar ?? false}
        />
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

    const handleSuccess = useCallback((sessionId: string) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        // Replace current page with /sessions to clear spawn flow from history
        navigate({ to: '/sessions', replace: true })
        // Then navigate to new session
        requestAnimationFrame(() => {
            navigate({
                to: '/sessions/$sessionId',
                params: { sessionId },
            })
        })
    }, [navigate, queryClient])

    return (
        <div className="flex-1 overflow-y-auto">
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
            </div>

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
                onCancel={handleCancel}
                onSuccess={handleSuccess}
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

        const result: NewSessionSearch = {}
        if (directoryRaw && directoryRaw.trim().length > 0) {
            result.directory = directoryRaw
        }
        if (machineIdRaw && machineIdRaw.trim().length > 0) {
            result.machineId = machineIdRaw
        }
        return result
    },
    component: NewSessionPage,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsPage,
})

export const routeTree = rootRoute.addChildren([
    indexRoute,
    sessionsRoute.addChildren([
        sessionsIndexRoute,
        newSessionRoute,
        sessionDetailRoute.addChildren([
            sessionTerminalRoute,
            sessionFilesRoute,
            sessionFileRoute,
        ]),
    ]),
    settingsRoute,
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
