import type { Machine } from '@/types/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/use-translation'

function getMachineTitle(machine: Machine): string {
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

function getMachineSubtitle(machine: Machine): string {
    const platform = machine.metadata?.platform ?? 'Unknown platform'
    const executorType = machine.metadata?.executorType
    const lifecycle = machine.runnerState?.lifecycle ?? machine.runnerState?.status
    const parts = [platform]

    if (executorType) {
        parts.push(executorType)
    }
    if (lifecycle) {
        parts.push(lifecycle)
    }

    return parts.join(' · ')
}

function getMachineDetailChips(machine: Machine): string[] {
    const chips: string[] = []
    const metadata = machine.metadata
    const runnerState = machine.runnerState

    if (metadata?.provider) {
        chips.push(`provider: ${metadata.provider}`)
    }
    if (metadata?.region) {
        chips.push(`region: ${metadata.region}`)
    }
    if (metadata?.environmentId) {
        chips.push(`env: ${metadata.environmentId}`)
    }
    if (metadata?.workerVersion) {
        chips.push(`worker: ${metadata.workerVersion}`)
    }
    if (metadata?.labels?.length) {
        chips.push(`labels: ${metadata.labels.join(', ')}`)
    }
    if (runnerState?.capacity) {
        chips.push(`capacity: ${runnerState.capacity.used}/${runnerState.capacity.total}`)
    }
    if (runnerState?.publicPreviewBaseUrl) {
        chips.push('preview: public')
    }

    return chips
}

export function MachineList(props: {
    machines: Machine[]
    onSelect: (machineId: string) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-3 p-3">
            <div className="text-xs text-[var(--text-tertiary)]">
                {props.machines.length} {t('machine.list.online')}
            </div>

            <div className="flex flex-col gap-3">
                {props.machines.map((m) => (
                    <Card
                        key={m.id}
                        className="cursor-pointer"
                        onClick={() => props.onSelect(m.id)}
                    >
                        <CardHeader className="pb-2">
                            <CardTitle className="truncate">{getMachineTitle(m)}</CardTitle>
                            <CardDescription className="truncate">
                                {getMachineSubtitle(m)}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2 pt-0">
                            <div className="flex flex-wrap gap-1 text-[11px] text-[var(--text-tertiary)]">
                                {getMachineDetailChips(m).map((chip) => (
                                    <span
                                        key={chip}
                                        className="rounded-full bg-[var(--bg-quaternary)] px-2 py-1"
                                    >
                                        {chip}
                                    </span>
                                ))}
                                {!m.active ? (
                                    <span className="rounded-full bg-[var(--bg-warning-secondary)] px-2 py-1 text-[var(--warn)]">
                                        inactive
                                    </span>
                                ) : null}
                            </div>
                            {m.runnerState?.workspacePreparation ? (
                                <div className="text-xs text-[var(--text-tertiary)]">
                                    workspace: {m.runnerState.workspacePreparation.phase}
                                    {typeof m.runnerState.workspacePreparation.progress === 'number' ? ` · ${m.runnerState.workspacePreparation.progress}%` : ''}
                                    {m.runnerState.workspacePreparation.repo ? ` · ${m.runnerState.workspacePreparation.repo}` : ''}
                                </div>
                            ) : null}
                            {m.runnerState?.lastProvisionError ? (
                                <div className="text-xs text-[var(--danger)]">
                                    provision: {m.runnerState.lastProvisionError.message}
                                </div>
                            ) : null}
                            {m.runnerState?.lastWorkspaceError ? (
                                <div className="text-xs text-[var(--danger)]">
                                    workspace: {m.runnerState.lastWorkspaceError.message}
                                </div>
                            ) : null}
                            {m.runnerState?.lastSpawnError ? (
                                <div className="text-xs text-[var(--danger)]">
                                    spawn: {m.runnerState.lastSpawnError.message}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
