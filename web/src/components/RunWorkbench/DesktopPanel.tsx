import { useState, useCallback, useEffect } from 'react'

export function DesktopPanel(props: { sessionId: string }) {
    const desktopUrl = `/desktop/${props.sessionId}`
    const daemonBase = `/preview/${props.sessionId}/9876`
    const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'loading'>('idle')

    const fetchRecordingStatus = useCallback(async () => {
        try {
            const res = await fetch(`${daemonBase}/recording/status`)
            if (res.ok) {
                const data = await res.json()
                setRecordingStatus(data.recording ? 'recording' : 'idle')
            }
        } catch {
            // daemon may not support recording
        }
    }, [daemonBase])

    useEffect(() => {
        void fetchRecordingStatus()
    }, [fetchRecordingStatus])

    const handleToggleRecording = async () => {
        const endpoint = recordingStatus === 'recording' ? 'stop' : 'start'
        setRecordingStatus('loading')
        try {
            const res = await fetch(`${daemonBase}/recording/${endpoint}`, { method: 'POST' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setRecordingStatus(endpoint === 'start' ? 'recording' : 'idle')
        } catch {
            setRecordingStatus(endpoint === 'start' ? 'idle' : 'recording')
        }
    }

    const handleFullscreen = () => {
        window.open(`/sessions/${props.sessionId}/desktop`, '_blank')
    }

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--cursor-stroke-secondary)] px-3 py-1.5">
                <div className="flex items-center gap-2">
                    {recordingStatus === 'recording' ? (
                        <button
                            type="button"
                            onClick={() => void handleToggleRecording()}
                            className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-[var(--cursor-danger)] hover:bg-[var(--cursor-danger-bg)] transition-colors"
                        >
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--cursor-danger)] animate-pulse" />
                            Stop
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void handleToggleRecording()}
                            disabled={recordingStatus === 'loading'}
                            className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-[var(--cursor-text-tertiary)] hover:text-[var(--cursor-text-primary)] hover:bg-[var(--cursor-bg-soft)] transition-colors disabled:opacity-50"
                        >
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--cursor-danger)]" />
                            Record
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleFullscreen}
                    className="rounded p-1 text-[var(--cursor-text-tertiary)] hover:text-[var(--cursor-text-primary)] hover:bg-[var(--cursor-bg-soft)] transition-colors"
                    title="Open in new window"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                </button>
            </div>
            {/* Desktop iframe */}
            <iframe
                src={desktopUrl}
                className="min-h-0 flex-1 border-0"
                title="Remote Desktop"
            />
        </div>
    )
}
