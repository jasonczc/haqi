import type { CloudCheckpoint, EnvironmentTemplate } from '@hapi/protocol/types'

function normalizeOptionalString(value: string | undefined): string | undefined {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
}

function buildCheckpointFromEnvironment(template: EnvironmentTemplate): CloudCheckpoint | null {
    const runtime = template.runtime
    const image = normalizeOptionalString(runtime?.image)
    const checkpointId = normalizeOptionalString(runtime?.checkpointId) ?? normalizeOptionalString(template.id)
    if (!checkpointId || !image) {
        return null
    }

    return {
        id: checkpointId,
        image,
        name: template.name ?? checkpointId,
        description: template.description,
        labels: template.features
            ? Object.entries(template.features)
                .filter(([, enabled]) => enabled)
                .map(([name]) => name)
            : undefined,
        defaultEnvironment: template,
        defaultDesktop: template.desktop
    }
}

export class CheckpointRegistry {
    private readonly checkpoints = new Map<string, CloudCheckpoint>()

    list(): CloudCheckpoint[] {
        return [...this.checkpoints.values()]
            .sort((left, right) => left.id.localeCompare(right.id))
    }

    get(id: string): CloudCheckpoint | null {
        return this.checkpoints.get(id) ?? null
    }

    register(checkpoint: CloudCheckpoint): CloudCheckpoint {
        const normalized: CloudCheckpoint = {
            ...checkpoint,
            id: checkpoint.id.trim(),
            image: checkpoint.image.trim()
        }
        this.checkpoints.set(normalized.id, normalized)
        return normalized
    }

    registerFromEnvironment(template: EnvironmentTemplate): CloudCheckpoint | null {
        const checkpoint = buildCheckpointFromEnvironment(template)
        return checkpoint ? this.register(checkpoint) : null
    }
}
