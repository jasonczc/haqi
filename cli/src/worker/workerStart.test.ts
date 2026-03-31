/**
 * Tests that verify known issues with workerStart / runnerLoop in remote worker mode.
 *
 * These tests exercise the code paths statically (import analysis + runtime behavior)
 * to confirm bugs exist before they are fixed.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { writeWorkerConfig, readWorkerConfig, type WorkerConfig } from './workerConfig'

// ---------- C1: Shared lock file ----------

describe('C1: Worker and Runner share the same lock file', () => {
    it('workerStart imports acquireRunnerLock (same lock as Runner)', async () => {
        // Read the source and verify it uses the Runner's lock, not a Worker-specific one
        const source = await fs.readFile(
            path.join(__dirname, 'workerStart.ts'),
            'utf-8'
        )
        // The bug: workerStart uses acquireRunnerLock from persistence
        // which locks ~/.hapi/runner.state.json.lock — same as the Runner
        expect(source).toContain("import { acquireRunnerLock } from '@/persistence'")

        // There is NO worker-specific lock — this is the problem.
        // A fix would introduce acquireWorkerLock or parameterize the lock path.
        expect(source).not.toContain('acquireWorkerLock')
    })
})

// ---------- C2: maybeAutoStartServer in runnerLoop ----------

describe('C2: runnerLoop calls maybeAutoStartServer (wrong for remote Workers)', () => {
    it('runnerLoop.ts imports and calls maybeAutoStartServer unconditionally', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // The bug: maybeAutoStartServer is imported and called inside the retry loop
        expect(source).toContain("import { maybeAutoStartServer }")
        expect(source).toContain('maybeAutoStartServer()')

        // There is NO condition checking whether we're local or remote
        expect(source).not.toMatch(/options\.mode\s*[!=]==?\s*['"]remote['"]/)
        expect(source).not.toMatch(/options\.isLocal/)
        expect(source).not.toMatch(/options\.isRemote/)
    })
})

// ---------- C3: runnerLoop writes local Runner state + self-restart ----------

describe('C3: runnerLoop has Runner-specific behavior that breaks Workers', () => {
    it('runnerLoop writes to local runner state file unconditionally', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // The bug: writeRunnerState is called unconditionally
        expect(source).toContain('writeRunnerState(fileState)')
        expect(source).toContain('writeRunnerState(updatedState)')

        // No mode check before writing state
        expect(source).not.toMatch(/if\s*\(.*local.*\)\s*\{?\s*writeRunnerState/)
    })

    it('runnerLoop spawns runner start for self-restart (wrong for Workers)', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // The bug: on version change, spawns ['runner', 'start'] not ['worker', 'start']
        expect(source).toContain("spawnHappyCLI(['runner', 'start']")

        // No mode-aware restart command
        expect(source).not.toContain("spawnHappyCLI(['worker', 'start']")
    })

    it('runnerLoop starts control server unconditionally (wrong for Workers)', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // The bug: startRunnerControlServer is called unconditionally
        expect(source).toContain('startRunnerControlServer(')

        // No mode check
        expect(source).not.toMatch(/if\s*\(.*local.*\)\s*\{?\s*.*startRunnerControlServer/)
    })
})

// ---------- I4: Config file permissions too open ----------

describe('I4: Worker config file has insecure default permissions', () => {
    it('writeWorkerConfig does not set restricted file permissions', async () => {
        const source = await fs.readFile(
            path.join(__dirname, 'workerConfig.ts'),
            'utf-8'
        )
        // The bug: writeFile is called without { mode: 0o600 }
        // This means the token file is readable by other users on shared systems
        expect(source).not.toContain('mode:')
        expect(source).not.toContain('0o600')
    })

    it('config file is world-readable by default', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haqi-worker-perm-'))
        try {
            const config: WorkerConfig = {
                hubUrl: 'https://hub.example.com',
                workerSessionToken: 'wst_secret_token_123',
                machineId: 'test-machine',
                namespace: 'default'
            }
            await writeWorkerConfig(config, tempDir)

            const filePath = path.join(tempDir, 'config.json')
            const stat = await fs.stat(filePath)
            const mode = stat.mode & 0o777

            // On most systems, default umask (022) gives 0644
            // The bug: other users CAN read the file (group+other read bits set)
            // mode & 0o044 checks if group-read or other-read bits are set
            const othersCanRead = (mode & 0o044) !== 0
            expect(othersCanRead).toBe(true) // This SHOULD fail after fix (others should NOT be able to read)
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true })
        }
    })
})

// ---------- I5: Empty machineId ----------

describe('I5: machineId can be empty string from enrollment', () => {
    it('workerStart falls back to empty string when machineId is undefined', async () => {
        const source = await fs.readFile(
            path.join(__dirname, 'workerStart.ts'),
            'utf-8'
        )
        // The bug: when Hub sends no machineId, it becomes ''
        expect(source).toContain("machineId: data.machineId ?? ''")

        // No generation of a fallback machineId
        expect(source).not.toContain('os.hostname()')
    })

    it('empty machineId gets persisted to config', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haqi-worker-mid-'))
        try {
            const config: WorkerConfig = {
                hubUrl: 'https://hub.example.com',
                workerSessionToken: 'wst_test',
                machineId: '', // empty — this is the bug
                namespace: 'default'
            }
            await writeWorkerConfig(config, tempDir)
            const read = await readWorkerConfig(tempDir)

            // The bug: empty machineId is persisted and would be used as-is
            expect(read!.machineId).toBe('')
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true })
        }
    })
})

// ---------- RunnerLoopOptions lacks mode field ----------

describe('RunnerLoopOptions has no mode field', () => {
    it('RunnerLoopOptions type does not include a mode or isRemote field', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // Extract the RunnerLoopOptions type definition
        const optionsMatch = source.match(/export type RunnerLoopOptions\s*=\s*\{[\s\S]*?\n\}/)
        expect(optionsMatch).not.toBeNull()

        const optionsType = optionsMatch![0]
        // The bug: no mode or isRemote/isLocal discriminator
        expect(optionsType).not.toContain('mode')
        expect(optionsType).not.toContain('isRemote')
        expect(optionsType).not.toContain('isLocal')
    })
})
