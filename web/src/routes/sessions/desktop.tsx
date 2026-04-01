import { useState, useCallback, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useTranslation } from '@/lib/use-translation'

function BackIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

type RecordingStatus = 'idle' | 'recording' | 'loading'

export default function DesktopPage() {
    const { sessionId } = useParams({ from: '/sessions/$sessionId/desktop' })
    const goBack = useAppGoBack()
    const { t } = useTranslation()
    const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle')
    const [recordings, setRecordings] = useState<string[]>([])
    const [error, setError] = useState<string | null>(null)

    const desktopUrl = `/desktop/${sessionId}`
    const daemonBase = `/preview/${sessionId}/9876`

    const fetchRecordingStatus = useCallback(async () => {
        try {
            const res = await fetch(`${daemonBase}/recording/status`)
            if (res.ok) {
                const data = await res.json()
                setRecordingStatus(data.recording ? 'recording' : 'idle')
            }
        } catch {
            // daemon may not support recording — ignore
        }
    }, [daemonBase])

    const fetchRecordings = useCallback(async () => {
        try {
            const res = await fetch(`${daemonBase}/recording/list`)
            if (res.ok) {
                const data = await res.json()
                setRecordings(data.recordings ?? [])
            }
        } catch {
            // ignore
        }
    }, [daemonBase])

    useEffect(() => {
        void fetchRecordingStatus()
        void fetchRecordings()
    }, [fetchRecordingStatus, fetchRecordings])

    const handleStartRecording = async () => {
        setError(null)
        setRecordingStatus('loading')
        try {
            const res = await fetch(`${daemonBase}/recording/start`, { method: 'POST' })
            if (!res.ok) {
                const text = await res.text()
                throw new Error(text || `HTTP ${res.status}`)
            }
            setRecordingStatus('recording')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start recording')
            setRecordingStatus('idle')
        }
    }

    const handleStopRecording = async () => {
        setError(null)
        setRecordingStatus('loading')
        try {
            const res = await fetch(`${daemonBase}/recording/stop`, { method: 'POST' })
            if (!res.ok) {
                const text = await res.text()
                throw new Error(text || `HTTP ${res.status}`)
            }
            setRecordingStatus('idle')
            void fetchRecordings()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to stop recording')
            setRecordingStatus('recording')
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
            <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto flex w-full max-w-content items-center gap-2 p-3">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        aria-label="Back"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">Desktop</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{sessionId.slice(0, 8)}...</div>
                    </div>
                    <div className="flex items-center gap-2">
                        {recordingStatus === 'recording' ? (
                            <button
                                type="button"
                                onClick={() => void handleStopRecording()}
                                className="flex items-center gap-1.5 rounded-md bg-red-500/15 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-500/25 transition-colors"
                            >
                                <span className="inline-block h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                                {t('recording.stop')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void handleStartRecording()}
                                disabled={recordingStatus === 'loading'}
                                className="flex items-center gap-1.5 rounded-md bg-[var(--app-subtle-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)] transition-colors disabled:opacity-50"
                            >
                                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                                {t('recording.start')}
                            </button>
                        )}
                        {recordings.length > 0 ? (
                            <a
                                href={`${daemonBase}/recording/download/${recordings[recordings.length - 1]}`}
                                download
                                className="rounded-md bg-[var(--app-subtle-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)] transition-colors"
                            >
                                {t('recording.download')}
                            </a>
                        ) : null}
                    </div>
                </div>
                {error ? (
                    <div className="mx-auto max-w-content px-3 pb-2">
                        <div className="rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-700">{error}</div>
                    </div>
                ) : null}
            </div>
            <iframe
                src={desktopUrl}
                className="min-h-0 flex-1 border-0"
                title="Remote Desktop"
            />
        </div>
    )
}
