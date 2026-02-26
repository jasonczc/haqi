import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { configuration } from '../../configuration'
import type { WebAppEnv } from '../middleware/auth'

const MEMORY_FILENAME = 'MEMORY.md'
const MAX_MEMORY_BYTES = 512 * 1024

const DEFAULT_MEMORY_TEMPLATE = `
    # MEMORY.md

    Long-term memory for HAQI agents.
    Distill this from logs periodically.

    ## Preferences
    - Keep responses concise.

    ## Decisions
    - Use X because Y.

    ## Pitfalls
    - Z cannot be handled with approach A.

    ## Key Facts
    - Project status, critical accounts, and constraints.
`.trim()

const updateMemorySchema = z.object({
    content: z.string(),
    updatedBy: z.string().trim().max(255).optional()
})

type MemoryDocument = {
    path: string
    content: string
    updatedAt: number
    bytes: number
}

function resolveMemoryPath(): string {
    return join(configuration.dataDir, MEMORY_FILENAME)
}

function ensureMemoryFile(filepath: string): void {
    if (existsSync(filepath)) {
        return
    }
    mkdirSync(dirname(filepath), { recursive: true })
    writeFileSync(filepath, `${DEFAULT_MEMORY_TEMPLATE}\n`, { encoding: 'utf-8', flag: 'wx' })
}

function readMemoryDocument(filepath: string): MemoryDocument {
    ensureMemoryFile(filepath)
    const content = readFileSync(filepath, 'utf-8')
    const stats = statSync(filepath)
    return {
        path: filepath,
        content,
        updatedAt: stats.mtimeMs,
        bytes: Buffer.byteLength(content, 'utf8')
    }
}

function updateMemoryDocument(filepath: string, content: string): MemoryDocument {
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > MAX_MEMORY_BYTES) {
        throw new Error(`Memory content exceeds ${MAX_MEMORY_BYTES} bytes`)
    }
    mkdirSync(dirname(filepath), { recursive: true })
    writeFileSync(filepath, content, 'utf-8')
    return readMemoryDocument(filepath)
}

export function createMemoryRoutes(): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/memory', (c) => {
        try {
            const memory = readMemoryDocument(resolveMemoryPath())
            return c.json({ memory })
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : 'Failed to read memory'
            }, 500)
        }
    })

    app.patch('/memory', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateMemorySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const memory = updateMemoryDocument(resolveMemoryPath(), parsed.data.content)
            return c.json({ memory })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update memory'
            if (message.includes('exceeds')) {
                return c.json({ error: message }, 400)
            }
            return c.json({ error: message }, 500)
        }
    })

    return app
}
