import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { readWorkerConfig, writeWorkerConfig, clearWorkerConfig, type WorkerConfig } from './workerConfig'

const sampleConfig: WorkerConfig = {
    hubUrl: 'https://hub.example.com',
    workerSessionToken: 'tok_abc123',
    machineId: 'machine-xyz',
    namespace: 'default',
}

describe('workerConfig', () => {
    let tmpDir: string

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haqi-worker-test-'))
    })

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('returns null when no config exists', async () => {
        const result = await readWorkerConfig(tmpDir)
        expect(result).toBe(null)
    })

    it('writes and reads back config correctly', async () => {
        await writeWorkerConfig(sampleConfig, tmpDir)
        const result = await readWorkerConfig(tmpDir)
        expect(result).toEqual(sampleConfig)
    })

    it('clears config successfully', async () => {
        await writeWorkerConfig(sampleConfig, tmpDir)
        await clearWorkerConfig(tmpDir)
        const result = await readWorkerConfig(tmpDir)
        expect(result).toBe(null)
    })
})
