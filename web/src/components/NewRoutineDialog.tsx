import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { RoutineSummary } from '@/types/api'

type TriggerKind = 'schedule' | 'github' | 'api'
type ScheduleMode = 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'custom'
type Step = 'main' | 'schedule' | 'api' | 'github'

type ScheduleConfig = {
    mode: ScheduleMode
    // daily/weekdays/weekly: hour:minute
    hour: number
    minute: number
    // weekly: day-of-week 0-6 (Sunday = 0)
    dayOfWeek: number
    // custom
    cron: string
}

type Props = {
    isOpen: boolean
    onClose: () => void
    api: ApiClient | null
    onCreated: (routine: RoutineSummary) => void
}

// ── Icons ──────────────────────────────────────────────────────────

function GitHubMarkIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.94c.58.11.8-.25.8-.56v-2c-3.2.69-3.88-1.54-3.88-1.54-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.3-.51-1.47.11-3.06 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.06.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.22.68.81.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
        </svg>
    )
}

function CloudIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 0 0 4.5 14.5" />
            <path d="M8 19h9" />
        </svg>
    )
}

function ChevronDownIcon(props: { size?: number }) {
    const s = props.size ?? 12
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

function ClockIcon(props: { size?: number }) {
    const s = props.size ?? 18
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    )
}

function CalendarIcon(props: { size?: number }) {
    const s = props.size ?? 16
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    )
}

function BranchIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
    )
}

function BracesIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" />
            <path d="M16 21h1a2 2 0 0 0 2-2v-4a2 2 0 0 1 2-2 2 2 0 0 1-2-2V7a2 2 0 0 0-2-2h-1" />
        </svg>
    )
}

function LinkIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
    )
}

function ArrowLeftIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
        </svg>
    )
}

function CloseIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

// ── Helpers ────────────────────────────────────────────────────────

const MOCK_REPOS = [
    { org: '39-ai', name: 'feelin-gradescope' },
    { org: '39-ai', name: 'thankyou-api' },
    { org: '39-ai', name: 'thankyou-queue' },
    { org: '39-ai', name: 'thankyou-web' }
]

function getGmtOffsetLabel(): string {
    try {
        const offset = -new Date().getTimezoneOffset() / 60
        const sign = offset >= 0 ? '+' : '-'
        const abs = Math.abs(offset)
        return `GMT${sign}${abs % 1 === 0 ? abs : abs.toFixed(1)}`
    } catch {
        return 'UTC'
    }
}

