import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import { useAppContext } from '@/lib/app-context'
import { useGroup } from '@/hooks/queries/useGroup'
import { useGroupMessages } from '@/hooks/queries/useGroupMessages'
import { useGroupNote } from '@/hooks/queries/useGroupNote'
import { useGroupActions } from '@/hooks/mutations/useGroupActions'
import { useSessions } from '@/hooks/queries/useSessions'
import { useMachines } from '@/hooks/queries/useMachines'
import type { GroupMember, GroupTimelineMessage, GroupTaskStatus, SessionSummary } from '@/types/api'
import { LoadingState } from '@/components/LoadingState'
import { MARKDOWN_PLUGINS, defaultComponents } from '@/components/assistant-ui/markdown-text'
import { cn } from '@/lib/utils'
import { NewSession } from '@/components/NewSession'
import { useTranslation } from '@/lib/use-translation'
import { getSessionTitle } from '@/lib/session-title'
import { matchesSessionSearch } from '@/lib/session-search'

// ─── Icons ───────────────────────────────────────────────────────────────────

function PlusIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

function ChevronDownIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

function ChevronRightIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function ChevronLeftIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function CloseIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function taskStatusClass(status: GroupTaskStatus): string {
    if (status === 'completed' || status === 'manual_done') return 'bg-green-100 text-green-700'
    if (status === 'failed' || status === 'canceled' || status === 'expired') return 'bg-red-100 text-red-700'
    if (status === 'running' || status === 'enqueued') return 'bg-amber-100 text-amber-700'
    return 'bg-blue-100 text-blue-700'
}

function isTerminalStatus(status: GroupTaskStatus): boolean {
    return status === 'completed' || status === 'manual_done' || status === 'failed' || status === 'canceled' || status === 'expired'
}

function extractBubbleText(message: GroupTimelineMessage): string {
    const p = message.payload
    if (typeof p === 'string') return p
    if (p && typeof p === 'object') {
        const o = p as { text?: unknown; status?: unknown; command?: unknown; reason?: unknown }
        if (typeof o.text === 'string' && o.text.trim()) return o.text
        if (typeof o.command === 'string' && o.command.trim()) return o.command
        if (typeof o.status === 'string') {
            const reason = typeof o.reason === 'string' ? `: ${o.reason}` : ''
            return `${o.status}${reason}`
        }
    }
    try { return JSON.stringify(p) } catch { return '' }
}

