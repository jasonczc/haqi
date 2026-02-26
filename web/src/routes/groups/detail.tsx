import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type ComponentProps, type FormEvent, type KeyboardEvent } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import type { Attachment, PendingAttachment } from '@assistant-ui/react'
import ReactMarkdown from 'react-markdown'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useAppContext } from '@/lib/app-context'
import { useGroup } from '@/hooks/queries/useGroup'
import { useGroupMessages } from '@/hooks/queries/useGroupMessages'
import { useGroupNote } from '@/hooks/queries/useGroupNote'
import { useGroupActions } from '@/hooks/mutations/useGroupActions'
import { useSessions } from '@/hooks/queries/useSessions'
import { useMachines } from '@/hooks/queries/useMachines'
import type { AttachmentMetadata, GroupMember, GroupTimelineMessage, GroupTaskStatus, SessionSummary } from '@/types/api'
import { LoadingState } from '@/components/LoadingState'
import { MARKDOWN_PLUGINS, defaultComponents } from '@/components/assistant-ui/markdown-text'
import { MessageAttachments } from '@/components/AssistantChat/messages/MessageAttachments'
import { FileIcon } from '@/components/FileIcon'
import { Spinner } from '@/components/Spinner'
import { cn } from '@/lib/utils'
import { createAttachmentAdapter } from '@/lib/attachmentAdapter'
import { isImageMimeType } from '@/lib/fileAttachments'
import { NewSession } from '@/components/NewSession'
import { useTranslation } from '@/lib/use-translation'
import { getSessionTitle } from '@/lib/session-title'
import { matchesSessionSearch } from '@/lib/session-search'

// ─── Custom Hooks ──────────────────────────────────────────────────────────────

// Custom hook for debouncing values to prevent excessive re-renders
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value)

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(handler)
        }
    }, [value, delay])

    return debouncedValue
}

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

function QuoteIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
        </svg>
    )
}

function AttachmentIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.48-8.48" />
        </svg>
    )
}

function AttachmentErrorIcon(props: { className?: string }) {
    return (
        <svg className={props.className} viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.75" fill="currentColor" />
        </svg>
    )
}

function SendIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
        </svg>
    )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function taskStatusClass(status: GroupTaskStatus): string {
    if (status === 'completed' || status === 'manual_done') return 'bg-[var(--app-badge-success-bg)] text-[var(--app-badge-success-text)]'
    if (status === 'failed' || status === 'canceled' || status === 'expired') return 'bg-[var(--app-badge-error-bg)] text-[var(--app-badge-error-text)]'
    if (status === 'running' || status === 'enqueued') return 'bg-[var(--app-badge-warning-bg)] text-[var(--app-badge-warning-text)]'
    return 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'
}

function isTerminalStatus(status: GroupTaskStatus): boolean {
    return status === 'completed' || status === 'manual_done' || status === 'failed' || status === 'canceled' || status === 'expired'
}

type GroupComposerAttachment = {
    id: string
    filename: string
    mimeType: string
    size: number
    status: 'uploading' | 'complete' | 'error'
    uploadSessionId: string
    path?: string
    previewUrl?: string
    error?: string
}

function normalizeAttachmentMetadata(value: unknown): AttachmentMetadata | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    const record = value as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const filename = typeof record.filename === 'string' ? record.filename.trim() : ''
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim() : ''
    const path = typeof record.path === 'string' ? record.path.trim() : ''
    const size = typeof record.size === 'number' && Number.isFinite(record.size)
        ? Math.max(0, record.size)
        : Number.NaN

    if (!id || !filename || !mimeType || !path || Number.isNaN(size)) {
        return null
    }

    const previewUrl = typeof record.previewUrl === 'string' && record.previewUrl.trim()
        ? record.previewUrl
        : undefined

    return {
        id,
        filename,
        mimeType,
        size,
        path,
        ...(previewUrl ? { previewUrl } : {})
    }
}

function extractBubbleAttachments(message: GroupTimelineMessage): AttachmentMetadata[] {
    const payload = message.payload
    if (!payload || typeof payload !== 'object') {
        return []
    }

    const rawAttachments = (payload as { attachments?: unknown }).attachments
    if (!Array.isArray(rawAttachments)) {
        return []
    }

    return rawAttachments
        .map((attachment) => normalizeAttachmentMetadata(attachment))
        .filter((attachment): attachment is AttachmentMetadata => attachment !== null)
}

function extractBubbleText(message: GroupTimelineMessage): string {
    const p = message.payload
    if (typeof p === 'string') return p
    if (p && typeof p === 'object') {
        const o = p as { text?: unknown; status?: unknown; command?: unknown; reason?: unknown; attachments?: unknown }
        if (typeof o.text === 'string' && o.text.trim()) return o.text
        if (typeof o.command === 'string' && o.command.trim()) return o.command
        if (typeof o.status === 'string') {
            const reason = typeof o.reason === 'string' ? `: ${o.reason}` : ''
            return `${o.status}${reason}`
        }
        if (Array.isArray(o.attachments)) return ''
    }
    try { return JSON.stringify(p) } catch { return '' }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
    if (flavor === 'claude') return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30'
    if (flavor === 'codex') return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
    if (flavor === 'gemini') return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30'
    if (flavor === 'opencode') return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 dark:border-fuchsia-500/30'
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
    if (status === 'working') return 'bg-[var(--app-badge-info-text)] animate-pulse'
    if (status === 'pending') return 'bg-[var(--app-badge-warning-text)]'
    if (status === 'completed') return 'bg-[var(--app-badge-success-text)]'
    return 'bg-[var(--app-hint)]'
}

