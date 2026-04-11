import { runDockerCommand } from '@/cloud/docker/dockerCli'
import { logger } from '@/ui/logger'

export type RemovedImage = {
    tag: string
    bytes: number
}

export type DockerCleanupResult = {
    removedImages: RemovedImage[]
    freedBytesImages: number
    freedBytesBuild: number
    freedBytesVolumes: number
    errors: string[]
}

export type DockerCleanupOptions = {
    // Image tags the caller wants preserved (e.g. checkpoints still referenced in the DB).
    // Any `haqi-checkpoint:*` image NOT in this list is considered orphaned and will be removed.
    keepImages?: string[]
    pruneBuildCache?: boolean
    pruneVolumes?: boolean
}

/**
 * Parse a docker size string (e.g. "4.3GB", "197.9MB", "1.27kB") into bytes.
 * Docker uses SI units (1KB = 1000, not 1024) in its output.
 */
function parseDockerSize(input: string): number {
    const match = input.trim().match(/^([\d.]+)\s*([kKmMgGtT]?)[bB]?$/)
    if (!match) return 0
    const value = parseFloat(match[1])
    if (Number.isNaN(value)) return 0
    const unit = match[2].toLowerCase()
    const multiplier =
        unit === 't' ? 1_000_000_000_000 :
        unit === 'g' ? 1_000_000_000 :
        unit === 'm' ? 1_000_000 :
        unit === 'k' ? 1_000 :
        1
    return Math.round(value * multiplier)
}

/** List all haqi-checkpoint images currently on the host, with their sizes. */
async function listHaqiCheckpointImages(): Promise<Array<{ tag: string; bytes: number }>> {
    try {
        const { stdout } = await runDockerCommand([
            'images',
            'haqi-checkpoint',
            '--format', '{{.Repository}}:{{.Tag}}\t{{.Size}}'
        ])
        const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean)
        return lines.map((line) => {
            const [tag, size] = line.split('\t')
            return { tag, bytes: parseDockerSize(size ?? '0') }
        })
    } catch (err) {
        logger.debug('[dockerStorage] Failed to list haqi-checkpoint images', err)
        return []
    }
}

// Docker's prune output varies by subcommand/version:
//   `docker builder prune -f` → "Total:\t0B"    (tab separator, no "reclaimed space" wording)
//   `docker volume prune -f`  → "Total reclaimed space: 1.994GB"
//   Other versions may emit   → "Total reclaimed space: 6.089GB" for builder too
// The regex accepts any "Total[...whatever...]:<sep>SIZE" shape.
function parseReclaimedSize(stdout: string): number {
    const match = stdout.match(/Total(?:\s+reclaimed\s+space)?:\s*([\d.]+\s*[kKmMgGtT]?[bB]?)/i)
    return match ? parseDockerSize(match[1]) : 0
}

/** Run `docker builder prune -f` and return the number of bytes reclaimed. */
async function pruneBuildCache(): Promise<{ freedBytes: number; error?: string }> {
    try {
        const { stdout } = await runDockerCommand(['builder', 'prune', '-f'])
        return { freedBytes: parseReclaimedSize(stdout) }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { freedBytes: 0, error: `builder prune failed: ${message}` }
    }
}

/** Run `docker volume prune -f` and return the number of bytes reclaimed. */
async function pruneVolumes(): Promise<{ freedBytes: number; error?: string }> {
    try {
        const { stdout } = await runDockerCommand(['volume', 'prune', '-f'])
        return { freedBytes: parseReclaimedSize(stdout) }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { freedBytes: 0, error: `volume prune failed: ${message}` }
    }
}

/**
 * Remove orphan haqi-checkpoint images + optionally prune build cache and volumes.
 * Only images whose tag is NOT in `keepImages` are removed — the hub supplies the
 * "still-referenced" set based on its checkpoint DB so we never nuke something in use.
 */
export async function cleanupDockerStorage(options: DockerCleanupOptions): Promise<DockerCleanupResult> {
    const errors: string[] = []
    const keep = new Set(options.keepImages ?? [])
    const removedImages: RemovedImage[] = []
    let freedBytesImages = 0

    // Pass 1 — orphan haqi-checkpoint images
    const existing = await listHaqiCheckpointImages()
    for (const img of existing) {
        if (keep.has(img.tag)) continue
        try {
            await runDockerCommand(['rmi', img.tag])
            removedImages.push(img)
            freedBytesImages += img.bytes
        } catch (err) {
            // Image might be in use by a running container — skip and keep going.
            const message = err instanceof Error ? err.message : String(err)
            errors.push(`rmi ${img.tag}: ${message}`)
        }
    }

    // Pass 2 — build cache (optional)
    let freedBytesBuild = 0
    if (options.pruneBuildCache) {
        const result = await pruneBuildCache()
        freedBytesBuild = result.freedBytes
        if (result.error) errors.push(result.error)
    }

    // Pass 3 — unused volumes (optional)
    let freedBytesVolumes = 0
    if (options.pruneVolumes) {
        const result = await pruneVolumes()
        freedBytesVolumes = result.freedBytes
        if (result.error) errors.push(result.error)
    }

    logger.debug('[dockerStorage] cleanup complete', {
        removed: removedImages.length,
        freedBytesImages,
        freedBytesBuild,
        freedBytesVolumes,
        errors: errors.length
    })

    return {
        removedImages,
        freedBytesImages,
        freedBytesBuild,
        freedBytesVolumes,
        errors
    }
}