function formatTime(ms: number): string {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getAvatarInitial(label: string): string {
    const trimmed = label.trim()
    if (!trimmed) {
        return '?'
    }
    const first = Array.from(trimmed)[0]
    return first.toUpperCase()
}

function getSessionAvatarTone(session: SessionSummary | undefined): string {
    const flavor = session?.metadata?.flavor ?? ''
    if (flavor === 'claude') return 'bg-orange-100 text-orange-700 border-orange-200'
    if (flavor === 'codex') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (flavor === 'gemini') return 'bg-blue-100 text-blue-700 border-blue-200'
    if (flavor === 'opencode') return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200'
    return 'bg-[var(--app-secondary-bg)] text-[var(--app-fg)] border-[var(--app-divider)]'
}

type MemberWorkStatus = 'offline' | 'pending' | 'working' | 'completed'

function getMemberWorkStatus(session: SessionSummary | undefined): MemberWorkStatus {
    if (!session?.active) {
        return 'offline'
    }
    if ((session.pendingRequestsCount ?? 0) > 0) {
        return 'pending'
    }
    if (session.thinking) {
        return 'working'
    }
    return 'completed'
}

function getMemberStatusDotClass(status: MemberWorkStatus): string {
    if (status === 'working') return 'bg-[#007AFF] animate-pulse'
    if (status === 'pending') return 'bg-amber-500'
    if (status === 'completed') return 'bg-[var(--app-badge-success-text)]'
    return 'bg-[var(--app-hint)]'
}

function getMemberStatusBadgeClass(status: MemberWorkStatus): string {
    if (status === 'working') return 'bg-blue-100 text-blue-700'
    if (status === 'pending') return 'bg-amber-100 text-amber-700'
    if (status === 'completed') return 'bg-green-100 text-green-700'
    return 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'
}

function getMemberStatusLabel(
    status: MemberWorkStatus,
    t: (key: string, params?: Record<string, string | number>) => string
): string {
    if (status === 'pending') {
        return t('session.item.pending')
    }
    if (status === 'working') {
        return t('session.item.thinking')
    }
    if (status === 'completed') {
        return t('session.item.completed')
    }
    return t('misc.offline')
}

function getSessionWorkingDirectory(session: SessionSummary | undefined): string {
    const worktreePath = session?.metadata?.worktree?.worktreePath?.trim()
    if (worktreePath) {
        return worktreePath
    }

    const metadataPath = session?.metadata?.path?.trim()
    if (metadataPath) {
        return metadataPath
    }

    const basePath = session?.metadata?.worktree?.basePath?.trim()
    if (basePath) {
        return basePath
    }

    return '-'
}

function buildSessionTooltipLines(options: {
    session: SessionSummary | undefined
    sessionId: string
    statusLabel: string
}): string[] {
    const directory = getSessionWorkingDirectory(options.session)
    const agentLabel = options.session?.metadata?.flavor ?? 'unknown'
    const modelLabel = options.session?.metadata?.model?.trim() || options.session?.modelMode || 'default'
    const branch = options.session?.metadata?.worktree?.branch ?? null
    const machineId = options.session?.metadata?.machineId ?? null

    return [
        `Status: ${options.statusLabel}`,
        `Session: ${options.sessionId}`,
        `Directory: ${directory}`,
        `Agent: ${agentLabel}`,
        `Model: ${modelLabel}`,
        ...(branch ? [`Branch: ${branch}`] : []),
        ...(machineId ? [`Machine: ${machineId}`] : [])
    ]
}

function getActorSessionId(message: GroupTimelineMessage): string | null {
    if (message.actorSessionId) {
        return message.actorSessionId
    }
    if (message.source.startsWith('session:')) {
        const value = message.source.slice('session:'.length).trim()
        return value || null
    }
    return null
}

function BubbleMarkdown(props: {
    content: string
    isUser: boolean
}) {
    return (
        <div
            className={cn(
                'aui-md min-w-0 max-w-full break-words text-sm',
                props.isUser
                    ? '[&_.aui-md-a]:text-white/90 [&_.aui-md-a]:decoration-white/70 [&_.aui-md-code]:bg-white/20 [&_.aui-md-blockquote]:border-white/50'
                    : ''
            )}
        >
            <ReactMarkdown
                remarkPlugins={MARKDOWN_PLUGINS}
                components={defaultComponents}
            >
                {props.content}
            </ReactMarkdown>
        </div>
    )
}

const COMPOSER_MIN_HEIGHT_PX = 38
const COMPOSER_MAX_HEIGHT_PX = 120

function resizeComposerTextarea(el: HTMLTextAreaElement | null): void {
    if (!el) return
    el.style.height = 'auto'
    const nextHeight = Math.min(
        Math.max(el.scrollHeight, COMPOSER_MIN_HEIGHT_PX),
        COMPOSER_MAX_HEIGHT_PX
    )
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? 'auto' : 'hidden'
}

// ─── AddMemberModal ───────────────────────────────────────────────────────────

function AddMemberModal(props: {
    existingMemberSessionIds: Set<string>
    onAdd: (sessionId: string) => Promise<void>
    onClose: () => void
    isPending: boolean
}) {
    const { api } = useAppContext()
    const { sessions, isLoading: sessionsLoading } = useSessions(api)
    const { machines } = useMachines(api, true)
    const [search, setSearch] = useState('')
    const [addingId, setAddingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [offlineExpanded, setOfflineExpanded] = useState(false)
    const [mode, setMode] = useState<'select' | 'create'>('select')

    const onlineMachines = useMemo(() => machines.filter((m) => m.active), [machines])

    const { online, offline } = useMemo(() => {
        const available = sessions.filter((s) => {
            if (props.existingMemberSessionIds.has(s.id)) return false
            return matchesSessionSearch(s, search)
        })
        return {
            online: available.filter((s) => s.active),
            offline: available.filter((s) => !s.active)
        }
    }, [sessions, props.existingMemberSessionIds, search])

    const handleAdd = async (sessionId: string) => {
        setAddingId(sessionId)
        setError(null)
        try {
            await props.onAdd(sessionId)
            props.onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add member')
        } finally {
            setAddingId(null)
        }
    }

    const handleSessionCreated = async (sessionId: string) => {
        setError(null)
        try {
            await props.onAdd(sessionId)
            props.onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add member')
        }
    }

    const renderSessionRow = (s: (typeof sessions)[0]) => {
        const title = getSessionTitle(s, { fallbackIdLength: 12 })
        const path = s.metadata?.path ?? ''
        return (
            <button
                key={s.id}
                type="button"
                disabled={addingId === s.id || props.isPending}
                onClick={() => { void handleAdd(s.id) }}
                className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--app-subtle-bg)] disabled:opacity-60"
            >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.active ? 'bg-green-500' : 'bg-[var(--app-divider)]'}`} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--app-fg)]">{title}</div>
                    {path
                        ? <div className="truncate text-xs text-[var(--app-hint)]">{path}</div>
                        : <div className="truncate text-xs text-[var(--app-hint)]">{s.id.slice(0, 20)}…</div>
                    }
                </div>
            </button>
        )
    }

    if (mode === 'create') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="flex w-full max-w-lg flex-col rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] shadow-xl" style={{ maxHeight: '90vh' }}>
                    <div className="flex items-center justify-between border-b border-[var(--app-divider)] px-4 py-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setMode('select')}
                                className="rounded-full p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                                title="Back to selection"
                            >
                                <ChevronLeftIcon />
                            </button>
                            <div className="font-semibold text-sm text-[var(--app-fg)]">Create New Session</div>
                        </div>
                        <button type="button" onClick={props.onClose} className="rounded-full p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]">
                            <CloseIcon />
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <NewSession
                            api={api}
                            machines={machines}
                            onSuccess={handleSessionCreated}
                            onCancel={() => setMode('select')}
                        />
                    </div>

                    {error ? <div className="border-t border-[var(--app-divider)] px-4 py-2 text-xs text-red-600">{error}</div> : null}
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex w-full max-w-sm flex-col rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] shadow-xl" style={{ maxHeight: '80vh' }}>
                <div className="flex items-center justify-between border-b border-[var(--app-divider)] px-4 py-3">
                    <div className="font-semibold text-sm text-[var(--app-fg)]">Add Member</div>
                    <button type="button" onClick={props.onClose} className="rounded-full p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]">
                        <CloseIcon />
                    </button>
                </div>

                {/* Mode toggle */}
                <div className="border-b border-[var(--app-divider)]">
                    <button
                        type="button"
                        onClick={() => setMode('create')}
                        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-sm text-[var(--app-link)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                    >
                        <PlusIcon className="h-3.5 w-3.5 shrink-0" />
                        Create new session
                        <ChevronRightIcon className="ml-auto h-3.5 w-3.5 text-[var(--app-hint)]" />
                    </button>
                </div>

                <div className="border-b border-[var(--app-divider)] px-3 py-2">
                    <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sessions..." className="w-full rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--app-link)]" />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {sessionsLoading ? (
                        <div className="px-4 py-3 text-sm text-[var(--app-hint)]">Loading sessions…</div>
                    ) : online.length === 0 && offline.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-[var(--app-hint)]">{search ? 'No sessions match.' : 'No sessions available.'}</div>
                    ) : (
                        <>
                            {online.length > 0 ? (
                                <>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--app-hint)]">Online ({online.length})</div>
                                    {online.map(renderSessionRow)}
                                </>
                            ) : null}
                            {offline.length > 0 ? (
                                <>
                                    <button type="button" onClick={() => setOfflineExpanded((v) => !v)} className="flex w-full items-center gap-1.5 px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] transition-colors">
                                        <ChevronRightIcon className={`h-3 w-3 transition-transform ${offlineExpanded ? 'rotate-90' : ''}`} />
                                        Offline ({offline.length})
                                    </button>
                                    {offlineExpanded ? offline.map(renderSessionRow) : null}
                                </>
                            ) : null}
                        </>
                    )}
                </div>

                {error ? <div className="border-t border-[var(--app-divider)] px-4 py-2 text-xs text-red-600">{error}</div> : null}
            </div>
        </div>
    )
}

// ─── MemberPill ───────────────────────────────────────────────────────────────

function MemberPill(props: {
    member: GroupMember
    session?: SessionSummary
    status: MemberWorkStatus
    onClick: () => void
}) {
    const { t } = useTranslation()
    const { member, session, status } = props
    const title = getSessionTitle(session, { fallbackSessionId: member.sessionId, fallbackIdLength: 12 })
    const idText = member.sessionId ?? `user:${member.userId ?? member.id}`
    const avatarInitial = getAvatarInitial(title)
    const avatarTone = getSessionAvatarTone(session)
    const clickable = Boolean(member.sessionId)
    const dotClass = getMemberStatusDotClass(status)
    const statusClass = getMemberStatusBadgeClass(status)
    const statusLabel = getMemberStatusLabel(status, t)
    const tooltipLines = buildSessionTooltipLines({
        session,
        sessionId: idText,
        statusLabel
    })
    const tooltipText = tooltipLines.join('\n')

    return (
        <button
            type="button"
            disabled={!clickable}
            onClick={props.onClick}
            className={`group relative flex items-center gap-2 rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-2.5 py-1.5 text-left transition-colors ${clickable ? 'hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-link)]' : 'cursor-default'}`}
            aria-label={tooltipText}
        >
            <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-80 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-md border border-[var(--app-divider)] bg-[var(--app-bg)] px-2.5 py-2 text-xs text-[var(--app-fg)] shadow-lg group-hover:block group-focus-visible:block">
                <div className="space-y-0.5">
                    <div className="font-medium">{title}</div>
                    {tooltipLines.map((line) => (
                        <div key={line} className="text-[var(--app-hint)] break-all">{line}</div>
                    ))}
                </div>
            </div>
            <span className="relative shrink-0">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${avatarTone}`}>
                    {avatarInitial}
                </span>
                <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[var(--app-bg)] ${dotClass}`} />
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-[var(--app-fg)]">{title}</span>
                <span className="block truncate text-[10px] text-[var(--app-hint)]">{idText}</span>
                <span className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] ${statusClass}`}>
                    {statusLabel}
                </span>
            </span>
        </button>
    )
}

