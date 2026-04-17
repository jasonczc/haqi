/**
 * Run event timeline — vertical list of routine_events rows for a run,
 * with type badges and elapsed-time gutters. Complements the
 * RunStateGraph by showing the actual transition sequence + any
 * activity metadata.
 */

import type { RoutineEventKind, RoutineEventRow } from '@/types/api'

const KIND_LABEL: Record<RoutineEventKind, string> = {
    'fire-received': 'Fire received',
    'filter-evaluated': 'Filter evaluated',
    'run-queued': 'Run queued',
    'run-spawning': 'Spawning',
    'run-started': 'Running',
    'run-ended': 'Ended',
    skipped: 'Skipped',
    error: 'Error'
}

// Semantic colors from cursor-theme.css. Each event kind maps to the
// status bucket the transition represents: spawning/running/ended
// inherit the active colors (warn/accent/success); terminal skips fall
// back to the dimmed text tokens; errors use --danger.
const KIND_COLOR: Record<RoutineEventKind, string> = {
    'fire-received': 'var(--text-quaternary)',
    'filter-evaluated': 'var(--text-tertiary)',
    'run-queued': 'var(--text-tertiary)',
    'run-spawning': 'var(--warn)',
    'run-started': 'var(--accent)',
    'run-ended': 'var(--success)',
    skipped: 'var(--text-quaternary)',
    error: 'var(--danger)'
}

function formatHMS(ts: number): string {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
}

function formatDelta(ms: number): string {
    if (ms < 1000) return `+${ms}ms`
    if (ms < 60_000) return `+${(ms / 1000).toFixed(1)}s`
    return `+${Math.round(ms / 1000)}s`
}

export function RunEventTimeline({ events }: { events: RoutineEventRow[] }) {
    if (events.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-[var(--border-secondary)] px-4 py-6 text-center text-[var(--font-size-sm)] text-[var(--text-tertiary)]">
                No events recorded for this run yet.
            </div>
        )
    }
    const start = events[0].at
    return (
        <div className="flex flex-col">
            {events.map((ev, i) => {
                const delta = ev.at - start
                const summary = summarizeData(ev)
                return (
                    <div
                        key={ev.id}
                        className="relative grid grid-cols-[80px,24px,1fr,90px] items-start gap-2 border-b border-[var(--border-secondary)] px-3 py-2 text-[var(--font-size-sm)] last:border-b-0"
                    >
                        <div className="font-mono text-[var(--font-size-xs)] text-[var(--text-tertiary)]">
                            {formatHMS(ev.at)}
                        </div>
                        <div className="flex justify-center pt-1">
                            <span
                                className="block h-2 w-2 rounded-full"
                                style={{ backgroundColor: KIND_COLOR[ev.kind] }}
                            />
                            {i < events.length - 1 ? (
                                <span
                                    aria-hidden
                                    className="absolute left-[calc(80px+8px+12px)] top-[11px] h-full w-px bg-[var(--border-secondary)]"
                                />
                            ) : null}
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-[var(--text-primary)]">
                                {KIND_LABEL[ev.kind]}
                            </span>
                            {summary ? (
                                <span className="font-mono text-[var(--font-size-xs)] text-[var(--text-secondary)]">
                                    {summary}
                                </span>
                            ) : null}
                        </div>
                        <div className="text-right font-mono text-[var(--font-size-xs)] text-[var(--text-tertiary)]">
                            {i === 0 ? '' : formatDelta(delta)}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function summarizeData(ev: RoutineEventRow): string | null {
    if (!ev.data || typeof ev.data !== 'object') return null
    const d = ev.data as Record<string, unknown>
    switch (ev.kind) {
        case 'filter-evaluated': {
            const matched = typeof d.matched === 'boolean' ? d.matched : undefined
            const reason = typeof d.reason === 'string' ? d.reason : undefined
            if (matched === undefined) return null
            return matched ? `match — ${reason ?? ''}` : `skip — ${reason ?? ''}`
        }
        case 'fire-received': {
            const triggerKind = typeof d.triggerKind === 'string' ? d.triggerKind : ''
            const actorObj = d.actor as Record<string, unknown> | undefined
            const actorType = actorObj && typeof actorObj.type === 'string' ? actorObj.type : ''
            return `trigger=${triggerKind} actor=${actorType}`
        }
        case 'run-spawning': {
            const sid = typeof d.spawnRequestId === 'string' ? d.spawnRequestId : ''
            return sid ? `spawn_request=${sid}` : null
        }
        case 'run-ended': {
            const status = typeof d.status === 'string' ? d.status : '?'
            const sessionId = typeof d.sessionId === 'string' ? d.sessionId : undefined
            return sessionId ? `${status} (session=${sessionId})` : status
        }
        case 'skipped': {
            const reason = typeof d.reason === 'string' ? d.reason : '?'
            return reason
        }
        case 'error': {
            const msg = typeof d.message === 'string' ? d.message : undefined
            return msg ?? null
        }
        default:
            return null
    }
}
