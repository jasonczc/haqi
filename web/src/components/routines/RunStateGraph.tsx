/**
 * Run state graph — React Flow visualization of the run state machine.
 *
 * The state machine itself is a fixed layout: nodes are the 8 possible
 * run statuses, edges are valid transitions per routines/firePipeline.
 * Given a `currentStatus`, we highlight the current node (animated
 * pulse) and the ancestor path we took to reach it (solid edges).
 * Unreached states are dimmed.
 *
 * Laid out manually (not dagre) because the graph is small, fixed, and
 * the layout is part of the visual identity. Columns:
 *
 *   [queued] → [spawning] → [running] → [succeeded]
 *                                       [failed]
 *                                       [timeout]
 *                                       [cancelled]
 *   [skipped]   (terminal from queued)
 */

import { useMemo } from 'react'
import ReactFlow, {
    Background,
    BackgroundVariant,
    Handle,
    Position,
    type Edge,
    type Node,
    type NodeProps,
    type ReactFlowProps
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { RoutineRunStatus } from '@/types/api'

const STATES: RoutineRunStatus[] = [
    'queued',
    'spawning',
    'running',
    'succeeded',
    'failed',
    'timeout',
    'skipped',
    'cancelled'
]

// Valid transitions (from → to[])
const TRANSITIONS: Record<RoutineRunStatus, RoutineRunStatus[]> = {
    queued: ['spawning', 'skipped', 'cancelled', 'failed'],
    spawning: ['running', 'failed', 'cancelled'],
    running: ['succeeded', 'failed', 'timeout', 'cancelled'],
    succeeded: [],
    failed: [],
    timeout: [],
    skipped: [],
    cancelled: []
}

// Which states are on the "success path" from queued
const SUCCESS_PATH: RoutineRunStatus[] = ['queued', 'spawning', 'running', 'succeeded']

// For a given current status, return the states we've passed through.
function ancestorsOf(status: RoutineRunStatus): Set<RoutineRunStatus> {
    const out = new Set<RoutineRunStatus>([status])
    switch (status) {
        case 'succeeded':
        case 'failed':
        case 'timeout':
            out.add('queued').add('spawning').add('running')
            break
        case 'running':
            out.add('queued').add('spawning')
            break
        case 'spawning':
            out.add('queued')
            break
        case 'cancelled':
            // Cancelled can come from queued / spawning / running — we
            // don't know which without event history, so assume queued as
            // the safest common ancestor.
            out.add('queued')
            break
        case 'skipped':
            out.add('queued')
            break
        case 'queued':
            break
    }
    return out
}

const LAYOUT_POSITIONS: Record<RoutineRunStatus, { x: number; y: number }> = {
    queued: { x: 40, y: 110 },
    spawning: { x: 200, y: 110 },
    running: { x: 360, y: 110 },
    succeeded: { x: 540, y: 30 },
    failed: { x: 540, y: 110 },
    timeout: { x: 540, y: 190 },
    cancelled: { x: 360, y: 250 },
    skipped: { x: 200, y: 250 }
}

const STATE_COLORS: Record<
    RoutineRunStatus,
    { bg: string; border: string; text: string }
> = {
    queued: { bg: '#e8e8e8', border: '#c4c4c4', text: '#444' },
    spawning: { bg: '#fef3c7', border: '#fbbf24', text: '#92400e' },
    running: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    succeeded: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    failed: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    timeout: { bg: '#fef3c7', border: '#f59e0b', text: '#78350f' },
    cancelled: { bg: '#e5e7eb', border: '#6b7280', text: '#374151' },
    skipped: { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' }
}

type NodeData = {
    status: RoutineRunStatus
    isCurrent: boolean
    isAncestor: boolean
    isTerminal: boolean
}

function StateNode({ data }: NodeProps<NodeData>) {
    const color = STATE_COLORS[data.status]
    const opacity = data.isAncestor ? 1 : 0.35
    const ring = data.isCurrent
        ? '0 0 0 2px #000, 0 0 12px 4px rgba(0,0,0,0.15)'
        : 'none'
    return (
        <div
            style={{
                background: color.bg,
                border: `1.5px solid ${color.border}`,
                color: color.text,
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                minWidth: 110,
                textAlign: 'center',
                opacity,
                boxShadow: ring,
                transition: 'opacity 150ms, box-shadow 200ms'
            }}
        >
            <Handle
                type="target"
                position={Position.Left}
                style={{ opacity: 0, pointerEvents: 'none' }}
            />
            {data.status}
            {data.isCurrent ? (
                <span
                    style={{
                        display: 'inline-block',
                        marginLeft: 6,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: color.border,
                        animation: 'pulse 1.4s ease-in-out infinite'
                    }}
                />
            ) : null}
            <Handle
                type="source"
                position={Position.Right}
                style={{ opacity: 0, pointerEvents: 'none' }}
            />
        </div>
    )
}

const nodeTypes: ReactFlowProps['nodeTypes'] = { state: StateNode }

export function RunStateGraph({ currentStatus }: { currentStatus: RoutineRunStatus }) {
    const { nodes, edges } = useMemo(() => {
        const ancestors = ancestorsOf(currentStatus)
        const terminals: RoutineRunStatus[] = [
            'succeeded',
            'failed',
            'timeout',
            'skipped',
            'cancelled'
        ]
        const n: Node<NodeData>[] = STATES.map((s) => ({
            id: s,
            type: 'state',
            position: LAYOUT_POSITIONS[s],
            data: {
                status: s,
                isCurrent: s === currentStatus,
                isAncestor: ancestors.has(s),
                isTerminal: terminals.includes(s)
            },
            draggable: false,
            selectable: false
        }))
        const e: Edge[] = []
        for (const [from, toList] of Object.entries(TRANSITIONS) as [RoutineRunStatus, RoutineRunStatus[]][]) {
            for (const to of toList) {
                const onSuccessPath =
                    SUCCESS_PATH.includes(from) && SUCCESS_PATH.includes(to)
                const active = ancestors.has(from) && ancestors.has(to)
                e.push({
                    id: `${from}->${to}`,
                    source: from,
                    target: to,
                    style: {
                        stroke: active ? '#111' : '#cbd5e1',
                        strokeWidth: active ? 2 : 1,
                        opacity: active ? 1 : 0.45
                    },
                    markerEnd: {
                        type: 'arrowclosed' as const,
                        color: active ? '#111' : '#cbd5e1',
                        width: 14,
                        height: 14
                    } as any,
                    animated: active && !terminals.includes(currentStatus),
                    type: onSuccessPath ? 'default' : 'smoothstep'
                })
            }
        }
        return { nodes: n, edges: e }
    }, [currentStatus])

    return (
        <div style={{ width: '100%', height: 360 }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.5}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                nodesDraggable={false}
                elementsSelectable={false}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={16}
                    size={1}
                    color="var(--cursor-stroke-secondary, #e5e7eb)"
                />
            </ReactFlow>
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.4; transform: scale(1.4); }
                }
            `}</style>
        </div>
    )
}
