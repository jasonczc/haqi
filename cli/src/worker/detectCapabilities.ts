import * as os from 'node:os'
import { promisify } from 'node:util'
import { exec } from 'node:child_process'
import type { WorkerCapabilities } from '@hapi/protocol/types'

const execAsync = promisify(exec)

async function hasDocker(): Promise<boolean> {
    try {
        await execAsync('command -v docker')
        return true
    } catch {
        return false
    }
}

async function getDiskGb(): Promise<number> {
    // Try Linux-style df first
    try {
        const { stdout } = await execAsync('df -BG --output=avail /')
        const lines = stdout.trim().split('\n')
        // First line is header "Avail", second line is value like "42G"
        const valueLine = lines[1]?.trim() ?? ''
        const match = valueLine.match(/^(\d+)G$/)
        if (match) {
            return parseInt(match[1], 10)
        }
    } catch {
        // Not Linux or df --output not supported
    }

    // Fallback: macOS-style df
    try {
        const { stdout } = await execAsync("df -g / | tail -1 | awk '{print $4}'")
        const value = parseInt(stdout.trim(), 10)
        if (!isNaN(value)) {
            return value
        }
    } catch {
        // df unavailable
    }

    return 0
}

export async function detectWorkerCapabilities(): Promise<WorkerCapabilities> {
    const [docker, diskGb] = await Promise.all([
        hasDocker(),
        getDiskGb()
    ])

    const cpuCount = os.cpus().length
    const memoryMb = Math.floor(os.totalmem() / 1024 / 1024)

    return {
        docker,
        dockerSession: docker,
        internetAccess: true,
        maxConcurrentSessions: cpuCount,
        resources: {
            cpu: cpuCount,
            memoryMb,
            ...(diskGb > 0 ? { diskGb } : {})
        }
    }
}
