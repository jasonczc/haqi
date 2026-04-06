import { useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import { useAppContext } from '@/lib/app-context'
import { useSession } from '@/hooks/queries/useSession'
import { useTerminalSocket } from '@/hooks/useTerminalSocket'
import { TerminalView } from '@/components/Terminal/TerminalView'

export function TerminalPanel(props: { sessionId: string }) {
    const { api } = useAppContext()
    const { session } = useSession(api, props.sessionId)
    const terminalRef = useRef<Terminal | null>(null)
    const [connected, setConnected] = useState(false)

    const terminalDescriptors = session?.metadata?.terminalDescriptors
    const firstTerminal = terminalDescriptors?.[0]

    const baseUrl = api ? (api as any).baseUrl ?? '' : ''
    const token = api ? (api as any).token ?? '' : ''

    const socket = useTerminalSocket({
        baseUrl,
        token,
        sessionId: props.sessionId,
        terminalId: firstTerminal?.name ?? ''
    })

    useEffect(() => {
        const unsubOutput = socket.onOutput((data: string) => {
            terminalRef.current?.write(data)
        })
        return unsubOutput
    }, [socket])

    useEffect(() => {
        if (socket.state.status === 'connected') {
            setConnected(true)
        } else {
            setConnected(false)
        }
    }, [socket.state])

    const handleMount = useCallback((terminal: Terminal) => {
        terminalRef.current = terminal
        terminal.onData((data) => {
            socket.write(data)
        })
        // Auto-connect
        const cols = terminal.cols
        const rows = terminal.rows
        socket.connect(cols, rows)
    }, [socket])

    const handleResize = useCallback((cols: number, rows: number) => {
        socket.resize(cols, rows)
    }, [socket])

    const handleFullscreen = () => {
        window.open(`/sessions/${props.sessionId}/terminal`, '_blank')
    }

    if (!firstTerminal) {
        return (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--cursor-text-tertiary)]">
                No terminal available for this session.
            </div>
        )
    }

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--cursor-stroke-secondary)] px-3 py-1.5">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${
                            connected ? 'bg-[var(--cursor-success)]' : socket.state.status === 'connecting' ? 'bg-[var(--cursor-warning)] animate-pulse' : 'bg-[var(--cursor-text-tertiary)]'
                        }`} />
                        <span className="text-[11px] text-[var(--cursor-text-tertiary)]">
                            {firstTerminal.name}
                        </span>
                    </div>
                    {terminalDescriptors && terminalDescriptors.length > 1 && (
                        <span className="rounded bg-[var(--cursor-bg-soft)] px-1.5 py-0.5 text-[10px] text-[var(--cursor-text-tertiary)]">
                            +{terminalDescriptors.length - 1} more
                        </span>
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
            {/* Terminal */}
            <div className="min-h-0 flex-1">
                <TerminalView
                    onMount={handleMount}
                    onResize={handleResize}
                    className="h-full"
                />
            </div>
        </div>
    )
}
