import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import { QuickSpawnDialog } from '@/components/QuickSpawnDialog'
import {
    CursorButton,
    CursorCollapsibleSection,
    CursorEmptyState,
    CursorNotice,
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsSection,
    cursorButtonClassName,
} from '@/components/settings/CursorSettingsPrimitives'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import type { StoredCloudCheckpoint } from '@/types/api'

type CheckpointTreeNode = {
    checkpoint: StoredCloudCheckpoint
    children: CheckpointTreeNode[]
    missingParent: boolean
}

type CheckpointTree = {
    roots: CheckpointTreeNode[]
    total: number
    ready: number
    failed: number
    rootsCount: number
    derivedCount: number
    orphanedCount: number
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
    return `${value} ${value === 1 ? singular : plural}`
}

function sortCheckpoints(a: StoredCloudCheckpoint, b: StoredCloudCheckpoint): number {
    return b.createdAt - a.createdAt
}

function buildCheckpointTree(checkpoints: StoredCloudCheckpoint[]): CheckpointTree {
    const sorted = [...checkpoints].sort(sortCheckpoints)
    const nodeById = new Map<string, CheckpointTreeNode>()

    for (const checkpoint of sorted) {
        nodeById.set(checkpoint.id, {
            checkpoint,
            children: [],
            missingParent: false,
        })
    }

    const roots: CheckpointTreeNode[] = []
    let ready = 0
    let failed = 0
    let derivedCount = 0
    let orphanedCount = 0

    for (const checkpoint of sorted) {
        const node = nodeById.get(checkpoint.id)
        if (!node) {
            continue
        }

        if (checkpoint.status === 'ready') {
            ready += 1
        }
        if (checkpoint.status === 'failed') {
            failed += 1
        }

        const parentId = checkpoint.parentCheckpointId?.trim() || ''
        if (!parentId) {
            roots.push(node)
            continue
        }

        derivedCount += 1
        const parent = nodeById.get(parentId)
        if (!parent) {
            node.missingParent = true
            orphanedCount += 1
            roots.push(node)
            continue
        }

        parent.children.push(node)
    }

    const sortNodes = (nodes: CheckpointTreeNode[]): void => {
        nodes.sort((a, b) => sortCheckpoints(a.checkpoint, b.checkpoint))
        for (const node of nodes) {
            sortNodes(node.children)
        }
    }

    sortNodes(roots)

    return {
        roots,
        total: checkpoints.length,
        ready,
        failed,
        rootsCount: checkpoints.length - derivedCount + orphanedCount,
        derivedCount,
        orphanedCount,
    }
}

function StatusBadge(props: { status: StoredCloudCheckpoint['status']; t: (key: string) => string }) {
    const toneMap = {
        ready: 'success',
        creating: 'accent',
        failed: 'danger',
    } as const
    const labelMap = {
        ready: props.t('cloud.checkpoints.ready'),
        creating: props.t('cloud.checkpoints.creating'),
        failed: props.t('cloud.checkpoints.failed'),
    } as const

    return (
        <CursorSettingsBadge tone={toneMap[props.status]} className="rounded-full">
            {labelMap[props.status]}
        </CursorSettingsBadge>
    )
}

function SummaryCard(props: {
    label: string
    value: string
    tone?: 'default' | 'success' | 'danger' | 'accent'
    description: string
}) {
    return (
        <CursorSettingsCard className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-[var(--cursor-text-secondary)]">{props.label}</span>
                <CursorSettingsBadge tone={props.tone}>{props.value}</CursorSettingsBadge>
            </div>
            <div className="mt-2 text-[11px] leading-4 text-[var(--cursor-text-secondary)]">{props.description}</div>
        </CursorSettingsCard>
    )
}

function CheckpointActions(props: {
    checkpointId: string
    onDelete: (id: string) => void
    deriveLabel: string
    newSessionLabel: string
    deleteLabel: string
}) {
    return (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Link
                to="/sessions"
                onClick={() => {
                    try {
                        sessionStorage.setItem('home-composer-preset', JSON.stringify({ checkpointId: props.checkpointId }))
                    } catch {
                        // ignore
                    }
                }}
                className={cursorButtonClassName({ variant: 'outline', size: 'sm' })}
            >
                {props.newSessionLabel}
            </Link>
            <Link
                to="/sessions"
                onClick={() => {
                    try {
                        sessionStorage.setItem('home-composer-preset', JSON.stringify({
                            checkpointId: props.checkpointId,
                            sessionType: 'setup',
                        }))
                    } catch {
                        // ignore
                    }
                }}
                className={cursorButtonClassName({ variant: 'outline', size: 'sm' })}
            >
                {props.deriveLabel}
            </Link>
            <CursorButton
                variant="danger"
                size="sm"
                onClick={() => props.onDelete(props.checkpointId)}
            >
                {props.deleteLabel}
            </CursorButton>
        </div>
    )
}

