import { cn } from '@/lib/utils'

export type ChecklistStatus = 'pending' | 'in_progress' | 'completed'

export function ChecklistStatusIcon(props: { status: ChecklistStatus; size?: number; className?: string }) {
    const size = props.size ?? 14
    const className = cn('checklist-status-icon', `checklist-status-icon--${props.status}`, props.className)

    if (props.status === 'completed') {
        return (
            <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="7" fill="currentColor" />
                <path d="M4.5 8.2 7 10.7l4.5-5" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
        )
    }

    if (props.status === 'in_progress') {
        return (
            <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <circle cx="8" cy="8" r="2.25" fill="currentColor">
                    <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
                </circle>
            </svg>
        )
    }

    return (
        <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
    )
}
