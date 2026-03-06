import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { configuration } from '../../configuration'
import { readSettingsOrThrow, writeSettings } from '../../config/settings'
import type { WebAppEnv } from '../middleware/auth'

const MEMORY_FILENAME = 'MEMORY.md'
const MAX_MEMORY_BYTES = 512 * 1024
const DEFAULT_MEMORY_INJECTION_ENABLED = false
const DEFAULT_PURE_CONTEXT_MODE = false

const DEFAULT_MEMORY_TEMPLATE = `
    # MEMORY.md

    Global user style memory shared by all sessions.
    Keep only durable, reusable preferences.
    Do not store session logs, temporary tasks, or verbose execution history.

    ## Communication Style
    - Preferred language, tone, response length, and formatting.

    ## Engineering Workflow
    - Tooling, coding, and review preferences that repeat across projects.

    ## Stable Constraints
    - Long-lived constraints, non-negotiables, and durable assumptions.

    ## Do Not Store
    - Session-specific steps, temporary TODOs, one-off debug notes, raw logs.
`.trim()

const updateMemorySchema = z.object({
    content: z.string().optional(),
    enabled: z.boolean().optional(),
    pureContextMode: z.boolean().optional(),
    updatedBy: z.string().trim().max(255).optional()
}).superRefine((value, ctx) => {
    if (value.content === undefined && value.enabled === undefined && value.pureContextMode === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Either content, enabled, or pureContextMode must be provided'
        })
    }
})

type MemoryDocument = {
    path: string
    content: string
    updatedAt: number
    bytes: number
}

type MemoryPayload = MemoryDocument & {
    enabled: boolean
    pureContextMode: boolean
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

async function readMemoryInjectionEnabled(): Promise<boolean> {
    const settings = await readSettingsOrThrow(configuration.settingsFile)
    if (typeof settings.memoryInjectionEnabled === 'boolean') {
        return settings.memoryInjectionEnabled
    }
    return DEFAULT_MEMORY_INJECTION_ENABLED
}

async function updateMemoryInjectionEnabled(enabled: boolean): Promise<void> {
    const settings = await readSettingsOrThrow(configuration.settingsFile)
    if (settings.memoryInjectionEnabled === enabled) {
        return
    }
    settings.memoryInjectionEnabled = enabled
    await writeSettings(configuration.settingsFile, settings)
}

async function readPureContextMode(): Promise<boolean> {
    const settings = await readSettingsOrThrow(configuration.settingsFile)
    if (typeof settings.pureContextMode === 'boolean') {
        return settings.pureContextMode
    }
    return DEFAULT_PURE_CONTEXT_MODE
}

async function updatePureContextMode(enabled: boolean): Promise<void> {
    const settings = await readSettingsOrThrow(configuration.settingsFile)
    if (settings.pureContextMode === enabled) {
        return
    }
    settings.pureContextMode = enabled
    await writeSettings(configuration.settingsFile, settings)
}

async function readMemoryPayload(filepath: string): Promise<MemoryPayload> {
    const memory = readMemoryDocument(filepath)
    const enabled = await readMemoryInjectionEnabled()
    const pureContextMode = await readPureContextMode()
    return {
        ...memory,
        enabled,
        pureContextMode
    }
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

    app.get('/memory', async (c) => {
        try {
            const memory = await readMemoryPayload(resolveMemoryPath())
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
            const filepath = resolveMemoryPath()
            if (parsed.data.content !== undefined) {
                updateMemoryDocument(filepath, parsed.data.content)
            } else {
                readMemoryDocument(filepath)
            }
            if (parsed.data.enabled !== undefined) {
                await updateMemoryInjectionEnabled(parsed.data.enabled)
            }
            if (parsed.data.pureContextMode !== undefined) {
                await updatePureContextMode(parsed.data.pureContextMode)
            }
            const memory = await readMemoryPayload(filepath)
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
