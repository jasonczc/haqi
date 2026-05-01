import { useMemo } from 'react'
import { useTranslation } from '@/lib/use-translation'
import type { ClaudeRateLimitEntry, ClaudeRateLimitSnapshot, ClaudeRateLimitType } from '@hapi/protocol/types'

type UsagePanelProps = {
    contextSize?: number
    contextWindowTokens?: number
    rateLimitSnapshot?: ClaudeRateLimitSnapshot
}

const RATE_LIMIT_ROWS: ReadonlyArray<{ key: ClaudeRateLimitType; labelKey: string }> = [
    { key: 'five_hour', labelKey: 'usage.rateLimit.fiveHour' },
    { key: 'seven_day', labelKey: 'usage.rateLimit.weeklyAll' },
    { key: 'seven_day_sonnet', labelKey: 'usage.rateLimit.weeklySonnet' },
    { key: 'seven_day_opus', labelKey: 'usage.rateLimit.weeklyOpus' },
    { key: 'overage', labelKey: 'usage.rateLimit.overage' }
]

function formatTokens(value: number): string {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`
    }
    return String(value)
}

function formatResetsIn(resetsAtSeconds: number, now: number, t: (key: string, params?: Record<string, string | number>) => string): string {
    const resetsAtMs = resetsAtSeconds * 1000
    const diffMs = resetsAtMs - now
    if (diffMs <= 0) {
        return t('usage.resetsNow')
    }
    const totalMinutes = Math.floor(diffMs / 60_000)
    const days = Math.floor(totalMinutes / (60 * 24))
    if (days >= 1) {
        return t('usage.resetsInDays', { count: days })
    }
    const hours = Math.floor(totalMinutes / 60)
    if (hours >= 1) {
        return t('usage.resetsInHours', { count: hours })
    }
    const minutes = Math.max(1, totalMinutes)
    return t('usage.resetsInMinutes', { count: minutes })
}

function utilizationToColorClass(utilization: number, status: ClaudeRateLimitEntry['status']): string {
    if (status === 'rejected') return 'bg-[var(--danger)]'
    if (utilization >= 0.85 || status === 'allowed_warning') return 'bg-[var(--warn)]'
    return 'bg-[var(--accent)]'
}

function ProgressRow(props: {
    label: string
    percentage: number | null
    color: string
    secondaryText?: string | null
}) {
    const safePct = props.percentage === null ? 0 : Math.min(100, Math.max(0, props.percentage))
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-[var(--cursor-text-primary)]">{props.label}</span>
                <span className="shrink-0 text-[var(--cursor-text-tertiary)]">
                    {props.percentage === null ? '—' : `${Math.round(props.percentage)}%`}
                    {props.secondaryText ? <span className="ml-2">· {props.secondaryText}</span> : null}
                </span>
            </div>
            <div className="h-1 w-full rounded-full bg-[var(--cursor-bg-hover)]">
                {props.percentage === null ? null : (
                    <div
                        className={`h-1 rounded-full transition-[width] ${props.color}`}
                        style={{ width: `${safePct}%` }}
                    />
                )}
            </div>
        </div>
    )
}

export function UsagePanel(props: UsagePanelProps) {
    const { t } = useTranslation()
    const now = useMemo(() => Date.now(), [props.rateLimitSnapshot, props.contextSize])

    const contextRow = useMemo(() => {
        const used = props.contextSize
        const limit = props.contextWindowTokens
        if (typeof used !== 'number' || typeof limit !== 'number' || limit <= 0) {
            return null
        }
        const percentage = (used / limit) * 100
        const text = `${formatTokens(used)} / ${formatTokens(limit)}`
        return { percentage, text }
    }, [props.contextSize, props.contextWindowTokens])

    const hasAnyRateLimit = useMemo(() => {
        const snap = props.rateLimitSnapshot
        return Boolean(snap && (snap.five_hour || snap.seven_day || snap.seven_day_opus || snap.seven_day_sonnet || snap.overage))
    }, [props.rateLimitSnapshot])

    return (
        <div className="flex w-72 flex-col gap-3 rounded-[10px] border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-card)] p-3 shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-[var(--cursor-text-primary)]">{t('usage.contextWindow')}</span>
                    {contextRow ? (
                        <span className="text-[var(--cursor-text-tertiary)]">
                            {contextRow.text} ({Math.round(contextRow.percentage)}%)
                        </span>
                    ) : (
                        <span className="text-[var(--cursor-text-tertiary)]">—</span>
                    )}
                </div>
                <div className="h-1 w-full rounded-full bg-[var(--cursor-bg-hover)]">
                    {contextRow ? (
                        <div
                            className={`h-1 rounded-full transition-[width] ${
                                contextRow.percentage >= 90 ? 'bg-[var(--danger)]'
                                    : contextRow.percentage >= 70 ? 'bg-[var(--warn)]'
                                        : 'bg-[var(--accent)]'
                            }`}
                            style={{ width: `${Math.min(100, contextRow.percentage)}%` }}
                        />
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-[var(--cursor-text-primary)]">
                    {t('usage.planUsage')}
                </div>

                {!hasAnyRateLimit ? (
                    <div className="text-[10px] text-[var(--cursor-text-tertiary)]">{t('usage.noRateLimitData')}</div>
                ) : (
                    RATE_LIMIT_ROWS.map(({ key, labelKey }) => {
                        const entry = props.rateLimitSnapshot?.[key]
                        const label = t(labelKey)
                        if (!entry) {
                            return (
                                <ProgressRow
                                    key={key}
                                    label={label}
                                    percentage={null}
                                    color="bg-[var(--accent)]"
                                />
                            )
                        }
                        const pct = typeof entry.utilization === 'number'
                            ? Math.round(entry.utilization * 1000) / 10
                            : null
                        const resetsText = entry.resetsAt
                            ? formatResetsIn(entry.resetsAt, now, t)
                            : null
                        return (
                            <ProgressRow
                                key={key}
                                label={label}
                                percentage={pct}
                                color={utilizationToColorClass(entry.utilization ?? 0, entry.status)}
                                secondaryText={resetsText}
                            />
                        )
                    })
                )}
            </div>
        </div>
    )
}
