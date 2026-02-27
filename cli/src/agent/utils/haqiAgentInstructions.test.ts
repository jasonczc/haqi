import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPromptWithHaqiAgentInstructions, loadHaqiAgentInstructions } from './haqiAgentInstructions'

describe('haqiAgentInstructions', () => {
    let tempRoot: string
    let previousHapiHome: string | undefined

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'haqi-agent-instructions-'))
        previousHapiHome = process.env.HAPI_HOME
    })

    afterEach(() => {
        if (previousHapiHome === undefined) {
            delete process.env.HAPI_HOME
        } else {
            process.env.HAPI_HOME = previousHapiHome
        }

        rmSync(tempRoot, { recursive: true, force: true })
    })

    it('loads HAQI-Agent.md from nearest parent directory', () => {
        const workspaceRoot = join(tempRoot, 'workspace')
        const nestedDir = join(workspaceRoot, 'apps', 'hub')
        mkdirSync(nestedDir, { recursive: true })
        writeFileSync(join(workspaceRoot, 'HAQI-Agent.md'), 'workspace-policy')

        const instructions = loadHaqiAgentInstructions(nestedDir)

        expect(instructions).toBe('workspace-policy')
    })

    it('creates global MEMORY.md under HAPI_HOME and injects it into prompt when enabled', () => {
        const startDir = join(tempRoot, 'workspace')
        const hapiHome = join(tempRoot, 'hapi-home')
        mkdirSync(startDir, { recursive: true })
        mkdirSync(hapiHome, { recursive: true })
        process.env.HAPI_HOME = hapiHome
        writeFileSync(
            join(hapiHome, 'settings.json'),
            JSON.stringify({ memoryInjectionEnabled: true }, null, 2)
        )

        const prompt = buildPromptWithHaqiAgentInstructions('BASE PROMPT', startDir)
        const memoryPath = join(hapiHome, 'MEMORY.md')

        expect(existsSync(memoryPath)).toBe(true)
        expect(prompt).toContain(`Load long-term user memory from ${memoryPath}.`)
        expect(prompt).toContain('Treat MEMORY.md as global personal style and durable constraints shared across sessions.')
        expect(prompt).toContain('Never write session-specific details')
        expect(prompt).toContain(`<haqi-memory path="${memoryPath}">`)
        expect(prompt).toContain('# MEMORY.md')
        expect(prompt).toContain('## Communication Style')
    })

    it('skips global memory injection by default', () => {
        const startDir = join(tempRoot, 'workspace')
        const hapiHome = join(tempRoot, 'hapi-home')
        mkdirSync(startDir, { recursive: true })
        mkdirSync(hapiHome, { recursive: true })
        process.env.HAPI_HOME = hapiHome

        const prompt = buildPromptWithHaqiAgentInstructions('BASE PROMPT', startDir)

        expect(prompt).toBe('BASE PROMPT')
        expect(existsSync(join(hapiHome, 'MEMORY.md'))).toBe(false)
    })

    it('loads both workspace instructions and global memory', () => {
        const startDir = join(tempRoot, 'workspace')
        const hapiHome = join(tempRoot, 'hapi-home')
        mkdirSync(startDir, { recursive: true })
        process.env.HAPI_HOME = hapiHome
        writeFileSync(join(startDir, 'HAQI-Agent.md'), 'repo-rules')
        mkdirSync(hapiHome, { recursive: true })
        writeFileSync(
            join(hapiHome, 'settings.json'),
            JSON.stringify({ memoryInjectionEnabled: true }, null, 2)
        )
        writeFileSync(join(hapiHome, 'MEMORY.md'), 'user-prefers-short-replies')

        const prompt = buildPromptWithHaqiAgentInstructions('BASE PROMPT', startDir)

        expect(prompt).toContain('<haqi-agent-instructions>')
        expect(prompt).toContain('repo-rules')
        expect(prompt).toContain('<haqi-memory path="')
        expect(prompt).toContain('user-prefers-short-replies')
    })

    it('truncates oversized MEMORY.md content', () => {
        const startDir = join(tempRoot, 'workspace')
        const hapiHome = join(tempRoot, 'hapi-home')
        mkdirSync(startDir, { recursive: true })
        mkdirSync(hapiHome, { recursive: true })
        process.env.HAPI_HOME = hapiHome
        writeFileSync(
            join(hapiHome, 'settings.json'),
            JSON.stringify({ memoryInjectionEnabled: true }, null, 2)
        )
        writeFileSync(join(hapiHome, 'MEMORY.md'), `prefix-${'x'.repeat(70 * 1024)}`)

        const prompt = buildPromptWithHaqiAgentInstructions('BASE PROMPT', startDir)

        expect(prompt).toContain('[truncated: MEMORY.md exceeded 65536 bytes]')
    })
})
