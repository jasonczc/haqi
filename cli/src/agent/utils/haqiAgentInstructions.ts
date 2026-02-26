import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { trimIdent } from '@/utils/trimIdent'
import { logger } from '@/ui/logger'

const WORKSPACE_INSTRUCTIONS_FILE = 'HAQI-Agent.md'
const GLOBAL_MEMORY_FILE = 'MEMORY.md'
const MAX_FILE_BYTES = 64 * 1024
const DEFAULT_MEMORY_TEMPLATE = trimIdent(`
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
`)

function findInstructionFile(startDir: string): string | null {
    let current = startDir

    while (true) {
        const candidate = join(current, WORKSPACE_INSTRUCTIONS_FILE)
        if (existsSync(candidate)) {
            return candidate
        }
        const parent = dirname(current)
        if (parent === current) {
            return null
        }
        current = parent
    }
}

function resolveHapiHomeDir(): string {
    const raw = process.env.HAPI_HOME?.trim()
    if (raw && raw.length > 0) {
        return raw.replace(/^~(?=\/|$)/, homedir())
    }
    return join(homedir(), '.hapi')
}

function resolveGlobalMemoryPath(): string {
    return join(resolveHapiHomeDir(), GLOBAL_MEMORY_FILE)
}

function ensureGlobalMemoryFile(filepath: string): void {
    if (existsSync(filepath)) {
        return
    }

    mkdirSync(dirname(filepath), { recursive: true })
    writeFileSync(filepath, `${DEFAULT_MEMORY_TEMPLATE}\n`, { encoding: 'utf-8', flag: 'wx' })
}

function trimToMaxBytes(content: string, maxBytes: number, filename: string): string {
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes <= maxBytes) {
        return content
    }

    const truncated = Buffer.from(content, 'utf8')
        .subarray(0, maxBytes)
        .toString('utf8')

    return `${truncated}\n\n[truncated: ${filename} exceeded ${maxBytes} bytes]`
}

export function loadHaqiAgentInstructions(startDir: string): string | null {
    try {
        const filepath = findInstructionFile(startDir)
        if (!filepath) {
            return null
        }
        const raw = readFileSync(filepath, 'utf-8').trim()
        if (!raw) {
            return null
        }
        return trimToMaxBytes(raw, MAX_FILE_BYTES, WORKSPACE_INSTRUCTIONS_FILE)
    } catch (error) {
        logger.debug('[haqi-agent-instructions] failed to load instructions', error)
        return null
    }
}

export function loadGlobalMemory(): { path: string; content: string } | null {
    try {
        const filepath = resolveGlobalMemoryPath()
        ensureGlobalMemoryFile(filepath)
        const raw = readFileSync(filepath, 'utf-8').trim()
        if (!raw) {
            return null
        }
        return {
            path: filepath,
            content: trimToMaxBytes(raw, MAX_FILE_BYTES, GLOBAL_MEMORY_FILE)
        }
    } catch (error) {
        logger.debug('[haqi-agent-instructions] failed to load global memory', error)
        return null
    }
}

export function buildPromptWithHaqiAgentInstructions(basePrompt: string, startDir: string): string {
    const instructions = loadHaqiAgentInstructions(startDir)
    const globalMemory = loadGlobalMemory()
    if (!instructions && !globalMemory) {
        return basePrompt
    }

    const blocks: string[] = [basePrompt]

    if (instructions) {
        const instructionsPreface = trimIdent(`
        Follow workspace operating rules in HAQI-Agent.md for group collaboration and memory usage.
        Treat them as runtime policy for this repository.
    `)
        blocks.push(`${instructionsPreface}\n\n<haqi-agent-instructions>\n${instructions}\n</haqi-agent-instructions>`)
    }

    if (globalMemory) {
        const memoryPreface = trimIdent(`
        Load long-term user memory from ${globalMemory.path}.
        Use it as cross-project context for preferences, decisions, pitfalls, and key facts.
        When you learn durable user information, update MEMORY.md directly using these sections:
        Preferences, Decisions, Pitfalls, Key Facts.
        Keep entries concise and actionable.
    `)
        blocks.push(`${memoryPreface}\n\n<haqi-memory path="${globalMemory.path}">\n${globalMemory.content}\n</haqi-memory>`)
    }

    return blocks.join('\n\n')
}
