import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import {
    buildBootstrapScript,
    normalizeEnvironmentCommands,
    runEnvironmentCommands
} from './runEnvironmentCommands'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(join(os.tmpdir(), 'haqi-env-cmd-'))
    tempDirs.push(dir)
    return dir
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('runEnvironmentCommands helpers', () => {
    it('normalizes string and array commands', () => {
        expect(normalizeEnvironmentCommands(undefined)).toEqual([])
        expect(normalizeEnvironmentCommands('  echo hi  ')).toEqual(['echo hi'])
        expect(normalizeEnvironmentCommands(['echo one', '  ', 'echo two'])).toEqual([
            'echo one',
            'echo two'
        ])
    })

    it('builds a bootstrap script that runs hooks then execs the agent', () => {
        const script = buildBootstrapScript({
            commands: ['echo install', ['echo start']],
            agentCommand: ['haqi', 'codex', '--auto-approve']
        })

        expect(script).toContain('set -eu')
        expect(script).toContain('echo install')
        expect(script).toContain('echo start')
        expect(script).toContain("exec 'haqi' 'codex' '--auto-approve'")
    })

    it('runs environment commands in order', async () => {
        const cwd = await makeTempDir()

        await runEnvironmentCommands({
            commands: [
                'printf one > step1.txt',
                'printf two > step2.txt'
            ],
            cwd,
            label: 'install'
        })

        await expect(fs.readFile(join(cwd, 'step1.txt'), 'utf8')).resolves.toBe('one')
        await expect(fs.readFile(join(cwd, 'step2.txt'), 'utf8')).resolves.toBe('two')
    })

    it('surfaces command failures with the hook label', async () => {
        const cwd = await makeTempDir()

        await expect(runEnvironmentCommands({
            commands: 'echo boom >&2; exit 7',
            cwd,
            label: 'start'
        })).rejects.toThrow('start command failed: boom')
    })
})
