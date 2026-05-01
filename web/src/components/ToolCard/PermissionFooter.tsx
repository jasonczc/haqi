import { useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import type { ChatToolCall, ToolPermission } from '@/chat/types'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/Spinner'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/StatusDot'
import { isCodexFamilyFlavor } from '@/lib/agentFlavorUtils'
import { isExitPlanToolName } from '@/components/ToolCard/exitPlanMode'
import { getInputStringAny } from '@/lib/toolInputUtils'
import { useTranslation } from '@/lib/use-translation'

function isToolAllowedForSession(toolName: string, toolInput: unknown, allowedTools: string[] | undefined): boolean {
    if (!allowedTools || allowedTools.length === 0) return false
    if (allowedTools.includes(toolName)) return true

    if (toolName === 'Bash') {
        const command = getInputStringAny(toolInput, ['command', 'cmd'])
        if (command) {
            return allowedTools.includes(`Bash(${command})`)
        }
    }

    return false
}

function isCodexSession(metadata: SessionMetadataSummary | null, toolName: string): boolean {
    return isCodexFamilyFlavor(metadata?.flavor)
        || toolName.startsWith('Codex')
        || toolName.startsWith('Gemini')
        || toolName.startsWith('OpenCode')
}

function formatPermissionSummary(permission: ToolPermission, toolName: string, toolInput: unknown, codex: boolean, t: (key: string) => string): string {
    const isPlanTool = isExitPlanToolName(toolName)

    if (permission.status === 'pending') {
        return isPlanTool ? t('tool.reviewPlan') : t('tool.waitingForApproval')
    }
    if (permission.status === 'canceled') {
        const base = isPlanTool ? t('tool.stayInPlanMode') : t('tool.canceled')
        return permission.reason ? `${base}: ${permission.reason}` : base
    }

    if (codex) {
        if (isPlanTool) {
            if (permission.status === 'approved') return t('tool.planApproved')
            if (permission.status === 'denied') {
                return permission.reason
                    ? `${t('tool.stayInPlanMode')}: ${permission.reason}`
                    : t('tool.stayInPlanMode')
            }
        }

        if (permission.status === 'approved' && permission.decision === 'approved_for_session') return t('tool.approvedForSession')
        if (permission.status === 'approved') return t('tool.approved')
        if (permission.status === 'denied' && permission.decision === 'abort') return permission.reason ? `${t('tool.aborted')}: ${permission.reason}` : t('tool.aborted')
        if (permission.status === 'denied') return permission.reason ? `${t('tool.deny')}: ${permission.reason}` : t('tool.deny')
        return t('tool.allow')
    }

    if (permission.status === 'approved') {
        if (permission.mode === 'acceptEdits') return t('tool.approvedAllowAllEdits')
        if (isToolAllowedForSession(toolName, toolInput, permission.allowedTools)) return t('tool.approvedForSession')
        return t('tool.approved')
    }

    if (permission.status === 'denied') {
        return permission.reason ? `${t('tool.deny')}: ${permission.reason}` : t('tool.deny')
    }

    return t('tool.allow')
}

const PERMISSION_TONE_TO_VARIANT = {
    allow: 'success',
    deny: 'danger',
    neutral: 'secondary',
} as const satisfies Record<'allow' | 'deny' | 'neutral', ButtonVariant>

function PermissionRowButton(props: {
    label: string
    tone: 'allow' | 'deny' | 'neutral'
    loading?: boolean
    disabled: boolean
    onClick: () => void
}) {
    return (
        <Button
            variant={PERMISSION_TONE_TO_VARIANT[props.tone]}
            size="md"
            className="permission-btn-row justify-between text-left"
            disabled={props.disabled}
            aria-busy={props.loading === true}
            onClick={props.onClick}
            trailingIcon={props.loading ? <Spinner size="sm" label={null} className="text-current" /> : undefined}
        >
            <span className="flex-1">{props.label}</span>
        </Button>
    )
}

export function PermissionFooter(props: {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    tool: ChatToolCall
    disabled: boolean
    onDone: () => void
}) {
    const { t } = useTranslation()
    const { haptic } = usePlatform()
    const permission = props.tool.permission
    const [loading, setLoading] = useState<'allow' | 'deny' | 'abort' | null>(null)
    const [loadingAllEdits, setLoadingAllEdits] = useState(false)
    const [loadingForSession, setLoadingForSession] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [note, setNote] = useState('')
    const toolName = props.tool.name
    const isPlanTool = isExitPlanToolName(toolName)

    const codex = useMemo(
        () => isPlanTool || isCodexSession(props.metadata, props.tool.name),
        [isPlanTool, props.metadata, props.tool.name]
    )

    if (!permission) return null

    const summary = formatPermissionSummary(permission, props.tool.name, props.tool.input, codex, t)
    const isPending = permission.status === 'pending'
    const trimmedNote = note.trim()
    const reason = trimmedNote.length > 0 ? trimmedNote : undefined

    const run = async (action: () => Promise<void>, hapticType: 'success' | 'error') => {
        if (props.disabled) return
        setError(null)
        try {
            await action()
            haptic.notification(hapticType)
            props.onDone()
        } catch (e) {
            haptic.notification('error')
            setError(e instanceof Error ? e.message : t('tool.requestFailed'))
        }
    }

    const isEditTool = toolName === 'Edit'
        || toolName === 'MultiEdit'
        || toolName === 'Write'
        || toolName === 'NotebookEdit'
    const hideAllowForSession = toolName === 'Edit'
        || toolName === 'MultiEdit'
        || toolName === 'Write'
        || toolName === 'NotebookEdit'
        || toolName === 'exit_plan_mode'
        || toolName === 'ExitPlanMode'

    const canAllowForSession = !codex && isPending && !hideAllowForSession
    const canAllowAllEdits = !codex && isPending && isEditTool

    const approve = async () => {
        if (!isPending || loading || loadingAllEdits || loadingForSession) return
        setLoading('allow')
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { reason }), 'success')
        setLoading(null)
    }

    const approveAllEdits = async () => {
        if (!isPending || loading || loadingAllEdits || loadingForSession) return
        setLoadingAllEdits(true)
        await run(() => props.api.approvePermission(props.sessionId, permission.id, 'acceptEdits'), 'success')
        setLoadingAllEdits(false)
    }

    const approveForSession = async () => {
        if (!canAllowForSession || loading || loadingAllEdits || loadingForSession) return
        setLoadingForSession(true)
        const command = toolName === 'Bash' ? getInputStringAny(props.tool.input, ['command', 'cmd']) : null
        const toolIdentifier = toolName === 'Bash' && command ? `Bash(${command})` : toolName
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { allowTools: [toolIdentifier] }), 'success')
        setLoadingForSession(false)
    }

    const deny = async () => {
        if (!isPending || loading || loadingAllEdits || loadingForSession) return
        setLoading('deny')
        await run(() => props.api.denyPermission(props.sessionId, permission.id, { reason }), 'success')
        setLoading(null)
    }

    const codexApprove = async (decision: 'approved' | 'approved_for_session') => {
        if (!isPending || loading || loadingForSession) return
        if (decision === 'approved_for_session') {
            setLoadingForSession(true)
            await run(() => props.api.approvePermission(props.sessionId, permission.id, { decision, reason }), 'success')
            setLoadingForSession(false)
            return
        }
        setLoading('allow')
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { decision, reason }), 'success')
        setLoading(null)
    }

    const codexDeny = async () => {
        if (!isPending || loading || loadingForSession) return
        setLoading('deny')
        await run(() => props.api.denyPermission(props.sessionId, permission.id, { decision: 'denied', reason }), 'success')
        setLoading(null)
    }

    const codexAbort = async () => {
        if (!isPending || loading || loadingForSession) return
        setLoading('abort')
        await run(() => props.api.denyPermission(props.sessionId, permission.id, { decision: 'abort', reason }), 'success')
        setLoading(null)
    }

    if (!isPending) {
        // Keep the thread minimal: approval is already reflected by tool state/icon.
        // Only surface a short message when the permission was denied/canceled and we have a reason.
        if (permission.status !== 'denied' && permission.status !== 'canceled') return null
        if (!permission.reason) return null

        return (
            <div className="mt-2 text-xs text-[var(--danger)]">
                {permission.reason}
            </div>
        )
    }

    return (
        <div className="permission-footer mt-2">
            <div className="permission-header">
                <StatusDot tone="warning" size={8} pulse className="permission-header-dot" />
                <span className="permission-header-label">{summary}</span>
            </div>

            {error ? (
                <div className="permission-error mt-2" role="alert">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                </div>
            ) : null}

            {isPlanTool ? (
                <div className="mt-2">
                    <div className="mb-1 text-xs text-[var(--cursor-text-secondary)]">
                        {t('tool.planNoteLabel')}
                    </div>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        disabled={props.disabled || loading !== null || loadingForSession}
                        placeholder={t('tool.planNotePlaceholder')}
                        aria-label={t('tool.planNoteLabel')}
                        className="w-full min-h-[72px] resize-y rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-card)] px-3 py-2 text-sm text-[var(--cursor-text-primary)] placeholder:text-[var(--cursor-text-secondary)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--cursor-button)] disabled:opacity-50"
                    />
                </div>
            ) : null}

            <div className="mt-2 flex flex-col gap-1">
                {codex ? (
                    isPlanTool ? (
                        <>
                            <PermissionRowButton
                                label={t('tool.approvePlan')}
                                tone="allow"
                                loading={loading === 'allow'}
                                disabled={props.disabled || loading !== null || loadingForSession}
                                onClick={() => codexApprove('approved')}
                            />
                            <PermissionRowButton
                                label={t('tool.rejectPlan')}
                                tone="deny"
                                loading={loading === 'deny'}
                                disabled={props.disabled || loading !== null || loadingForSession}
                                onClick={codexDeny}
                            />
                            <PermissionRowButton
                                label={t('tool.skipPlan')}
                                tone="neutral"
                                loading={loading === 'abort'}
                                disabled={props.disabled || loading !== null || loadingForSession}
                                onClick={codexAbort}
                            />
                        </>
                    ) : (
                        <>
                            <PermissionRowButton
                                label={t('tool.yes')}
                                tone="allow"
                                loading={loading === 'allow'}
                                disabled={props.disabled || loading !== null || loadingForSession}
                                onClick={() => codexApprove('approved')}
                            />
                            <PermissionRowButton
                                label={t('tool.yesForSession')}
                                tone="neutral"
                                loading={loadingForSession}
                                disabled={props.disabled || loading !== null || loadingForSession}
                                onClick={() => codexApprove('approved_for_session')}
                            />
                            <PermissionRowButton
                                label={t('tool.abortLabel')}
                                tone="deny"
                                loading={loading === 'abort'}
                                disabled={props.disabled || loading !== null || loadingForSession}
                                onClick={codexAbort}
                            />
                        </>
                    )
                ) : (
                    <>
                        <PermissionRowButton
                            label={t('tool.allow')}
                            tone="allow"
                            loading={loading === 'allow'}
                            disabled={props.disabled || loading !== null || loadingAllEdits || loadingForSession}
                            onClick={approve}
                        />
                        {canAllowForSession ? (
                            <PermissionRowButton
                                label={t('tool.allowForSession')}
                                tone="neutral"
                                loading={loadingForSession}
                                disabled={props.disabled || loading !== null || loadingAllEdits || loadingForSession}
                                onClick={approveForSession}
                            />
                        ) : null}
                        {canAllowAllEdits ? (
                            <PermissionRowButton
                                label={t('tool.allowAll')}
                                tone="neutral"
                                loading={loadingAllEdits}
                                disabled={props.disabled || loading !== null || loadingAllEdits || loadingForSession}
                                onClick={approveAllEdits}
                            />
                        ) : null}
                        <PermissionRowButton
                            label={t('tool.deny')}
                            tone="deny"
                            loading={loading === 'deny'}
                            disabled={props.disabled || loading !== null || loadingAllEdits || loadingForSession}
                            onClick={deny}
                        />
                    </>
                )}
            </div>
        </div>
    )
}
