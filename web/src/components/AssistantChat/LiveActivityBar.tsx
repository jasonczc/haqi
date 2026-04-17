import { useMemo } from 'react'
import type { DecryptedMessage } from '@/types/api'
import { extractLatestLiveActivity } from '@/components/AssistantChat/liveActivity'

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
        <div className="live-activity-bar mx-auto w-full max-w-content px-3 pb-1">
            <div className="live-activity-inner flex items-center gap-2.5 rounded-full px-3 py-1.5 text-xs">
                <span className="live-activity-dot" aria-hidden />
                <span className="live-activity-text truncate">{activity}</span>
            </div>
        </div>
    )
}
