import { useAssistantState } from '@assistant-ui/react'
import { getEventPresentation, formatUnixTimestamp } from '@/chat/presentation'
import type { AgentEvent } from '@/chat/types'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'

const PROMINENT_EVENT_TYPES = new Set(['rate-limit', 'limit-reached', 'api-error'])

function isProminentEvent(event: AgentEvent | undefined): event is AgentEvent {
    return event != null && PROMINENT_EVENT_TYPES.has(event.type)
}

function ProminentEventCard({ event, text }: { event: AgentEvent; text: string }) {
    const isError = event.type === 'api-error'
    const borderClass = isError
        ? 'border-[var(--cursor-badge-error-border)] bg-[var(--cursor-badge-error-bg)]'
        : 'border-[var(--cursor-badge-warning-border)] bg-[var(--cursor-badge-warning-bg)]'
    const textClass = isError
        ? 'text-[var(--cursor-badge-error-text)]'
        : 'text-[var(--cursor-badge-warning-text)]'

    const resetsAt = 'resetsAt' in event && typeof event.resetsAt === 'number' && event.resetsAt > 0
        ? event.resetsAt
        : 'endsAt' in event && typeof event.endsAt === 'number' && event.endsAt > 0
            ? event.endsAt
            : null

    return (
        <div className={`system-event-card mx-auto max-w-[88%] rounded-xl border sm:max-w-[84%] lg:max-w-[76%] ${borderClass}`}>
            <div className={`system-event-icon ${isError ? 'is-error' : 'is-warning'}`} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isError ? (
                        <>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </>
                    ) : (
                        <>
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </>
                    )}
                </svg>
            </div>
            <div className="system-event-body min-w-0 flex-1">
                <div className={`system-event-text ${textClass}`}>{text}</div>
                {resetsAt ? (
                    <div className={`system-event-meta ${textClass}`}>
                        Resets at {formatUnixTimestamp(resetsAt)}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

export function HappySystemMessage() {
    const messageId = useAssistantState(({ message }) => message.id)
    const role = useAssistantState(({ message }) => message.role)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'system') return ''
        return message.content[0]?.type === 'text' ? message.content[0].text : ''
    })
    const event = useAssistantState(({ message }) => {
        if (message.role !== 'system') return undefined
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'event' ? custom.event : undefined
    })

    if (role !== 'system') return null

    const presentation = event ? getEventPresentation(event) : null

    if (isProminentEvent(event)) {
        return (
            <div className="py-1.5" data-happy-message-id={messageId}>
                <ProminentEventCard event={event} text={presentation?.text ?? text} />
            </div>
        )
    }

    const icon = presentation?.icon ?? null

    return (
        <div className="py-1" data-happy-message-id={messageId}>
            <div className="mx-auto w-fit max-w-[88%] px-2 text-center text-xs text-[var(--cursor-text-secondary)] opacity-80 sm:max-w-[84%] lg:max-w-[76%]">
                <span className="inline-flex items-center gap-1">
                    {icon ? <span aria-hidden="true">{icon}</span> : null}
                    <span>{text}</span>
                </span>
            </div>
        </div>
    )
}
