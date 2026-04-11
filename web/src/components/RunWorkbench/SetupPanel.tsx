import { useState, useCallback } from 'react'
import type { Session } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { useToast } from '@/lib/toast-context'

type SetupStep = {
    label: string
    status: 'pending' | 'active' | 'done' | 'skipped'
    description?: string
}

function StepIcon(props: { status: string }) {
    if (props.status === 'done') {
        return (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="8" fill="var(--cursor-success)" />
                <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    }
    if (props.status === 'active') {
        return (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="animate-spin">
                <circle cx="9" cy="9" r="7.5" stroke="var(--cursor-link)" strokeWidth="1.5" strokeDasharray="35 12" />
            </svg>
        )
    }
    // pending / skipped
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="var(--cursor-stroke-primary)" strokeWidth="1.5" />
        </svg>
    )
}

/**
 * Setup panel for the Run Workbench.
 * Matches Cursor's setup run right-panel experience:
 * - "Setup is ready to save" banner
 * - Step checklist (get notified, connect slack, setting up, save environment)
 * - Update Script editor
 * - Save button
 */
export function SetupPanel(props: {
    session: Session
    api: ApiClient | null
}) {
    const { addToast } = useToast()
    const setupStatus = props.session.metadata?.setupStatus
    const environmentId = props.session.metadata?.environmentId
    const checkpointId = props.session.metadata?.checkpointId
    const containerId = props.session.metadata?.containerId

    const [updateScript, setUpdateScript] = useState('')
    const [checkpointName, setCheckpointName] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const isSetupComplete = setupStatus?.phase === 'complete' || setupStatus?.phase === 'done'
    const isSetupRunning = setupStatus?.phase === 'running' || setupStatus?.phase === 'active'

    // Derive steps from metadata
    const steps: SetupStep[] = [
        {
            label: 'Get notified when finished',
            status: 'done',
            description: 'Notifications are enabled for this session.'
        },
        {
            label: 'Setting up environment',
            status: isSetupComplete ? 'done' : isSetupRunning ? 'active' : 'pending',
            description: setupStatus?.message
        },
        {
            label: 'Save environment',
            status: isSetupComplete && checkpointId ? 'done' : isSetupComplete ? 'active' : 'pending',
            description: 'The environment consists of a machine snapshot and an update script for refreshing dependencies.'
        }
    ]

    const handleSaveCheckpoint = useCallback(async () => {
        const name = checkpointName.trim()
        if (!name || !props.api || !containerId) return
        setIsSaving(true)
        try {
            const result = await props.api.saveCheckpoint(props.session.id, name)
            addToast({
                title: 'Environment Saved',
                body: `Checkpoint: ${result.checkpointId.slice(0, 8)}`,
                sessionId: props.session.id,
                url: ''
            })
        } catch (err) {
            addToast({
                title: 'Save Failed',
                body: err instanceof Error ? err.message : 'Failed to save environment',
                sessionId: props.session.id,
                url: ''
            })
        } finally {
            setIsSaving(false)
        }
    }, [props.api, props.session.id, checkpointName, containerId, addToast])

    return (
        <div className="flex flex-1 flex-col overflow-y-auto">
            {/* Banner — show whenever a container is running and no checkpoint yet */}
            {containerId && !checkpointId && (
                <div className="border-b border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-soft)] px-4 py-3">
                    <div className="text-[14px] font-semibold text-[var(--cursor-text-primary)]">
                        {isSetupComplete ? 'Setup is ready to save' : 'Save environment anytime'}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[var(--cursor-text-tertiary)]">
                        {isSetupComplete
                            ? 'The agent has finished preparing the environment. Save it now so future agents can reuse it.'
                            : 'Capture the current container state as a checkpoint. Future agents can spawn from this snapshot instantly.'}
                    </div>
                </div>
            )}

            {/* Step list */}
            <div className="border-b border-[var(--cursor-stroke-secondary)] px-4 py-3">
                <div className="space-y-3">
                    {steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                            <div className="mt-0.5 flex-shrink-0">
                                <StepIcon status={step.status} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className={`text-[13px] font-medium ${
                                    step.status === 'done' ? 'text-[var(--cursor-text-primary)]' : 'text-[var(--cursor-text-tertiary)]'
                                }`}>
                                    {step.label}
                                </div>
                                {step.description && step.status !== 'pending' && (
                                    <div className="mt-0.5 text-[11px] text-[var(--cursor-text-tertiary)]">
                                        {step.description}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Save environment section — available whenever a container exists */}
            {containerId && (
                <div className="px-4 py-3">
                    <div className="text-[13px] font-semibold text-[var(--cursor-text-primary)] mb-2">
                        Save environment
                    </div>
                    <div className="text-[12px] text-[var(--cursor-text-tertiary)] mb-3">
                        The environment consists of a machine snapshot and an update script for refreshing dependencies.
                    </div>

                    {/* Update Script */}
                    <div className="mb-3">
                        <div className="text-[12px] font-medium text-[var(--cursor-text-tertiary)] mb-1.5">
                            Update Script
                        </div>
                        <textarea
                            value={updateScript}
                            onChange={(e) => setUpdateScript(e.target.value)}
                            placeholder="# Commands to refresh dependencies&#10;npm install&#10;pip install -r requirements.txt"
                            rows={5}
                            className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-soft)] px-3 py-2 font-mono text-[12px] text-[var(--cursor-text-primary)] placeholder:text-[var(--cursor-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)] resize-y"
                        />
                    </div>

                    {/* Checkpoint name + Save button */}
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <label className="text-[11px] font-medium text-[var(--cursor-text-tertiary)] mb-1 block">
                                Environment name
                            </label>
                            <input
                                type="text"
                                value={checkpointName}
                                onChange={(e) => setCheckpointName(e.target.value)}
                                placeholder="my-dev-env"
                                className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-card)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleSaveCheckpoint()}
                            disabled={!checkpointName.trim() || isSaving}
                            className="rounded-md bg-[var(--cursor-button)] px-4 py-1.5 text-[13px] font-medium text-[var(--cursor-bg-card)] transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            )}

            {/* Already saved */}
            {checkpointId && (
                <div className="px-4 py-3">
                    <div className="flex items-center gap-2 rounded-md bg-[var(--cursor-success-bg)] px-3 py-2">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--cursor-success)">
                            <circle cx="8" cy="8" r="7" />
                            <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                        <span className="text-[13px] font-medium text-[var(--cursor-success)]">
                            Environment saved
                        </span>
                        <span className="ml-auto text-[11px] font-mono text-[var(--cursor-text-tertiary)]">
                            {checkpointId.slice(0, 8)}
                        </span>
                    </div>
                </div>
            )}

            {/* Start your first agent */}
            {isSetupComplete && (
                <div className="px-4 py-3 border-t border-[var(--cursor-stroke-secondary)]">
                    <div className="flex items-center gap-2 text-[var(--cursor-text-tertiary)]">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="8" cy="8" r="7" />
                            <path d="M6 6l4 4M10 6l-4 4" strokeLinecap="round" />
                        </svg>
                        <span className="text-[13px]">Start your first agent</span>
                    </div>
                </div>
            )}

            {/* Not a cloud session at all */}
            {!setupStatus && !environmentId && !containerId && (
                <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--cursor-text-tertiary)]">
                    This session doesn't have a setup configuration.
                </div>
            )}

            {/* Environment info */}
            {environmentId && (
                <div className="border-t border-[var(--cursor-stroke-secondary)] px-4 py-3">
                    <div className="text-[11px] text-[var(--cursor-text-tertiary)]">
                        <span className="font-medium">Environment:</span> {environmentId}
                        {props.session.metadata?.environmentVersion && (
                            <span className="ml-2">v{props.session.metadata.environmentVersion}</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