function CheckpointTreeCard(props: {
    node: CheckpointTreeNode
    checkpointsById: Map<string, StoredCloudCheckpoint>
    t: (key: string) => string
    onDelete: (id: string) => void
    depth?: number
}) {
    const { node, checkpointsById, t, onDelete } = props
    const depth = props.depth ?? 0
    const checkpoint = node.checkpoint
    const parent = checkpoint.parentCheckpointId ? checkpointsById.get(checkpoint.parentCheckpointId) : null
    const isRoot = !checkpoint.parentCheckpointId || node.missingParent
    const childCount = node.children.length

    return (
        <div className={depth > 0 ? 'relative pl-6' : ''}>
            {depth > 0 ? (
                <>
                    <div className="absolute left-2 top-0 h-6 border-l border-[var(--cursor-stroke-secondary)]" />
                    <div className="absolute left-2 top-6 w-4 border-t border-[var(--cursor-stroke-secondary)]" />
                </>
            ) : null}

            <CursorSettingsCard className="px-3 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={checkpoint.status} t={t} />
                            <span className="truncate text-[14px] font-semibold leading-5 text-[var(--cursor-text-primary)]">
                                {checkpoint.name}
                            </span>
                            <CursorSettingsBadge>{isRoot ? 'Root' : 'Derived'}</CursorSettingsBadge>
                            {childCount > 0 ? (
                                <CursorSettingsBadge tone="accent">
                                    {formatCount(childCount, 'child')}
                                </CursorSettingsBadge>
                            ) : null}
                            {node.missingParent ? (
                                <CursorSettingsBadge tone="danger">Missing parent</CursorSettingsBadge>
                            ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
                            <span>
                                <span className="font-medium text-[var(--cursor-text-primary)]">ID</span>{' '}
                                <span className="font-[var(--font-mono)]">{checkpoint.id.slice(0, 12)}</span>
                            </span>
                            {checkpoint.repoUrl ? (
                                <span>
                                    <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.checkpoints.repo')}</span>{' '}
                                    {checkpoint.repoUrl}
                                </span>
                            ) : null}
                            {checkpoint.machineId ? (
                                <span>
                                    <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.checkpoints.machine')}</span>{' '}
                                    <span className="font-[var(--font-mono)]">{checkpoint.machineId}</span>
                                </span>
                            ) : null}
                            <span>{formatDate(checkpoint.createdAt)}</span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] leading-4 text-[var(--cursor-text-secondary)]">
                            <span>
                                <span className="font-medium text-[var(--cursor-text-primary)]">Base</span>{' '}
                                <span className="font-[var(--font-mono)]">{checkpoint.baseImage}</span>
                            </span>
                            <span>
                                <span className="font-medium text-[var(--cursor-text-primary)]">Image</span>{' '}
                                <span className="font-[var(--font-mono)]">{checkpoint.dockerImage}</span>
                            </span>
                        </div>

                        {checkpoint.parentCheckpointId ? (
                            <div className="mt-2 text-[11px] leading-4 text-[var(--cursor-text-secondary)]">
                                <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.checkpoints.parent')}</span>{' '}
                                {parent ? (
                                    <span className="font-[var(--font-mono)]">
                                        {parent.name} ({checkpoint.parentCheckpointId.slice(0, 8)})
                                    </span>
                                ) : (
                                    <span className="font-[var(--font-mono)]">{checkpoint.parentCheckpointId}</span>
                                )}
                            </div>
                        ) : null}
                    </div>

                    <CheckpointActions
                        checkpointId={checkpoint.id}
                        onDelete={onDelete}
                        deriveLabel={t('cloud.checkpoints.derive')}
                        newSessionLabel={t('cloud.checkpoints.newSession')}
                        deleteLabel={t('cloud.checkpoints.delete')}
                    />
                </div>
            </CursorSettingsCard>

            {node.children.length > 0 ? (
                <div className="ml-2 mt-3 space-y-3 border-l border-[var(--cursor-stroke-tertiary)] pl-4">
                    {node.children.map((child) => (
                        <CheckpointTreeCard
                            key={child.checkpoint.id}
                            node={child}
                            checkpointsById={checkpointsById}
                            t={t}
                            onDelete={onDelete}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    )
}

export default function CloudCheckpointsPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [isExpanded, setIsExpanded] = useState(true)
    const [spawnOpen, setSpawnOpen] = useState(false)

    const checkpointsQuery = useQuery({
        queryKey: queryKeys.cloudCheckpoints,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudCheckpoints()
        },
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            await api.deleteCheckpoint(id)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cloudCheckpoints }),
    })

    if (checkpointsQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (checkpointsQuery.isError) {
        return <div className="p-4 text-sm text-[var(--cursor-badge-error-text)]">Failed to load checkpoints</div>
    }

    const checkpoints = checkpointsQuery.data?.checkpoints ?? []
    const checkpointsById = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]))
    const tree = buildCheckpointTree(checkpoints)

    return (
        <>
            <div className="mx-auto w-full max-w-content">
                <CursorSettingsHeader
                    title="Checkpoints"
                    description="Manage saved cloud snapshots, inspect parent-child lineage, and branch new setup runs from any existing checkpoint."
                />

                <CursorSettingsSection
                    title="Overview"
                    subtitle="Checkpoint inventory and health across the current namespace."
                    action={(
                        <CursorButton size="sm" onClick={() => setSpawnOpen(true)}>
                            Start Setup Session
                        </CursorButton>
                    )}
                >
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryCard
                            label="Total"
                            value={String(tree.total)}
                            description="All saved checkpoint records in this namespace."
                        />
                        <SummaryCard
                            label="Roots"
                            value={String(tree.rootsCount)}
                            tone="accent"
                            description="Top-level checkpoints that start a lineage."
                        />
                        <SummaryCard
                            label="Derived"
                            value={String(tree.derivedCount)}
                            description="Checkpoints saved from an existing checkpoint-backed session."
                        />
                        <SummaryCard
                            label="Ready"
                            value={String(tree.ready)}
                            tone="success"
                            description={tree.failed > 0 ? `${tree.failed} failed checkpoints still need cleanup.` : 'All completed snapshots available for restore.'}
                        />
                    </div>
                </CursorSettingsSection>

                {tree.orphanedCount > 0 ? (
                    <CursorSettingsSection className="mb-4">
                        <CursorNotice tone="danger">
                            {formatCount(tree.orphanedCount, 'checkpoint')} reference a parent that is no longer present. They are shown as detached roots below.
                        </CursorNotice>
                    </CursorSettingsSection>
                ) : null}

                <CursorSettingsSection
                    title="Relationship Tree"
                    subtitle={tree.total === 0
                        ? 'No saved snapshots yet.'
                        : `${formatCount(tree.roots.length, 'lineage')} across ${formatCount(tree.total, 'checkpoint')}.`}
                >
                    <CursorCollapsibleSection
                        title="Checkpoint graph"
                        description={tree.total === 0
                            ? 'Create a setup session, save a checkpoint, then derive from it to build a reusable tree.'
                            : 'Each root starts a lineage. Nested cards are saved from the parent checkpoint above them.'}
                        isExpanded={isExpanded}
                        onToggle={() => setIsExpanded(!isExpanded)}
                    >
                        {tree.total === 0 ? (
                            <div className="px-4 py-6">
                                <CursorEmptyState
                                    title={t('cloud.checkpoints.empty')}
                                    description="Start a Setup session to configure an environment, then save it as a checkpoint."
                                    action={(
                                        <div className="flex items-center justify-center gap-2">
                                            <CursorButton size="sm" onClick={() => setSpawnOpen(true)}>
                                                Start Setup Session
                                            </CursorButton>
                                            <Link to="/settings/onboard" className={cursorButtonClassName({ variant: 'outline', size: 'sm' })}>
                                                Onboarding Guide
                                            </Link>
                                        </div>
                                    )}
                                />
                            </div>
                        ) : (
                            <CursorSettingsCard className="space-y-4 p-4">
                                {tree.roots.map((node) => (
                                    <CheckpointTreeCard
                                        key={node.checkpoint.id}
                                        node={node}
                                        checkpointsById={checkpointsById}
                                        t={t}
                                        onDelete={(id) => setDeleteId(id)}
                                    />
                                ))}
                            </CursorSettingsCard>
                        )}
                    </CursorCollapsibleSection>
                </CursorSettingsSection>
            </div>

            <ConfirmDialog
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                title={t('cloud.checkpoints.confirmDelete')}
                description="This action cannot be undone."
                confirmLabel={t('cloud.checkpoints.delete')}
                confirmingLabel={t('cloud.checkpoints.delete')}
                onConfirm={async () => {
                    if (deleteId) {
                        await deleteMutation.mutateAsync(deleteId)
                    }
                }}
                isPending={deleteMutation.isPending}
                destructive
            />

            <QuickSpawnDialog
                open={spawnOpen}
                onClose={() => setSpawnOpen(false)}
                defaultSetup
                onSpawned={(sessionId) => {
                    setSpawnOpen(false)
                    void navigate({ to: '/sessions/$sessionId', params: { sessionId } })
                }}
            />
        </>
    )
}