function getMemberStatusBadgeClass(status: MemberWorkStatus): string {
    if (status === 'working') return 'bg-[var(--app-badge-info-bg)] text-[var(--app-badge-info-text)]'
    if (status === 'pending') return 'bg-[var(--app-badge-warning-bg)] text-[var(--app-badge-warning-text)]'
    if (status === 'completed') return 'bg-[var(--app-badge-success-bg)] text-[var(--app-badge-success-text)]'
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

function canQuoteMessage(message: GroupTimelineMessage): boolean {
    // 只允许引用聊天消息，不允许引用系统消息等
    return message.type === 'chat' && !message.source.startsWith('system:')
}

function truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
}

function parseQuoteFromText(text: string): { actorName: string; quotedText: string } | null {
    if (!text.startsWith('>')) return null

    const lines = text.split('\n')
    const quotedLines: string[] = []
    let actorName = 'Unknown'

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('>')) break

        const content = trimmed.slice(1).trim()
        if (quotedLines.length === 0 && content.includes(':')) {
            // First line might contain "Author: content"
            const colonIndex = content.indexOf(':')
            actorName = content.slice(0, colonIndex).trim()
            const remainingContent = content.slice(colonIndex + 1).trim()
            if (remainingContent) {
                quotedLines.push(remainingContent)
            }
        } else if (content) {
            quotedLines.push(content)
        }
    }

    return quotedLines.length > 0 ? {
        actorName,
        quotedText: quotedLines.join(' ')
    } : null
}

function getDisplayText(message: GroupTimelineMessage): string {
    const text = extractBubbleText(message)

    // Only filter quote content if we have the quotedMessage field from backend
    // If backend doesn't provide quotedMessage field, we rely on parseQuoteFromText for UI display
    if (message.quotedMessage) {
        const lines = text.split('\n')
        let startIndex = 0

        // Skip all lines that start with '>' (blockquote) and subsequent empty lines
        while (startIndex < lines.length) {
            const line = lines[startIndex].trim()
            if (line.startsWith('>')) {
                startIndex++
            } else if (startIndex > 0 && line === '') {
                startIndex++
            } else {
                break
            }
        }

        const remainingText = lines.slice(startIndex).join('\n').trim()
        return remainingText || text // fallback to original text if nothing remains
    }

    return text
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

    // Avoid unnecessary DOM reads/writes by checking if resize is needed
    const currentHeight = parseInt(el.style.height) || COMPOSER_MIN_HEIGHT_PX
    el.style.height = 'auto'
    const scrollHeight = el.scrollHeight
    const nextHeight = Math.min(Math.max(scrollHeight, COMPOSER_MIN_HEIGHT_PX), COMPOSER_MAX_HEIGHT_PX)

    // Only update if height actually changed
    if (currentHeight !== nextHeight) {
        el.style.height = `${nextHeight}px`
    }

    // Only update overflow if needed
    const shouldScroll = scrollHeight > COMPOSER_MAX_HEIGHT_PX
    const currentOverflow = el.style.overflowY
    const newOverflow = shouldScroll ? 'auto' : 'hidden'
    if (currentOverflow !== newOverflow) {
        el.style.overflowY = newOverflow
    }
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
            className={`group relative flex items-center gap-1.5 rounded-lg border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-2 py-1 text-left transition-colors ${clickable ? 'hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-link)]' : 'cursor-default'}`}
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
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold ${avatarTone}`}>
                    {avatarInitial}
                </span>
                <span className={`absolute -bottom-px -right-px h-1.5 w-1.5 rounded-full ${dotClass}`} />
            </span>
            <span className="max-w-[120px] truncate text-[11px] font-medium text-[var(--app-fg)]">{title}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${statusClass}`}>
                {statusLabel}
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
        <div className="mt-1 max-w-[88%] sm:max-w-[82%] lg:max-w-[75%]">
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
    onQuote?: (message: GroupTimelineMessage) => void
    taskStates?: LatestTaskStates
}) {
    const { t } = useTranslation()
    const { message } = props
    const text = getDisplayText(message)
    const attachments = extractBubbleAttachments(message)
    const isUser = message.source.startsWith('user:')
    const isSystem = message.type === 'system' || message.type === 'note_state'
    const isCommand = message.type === 'command'

    // Get quote information either from message.quotedMessage or parse from text
    const quoteInfo = message.quotedMessage
        ? { actorName: message.quotedMessage.actorName || 'Unknown', quotedText: message.quotedMessage.text }
        : parseQuoteFromText(extractBubbleText(message))

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

    const replyBtn = canQuoteMessage(message) && props.onQuote ? (
        <button
            type="button"
            onClick={() => props.onQuote?.(message)}
            className="mb-1 shrink-0 self-end rounded-full p-1 text-[var(--app-hint)] opacity-100 transition-opacity hover:bg-[var(--app-subtle-bg)] md:opacity-0 md:group-hover/message:opacity-100"
            title="Reply"
        >
            <QuoteIcon className="h-3.5 w-3.5" />
        </button>
    ) : null

    return (
        <div className={`group/message flex items-end gap-1 py-1 ${isUser ? 'justify-end pl-3.5 pr-2' : 'justify-start pl-2 pr-3.5'}`}>
            {isUser && replyBtn}
            <div className={`flex max-w-[88%] flex-col ${isUser ? 'items-end' : 'items-start'} sm:max-w-[82%] lg:max-w-[75%]`}>
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
                    {quoteInfo && (
                        <div className={`mb-1.5 flex items-start gap-1.5 rounded px-2 py-1.5 ${
                            isUser ? 'bg-white/10' : 'bg-[var(--app-bg)]/60'
                        }`}>
                            <QuoteIcon className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-60" />
                            <div className="min-w-0 flex-1">
                                <span className={`text-[10px] font-medium ${
                                    isUser ? 'text-white/80' : 'text-[var(--app-link)]'
                                }`}>
                                    {quoteInfo.actorName}:
                                </span>
                                <span className={`ml-1 break-all text-[10px] leading-4 ${
                                    isUser ? 'text-white/60' : 'text-[var(--app-hint)]'
                                }`}>
                                    {truncateText(quoteInfo.quotedText, 64)}
                                </span>
                            </div>
                        </div>
                    )}
                    {text ? (isCommand ? text : <BubbleMarkdown content={text} isUser={isUser} />) : null}
                    {attachments.length > 0 ? (
                        <MessageAttachments attachments={attachments} />
                    ) : null}
                </div>
                {isCommand && props.taskStates && props.taskStates.size > 0 ? (
                    <TaskStateList taskStates={props.taskStates} />
                ) : null}
                <div className="mt-0.5 text-[10px] text-[var(--app-hint)]">
                    {formatTime(message.createdAt)}
                </div>
            </div>
            {!isUser && replyBtn}
        </div>
    )
}

