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
        <div className="flex h-full min-h-0 flex-col bg-[var(--bg-editor)]">
            <div className="border-b border-[var(--border-tertiary)] bg-[var(--bg-editor)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto flex w-full max-w-content items-center gap-2 p-3">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-quaternary)] hover:text-[var(--text-primary)]"
                        aria-label="Back"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">Desktop</div>
                        <div className="truncate text-xs text-[var(--text-tertiary)]">{sessionId.slice(0, 8)}...</div>
                    </div>
                    <div className="flex items-center gap-2">
                        {recordingStatus === 'recording' ? (
                            <button
                                type="button"
                                onClick={() => void handleStopRecording()}
                                className="flex items-center gap-1.5 rounded-md bg-[var(--bg-danger-secondary)] px-2.5 py-1.5 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[var(--bg-danger-quaternary)]"
                            >
                                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--danger)]" />
                                {t('recording.stop')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void handleStartRecording()}
                                disabled={recordingStatus === 'loading'}
                                className="flex items-center gap-1.5 rounded-md bg-[var(--bg-quaternary)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                            >
                                <span className="inline-block h-2 w-2 rounded-full bg-[var(--danger)]" />
                                {t('recording.start')}
                            </button>
                        )}
                        {recordings.length > 0 ? (
                            <a
                                href={`${daemonBase}/recording/download/${recordings[recordings.length - 1]}`}
                                download
                                className="rounded-md bg-[var(--bg-quaternary)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)]"
                            >
                                {t('recording.download')}
                            </a>
                        ) : null}
                    </div>
                </div>
                {error ? (
                    <div className="mx-auto max-w-content px-3 pb-2">
                        <div className="rounded-md bg-[var(--bg-danger-secondary)] px-3 py-1.5 text-xs text-[var(--danger)]">{error}</div>
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
