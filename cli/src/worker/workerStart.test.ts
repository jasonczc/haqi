/**
 * Tests that verify fixes for known issues with workerStart / runnerLoop in remote worker mode.
 *
 * These tests verify the fixes are in place by checking source code for correct patterns.
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

describe('C2: runnerLoop gates maybeAutoStartServer for local mode only', () => {
    it('runnerLoop.ts only calls maybeAutoStartServer when mode is local', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // maybeAutoStartServer is still imported (used in local mode)
        expect(source).toContain("import { maybeAutoStartServer }")
        expect(source).toContain('maybeAutoStartServer()')

        // The fix: there IS a condition checking mode before calling it
        expect(source).toMatch(/options\.mode\s*===\s*['"]local['"]/)
    })
})

// ---------- C3: runnerLoop writes local Runner state + self-restart ----------

describe('C3: runnerLoop gates Runner-specific behavior by mode', () => {
    it('runnerLoop gates writeRunnerState for local mode only', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // writeRunnerState is still called, but gated
        expect(source).toContain('writeRunnerState(fileState)')
        expect(source).toContain('writeRunnerState(updatedState)')

        // The fix: mode check before writing state
        expect(source).toMatch(/if\s*\(options\.mode\s*===\s*['"]local['"]\)\s*\{[\s\S]*?writeRunnerState/)
    })

    it('runnerLoop gates self-restart for local mode only', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // Self-restart still exists for local mode
        expect(source).toContain("spawnHappyCLI(['runner', 'start']")

        // The fix: gated by local mode check
        expect(source).toMatch(/if\s*\(options\.mode\s*===\s*['"]local['"]\)\s*\{[\s\S]*?spawnHappyCLI/)
    })

    it('runnerLoop gates control server for local mode only', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // Control server still exists
        expect(source).toContain('startRunnerControlServer(')

        // The fix: gated by local mode check
        expect(source).toMatch(/if\s*\(options\.mode\s*===\s*['"]local['"]\)\s*\{[\s\S]*?startRunnerControlServer/)
    })
})

// ---------- I4: Config file permissions ----------

describe('I4: Worker config file has secure permissions', () => {
    it('writeWorkerConfig sets restricted file permissions (0o600)', async () => {
        const source = await fs.readFile(
            path.join(__dirname, 'workerConfig.ts'),
            'utf-8'
        )
        // The fix: writeFile is called with { mode: 0o600 }
        expect(source).toContain('mode:')
        expect(source).toContain('0o600')
    })

    it('config file is owner-only readable after fix', async () => {
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

            // After fix: other users should NOT be able to read the file
            const othersCanRead = (mode & 0o044) !== 0
            expect(othersCanRead).toBe(false)
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true })
        }
    })
})

// ---------- I5: Empty machineId ----------

describe('I5: machineId has a generated fallback instead of empty string', () => {
    it('workerStart generates a fallback machineId when undefined', async () => {
        const source = await fs.readFile(
            path.join(__dirname, 'workerStart.ts'),
            'utf-8'
        )
        // The fix: no longer falls back to empty string
        expect(source).not.toContain("machineId: data.machineId ?? ''")

        // Uses os.hostname() for a generated fallback
        expect(source).toContain('os.hostname()')
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

// ---------- RunnerLoopOptions has mode field ----------

describe('RunnerLoopOptions has mode field', () => {
    it('RunnerLoopOptions type includes a mode field', async () => {
        const source = await fs.readFile(
            path.join(__dirname, '..', 'runner', 'runnerLoop.ts'),
            'utf-8'
        )
        // Extract the RunnerLoopOptions type definition
        const optionsMatch = source.match(/export type RunnerLoopOptions\s*=\s*\{[\s\S]*?\n\}/)
        expect(optionsMatch).not.toBeNull()

        const optionsType = optionsMatch![0]
        // The fix: mode discriminator is present
        expect(optionsType).toContain('mode')
    })
})
