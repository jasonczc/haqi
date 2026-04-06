import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RepoPicker } from '@/components/RepoPicker'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import type { CloudCheckpoint } from '@hapi/protocol/types'

function ChevronDownIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

export function QuickSpawnDialog(props: {
    open: boolean
    onClose: () => void
    onSpawned?: (sessionId: string) => void
    defaultSetup?: boolean
}) {
    const { api } = useAppContext()
    const navigate = useNavigate()

    const [task, setTask] = useState('')
    const [checkpointId, setCheckpointId] = useState('')
    const [setupMode, setSetupMode] = useState(props.defaultSetup ?? false)
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const [agent, setAgent] = useState('claude')
    const [model, setModel] = useState('')
    const [repoUrl, setRepoUrl] = useState('')
    const [isSpawning, setIsSpawning] = useState(false)
    const [spawnError, setSpawnError] = useState<string | null>(null)

    const checkpointsQuery = useQuery({
        queryKey: queryKeys.cloudCheckpoints,
        enabled: Boolean(api) && props.open,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudCheckpoints()
        },
        staleTime: 30_000,
    })

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api) && props.open,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkers()
        },
    })

    const checkpoints: CloudCheckpoint[] = checkpointsQuery.data?.checkpoints ?? []
    const readyCheckpoints = checkpoints
    const workers = workersQuery.data?.workers ?? []
    const activeWorker = workers.find((w) => w.active && w.selectable !== false) ?? workers[0]

    const handleClose = () => {
        if (isSpawning) return
        setTask('')
        setCheckpointId('')
        setSetupMode(false)
        setAdvancedOpen(false)
        setAgent('claude')
        setModel('')
        setRepoUrl('')
        setSpawnError(null)
        props.onClose()
    }

    const handleStart = async () => {
        if (!api) {
            setSpawnError('API unavailable')
            return
        }
        if (!activeWorker) {
            setSpawnError('No active cloud worker found. Please add a worker first.')
            return
        }

        setIsSpawning(true)
        setSpawnError(null)

        try {
            const workspaceSource =
                repoUrl.trim()
                    ? {
                          repository: {
                              url: repoUrl.trim(),
                              provider: 'github' as const,
                          },
                      }
                    : undefined

            const result = await api.spawnSession(activeWorker.machineId, {
                runtimeKind: 'daemon-session',
                executionBackend: (activeWorker.executorType === 'cloud-self-hosted' || activeWorker.executorType === 'cloud-managed')
                    ? activeWorker.executorType
                    : 'cloud-self-hosted',
                sessionType: setupMode ? 'setup' : 'simple',
                agent: agent as 'claude',
                yolo: true,
                ...(checkpointId ? { checkpointId } : {}),
                ...(task.trim() ? { initialPrompt: task.trim() } : {}),
                ...(model.trim() ? { model: model.trim() } : {}),
                ...(workspaceSource ? { workspaceSource } : {}),
            })

            if (result.type === 'success') {
                handleClose()
                if (props.onSpawned) {
                    props.onSpawned(result.sessionId)
                } else {
                    void navigate({ to: '/sessions/$sessionId', params: { sessionId: result.sessionId } })
                }
            } else if (result.type === 'accepted') {
                handleClose()
                void navigate({ to: '/settings/requests' })
            } else if (result.type === 'error') {
                setSpawnError(result.message)
            }
        } catch (err) {
            setSpawnError(err instanceof Error ? err.message : 'Failed to spawn session')
        } finally {
            setIsSpawning(false)
        }
    }

    const canStart = Boolean(activeWorker) && !isSpawning

    return (
        <Dialog open={props.open} onOpenChange={(open) => { if (!open) handleClose() }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>New Cloud Session</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4 pt-2">
                    {/* Checkpoint selector */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-[var(--text-primary)]">
                            Checkpoint
                        </label>
                        <select
                            value={checkpointId}
                            onChange={(e) => setCheckpointId(e.target.value)}
                            disabled={isSpawning}
                            className="w-full rounded-md border border-[var(--border-secondary)] bg-[var(--bg-editor)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                        >
                            <option value="">— no checkpoint —</option>
                            {readyCheckpoints.map((cp) => (
                                <option key={cp.id} value={cp.id}>
                                    {cp.name ?? cp.id}
                                </option>
                            ))}
                        </select>
                        {checkpointsQuery.isLoading && (
                            <span className="text-xs text-[var(--text-tertiary)]">Loading checkpoints...</span>
                        )}
                    </div>

                    {/* Task textarea */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-[var(--text-primary)]">
                            Task
                        </label>
                        <textarea
                            value={task}
                            onChange={(e) => setTask(e.target.value)}
                            placeholder="Describe what the agent should do..."
                            rows={4}
                            disabled={isSpawning}
                            className="w-full resize-none rounded-md border border-[var(--border-secondary)] bg-[var(--bg-editor)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                        />
                    </div>

                    {/* Setup Environment checkbox */}
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={setupMode}
                            onChange={(e) => setSetupMode(e.target.checked)}
                            disabled={isSpawning}
                            className="h-4 w-4 rounded border border-[var(--border-secondary)] accent-[var(--accent)]"
                        />
                        <span className="font-medium text-[var(--text-primary)]">Setup Environment</span>
                        <span className="text-[var(--text-tertiary)]">(installs deps, configures tools)</span>
                    </label>

                    {/* Advanced section */}
                    <div className="flex flex-col gap-0">
                        <button
                            type="button"
                            onClick={() => setAdvancedOpen((v) => !v)}
                            className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                        >
                            <ChevronDownIcon
                                className={`transition-transform ${advancedOpen ? '' : '-rotate-90'}`}
                            />
                            Advanced
                        </button>

                        {advancedOpen && (
                            <div className="mt-3 flex flex-col gap-3 rounded-md border border-[var(--border-secondary)] p-3">
                                {/* Agent */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-[var(--text-tertiary)]">
                                        Agent
                                    </label>
                                    <select
                                        value={agent}
                                        onChange={(e) => setAgent(e.target.value)}
                                        disabled={isSpawning}
                                        className="w-full rounded-md border border-[var(--border-secondary)] bg-[var(--bg-editor)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                                    >
                                        <option value="claude">Claude</option>
                                        <option value="codex">Codex</option>
                                    </select>
                                </div>

                                {/* Model */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-[var(--text-tertiary)]">
                                        Model
                                    </label>
                                    <input
                                        type="text"
                                        value={model}
                                        onChange={(e) => setModel(e.target.value)}
                                        placeholder="e.g. claude-opus-4-5 (leave blank for default)"
                                        disabled={isSpawning}
                                        className="w-full rounded-md border border-[var(--border-secondary)] bg-[var(--bg-editor)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                                    />
                                </div>

                                {/* Repo picker (Cursor-style) */}
                                <RepoPicker
                                    value={repoUrl}
                                    onChange={setRepoUrl}
                                    disabled={isSpawning}
                                />

                                {/* Worker status */}
                                <div className="text-xs text-[var(--text-tertiary)]">
                                    {workersQuery.isLoading
                                        ? 'Loading workers...'
                                        : activeWorker
                                          ? `Worker: ${activeWorker.machineId} (${activeWorker.provider})`
                                          : 'No active worker available'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {spawnError && (
                        <p className="rounded-md bg-[var(--bg-danger-secondary)] px-3 py-2 text-sm text-[var(--danger)]">
                            {spawnError}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClose}
                            disabled={isSpawning}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => void handleStart()}
                            disabled={!canStart}
                        >
                            {isSpawning ? 'Starting...' : 'Start Agent'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