// ─── TaskStateList ─────────────────────────────────────────────────────────────
// Collapsible task detail shown under a command bubble

type LatestTaskStates = Map<string, GroupTimelineMessage>  // taskId → latest msg

function TaskStateList(props: { taskStates: LatestTaskStates }) {
    const [open, setOpen] = useState(false)
    const tasks = Array.from(props.taskStates.values())
    if (tasks.length === 0) return null

    const allDone = tasks.every((t) => {
        const p = t.payload as { status?: unknown } | null
        return isTerminalStatus((p?.status ?? 'pending') as GroupTaskStatus)
    })
    const summary = `${tasks.length} task${tasks.length > 1 ? 's' : ''}${allDone ? ' ✓' : ''}`

    return (
        <div className="mt-1 max-w-[75%]">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 text-[10px] text-[var(--app-hint)] hover:text-[var(--app-fg)] transition-colors"
            >
                <ChevronRightIcon className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                {summary}
            </button>
            {open ? (
                <div className="mt-1 space-y-1">
                    {tasks.map((t) => {
                        const p = t.payload as { status?: unknown; targetSessionId?: unknown; error?: unknown } | null
                        const status = (p?.status ?? 'pending') as GroupTaskStatus
                        const target = typeof p?.targetSessionId === 'string' ? p.targetSessionId.slice(0, 14) : ''
                        const error = typeof p?.error === 'string' ? p.error : null
                        return (
                            <div key={t.taskId ?? t.id} className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-2 py-1">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${taskStatusClass(status)}`}>{status}</span>
                                {target ? <span className="text-[10px] text-[var(--app-hint)]">{target}</span> : null}
                                {error ? <span className="text-[10px] text-red-500">{error}</span> : null}
                            </div>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}

// ─── TimelineBubble ───────────────────────────────────────────────────────────

function TimelineBubble(props: {
    message: GroupTimelineMessage
    sessionMap: Map<string, SessionSummary>
    onOpenSession: (sessionId: string) => void
    taskStates?: LatestTaskStates
}) {
    const { t } = useTranslation()
    const { message } = props
    const text = extractBubbleText(message)
    const isUser = message.source.startsWith('user:')
    const isSystem = message.type === 'system' || message.type === 'note_state'
    const isCommand = message.type === 'command'

    if (isSystem) {
        return (
            <div className="flex justify-center py-1">
                <span className="rounded-full bg-[var(--app-secondary-bg)] px-3 py-1 text-[11px] italic text-[var(--app-hint)]">{text}</span>
            </div>
        )
    }

    const actorSessionId = getActorSessionId(message)
    const actorSession = actorSessionId ? props.sessionMap.get(actorSessionId) : undefined
    const actorTitle = actorSessionId
        ? getSessionTitle(actorSession, { fallbackSessionId: actorSessionId, fallbackIdLength: 12 })
        : (message.actorName || message.source)
    const actorId = actorSessionId ?? null
    const actorInitial = getAvatarInitial(actorTitle)
    const actorTone = getSessionAvatarTone(actorSession)
    const actorStatusLabel = actorSessionId
        ? getMemberStatusLabel(getMemberWorkStatus(actorSession), t)
        : 'unknown'
    const actorTooltipLines = actorSessionId
        ? buildSessionTooltipLines({
            session: actorSession,
            sessionId: actorSessionId,
            statusLabel: actorStatusLabel
        })
        : []
    const actorTooltipText = actorTooltipLines.join('\n')

    return (
        <div className={`flex py-1 ${isUser ? 'justify-end pl-3.5 pr-3' : 'justify-start pl-3.5 pr-3'}`}>
            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`} style={{ maxWidth: '75%' }}>
                <div className="mb-1 flex items-center gap-2">
                    {actorSessionId ? (
                        <div className="group relative shrink-0">
                            <button
                                type="button"
                                onClick={() => props.onOpenSession(actorSessionId)}
                                className="transition-opacity hover:opacity-80"
                                aria-label={actorTooltipText}
                            >
                                <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${actorTone}`}>
                                    {actorInitial}
                                </span>
                            </button>
                            <div className={`pointer-events-none absolute top-full z-30 mt-2 hidden w-80 max-w-[calc(100vw-1rem)] rounded-md border border-[var(--app-divider)] bg-[var(--app-bg)] px-2.5 py-2 text-xs text-[var(--app-fg)] shadow-lg group-hover:block group-focus-within:block ${isUser ? 'right-0' : 'left-0'}`}>
                                <div className="space-y-0.5">
                                    <div className="font-medium">{actorTitle}</div>
                                    {actorTooltipLines.map((line) => (
                                        <div key={line} className="text-[var(--app-hint)] break-all">{line}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : null}
                    <div className={`min-w-0 ${isUser ? 'text-right' : 'text-left'}`}>
                        <div className="truncate text-[11px] font-medium text-[var(--app-fg)]">{actorTitle}</div>
                        {actorId ? (
                            <div className="truncate text-[10px] text-[var(--app-hint)]">
                                {actorId}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                        isUser
                            ? 'bg-[var(--app-button)] text-[var(--app-button-text)] rounded-br-sm'
                            : 'bg-[var(--app-secondary-bg)] text-[var(--app-fg)] rounded-bl-sm'
                    } ${isCommand
                        ? 'font-mono text-xs whitespace-pre-wrap break-words'
                        : isUser
                            ? '[&_.aui-md]:text-sm [&_.aui-md-a]:text-white/90 [&_.aui-md-a]:decoration-white/70 [&_.aui-md-code]:bg-white/20 [&_.aui-md-blockquote]:border-white/50'
                            : '[&_.aui-md]:text-sm'
                    }`}
                >
                    {isCommand ? text : <BubbleMarkdown content={text} isUser={isUser} />}
                </div>
                {/* Task states collapsible — only for command messages with tasks */}
                {isCommand && props.taskStates && props.taskStates.size > 0 ? (
                    <TaskStateList taskStates={props.taskStates} />
                ) : null}
                <div className="mt-0.5 text-[10px] text-[var(--app-hint)]">{formatTime(message.createdAt)}</div>
            </div>
        </div>
    )
}

// ─── MentionPopup ─────────────────────────────────────────────────────────────

type MentionCandidate = { id: string; label: string; sublabel?: string }

function MentionPopup(props: {
    candidates: MentionCandidate[]
    activeIndex: number
    onSelect: (id: string) => void
}) {
    if (props.candidates.length === 0) return null
    return (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-20 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] shadow-lg overflow-hidden">
            {props.candidates.map((c, i) => (
                <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); props.onSelect(c.id) }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${i === props.activeIndex ? 'bg-[var(--app-subtle-bg)]' : 'hover:bg-[var(--app-subtle-bg)]'}`}
                >
                    <span className="font-medium text-[var(--app-link)]">@{c.id}</span>
                    {c.sublabel ? <span className="truncate text-xs text-[var(--app-hint)]">{c.sublabel}</span> : null}
                </button>
            ))}
        </div>
    )
}

// ─── GroupDetailPage ──────────────────────────────────────────────────────────

export default function GroupDetailPage() {
    const { api } = useAppContext()
    const { groupId } = useParams({ from: '/groups/$groupId' })
    const navigate = useNavigate()

    const { group, isLoading: groupLoading, error: groupError } = useGroup(api, groupId)
    const { messages, isLoading: messagesLoading } = useGroupMessages(api, groupId)
    const { note, isLoading: noteLoading } = useGroupNote(api, groupId)
    const { postMessage, updateNote, refreshNote, broadcastNote, addMember, updateGroup, isPending } = useGroupActions(api, groupId)
    const { sessions } = useSessions(api)

    const [composer, setComposer] = useState('')
    const [noteDraft, setNoteDraft] = useState('')
    const [noteOpen, setNoteOpen] = useState(false)
    const [showAddMember, setShowAddMember] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const timelineRef = useRef<HTMLDivElement>(null)
    const composerRef = useRef<HTMLTextAreaElement>(null)

    // Mention autocomplete state
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionIndex, setMentionIndex] = useState(0)

    useEffect(() => {
        setNoteDraft(note?.content ?? '')
    }, [note?.content])

    useLayoutEffect(() => {
        resizeComposerTextarea(composerRef.current)
    }, [composer])

    useEffect(() => {
        if (timelineRef.current) {
            timelineRef.current.scrollTop = timelineRef.current.scrollHeight
        }
    }, [messages])

    const members = group?.members ?? []
    const existingMemberSessionIds = useMemo(
        () => new Set(members.filter((m) => m.sessionId).map((m) => m.sessionId as string)),
        [members]
    )

    // Build map: sessionId → session (for status dots)
    const sessionMap = useMemo(() => {
        const m = new Map<string, (typeof sessions)[0]>()
        for (const s of sessions) m.set(s.id, s)
        return m
    }, [sessions])

    // Build task-state map: traceId → Map<taskId, latestMsg>
    // task_state messages are excluded from the main render loop
    const taskStateMap = useMemo(() => {
        const map = new Map<string, Map<string, GroupTimelineMessage>>()
        for (const msg of messages) {
            if (msg.type !== 'task_state' || !msg.traceId) continue
            if (!map.has(msg.traceId)) map.set(msg.traceId, new Map())
            const byTask = map.get(msg.traceId)!
            const taskKey = msg.taskId ?? msg.id
            const prev = byTask.get(taskKey)
            if (!prev || msg.seq > prev.seq) {
                byTask.set(taskKey, msg)
            }
        }
        return map
    }, [messages])

    // Filtered messages — exclude task_state; they appear under their command bubble
    const visibleMessages = useMemo(
        () => messages.filter((m) => m.type !== 'task_state'),
        [messages]
    )

    const mentionableMemberSessionIds = useMemo(() => {
        const ids: string[] = []
        for (const member of members) {
            if (!member.sessionId) continue
            const session = sessionMap.get(member.sessionId)
            if (getMemberWorkStatus(session) !== 'offline') {
                ids.push(member.sessionId)
            }
        }
        return ids
    }, [members, sessionMap])

    const mentionableMemberSessionIdSet = useMemo(
        () => new Set(mentionableMemberSessionIds),
        [mentionableMemberSessionIds]
    )

    // Mention candidates: 'all' + online group member session IDs
    const mentionCandidates = useMemo<MentionCandidate[]>(() => {
        const q = (mentionQuery ?? '').toLowerCase()
        const candidates: MentionCandidate[] = []
        if (mentionableMemberSessionIds.length > 0) {
            candidates.push({ id: 'all', label: 'all', sublabel: 'Broadcast to online members' })
        }
        for (const member of members) {
            if (!member.sessionId) continue
            if (!mentionableMemberSessionIdSet.has(member.sessionId)) continue
            const s = sessionMap.get(member.sessionId)
            const name = s?.metadata?.name
            candidates.push({
                id: member.sessionId,
                label: member.sessionId,
                sublabel: name ?? undefined
            })
        }
        if (!q) return candidates
        return candidates.filter(
            (c) => c.id.toLowerCase().includes(q) || (c.sublabel ?? '').toLowerCase().includes(q)
        )
    }, [mentionQuery, members, sessionMap, mentionableMemberSessionIds.length, mentionableMemberSessionIdSet])

    // Detect @mention in composer
    const detectMention = useCallback((value: string, cursorPos: number) => {
        const before = value.slice(0, cursorPos)
        const match = before.match(/@([A-Za-z0-9._:-]*)$/)
        if (match) {
            setMentionQuery(match[1])
            setMentionIndex(0)
        } else {
            setMentionQuery(null)
        }
    }, [])

    const handleComposerChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        resizeComposerTextarea(e.target)
        setComposer(e.target.value)
        detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
    }, [detectMention])

    const insertMention = useCallback((id: string) => {
        const el = composerRef.current
        const pos = el?.selectionStart ?? composer.length
        const before = composer.slice(0, pos)
        const after = composer.slice(pos)
        const lastAt = before.lastIndexOf('@')
        const newText = before.slice(0, lastAt) + `@${id} ` + after
        setComposer(newText)
        setMentionQuery(null)
        // restore focus + move cursor after inserted mention
        requestAnimationFrame(() => {
            if (el) {
                el.focus()
                const newPos = lastAt + id.length + 2
                el.setSelectionRange(newPos, newPos)
            }
        })
    }, [composer])

    const handleSend = useCallback(async (e?: FormEvent) => {
        e?.preventDefault()
        const text = composer.trim()
        if (!text) return
        const type = text.startsWith('/') || /\B@/.test(text) ? 'command' : 'chat'
        setActionError(null)
        if (type === 'command') {
            const mentionedSessionIds = Array.from(text.matchAll(/\B@([A-Za-z0-9._:-]+)/g))
                .map((match) => match[1])
                .filter((value) => value !== 'all')
            const offlineMentions = Array.from(new Set(
                mentionedSessionIds.filter(
                    (sessionId) => existingMemberSessionIds.has(sessionId)
                        && !mentionableMemberSessionIdSet.has(sessionId)
                )
            ))
            if (offlineMentions.length > 0) {
                setActionError(`Offline members cannot be mentioned: ${offlineMentions.join(', ')}`)
                return
            }
        }
        try {
            await postMessage({ type, text, source: 'user:web' })
            setComposer('')
            setMentionQuery(null)
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to send')
        }
    }, [composer, postMessage, existingMemberSessionIds, mentionableMemberSessionIdSet])

    const handleComposerKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionQuery !== null && mentionCandidates.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMentionIndex((i) => (i + 1) % mentionCandidates.length)
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length)
                return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                insertMention(mentionCandidates[mentionIndex].id)
                return
            }
            if (e.key === 'Escape') {
                setMentionQuery(null)
                return
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void handleSend()
        }
    }, [mentionQuery, mentionCandidates, mentionIndex, insertMention, handleSend])

    const handleSaveNote = async () => {
        setActionError(null)
        try {
            await updateNote({ content: noteDraft, updatedBy: 'user:web' })
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to save note')
        }
    }

    const handleRefreshNote = async () => {
        setActionError(null)
        try {
            await refreshNote({ source: 'user:web' })
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to refresh note')
        }
    }

    const handleBroadcastNote = async () => {
        if (!note?.content) return

        setActionError(null)
        try {
            await broadcastNote()
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to broadcast note')
        }
    }

    const handleUpdateNoteExecutor = async (sessionId: string | null) => {
        setActionError(null)
        try {
            await updateGroup({ noteSessionId: sessionId })
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to update note executor')
        }
    }

    if (groupLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingState label="Loading group..." className="text-sm" />
            </div>
        )
    }

    if (!group || groupError) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
                <div className="text-sm text-red-600">{groupError ?? 'Group not found'}</div>
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col bg-[var(--app-bg)]">
            {/* A. Group Meta */}
            <div className="border-b border-[var(--app-divider)] pl-3.5 pr-3 py-3">
                <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-[var(--app-fg)]">{group.group.name}</div>
                    <div className="mt-1 text-xs text-[var(--app-hint)] break-words">
                        {group.group.description?.trim() || 'No description'}
                    </div>
                </div>
            </div>

            {/* B. Members Row */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--app-divider)] pl-3.5 pr-3 py-2">
                {members.map((member) => {
                    const s = member.sessionId ? sessionMap.get(member.sessionId) : undefined
                    const status = getMemberWorkStatus(s)
                    return (
                        <MemberPill
                            key={member.id}
                            member={member}
                            session={s}
                            status={status}
                            onClick={() => {
                                if (member.sessionId) {
                                    navigate({ to: '/sessions/$sessionId', params: { sessionId: member.sessionId } })
                                }
                            }}
                        />
                    )
                })}
                <button
                    type="button"
                    onClick={() => setShowAddMember(true)}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[var(--app-divider)] text-[var(--app-hint)] transition-colors hover:border-[var(--app-link)] hover:text-[var(--app-link)]"
                    title="Add member"
                >
                    <PlusIcon className="h-3 w-3" />
                </button>
            </div>

            {/* C. Group Note (collapsible) */}
            <div className="border-b border-[var(--app-divider)]">
                <div className="flex items-center gap-2 pl-3.5 pr-3 py-2 text-xs text-[var(--app-hint)]">
                    <button
                        type="button"
                        onClick={() => setNoteOpen((o) => !o)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[var(--app-fg)] transition-colors"
                    >
                        {noteOpen ? <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" /> : <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-medium uppercase tracking-wide">Note</span>
                        {note ? <span className="text-[10px]">v{note.version}</span> : null}
                    </button>
                    <div className="ml-auto flex gap-1">
                        <button
                            type="button"
                            onClick={() => { void handleBroadcastNote() }}
                            disabled={isPending || !note?.content}
                            className="rounded border border-[var(--app-divider)] px-2 py-0.5 text-[10px] text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] disabled:opacity-50"
                            title="广播当前Note内容到所有群组成员"
                        >
                            📢 Broadcast
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleRefreshNote() }}
                            disabled={isPending}
                            className="rounded border border-[var(--app-divider)] px-2 py-0.5 text-[10px] text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] disabled:opacity-50"
                        >
                            Refresh
                        </button>
                    </div>
                </div>
                {noteOpen ? (
                    <div className="pl-3.5 pr-3 pb-3 pt-1">
                        {noteLoading ? (
                            <LoadingState label="Loading note..." className="text-sm py-2" />
                        ) : (
                            <>
                                <textarea
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                    placeholder="Note content..."
                                    rows={5}
                                    className="w-full rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--app-link)] resize-y"
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-xs text-[var(--app-hint)]">Note Executor</span>
                                    <select
                                        value={group.group.noteSessionId ?? ''}
                                        onChange={(e) => {
                                            const next = e.target.value.trim()
                                            void handleUpdateNoteExecutor(next.length > 0 ? next : null)
                                        }}
                                        disabled={isPending}
                                        className="min-w-0 flex-1 rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-2 py-1.5 text-xs text-[var(--app-fg)] outline-none focus:border-[var(--app-link)] disabled:opacity-60"
                                    >
                                        <option value="">Not configured</option>
                                        {members
                                            .filter((member) => typeof member.sessionId === 'string' && member.sessionId.length > 0)
                                            .map((member) => {
                                                const sessionId = member.sessionId as string
                                                const session = sessionMap.get(sessionId)
                                                const title = getSessionTitle(session, { fallbackSessionId: sessionId, fallbackIdLength: 12 })
                                                return (
                                                    <option key={sessionId} value={sessionId}>
                                                        {`${title} (${sessionId.slice(0, 8)})`}
                                                    </option>
                                                )
                                            })}
                                    </select>
                                </div>
                                <div className="mt-2 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => { void handleSaveNote() }}
                                        disabled={isPending}
                                        className="rounded-md bg-[var(--app-button)] px-3 py-1.5 text-xs text-[var(--app-button-text)] disabled:opacity-60"
                                    >
                                        Save Note
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ) : null}
            </div>

            {/* D. Timeline */}
            <div ref={timelineRef} className="flex-1 min-h-0 overflow-y-auto py-2">
                {messagesLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingState label="Loading messages..." className="text-sm" />
                    </div>
                ) : visibleMessages.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-sm text-[var(--app-hint)]">
                        No messages yet. Start the conversation below.
                    </div>
                ) : (
                    visibleMessages.map((message) => (
                        <TimelineBubble
                            key={message.id}
                            message={message}
                            sessionMap={sessionMap}
                            onOpenSession={(sessionId) => {
                                navigate({ to: '/sessions/$sessionId', params: { sessionId } })
                            }}
                            taskStates={message.type === 'command' && message.traceId
                                ? taskStateMap.get(message.traceId)
                                : undefined
                            }
                        />
                    ))
                )}
            </div>

            {/* E. Composer */}
            <div className="border-t border-[var(--app-divider)] bg-[var(--app-bg)] pb-[env(safe-area-inset-bottom)]">
                {actionError ? (
                    <div className="pl-3.5 pr-3 pt-2 text-xs text-red-600">{actionError}</div>
                ) : null}
                <form onSubmit={(e) => { void handleSend(e) }} className="relative flex items-end gap-2 pl-3.5 pr-3 py-2">
                    {/* @ mention popup */}
                    {mentionQuery !== null && mentionCandidates.length > 0 ? (
                        <MentionPopup
                            candidates={mentionCandidates}
                            activeIndex={mentionIndex}
                            onSelect={insertMention}
                        />
                    ) : null}
                    <textarea
                        ref={composerRef}
                        value={composer}
                        onChange={handleComposerChange}
                        onKeyDown={handleComposerKeyDown}
                        placeholder="Send chat, /command, @sessionId, or @all"
                        rows={1}
                        className="flex-1 resize-none rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--app-link)]"
                        style={{ minHeight: '38px', maxHeight: '120px' }}
                    />
                    <button
                        type="submit"
                        disabled={isPending || composer.trim().length === 0}
                        className="shrink-0 rounded-xl bg-[var(--app-button)] px-4 py-2 text-sm text-[var(--app-button-text)] disabled:opacity-60"
                    >
                        Send
                    </button>
                </form>
            </div>

            {/* F. AddMemberModal */}
            {showAddMember ? (
                <AddMemberModal
                    existingMemberSessionIds={existingMemberSessionIds}
                    onAdd={addMember}
                    onClose={() => setShowAddMember(false)}
                    isPending={isPending}
                />
            ) : null}
        </div>
    )
}
