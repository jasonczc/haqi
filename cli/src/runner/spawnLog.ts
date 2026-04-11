import { createWriteStream, mkdirSync, openSync, closeSync, fstatSync, readSync, type WriteStream } from 'node:fs'
import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { configuration } from '@/configuration'
import { logger } from '@/ui/logger'

// Per-spawn append-only log file under ~/.hapi/logs/spawn/{requestId}.log.
// The hub fetches these via an RPC + HTTP endpoint so users can inspect spawn
// output (stdout, stderr, lifecycle events) from the Cloud Request detail page.

function spawnLogDir(): string {
    return join(configuration.logsDir, 'spawn')
}

function spawnLogPath(spawnRequestId: string): string {
    // Sanitize to prevent path traversal. spawnRequestIds are uuids or
    // `spawn-{ts}-{hex}` so this is a no-op for normal traffic.
    const safe = spawnRequestId.replace(/[^a-zA-Z0-9-_]/g, '_')
    return join(spawnLogDir(), `${safe}.log`)
}

export class SpawnLogger {
    private stream: WriteStream | null = null
    private closed = false

    constructor(spawnRequestId: string) {
        try {
            mkdirSync(spawnLogDir(), { recursive: true })
            this.stream = createWriteStream(spawnLogPath(spawnRequestId), { flags: 'a' })
            this.stream.on('error', (err) => {
                logger.debug('[spawnLog] write stream error', err)
            })
        } catch (err) {
            logger.debug('[spawnLog] failed to open log file', err)
            this.stream = null
        }
    }

    private write(kind: string, text: string): void {
        if (!this.stream || this.closed) return
        try {
            // Date.now() + new Date().toISOString() are cheap; the surrounding
            // template literal is the dominant cost for chatty children, but
            // still well under WriteStream batching overhead.
            this.stream.write(`[${new Date().toISOString()}] [${kind}] ${text.replace(/\s+$/, '')}\n`)
        } catch (err) {
            logger.debug('[spawnLog] write failed', err)
        }
    }

    info(message: string): void {
        this.write('INFO', message)
    }

    event(key: string, data?: unknown): void {
        const serialized = data === undefined ? '' : ' ' + (typeof data === 'string' ? data : JSON.stringify(data))
        this.write('EVENT', `${key}${serialized}`)
    }

    stdout(chunk: Buffer | string): void {
        this.write('STDOUT', typeof chunk === 'string' ? chunk : chunk.toString())
    }

    stderr(chunk: Buffer | string): void {
        this.write('STDERR', typeof chunk === 'string' ? chunk : chunk.toString())
    }

    close(): void {
        if (this.closed) return
        this.closed = true
        try {
            this.stream?.end()
        } catch (err) {
            logger.debug('[spawnLog] close failed', err)
        }
    }
}

/**
 * Read the per-spawn log file. Returns at most `maxBytes` from the END of the
 * file, so we never load a 100MB log just to discard most of it.
 */
export function readSpawnLog(
    spawnRequestId: string,
    maxBytes = 256 * 1024
): { content: string; truncated: boolean } | null {
    let fd: number | null = null
    try {
        fd = openSync(spawnLogPath(spawnRequestId), 'r')
        const size = fstatSync(fd).size
        if (size === 0) return { content: '', truncated: false }
        const truncated = size > maxBytes
        const length = truncated ? maxBytes : size
        const start = truncated ? size - maxBytes : 0
        const buf = Buffer.alloc(length)
        readSync(fd, buf, 0, length, start)
        return { content: buf.toString('utf-8'), truncated }
    } catch (err: unknown) {
        if (err && typeof err === 'object' && (err as { code?: string }).code === 'ENOENT') {
            return null
        }
        logger.debug('[spawnLog] readSpawnLog failed', err)
        return null
    } finally {
        if (fd !== null) {
            try { closeSync(fd) } catch { /* ignore */ }
        }
    }
}

/** Prune old spawn log files (older than `maxAgeMs`) to keep disk usage bounded. */
export async function pruneOldSpawnLogs(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
        const entries = await readdir(spawnLogDir()).catch((err: unknown) => {
            if (err && typeof err === 'object' && (err as { code?: string }).code === 'ENOENT') {
                return [] as string[]
            }
            throw err
        })
        const now = Date.now()
        for (const entry of entries) {
            if (!entry.endsWith('.log')) continue
            const path = join(spawnLogDir(), entry)
            try {
                const s = await stat(path)
                if (now - s.mtimeMs > maxAgeMs) {
                    await unlink(path)
                }
            } catch {
                // per-file failure is non-fatal
            }
        }
    } catch (err) {
        logger.debug('[spawnLog] pruneOldSpawnLogs failed', err)
    }
}
