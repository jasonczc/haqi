import { useEffect, useState } from 'react'
import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { LazyRainbowText } from '@/components/LazyRainbowText'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { MessageStatusIndicator } from '@/components/AssistantChat/messages/MessageStatusIndicator'
import { MessageAttachments } from '@/components/AssistantChat/messages/MessageAttachments'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import type { MessageStatus as HappyMessageStatus } from '@/types/api'

function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    if (totalSec < 60) return `${totalSec}s`
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function UserPromptStatusLine(props: {
    status: HappyMessageStatus | undefined
    turnDurationMs: number | null
    createdAt: number | null
}) {
    const { status, turnDurationMs, createdAt } = props
    const [now, setNow] = useState<number>(() => Date.now())

    const isOpen = turnDurationMs === null && (status === 'sent' || status === undefined)

    useEffect(() => {
        if (!isOpen) return
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [isOpen])

    let text = ''
    if (status === 'sending') text = 'Sending…'
    else if (status === 'failed') text = 'Failed'
    else if (turnDurationMs !== null) text = `Worked for ${formatDuration(turnDurationMs)}`
    else if (isOpen && createdAt !== null) text = `Working for ${formatDuration(Math.max(0, now - createdAt))}`

    if (!text) return null
    return (
        <div className="agent-status text-[length:var(--font-size-sm)] text-[var(--text-secondary)]" style={{ paddingLeft: '4px' }}>
            {text}
        </div>
    )
}

export function HappyUserMessage() {
    const ctx = useHappyChatContext()
    const messageId = useAssistantState(({ message }) => message.id)
    const role = useAssistantState(({ message }) => message.role)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'user') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const status = useAssistantState(({ message }) => {
        if (message.role !== 'user') return undefined
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.status
    })
    const localId = useAssistantState(({ message }) => {
        if (message.role !== 'user') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.localId ?? null
    })
    const attachments = useAssistantState(({ message }) => {
        if (message.role !== 'user') return undefined
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.attachments
    })
    const turnDurationMs = useAssistantState(({ message }) => {
        if (message.role !== 'user') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.turnDurationMs ?? null
    })
    const createdAt = useAssistantState(({ message }) => {
        if (message.role !== 'user') return null
        const raw = message.createdAt as unknown as Date | number | undefined
        if (raw instanceof Date) return raw.getTime()
        if (typeof raw === 'number') return raw
        return null
    })
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })

    if (role !== 'user') return null
    const canRetry = status === 'failed' && typeof localId === 'string' && Boolean(ctx.onRetryMessage)
    const onRetry = canRetry ? () => ctx.onRetryMessage!(localId!) : undefined

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root className="chat-message-user px-1 min-w-0 max-w-full overflow-x-hidden" data-happy-message-id={messageId}>
                <CliOutputBlock text={cliText} />
            </MessagePrimitive.Root>
        )
    }

    const hasText = text.length > 0
    const hasAttachments = attachments && attachments.length > 0

    return (
        <MessagePrimitive.Root
            className="chat-message-user flex flex-col"
            style={{ gap: 'var(--chat-message-gap)' }}
            data-happy-message-id={messageId}
        >
            <div
                className="user-prompt relative text-[length:var(--font-size-base)] text-[var(--text-primary)]"
                style={{
                    background: 'var(--user-card-bg)',
                    border: '1px solid var(--border-tertiary)',
                    borderRadius: 'var(--user-card-radius)',
                    padding: 'var(--user-card-padding-y) var(--user-card-padding-x)',
                    boxShadow: 'var(--user-card-shadow)',
                }}
            >
                <div className={`user-prompt-body min-w-0 ${onRetry ? 'pr-8' : ''}`}>
                    {hasText && <LazyRainbowText text={text} />}
                    {hasAttachments && <MessageAttachments attachments={attachments} />}
                </div>
                {onRetry ? (
                    <div className="user-prompt-retry absolute right-2 top-2">
                        <MessageStatusIndicator status={status!} onRetry={onRetry} />
                    </div>
                ) : null}
            </div>
            <UserPromptStatusLine status={status} turnDurationMs={turnDurationMs} createdAt={createdAt} />
        </MessagePrimitive.Root>
    )
}