// ─── MentionPopup ─────────────────────────────────────────────────────────────

type MentionCandidate = { id: string; label: string; sublabel?: string }

function MentionPopup(props: {
    candidates: MentionCandidate[]
    activeIndex: number
    onSelect: (id: string) => void
    position?: number
}) {
    if (props.candidates.length === 0) return null
    return (
        <div
            className="absolute bottom-full mb-1 z-20 min-w-[240px] max-w-[320px] rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] shadow-lg overflow-hidden"
            style={{ left: `${props.position || 0}px` }}
        >
            {props.candidates.map((c, i) => (
                <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); props.onSelect(c.id) }}
                    className={`flex w-full flex-col px-3 py-2 text-left text-sm transition-colors ${i === props.activeIndex ? 'bg-[var(--app-subtle-bg)]' : 'hover:bg-[var(--app-subtle-bg)]'}`}
                >
                    <span className="font-medium text-[var(--app-fg)] truncate">{c.sublabel ?? c.id}</span>
                    <span className="truncate text-xs text-[var(--app-hint)]">@{c.id}</span>
                </button>
            ))}
        </div>
    )
}

function isPendingAttachmentAsyncGenerator(
    value: Promise<PendingAttachment> | AsyncGenerator<PendingAttachment, void, unknown>
): value is AsyncGenerator<PendingAttachment, void, unknown> {
    return typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
}

function ComposerAttachmentList(props: {
    attachments: GroupComposerAttachment[]
    disabled: boolean
    onRemove: (id: string) => void
}) {
    if (props.attachments.length === 0) {
        return null
    }

    return (
        <div className="flex flex-wrap gap-2 border-b border-[var(--app-border)] px-4 pb-2 pt-3">
            {props.attachments.map((attachment) => {
                const isImage = isImageMimeType(attachment.mimeType) && Boolean(attachment.previewUrl)
                const statusText = attachment.status === 'uploading'
                    ? 'Uploading...'
                    : attachment.status === 'error'
                        ? (attachment.error ?? 'Upload failed')
                        : formatFileSize(attachment.size)

                return (
                    <div key={attachment.id} className="flex min-w-[180px] max-w-full items-center gap-2 rounded-lg bg-[var(--app-subtle-bg)] px-3 py-2 text-base text-[var(--app-fg)]">
                        {attachment.status === 'uploading' ? (
                            <Spinner size="sm" label={null} className="text-[var(--app-hint)]" />
                        ) : null}
                        {attachment.status === 'error' ? (
                            <span className="text-red-500">
                                <AttachmentErrorIcon className="h-4 w-4" />
                            </span>
                        ) : null}
                        {isImage ? (
                            <img
                                src={attachment.previewUrl}
                                alt={attachment.filename}
                                className="h-8 w-8 shrink-0 rounded object-cover"
                            />
                        ) : (
                            <span className="shrink-0">
                                <FileIcon fileName={attachment.filename} size={20} />
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] text-[var(--app-fg)]">
                                {attachment.filename}
                            </div>
                            <div className={`truncate text-[10px] ${attachment.status === 'error' ? 'text-red-600' : 'text-[var(--app-hint)]'}`}>
                                {statusText}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => { void props.onRemove(attachment.id) }}
                            disabled={props.disabled}
                            className="shrink-0 rounded p-0.5 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] disabled:opacity-50"
                            title="Remove attachment"
                        >
                            <CloseIcon className="h-3 w-3" />
                        </button>
                    </div>
                )
            })}
        </div>
    )
}

const TIMELINE_FIRST_ITEM_INDEX_BASE = 1_000_000

const TimelineScroller = forwardRef<HTMLDivElement, ComponentProps<'div'>>(
    function TimelineScroller(props, ref) {
        return (
            <div
                {...props}
                ref={ref}
                className={`app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${props.className ?? ''}`.trim()}
            />
        )
    }
)

