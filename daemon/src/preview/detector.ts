import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { PortInfo } from '../types'

const execAsync = promisify(exec)

export function parseListeningPorts(ssOutput: string, excludePorts: number[]): PortInfo[] {
    const exclude = new Set(excludePorts)
    const ports: PortInfo[] = []
    const lines = ssOutput.split('\n').slice(1) // skip header

    for (const line of lines) {
        if (!line.includes('LISTEN')) continue
        const addrMatch = line.match(/:(\d+)\s/)
        if (!addrMatch) continue
        const port = parseInt(addrMatch[1], 10)
        if (exclude.has(port) || port === 0) continue

        const pidMatch = line.match(/\("([^"]+)",pid=(\d+)/)
        ports.push({
            port,
            pid: pidMatch ? parseInt(pidMatch[2], 10) : undefined,
            process: pidMatch?.[1]
        })
    }

    return ports
}

export async function detectListeningPorts(excludePorts: number[]): Promise<PortInfo[]> {
    try {
        const { stdout } = await execAsync('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo ""')
        return parseListeningPorts(stdout, excludePorts)
    } catch {
        return []
    }
}
