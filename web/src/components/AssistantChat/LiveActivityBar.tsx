import { useMemo } from 'react'
import type { DecryptedMessage } from '@/types/api'
import { extractLatestLiveActivity } from '@/components/AssistantChat/liveActivity'
import { Spinner } from '@/components/Spinner'

export function LiveActivityBar(props: {
    messages: DecryptedMessage[]
    visible: boolean
}) {
    const activity = useMemo(
        () => props.visible ? extractLatestLiveActivity(props.messages) : '',
        [props.messages, props.visible]
    )

    if (!props.visible) {
        return null
    }

    return (
        <div className="animate-bounce-in mx-auto w-full max-w-content px-3 pb-1">
            <div className="flex items-center gap-2 rounded-lg bg-[var(--app-subtle-bg)] px-3 py-1.5 text-xs text-[var(--app-hint)]">
                <Spinner size="sm" label={null} className="text-current" />
                <span className="truncate">{activity}</span>
            </div>
        </div>
    )
}
