import { cn } from '@/lib/utils'

/**
 * Unified status indicator dot used across the app.
 *
 * Tones:
 *   - idle:       gray, static (e.g. stopped session)
 *   - success:    green, static (e.g. active session)
 *   - info:       blue, static (e.g. composer online)
 *   - warning:    amber, static (e.g. needs action)
 *   - danger:     red, static (e.g. error)
 *
 * Motion:
 *   - pulse=true adds a gentle breathing halo (2.4s).
 *   - pulse="fast" uses 1.1s (live activity).
 *
 * Sizes default to 6px — same as Cursor's inline indicators.
 */
export type StatusDotTone = 'idle' | 'success' | 'info' | 'warning' | 'danger'
export type StatusDotPulse = boolean | 'fast'

export function StatusDot(props: {
    tone: StatusDotTone
    pulse?: StatusDotPulse
    size?: number
    className?: string
    title?: string
}) {
    const size = props.size ?? 6
    return (
        <span
            className={cn('status-dot', `status-dot--${props.tone}`, props.pulse === true && 'status-dot--pulse', props.pulse === 'fast' && 'status-dot--pulse-fast', props.className)}
            style={{ width: size, height: size }}
            title={props.title}
            aria-hidden
        />
    )
}
