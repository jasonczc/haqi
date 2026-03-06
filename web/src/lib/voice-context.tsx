import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ConversationStatus, StatusCallback } from '@/realtime/types'
import { setVoicePureContextModeEnabled, startRealtimeSession, stopRealtimeSession, voiceHooks } from '@/realtime'
import { getElevenLabsCodeFromPreference } from '@/lib/languages'
import { useAppContext } from '@/lib/app-context'
import { useMemory } from '@/hooks/queries/useMemory'

interface VoiceContextValue {
    status: ConversationStatus
    errorMessage: string | null
    micMuted: boolean
    currentSessionId: string | null
    setStatus: (status: ConversationStatus, errorMessage?: string) => void
    setMicMuted: (muted: boolean) => void
    toggleMic: () => void
    startVoice: (sessionId: string) => Promise<void>
    stopVoice: () => Promise<void>
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

export function VoiceProvider({ children }: { children: ReactNode }) {
    const { api } = useAppContext()
    const { memory } = useMemory(api)
    const pureContextModeEnabled = memory?.pureContextMode ?? false
    const [status, setStatusInternal] = useState<ConversationStatus>('disconnected')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [micMuted, setMicMuted] = useState(false)
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

    const setStatus: StatusCallback = useCallback((newStatus, error) => {
        setStatusInternal(newStatus)
        if (newStatus === 'error') {
            setErrorMessage(error ?? null)
        } else if (newStatus === 'connected') {
            setErrorMessage(null)
        }
    }, [])

    const toggleMic = useCallback(() => {
        setMicMuted((prev) => !prev)
    }, [])

    useEffect(() => {
        setVoicePureContextModeEnabled(pureContextModeEnabled)
    }, [pureContextModeEnabled])

    const startVoice = useCallback(async (sessionId: string) => {
        setCurrentSessionId(sessionId)
        const initialContext = pureContextModeEnabled
            ? ''
            : voiceHooks.onVoiceStarted(sessionId)

        // Read voice language preference from localStorage
        const voiceLang = localStorage.getItem('hapi-voice-lang')
        const elevenLabsLang = getElevenLabsCodeFromPreference(voiceLang)

        await startRealtimeSession(sessionId, initialContext, elevenLabsLang)
    }, [pureContextModeEnabled])

    const stopVoice = useCallback(async () => {
        voiceHooks.onVoiceStopped()
        await stopRealtimeSession()
        setCurrentSessionId(null)
        setStatusInternal('disconnected')
        setErrorMessage(null)
    }, [])

    return (
        <VoiceContext.Provider
            value={{
                status,
                errorMessage,
                micMuted,
                currentSessionId,
                setStatus,
                setMicMuted,
                toggleMic,
                startVoice,
                stopVoice
            }}
        >
            {children}
        </VoiceContext.Provider>
    )
}

export function useVoice(): VoiceContextValue {
    const context = useContext(VoiceContext)
    if (!context) {
        throw new Error('useVoice must be used within a VoiceProvider')
    }
    return context
}

export function useVoiceOptional(): VoiceContextValue | null {
    return useContext(VoiceContext)
}
