import type { Machine } from '@/types/api'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

export function MachineList(props: {
    machines: Machine[]
    onSelect: (machineId: string) => void
}) {
    return (
        <div className="flex flex-col gap-3 p-3">
            <div className="text-xs text-[var(--app-hint)]">
                {props.machines.length} online
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
                    </Card>
                ))}
            </div>
        </div>
    )
}
