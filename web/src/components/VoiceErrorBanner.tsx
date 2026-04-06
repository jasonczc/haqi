import { useEffect } from 'react'
import { useVoiceOptional } from '@/lib/voice-context'

export function VoiceErrorBanner() {
    const voice = useVoiceOptional()

    const shouldShow = voice && voice.status === 'error' && voice.errorMessage

    useEffect(() => {
        if (!shouldShow || !voice) return

        const timer = setTimeout(() => {
            voice.setStatus('disconnected')
        }, 3000)

        return () => clearTimeout(timer)
    }, [shouldShow, voice])

    if (!shouldShow) {
        return null
    }

    return (
        <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center border-b border-[var(--danger)]/20 bg-[var(--danger)]/12 py-2 text-center text-sm font-medium text-[var(--danger)]">
            {voice.errorMessage}
        </div>
    )
}