function TimelineHistoryControl(props: {
    isLoading: boolean
    hasMore: boolean
    onLoadMore: () => void
}) {
    if (!props.isLoading && !props.hasMore) {
        return null
    }

    if (props.isLoading) {
        return (
            <div className="py-1.5 text-center">
                <span className="inline-flex rounded-full bg-[var(--app-button)] px-2.5 py-1 text-xs text-[var(--app-button-text)]">
                    Loading history...
                </span>
            </div>
        )
    }

    return (
        <div className="py-1.5 text-center">
            <button
                type="button"
                onClick={props.onLoadMore}
                className="inline-flex rounded-full border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
            >
                Load older
            </button>
        </div>
    )
}

// ─── GroupDetailPage ──────────────────────────────────────────────────────────

export default function GroupDetailPage() {
    const { api } = useAppContext()
    const { groupId } = useParams({ from: '/groups/$groupId' })
    const navigate = useNavigate()

    const { group, isLoading: groupLoading, error: groupError } = useGroup(api, groupId)
    const {
        messages,
        isLoading: messagesLoading,
        isLoadingMore: messagesLoadingMore,
        hasMore: messagesHasMore,
        loadMore: loadMoreMessages
    } = useGroupMessages(api, groupId)
    const { note, isLoading: noteLoading } = useGroupNote(api, groupId)
    const { postMessage, updateNote, refreshNote, broadcastNote, addMember, updateGroup, isPending } = useGroupActions(api, groupId)
    const { sessions } = useSessions(api)

    const [composer, setComposer] = useState('')
    const [composerAttachments, setComposerAttachments] = useState<GroupComposerAttachment[]>([])
    const [noteDraft, setNoteDraft] = useState('')
    const [notePromptDraft, setNotePromptDraft] = useState('')
    const [noteOpen, setNoteOpen] = useState(false)
    const [showAddMember, setShowAddMember] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [quotedMessage, setQuotedMessage] = useState<GroupTimelineMessage | null>(null)
    const [membersExpanded, setMembersExpanded] = useState(() => {
        // 默认在小屏幕上折叠成员列表
        if (typeof window !== 'undefined') {
            return window.innerWidth > 768
        }
        return true
    })
    const timelineRef = useRef<VirtuosoHandle | null>(null)
    const composerRef = useRef<HTMLTextAreaElement>(null)
    const composerAttachmentInputRef = useRef<HTMLInputElement>(null)
    const composerAttachmentRuntimeRef = useRef<Map<string, {
        adapter: ReturnType<typeof createAttachmentAdapter>
        attachment: Attachment
    }>>(new Map())
    const previousVisibleMessageIdsRef = useRef<string[]>([])
    const timelineInitializedRef = useRef(false)
    const [timelineFirstItemIndex, setTimelineFirstItemIndex] = useState(TIMELINE_FIRST_ITEM_INDEX_BASE)

    // Mention autocomplete state
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionIndex, setMentionIndex] = useState(0)
    const [mentionPosition, setMentionPosition] = useState(0)

    // Debounce mention query for better performance
    const debouncedMentionQuery = useDebounce(mentionQuery, 100)

    useEffect(() => {
        return () => {
            const runtimes = Array.from(composerAttachmentRuntimeRef.current.values())
            composerAttachmentRuntimeRef.current.clear()
            for (const runtime of runtimes) {
                void runtime.adapter.remove(runtime.attachment).catch(() => {
                    // Best effort cleanup for unsent uploads
                })
            }
        }
    }, [groupId])

    useEffect(() => {
        setNoteDraft(note?.content ?? '')
    }, [note?.content])

    useEffect(() => {
        setNotePromptDraft(group?.group?.notePrompt ?? '')
    }, [group?.group?.notePrompt])

    useLayoutEffect(() => {
        resizeComposerTextarea(composerRef.current)
    }, [composer])

    useEffect(() => {
        setTimelineFirstItemIndex(TIMELINE_FIRST_ITEM_INDEX_BASE)
        previousVisibleMessageIdsRef.current = []
        timelineInitializedRef.current = false
    }, [groupId])

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

    useLayoutEffect(() => {
        const previousIds = previousVisibleMessageIdsRef.current
        if (previousIds.length === 0) {
            previousVisibleMessageIdsRef.current = visibleMessages.map((message) => message.id)
            return
        }

        const previousFirstId = previousIds[0]
        if (previousFirstId) {
            const preservedIndex = visibleMessages.findIndex((message) => message.id === previousFirstId)
            if (preservedIndex > 0) {
                setTimelineFirstItemIndex((value) => value - preservedIndex)
            }
        }

        previousVisibleMessageIdsRef.current = visibleMessages.map((message) => message.id)
    }, [visibleMessages])

    useEffect(() => {
        if (timelineInitializedRef.current || messagesLoading || visibleMessages.length === 0) {
            return
        }
        timelineInitializedRef.current = true
        requestAnimationFrame(() => {
            timelineRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' })
        })
    }, [messagesLoading, visibleMessages.length])

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

    const uploadSessionId = useMemo(() => {
        const preferred = group?.group?.noteSessionId ?? null
        if (preferred && mentionableMemberSessionIdSet.has(preferred)) {
            return preferred
        }
        return mentionableMemberSessionIds[0] ?? null
    }, [group?.group?.noteSessionId, mentionableMemberSessionIds, mentionableMemberSessionIdSet])

    const readyComposerAttachments = useMemo<AttachmentMetadata[]>(() => (
        composerAttachments
            .filter((attachment) => attachment.status === 'complete' && Boolean(attachment.path))
            .map((attachment) => ({
                id: attachment.id,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                size: attachment.size,
                path: attachment.path as string,
                ...(attachment.previewUrl ? { previewUrl: attachment.previewUrl } : {})
            }))
    ), [composerAttachments])

    const hasUploadingAttachments = useMemo(
        () => composerAttachments.some((attachment) => attachment.status === 'uploading'),
        [composerAttachments]
    )
    const uploadAdapter = useMemo(
        () => (uploadSessionId ? createAttachmentAdapter(api, uploadSessionId) : null),
        [api, uploadSessionId]
    )

    // Base mention candidates (cached separately from filtering)
    const baseMentionCandidates = useMemo<MentionCandidate[]>(() => {
        const candidates: MentionCandidate[] = []
        if (mentionableMemberSessionIds.length > 0) {
            candidates.push({ id: 'all', label: 'all', sublabel: 'Broadcast to online members' })
        }
        for (const member of members) {
            if (!member.sessionId) continue
            if (!mentionableMemberSessionIdSet.has(member.sessionId)) continue
            const s = sessionMap.get(member.sessionId)
            const title = getSessionTitle(s, { fallbackSessionId: member.sessionId, fallbackIdLength: 12 })
            candidates.push({
                id: member.sessionId,
                label: member.sessionId,
                sublabel: title
            })
        }
        return candidates
    }, [members, sessionMap, mentionableMemberSessionIds.length, mentionableMemberSessionIdSet])

    // Filtered mention candidates (only re-filters when query changes)
    const mentionCandidates = useMemo<MentionCandidate[]>(() => {
        const q = (debouncedMentionQuery ?? '').toLowerCase()
        if (!q) return baseMentionCandidates
        return baseMentionCandidates.filter(
            (c) => c.id.toLowerCase().includes(q) || (c.sublabel ?? '').toLowerCase().includes(q)
        )
    }, [baseMentionCandidates, debouncedMentionQuery])

    // Detect @mention in composer (optimized)
    const detectMention = useCallback((value: string, cursorPos: number) => {
        // Quick check: if no @ character near cursor, bail early
        const before = value.slice(Math.max(0, cursorPos - 50), cursorPos)
        const lastAtIndex = before.lastIndexOf('@')

        if (lastAtIndex === -1) {
            // No @ found, clear mention state if needed
            if (mentionQuery !== null) {
                setMentionQuery(null)
            }
            return
        }

        // Check if we're in a potential mention context
        const potentialMention = before.slice(lastAtIndex + 1)
        const isValidMention = /^[A-Za-z0-9._:-]*$/.test(potentialMention)

        if (isValidMention) {
            if (mentionQuery !== potentialMention) {
                setMentionQuery(potentialMention)
                setMentionIndex(0)

                // Calculate horizontal position of @ symbol for popup positioning
                const textarea = composerRef.current
                if (textarea) {
                    const atPosition = cursorPos - potentialMention.length
                    const beforeAt = value.slice(0, atPosition)
                    const lines = beforeAt.split('\n')
                    const currentLine = lines[lines.length - 1]

                    // Create a temporary element to measure text width more accurately
                    const measurer = document.createElement('span')
                    measurer.style.cssText = `
                        position: absolute;
                        top: -9999px;
                        left: -9999px;
                        visibility: hidden;
                        white-space: pre;
                        font-family: ${getComputedStyle(textarea).fontFamily};
                        font-size: ${getComputedStyle(textarea).fontSize};
                        font-weight: ${getComputedStyle(textarea).fontWeight};
                        letter-spacing: ${getComputedStyle(textarea).letterSpacing};
                    `
                    measurer.textContent = currentLine
                    document.body.appendChild(measurer)

                    const leftOffset = measurer.offsetWidth
                    document.body.removeChild(measurer)

                    // Clamp position to prevent popup from going off-screen
                    const textareaRect = textarea.getBoundingClientRect()
                    const maxLeft = Math.max(0, textareaRect.width - 240) // min popup width
                    setMentionPosition(Math.min(leftOffset + 16, maxLeft)) // +16px for padding
                }
            }
        } else {
            if (mentionQuery !== null) {
                setMentionQuery(null)
            }
        }
    }, [mentionQuery])

    const handleComposerChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value
        const cursorPos = e.target.selectionStart ?? value.length

        // Update state immediately for responsive typing
        setComposer(value)

        // Use requestAnimationFrame to defer DOM operations
        requestAnimationFrame(() => {
            resizeComposerTextarea(e.target)
        })

        // Detect mentions (will be debounced via debouncedMentionQuery)
        detectMention(value, cursorPos)
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

    const syncComposerAttachmentFromPending = useCallback((
        pending: PendingAttachment,
        sessionId: string
    ) => {
        const pendingStatus = pending.status.type
        const path = (pending as { path?: unknown }).path
        const previewUrl = (pending as { previewUrl?: unknown }).previewUrl
        const nextAttachment: GroupComposerAttachment = {
            id: pending.id,
            filename: pending.name,
            mimeType: pending.contentType ?? 'application/octet-stream',
            size: pending.file?.size ?? 0,
            uploadSessionId: sessionId,
            status: 'uploading'
        }

        if (pendingStatus === 'requires-action') {
            if (typeof path === 'string' && path.length > 0) {
                nextAttachment.status = 'complete'
                nextAttachment.path = path
                if (typeof previewUrl === 'string' && previewUrl.length > 0) {
                    nextAttachment.previewUrl = previewUrl
                }
            } else {
                nextAttachment.status = 'error'
                nextAttachment.error = 'Upload failed'
            }
        } else if (pendingStatus === 'incomplete') {
            nextAttachment.status = 'error'
            nextAttachment.error = 'Upload failed'
        }

        setComposerAttachments((current) => {
            const index = current.findIndex((attachment) => attachment.id === nextAttachment.id)
            if (index === -1) {
                return [...current, nextAttachment]
            }
            const updated = [...current]
            updated[index] = { ...updated[index], ...nextAttachment }
            return updated
        })
    }, [])

    const uploadComposerAttachment = useCallback(async (
        file: File,
        adapter: ReturnType<typeof createAttachmentAdapter>,
        sessionId: string
    ) => {
        try {
            const addResult = adapter.add({ file })
            if (isPendingAttachmentAsyncGenerator(addResult)) {
                for await (const pending of addResult) {
                    const attachment = pending as unknown as Attachment
                    composerAttachmentRuntimeRef.current.set(attachment.id, { adapter, attachment })
                    syncComposerAttachmentFromPending(pending, sessionId)
                }
                return
            }

            const pending = await addResult
            const attachment = pending as unknown as Attachment
            composerAttachmentRuntimeRef.current.set(attachment.id, { adapter, attachment })
            syncComposerAttachmentFromPending(pending, sessionId)
        } catch {
            // Adapter yields error states in normal paths; unexpected failures are ignored.
        }
    }, [syncComposerAttachmentFromPending])

    const removeComposerAttachment = useCallback(async (id: string) => {
        const runtime = composerAttachmentRuntimeRef.current.get(id)
        composerAttachmentRuntimeRef.current.delete(id)
        setComposerAttachments((current) => current.filter((attachment) => attachment.id !== id))
        if (runtime) {
            try {
                await runtime.adapter.remove(runtime.attachment)
            } catch {
                // Best effort cleanup
            }
        }
    }, [])

    const handleAttachmentInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ''
        if (files.length === 0) {
            return
        }
        if (!uploadSessionId || !uploadAdapter) {
            setActionError('No online group member available for uploads')
            return
        }

        setActionError(null)
        for (const file of files) {
            void uploadComposerAttachment(file, uploadAdapter, uploadSessionId)
        }
    }, [uploadAdapter, uploadComposerAttachment, uploadSessionId])

    const handleComposerPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        const imageFiles = files.filter((file) => file.type.startsWith('image/'))
        if (imageFiles.length === 0) {
            return
        }

        event.preventDefault()
        if (!uploadSessionId || !uploadAdapter) {
            setActionError('No online group member available for uploads')
            return
        }

        setActionError(null)
        for (const file of imageFiles) {
            void uploadComposerAttachment(file, uploadAdapter, uploadSessionId)
        }
    }, [uploadAdapter, uploadComposerAttachment, uploadSessionId])

    const openAttachmentPicker = useCallback(() => {
        if (!uploadSessionId) {
            setActionError('No online group member available for uploads')
            return
        }
        composerAttachmentInputRef.current?.click()
    }, [uploadSessionId])

    const handleQuoteMessage = useCallback((message: GroupTimelineMessage) => {
        setQuotedMessage(message)
        requestAnimationFrame(() => {
            const textarea = composerRef.current
            if (!textarea) {
                return
            }
            try {
                textarea.focus({ preventScroll: true })
            } catch {
                textarea.focus()
            }
            const cursor = textarea.value.length
            textarea.setSelectionRange(cursor, cursor)
        })
    }, [])

    const handleSend = useCallback(async (e?: FormEvent) => {
        e?.preventDefault()
        const rawText = composer.trim()
        const hasAttachments = readyComposerAttachments.length > 0
        if (!rawText && !hasAttachments) return
        if (hasUploadingAttachments) {
            setActionError('Please wait for uploads to finish')
            return
        }
        const type = rawText
            ? (rawText.startsWith('/') || /\B@/.test(rawText) ? 'command' : 'chat')
            : 'chat'
        setActionError(null)
        if (type === 'command') {
            const mentionedSessionIds = Array.from(rawText.matchAll(/\B@([A-Za-z0-9._:-]+)/g))
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
            await postMessage({
                type,
                text: rawText || undefined,
                attachments: readyComposerAttachments.length > 0 ? readyComposerAttachments : undefined,
                source: 'user:web',
                quotedMessageId: quotedMessage?.id
            })
            setComposer('')
            setComposerAttachments([])
            composerAttachmentRuntimeRef.current.clear()
            setMentionQuery(null)
            setQuotedMessage(null)
            requestAnimationFrame(() => {
                timelineRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })
            })
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to send')
        }
    }, [
        composer,
        postMessage,
        existingMemberSessionIds,
        hasUploadingAttachments,
        mentionableMemberSessionIdSet,
        quotedMessage,
        readyComposerAttachments
    ])

    const handleLoadOlderMessages = useCallback(() => {
        if (messagesLoading || messagesLoadingMore || !messagesHasMore) {
            return
        }
        void loadMoreMessages()
    }, [loadMoreMessages, messagesHasMore, messagesLoading, messagesLoadingMore])

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
            if (e.nativeEvent.isComposing) {
                return
            }
            e.preventDefault()
            if (isPending) {
                return
            }
            void handleSend()
        }

    }, [mentionQuery, mentionCandidates, mentionIndex, insertMention, isPending, handleSend])

    const handleSaveNote = async () => {
        setActionError(null)
        try {
            await updateNote({ content: noteDraft, updatedBy: 'user:web' })
            const savedPrompt = group?.group?.notePrompt ?? ''
            if (notePromptDraft !== savedPrompt) {
                await updateGroup({ notePrompt: notePromptDraft.trim() || null })
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to save note')
        }
    }

    const handleRefreshNote = async () => {
        setActionError(null)
        try {
            const notePrompt = group?.group?.notePrompt?.trim()
            await refreshNote({ source: 'user:web', ...(notePrompt ? { command: notePrompt } : {}) })
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

    const canSendComposer = !isPending
        && !hasUploadingAttachments
        && (composer.trim().length > 0 || readyComposerAttachments.length > 0)

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
            {/* B. Members (collapsible) */}
            <div className="border-b border-[var(--app-divider)]">
                <div className="flex items-center gap-2 pl-3.5 pr-3 py-2 text-xs text-[var(--app-hint)]">
                    <button
                        type="button"
                        onClick={() => setMembersExpanded(!membersExpanded)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[var(--app-fg)] transition-colors"
                    >
                        {membersExpanded ? <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" /> : <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-medium uppercase tracking-wide">Members</span>
                        <span className="text-[10px]">{members.length}</span>
                        {members.some(m => {
                            const s = m.sessionId ? sessionMap.get(m.sessionId) : undefined
                            return getMemberWorkStatus(s) !== 'offline'
                        }) && (
                            <span className="text-[10px]">
                                {members.filter(m => {
                                    const s = m.sessionId ? sessionMap.get(m.sessionId) : undefined
                                    return getMemberWorkStatus(s) !== 'offline'
                                }).length} online
                            </span>
                        )}

                        {/* Show preview avatars when collapsed */}
                        {!membersExpanded && (
                            <div className="flex items-center gap-1 ml-2">
                                {members
                                    .filter(m => {
                                        const s = m.sessionId ? sessionMap.get(m.sessionId) : undefined
                                        return getMemberWorkStatus(s) !== 'offline'
                                    })
                                    .slice(0, 4)
                                    .map((member) => {
                                        const s = member.sessionId ? sessionMap.get(member.sessionId) : undefined
                                        const title = getSessionTitle(s, { fallbackSessionId: member.sessionId, fallbackIdLength: 12 })
                                        const avatarInitial = getAvatarInitial(title)
                                        const avatarTone = getSessionAvatarTone(s)
                                        const status = getMemberWorkStatus(s)
                                        const dotClass = getMemberStatusDotClass(status)
                                        return (
                                            <div key={member.id} className="relative">
                                                <span className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold ${avatarTone}`}>
                                                    {avatarInitial}
                                                </span>
                                                <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ${dotClass}`} />
                                            </div>
                                        )
                                    })}
                                {members.filter(m => {
                                    const s = m.sessionId ? sessionMap.get(m.sessionId) : undefined
                                    return getMemberWorkStatus(s) !== 'offline'
                                }).length > 4 && (
                                    <span className="text-[9px] text-[var(--app-hint)]">
                                        +{members.filter(m => {
                                            const s = m.sessionId ? sessionMap.get(m.sessionId) : undefined
                                            return getMemberWorkStatus(s) !== 'offline'
                                        }).length - 4}
                                    </span>
                                )}
                            </div>
                        )}
                    </button>
                    <div className="ml-auto flex gap-1">
                        <button
                            type="button"
                            onClick={() => setShowAddMember(true)}
                            disabled={isPending}
                            className="rounded border border-[var(--app-divider)] px-2 py-0.5 text-[10px] text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] disabled:opacity-50"
                            title="Add member"
                        >
                            Add
                        </button>
                    </div>
                </div>
                {membersExpanded ? (
                    <div className="flex flex-wrap items-center gap-1.5 pl-3.5 pr-3 pb-2">
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
                    </div>
                ) : null}
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
                            onClick={() => { void handleSaveNote() }}
                            disabled={isPending}
                            className="rounded border border-[var(--app-divider)] px-2 py-0.5 text-[10px] text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] disabled:opacity-50"
                            title="保存Note内容和Prompt"
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleRefreshNote() }}
                            disabled={isPending}
                            className="rounded border border-[var(--app-divider)] px-2 py-0.5 text-[10px] text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] disabled:opacity-50"
                        >
                            Generate
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleBroadcastNote() }}
                            disabled={isPending || !note?.content}
                            className="rounded border border-[var(--app-divider)] px-2 py-0.5 text-[10px] text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] disabled:opacity-50"
                            title="广播当前Note内容到所有群组成员"
                        >
                            📢 Broadcast
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
                                <div className="mt-2 grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1.5">
                                    <span className="self-center text-[11px] text-[var(--app-hint)]">Executor</span>
                                    <select
                                        value={group.group.noteSessionId ?? ''}
                                        onChange={(e) => {
                                            const next = e.target.value.trim()
                                            void handleUpdateNoteExecutor(next.length > 0 ? next : null)
                                        }}
                                        disabled={isPending}
                                        className="w-full rounded border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-2 py-1 text-[11px] text-[var(--app-fg)] outline-none focus:border-[var(--app-link)] disabled:opacity-60"
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
                                    <span className="pt-1 text-[11px] text-[var(--app-hint)]">Prompt</span>
                                    <textarea
                                        value={notePromptDraft}
                                        onChange={(e) => setNotePromptDraft(e.target.value)}
                                        placeholder="Optional prompt for each generation..."
                                        rows={2}
                                        className="w-full resize-y rounded border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-2 py-1 text-[11px] text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                ) : null}
            </div>

            {/* D. Timeline */}
            <div className="flex-1 min-h-0">
                {messagesLoading && visibleMessages.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingState label="Loading messages..." className="text-sm" />
                    </div>
                ) : visibleMessages.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-sm text-[var(--app-hint)]">
                        No messages yet. Start the conversation below.
                    </div>
                ) : (
                    <Virtuoso
                        ref={timelineRef}
                        data={visibleMessages}
                        style={{ height: '100%' }}
                        firstItemIndex={timelineFirstItemIndex}
                        increaseViewportBy={{ top: 400, bottom: 400 }}
                        startReached={() => {
                            handleLoadOlderMessages()
                        }}
                        followOutput={(isAtBottom) => (isAtBottom ? 'auto' : false)}
                        components={{
                            Scroller: TimelineScroller,
                            Header: () => (
                                <TimelineHistoryControl
                                    isLoading={messagesLoadingMore}
                                    hasMore={messagesHasMore}
                                    onLoadMore={handleLoadOlderMessages}
                                />
                            ),
                            Footer: () => <div className="h-2" />
                        }}
                        itemContent={(_index, message) => (
                            <TimelineBubble
                                key={message.id}
                                message={message}
                                sessionMap={sessionMap}
                                onOpenSession={(sessionId) => {
                                    navigate({ to: '/sessions/$sessionId', params: { sessionId } })
                                }}
                                onQuote={handleQuoteMessage}
                                taskStates={message.type === 'command' && message.traceId
                                    ? taskStateMap.get(message.traceId)
                                    : undefined
                                }
                            />
                        )}
                    />
                )}
            </div>

            {/* E. Composer */}
            <div className="border-t border-[var(--app-divider)] bg-[var(--app-bg)] pb-[env(safe-area-inset-bottom)]">
                {actionError ? (
                    <div className="pl-3.5 pr-3 pt-2 text-xs text-red-600">{actionError}</div>
                ) : null}
                <form onSubmit={(e) => { void handleSend(e) }} className="relative px-3 pt-2">
                    <input
                        ref={composerAttachmentInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleAttachmentInputChange}
                    />
                    {/* @ mention popup */}
                    {mentionQuery !== null && mentionCandidates.length > 0 ? (
                        <MentionPopup
                            candidates={mentionCandidates}
                            activeIndex={mentionIndex}
                            onSelect={insertMention}
                            position={mentionPosition}
                        />
                    ) : null}
                    <div className={`overflow-hidden rounded-[20px] bg-[var(--app-secondary-bg)] transition-colors ${quotedMessage ? 'ring-1 ring-[var(--app-link)]/40' : ''}`}>
                        <ComposerAttachmentList
                            attachments={composerAttachments}
                            disabled={isPending}
                            onRemove={removeComposerAttachment}
                        />
                        {quotedMessage && (
                            <div className="flex items-start gap-1.5 border-b border-[var(--app-border)] px-4 py-2">
                                <div className="h-3 w-0.5 shrink-0 rounded-full bg-[var(--app-link)]" />
                                <QuoteIcon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--app-link)]" />
                                <span className="min-w-0 flex-1 text-[11px] leading-4 text-[var(--app-hint)]">
                                    <span className="font-medium text-[var(--app-link)]">
                                        {quotedMessage.actorName || getActorSessionId(quotedMessage) || 'Unknown'}
                                    </span>
                                    {' · '}
                                    <span className="break-all">
                                        {truncateText(extractBubbleText(quotedMessage), 96)}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setQuotedMessage(null)}
                                    className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                                    title="Cancel reply"
                                >
                                    <CloseIcon className="h-3 w-3" />
                                </button>
                            </div>
                        )}
                        <div className="px-4 py-3">
                            <textarea
                                ref={composerRef}
                                value={composer}
                                onChange={handleComposerChange}
                                onPaste={handleComposerPaste}
                                onKeyDown={handleComposerKeyDown}
                                placeholder="Send chat, /command, @sessionId, or @all"
                                rows={1}
                                className="w-full resize-none bg-transparent text-sm outline-none"
                                style={{ minHeight: '38px', maxHeight: '120px' }}
                            />
                        </div>
                        <div className="flex items-center justify-between px-2 pb-2">
                            <button
                                type="button"
                                onClick={openAttachmentPicker}
                                disabled={isPending || !uploadSessionId}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-fg)]/60 transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50"
                                title={uploadSessionId ? 'Attach files' : 'No online member available for uploads'}
                            >
                                <AttachmentIcon className="h-[18px] w-[18px]" />
                            </button>
                            <button
                                type="submit"
                                disabled={!canSendComposer}
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${canSendComposer ? 'bg-black' : 'bg-[#C0C0C0]'}`}
                                title="Send"
                            >
                                <SendIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
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
