import { cn } from '@/lib/utils'

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
            className={cn(
                'status-dot',
                `status-dot--${props.tone}`,
                props.pulse === true && 'status-dot--pulse',
                props.pulse === 'fast' && 'status-dot--pulse-fast',
                props.className
            )}
            style={{ width: size, height: size }}
            title={props.title}
            aria-hidden
        />
    )
}
