import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { configuration } from '@/configuration'

export type WorkerConfig = {
    hubUrl: string
    workerSessionToken: string
    legacyAccessToken?: string
    machineId: string
    namespace: string
}

const DEFAULT_CONFIG_DIR = path.join(configuration.happyHomeDir, 'worker')

function configFilePath(configDir: string): string {
    return path.join(configDir, 'config.json')
}

export async function readWorkerConfig(configDir: string = DEFAULT_CONFIG_DIR): Promise<WorkerConfig | null> {
    const filePath = configFilePath(configDir)
    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(raw) as WorkerConfig
        return parsed
    } catch {
        return null
    }
}

export async function writeWorkerConfig(config: WorkerConfig, configDir: string = DEFAULT_CONFIG_DIR): Promise<void> {
    await fs.mkdir(configDir, { recursive: true })
    const filePath = configFilePath(configDir)
    await fs.writeFile(filePath, JSON.stringify(config, null, 4), { encoding: 'utf-8', mode: 0o600 })
}

export async function clearWorkerConfig(configDir: string = DEFAULT_CONFIG_DIR): Promise<void> {
    const filePath = configFilePath(configDir)
    try {
        await fs.unlink(filePath)
    } catch {
        // File does not exist — nothing to clear
    }
}