function formatHourSummary(hour: number, minute: number): string {
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    const ampm = hour < 12 ? 'AM' : 'PM'
    return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`
}

function summarizeCron(expr: string): string {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return 'Invalid cron expression'
    const [minute, hour, dom, month, dow] = parts
    const timeStr =
        hour === '*' || minute === '*'
            ? 'every minute'
            : `At ${formatHourSummary(Number(hour) || 0, Number(minute) || 0)}`
    const dowMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    if (dow !== '*' && dom === '*' && month === '*') {
        const n = Number(dow)
        if (!Number.isNaN(n) && n >= 0 && n <= 6) {
            return `${timeStr}, only on ${dowMap[n]} (times in UTC)`
        }
    }
    if (dow === '*' && dom === '*' && month === '*') {
        return `${timeStr}, every day (times in UTC)`
    }
    return `${timeStr} (times in UTC)`
}

// ── Main Dialog ────────────────────────────────────────────────────

export function NewRoutineDialog(props: Props) {
    const { isOpen, onClose, api, onCreated } = props
    const [step, setStep] = useState<Step>('main')
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [tab, setTab] = useState<'connectors' | 'permissions'>('connectors')
    const [repoPickerOpen, setRepoPickerOpen] = useState(false)
    const [selectedRepo, setSelectedRepo] = useState<{ org: string; name: string } | null>(null)
    const [triggerKind, setTriggerKind] = useState<TriggerKind | null>(null)
    const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
        mode: 'daily',
        hour: 9,
        minute: 0,
        dayOfWeek: 1,
        cron: '0 0 * * 1'
    })
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const nameInputRef = useRef<HTMLInputElement | null>(null)
    const repoBtnRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => {
        if (!isOpen) return
        setStep('main')
        setName('')
        setDescription('')
        setTab('connectors')
        setRepoPickerOpen(false)
        setSelectedRepo(null)
        setTriggerKind(null)
        setScheduleConfig({
            mode: 'daily',
            hour: 9,
            minute: 0,
            dayOfWeek: 1,
            cron: '0 0 * * 1'
        })
        setError(null)
        const frame = window.requestAnimationFrame(() => {
            nameInputRef.current?.focus()
        })
        return () => window.cancelAnimationFrame(frame)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (step !== 'main') {
                    setStep('main')
                } else if (repoPickerOpen) {
                    setRepoPickerOpen(false)
                } else {
                    onClose()
                }
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [isOpen, step, repoPickerOpen, onClose])

    const handleSubmit = useCallback(async () => {
        if (!api) return
        const trimmedName = name.trim()
        if (!trimmedName) {
            setError('Name is required')
            nameInputRef.current?.focus()
            return
        }
        if (!triggerKind) {
            setError('Select a trigger')
            return
        }
        setSubmitting(true)
        setError(null)
        let triggerConfig: RoutineSummary['trigger']
        if (triggerKind === 'schedule') {
            if (scheduleConfig.mode === 'hourly') {
                triggerConfig = { kind: 'schedule', every: 'hour', minute: scheduleConfig.minute }
            } else if (scheduleConfig.mode === 'daily') {
                triggerConfig = {
                    kind: 'schedule',
                    every: 'day',
                    hour: scheduleConfig.hour,
                    minute: scheduleConfig.minute,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                }
            } else {
                setError('Only Hourly and Daily schedules are supported server-side right now')
                setSubmitting(false)
                return
            }
        } else if (triggerKind === 'api') {
            triggerConfig = { kind: 'api' }
        } else {
            triggerConfig = { kind: 'github', events: ['pull_request'] }
        }
        try {
            const result = await api.createRoutine({
                name: trimmedName,
                description: description.trim() || undefined,
                trigger: triggerConfig,
                spawn: {}
            })
            if (result.ok && result.routine) {
                onCreated(result.routine)
                onClose()
            } else {
                setError('Failed to create routine')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create routine')
        } finally {
            setSubmitting(false)
        }
    }, [api, name, description, triggerKind, scheduleConfig, onCreated, onClose])

    const triggerSummary = useMemo(() => {
        if (!triggerKind) return null
        if (triggerKind === 'api') return 'Trigger from your own code by sending a POST request'
        if (triggerKind === 'schedule') {
            if (scheduleConfig.mode === 'hourly')
                return `Runs every hour at :${String(scheduleConfig.minute).padStart(2, '0')}`
            if (scheduleConfig.mode === 'daily')
                return `Runs daily at ${formatHourSummary(scheduleConfig.hour, scheduleConfig.minute)} ${getGmtOffsetLabel()}`
            if (scheduleConfig.mode === 'weekdays')
                return `Weekdays at ${formatHourSummary(scheduleConfig.hour, scheduleConfig.minute)}`
            if (scheduleConfig.mode === 'weekly')
                return `Weekly at ${formatHourSummary(scheduleConfig.hour, scheduleConfig.minute)}`
            if (scheduleConfig.mode === 'custom') return `Custom cron: ${scheduleConfig.cron}`
        }
        if (triggerKind === 'github') return 'Runs when a GitHub webhook event fires'
        return null
    }, [triggerKind, scheduleConfig])

    if (!isOpen) return null

    const repoLabel = selectedRepo ? `${selectedRepo.org}/${selectedRepo.name}` : 'Select a repository'

    return (
        <div className="routine-dialog-backdrop" onClick={onClose}>
            <div
                className="routine-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="New routine"
                onClick={(e) => e.stopPropagation()}
            >
                {step === 'main' ? (
                    <>
                        <div className="routine-dialog-body">
                            <div className="routine-field">
                                <label className="routine-label" htmlFor="routine-name">
                                    Name <span className="routine-required">*</span>
                                </label>
                                <input
                                    id="routine-name"
                                    ref={nameInputRef}
                                    type="text"
                                    className="routine-input"
                                    placeholder="e.g., Daily code review"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="routine-prompt-card">
                                <textarea
                                    className="routine-prompt-textarea"
                                    placeholder="Describe what Claude should do in each session"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    disabled={submitting}
                                    rows={4}
                                />
                                <button type="button" className="routine-model-picker">
                                    <span>Opus 4.7</span>
                                    <ChevronDownIcon size={12} />
                                </button>
                                <div className="routine-prompt-card-footer">
                                    <div className="routine-prompt-footer-leading" style={{ position: 'relative' }}>
                                        <button
                                            ref={repoBtnRef}
                                            type="button"
                                            className="routine-inline-btn"
                                            onClick={() => setRepoPickerOpen((o) => !o)}
                                        >
                                            <GitHubMarkIcon />
                                            <span>{repoLabel}</span>
                                        </button>
                                        {repoPickerOpen ? (
                                            <RepoPicker
                                                onPick={(r) => {
                                                    setSelectedRepo(r)
                                                    setRepoPickerOpen(false)
                                                }}
                                                onClose={() => setRepoPickerOpen(false)}
                                            />
                                        ) : null}
                                    </div>
                                    <div className="routine-prompt-card-trailing">
                                        <button type="button" className="routine-inline-btn subtle">
                                            <CloudIcon />
                                            <span>Default</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="routine-section-title">Select a trigger</div>
                            {triggerKind ? (
                                <div className="routine-trigger-list">
                                    <button
                                        type="button"
                                        className="routine-trigger-summary"
                                        onClick={() => {
                                            if (triggerKind === 'schedule') setStep('schedule')
                                            else if (triggerKind === 'api') setStep('api')
                                            else if (triggerKind === 'github') setStep('github')
                                        }}
                                        title="Edit trigger"
                                    >
                                        <span className="routine-trigger-icon">
                                            {triggerKind === 'schedule'
                                                ? <ClockIcon />
                                                : triggerKind === 'api'
                                                    ? <BracesIcon />
                                                    : <BranchIcon />}
                                        </span>
                                        <span className="routine-trigger-summary-text">{triggerSummary}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="routine-add-trigger-btn"
                                        onClick={() => setTriggerKind(null)}
                                        title="Only one trigger per routine is supported right now — click to clear and re-add"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <line x1="12" y1="5" x2="12" y2="19" />
                                            <line x1="5" y1="12" x2="19" y2="12" />
                                        </svg>
                                        <span>Add another trigger</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="routine-trigger-list">
                                    <button
                                        type="button"
                                        className="routine-trigger"
                                        onClick={() => setStep('schedule')}
                                    >
                                        <span className="routine-trigger-icon"><ClockIcon /></span>
                                        <span className="routine-trigger-body">
                                            <span className="routine-trigger-title">Schedule</span>
                                            <span className="routine-trigger-sub">Run on a recurring cron schedule</span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`routine-trigger${!selectedRepo ? ' disabled' : ''}`}
                                        disabled={!selectedRepo}
                                        onClick={() => selectedRepo && setStep('github')}
                                    >
                                        <span className="routine-trigger-icon"><BranchIcon /></span>
                                        <span className="routine-trigger-body">
                                            <span className="routine-trigger-title">GitHub event</span>
                                            <span className="routine-trigger-sub">Run when a GitHub webhook event fires</span>
                                        </span>
                                        {!selectedRepo ? (
                                            <span className="routine-trigger-tail">Select a repository first</span>
                                        ) : null}
                                    </button>
                                    <button
                                        type="button"
                                        className="routine-trigger"
                                        onClick={() => setStep('api')}
                                    >
                                        <span className="routine-trigger-icon"><BracesIcon /></span>
                                        <span className="routine-trigger-body">
                                            <span className="routine-trigger-title">API</span>
                                            <span className="routine-trigger-sub">Trigger from your own code by sending a POST request</span>
                                        </span>
                                    </button>
                                </div>
                            )}

                            <div className="routine-subtabs" role="tablist">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === 'connectors'}
                                    className={`routine-subtab${tab === 'connectors' ? ' active' : ''}`}
                                    onClick={() => setTab('connectors')}
                                >
                                    Connectors
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === 'permissions'}
                                    className={`routine-subtab${tab === 'permissions' ? ' active' : ''}`}
                                    onClick={() => setTab('permissions')}
                                >
                                    Permissions
                                </button>
                            </div>
                            <div className="routine-subtab-divider" />

                            {tab === 'connectors' ? (
                                <div className="routine-connectors">
                                    <div className="routine-connectors-title">Connectors</div>
                                    <div className="routine-connectors-desc">
                                        All connected integrations are included by default. Remove any you don't need for this task.
                                    </div>
                                    <button type="button" className="routine-add-connector">
                                        <LinkIcon />
                                        <span>Add connector</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="routine-connectors">
                                    <div className="routine-connectors-title">Permissions</div>
                                    <div className="routine-connectors-desc">
                                        Configure what this routine is allowed to do (coming soon).
                                    </div>
                                </div>
                            )}

                            {error ? <div className="routine-error" role="alert">{error}</div> : null}
                        </div>

                        <div className="routine-dialog-footer">
                            <button
                                type="button"
                                className="routine-btn-secondary"
                                onClick={onClose}
                                disabled={submitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="routine-btn-primary"
                                onClick={handleSubmit}
                                disabled={submitting || !name.trim() || !triggerKind}
                            >
                                {submitting ? 'Creating…' : 'Create'}
                            </button>
                        </div>
                    </>
                ) : step === 'schedule' ? (
                    <ScheduleSubView
                        config={scheduleConfig}
                        onChange={setScheduleConfig}
                        onBack={() => setStep('main')}
                        onClose={onClose}
                        onConfirm={() => {
                            setTriggerKind('schedule')
                            setStep('main')
                        }}
                    />
                ) : step === 'api' ? (
                    <ApiSubView
                        onBack={() => setStep('main')}
                        onClose={onClose}
                        onConfirm={() => {
                            setTriggerKind('api')
                            setStep('main')
                        }}
                    />
                ) : step === 'github' ? (
                    <GitHubSubView
                        onBack={() => setStep('main')}
                        onClose={onClose}
                        onConfirm={() => {
                            setTriggerKind('github')
                            setStep('main')
                        }}
                    />
                ) : null}
            </div>
        </div>
    )
}

// ── Schedule sub-view ─────────────────────────────────────────────

function ScheduleSubView(props: {
    config: ScheduleConfig
    onChange: (next: ScheduleConfig) => void
    onBack: () => void
    onClose: () => void
    onConfirm: () => void
}) {
    const { config, onChange, onBack, onClose, onConfirm } = props
    const modes: { value: ScheduleMode; label: string; icon: React.ReactNode }[] = [
        { value: 'hourly', label: 'Hourly', icon: <ClockIcon size={14} /> },
        { value: 'daily', label: 'Daily', icon: <CalendarIcon size={14} /> },
        { value: 'weekdays', label: 'Weekdays', icon: <CalendarIcon size={14} /> },
        { value: 'weekly', label: 'Weekly', icon: <CalendarIcon size={14} /> },
        { value: 'custom', label: 'Custom', icon: null }
    ]

    const canConfirm =
        config.mode === 'hourly' || config.mode === 'daily' || config.mode === 'custom'

    const timeInputValue = `${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')}`

    let summaryText: string
    if (config.mode === 'hourly') summaryText = 'Runs every hour'
    else if (config.mode === 'daily')
        summaryText = `Runs daily at ${formatHourSummary(config.hour, config.minute)} ${getGmtOffsetLabel()}`
    else if (config.mode === 'weekdays')
        summaryText = `Runs every weekday at ${formatHourSummary(config.hour, config.minute)} ${getGmtOffsetLabel()} (coming soon)`
    else if (config.mode === 'weekly') {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        summaryText = `Runs weekly on ${days[config.dayOfWeek] ?? 'Monday'} at ${formatHourSummary(config.hour, config.minute)} (coming soon)`
    } else summaryText = summarizeCron(config.cron)

    return (
        <>
            <div className="routine-sub-header">
                <button type="button" className="routine-sub-iconbtn" onClick={onBack} aria-label="Back">
                    <ArrowLeftIcon />
                </button>
                <div className="routine-sub-title">Add schedule</div>
                <button type="button" className="routine-sub-iconbtn" onClick={onClose} aria-label="Close">
                    <CloseIcon />
                </button>
            </div>

            <div className="routine-sub-body">
                <div className="routine-schedule-tabs">
                    {modes.map((m) => {
                        const active = config.mode === m.value
                        return (
                            <button
                                key={m.value}
                                type="button"
                                className={`routine-schedule-tab${active ? ' active' : ''}`}
                                onClick={() => onChange({ ...config, mode: m.value })}
                            >
                                {m.icon ? <span className="routine-schedule-tab-icon">{m.icon}</span> : null}
                                <span>{m.label}</span>
                            </button>
                        )
                    })}
                </div>

                {config.mode === 'hourly' ? (
                    <div className="routine-schedule-field">
                        <label className="routine-sub-label">At minute</label>
                        <input
                            type="number"
                            min={0}
                            max={59}
                            className="routine-sub-input compact"
                            value={config.minute}
                            onChange={(e) => {
                                const n = Math.min(59, Math.max(0, Number(e.target.value) || 0))
                                onChange({ ...config, minute: n })
                            }}
                        />
                        <div className="routine-sub-helper">Runs every hour</div>
                    </div>
                ) : null}

                {config.mode === 'daily' || config.mode === 'weekdays' ? (
                    <div className="routine-schedule-field">
                        <label className="routine-sub-label">Time</label>
                        <input
                            type="time"
                            className="routine-sub-input time"
                            value={timeInputValue}
                            onChange={(e) => {
                                const [h, m] = e.target.value.split(':').map((v) => Number(v) || 0)
                                onChange({ ...config, hour: h, minute: m })
                            }}
                        />
                        <div className="routine-sub-helper">{summaryText}</div>
                    </div>
                ) : null}

                {config.mode === 'weekly' ? (
                    <div className="routine-schedule-field">
                        <label className="routine-sub-label">Day & time</label>
                        <div className="routine-weekly-row">
                            <select
                                className="routine-sub-input select"
                                value={config.dayOfWeek}
                                onChange={(e) => onChange({ ...config, dayOfWeek: Number(e.target.value) })}
                            >
                                <option value={0}>Sunday</option>
                                <option value={1}>Monday</option>
                                <option value={2}>Tuesday</option>
                                <option value={3}>Wednesday</option>
                                <option value={4}>Thursday</option>
                                <option value={5}>Friday</option>
                                <option value={6}>Saturday</option>
                            </select>
                            <input
                                type="time"
                                className="routine-sub-input time"
                                value={timeInputValue}
                                onChange={(e) => {
                                    const [h, m] = e.target.value.split(':').map((v) => Number(v) || 0)
                                    onChange({ ...config, hour: h, minute: m })
                                }}
                            />
                        </div>
                        <div className="routine-sub-helper">{summaryText}</div>
                    </div>
                ) : null}

                {config.mode === 'custom' ? (
                    <div className="routine-schedule-field">
                        <label className="routine-sub-label">Cron expression</label>
                        <input
                            type="text"
                            className="routine-sub-input mono"
                            value={config.cron}
                            onChange={(e) => onChange({ ...config, cron: e.target.value })}
                            placeholder="0 0 * * *"
                        />
                        <div className="routine-sub-helper">{summaryText}</div>
                    </div>
                ) : null}
            </div>

            <div className="routine-sub-footer">
                <div className="routine-sub-footer-text">
                    Runs are staggered by a few minutes to spread server load.
                </div>
                <button
                    type="button"
                    className="routine-btn-dark"
                    onClick={onConfirm}
                    disabled={!canConfirm}
                    title={canConfirm ? 'Add trigger' : 'Weekdays and Weekly are coming soon'}
                >
                    Add trigger
                </button>
            </div>
        </>
    )
}

// ── API sub-view ─────────────────────────────────────────────────

function ApiSubView(props: { onBack: () => void; onClose: () => void; onConfirm: () => void }) {
    const { onBack, onClose, onConfirm } = props
    return (
        <>
            <div className="routine-sub-header">
                <button type="button" className="routine-sub-iconbtn" onClick={onBack} aria-label="Back">
                    <ArrowLeftIcon />
                </button>
                <div className="routine-sub-title">Add trigger</div>
                <button type="button" className="routine-sub-iconbtn" onClick={onClose} aria-label="Close">
                    <CloseIcon />
                </button>
            </div>

            <div className="routine-sub-body">
                <div className="routine-api-title">Fire this routine from anywhere</div>
                <div className="routine-api-desc">
                    After saving, you'll get a token and a curl snippet on the routine detail page. Send a POST request whenever you want it to run.
                </div>
                <pre className="routine-api-code">
                    <code>
                        {'$ '}<span className="routine-api-cmd">{'curl -X POST .../fire \\'}</span>{'\n'}
                        {'    '}<span className="routine-api-flag">-H</span>{' "'}<span className="routine-api-arg">{'Authorization: Bearer '}</span>{'••••••"'}
                    </code>
                </pre>
            </div>

            <div className="routine-sub-footer">
                <div className="routine-sub-footer-text" />
                <button type="button" className="routine-btn-dark" onClick={onConfirm}>
                    Add trigger
                </button>
            </div>
        </>
    )
}

// ── GitHub sub-view ──────────────────────────────────────────────

function GitHubSubView(props: { onBack: () => void; onClose: () => void; onConfirm: () => void }) {
    const { onBack, onClose, onConfirm } = props
    return (
        <>
            <div className="routine-sub-header">
                <button type="button" className="routine-sub-iconbtn" onClick={onBack} aria-label="Back">
                    <ArrowLeftIcon />
                </button>
                <div className="routine-sub-title">Add trigger</div>
                <button type="button" className="routine-sub-iconbtn" onClick={onClose} aria-label="Close">
                    <CloseIcon />
                </button>
            </div>

            <div className="routine-sub-body">
                <div className="routine-api-title">GitHub webhook</div>
                <div className="routine-api-desc">
                    After saving, haqi will register a webhook on the selected repository and fire this routine when matching events arrive.
                </div>
            </div>

            <div className="routine-sub-footer">
                <div className="routine-sub-footer-text" />
                <button type="button" className="routine-btn-dark" onClick={onConfirm}>
                    Add trigger
                </button>
            </div>
        </>
    )
}

// ── Repository picker popover ────────────────────────────────────

function RepoPicker(props: {
    onPick: (r: { org: string; name: string }) => void
    onClose: () => void
}) {
    const { onPick, onClose } = props
    const [query, setQuery] = useState('')
    const rootRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const onDocPointer = (e: PointerEvent) => {
            if (rootRef.current?.contains(e.target as Node)) return
            onClose()
        }
        document.addEventListener('pointerdown', onDocPointer)
        return () => document.removeEventListener('pointerdown', onDocPointer)
    }, [onClose])

    const recent = MOCK_REPOS.slice(2, 3)
    const all = MOCK_REPOS.filter((r) =>
        query.trim().length === 0
            ? true
            : `${r.org}/${r.name}`.toLowerCase().includes(query.trim().toLowerCase())
    )

    return (
        <div ref={rootRef} className="routine-repo-picker" role="listbox" aria-label="Select a repository">
            <div className="routine-repo-search">
                <input
                    type="text"
                    placeholder="Search repositories"
                    className="routine-repo-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
            </div>
            {recent.length > 0 && query.trim().length === 0 ? (
                <>
                    <div className="routine-repo-section-label">Recently Used</div>
                    {recent.map((r) => (
                        <button
                            key={`recent-${r.org}/${r.name}`}
                            type="button"
                            className="routine-repo-item"
                            onClick={() => onPick(r)}
                        >
                            <span className="routine-repo-name">{r.name}</span>
                            <span className="routine-repo-org">{r.org}</span>
                        </button>
                    ))}
                    <div className="routine-repo-divider" />
                </>
            ) : null}
            <div className="routine-repo-section-label">All Repositories</div>
            {all.length === 0 ? (
                <div className="routine-repo-empty">No matches</div>
            ) : (
                all.map((r) => (
                    <button
                        key={`all-${r.org}/${r.name}`}
                        type="button"
                        className="routine-repo-item"
                        onClick={() => onPick(r)}
                    >
                        <span className="routine-repo-name">{r.name}</span>
                        <span className="routine-repo-org">{r.org}</span>
                    </button>
                ))
            )}
            <div className="routine-repo-divider" />
            <div className="routine-repo-footer">
                Repo missing? <a href="https://github.com/apps/claude" target="_blank" rel="noreferrer" className="routine-repo-footer-link">Install the Claude GitHub app ↗</a> in a private repository to access it here.
            </div>
        </div>
    )
}
