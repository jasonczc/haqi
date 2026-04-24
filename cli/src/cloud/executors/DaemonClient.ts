type SpawnRequest = {
    command: string[]
    cwd?: string
    env?: Record<string, string>
    user?: string
}

type SpawnResponse = {
    pid: number
    status: 'running' | 'failed'
    error?: string
}

type ProcessStatus = {
    pid: number | null
    running: boolean
    exitCode: number | null
    signal: string | null
    uptimeMs: number | null
}

type HealthResponse = {
    status: 'ok'
    pid: number
    uptimeMs: number
}

type OutputChunk = {
    type: 'stdout' | 'stderr'
    data: string
    timestamp: number
}

type OutputResponse = {
    chunks: OutputChunk[]
}

type PortInfo = {
    port: number
    pid?: number
    process?: string
}

type PrepareRequest = {
    commands: string[]
    cwd: string
    env?: Record<string, string>
}

type PrepareResponse = {
    success: boolean
    error?: string
}

export class DaemonClient {
    constructor(
        private readonly baseUrl: string,
        private readonly authToken: string
    ) {}

    private async request<T>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'Content-Type': 'application/json',
                ...(options?.headers ?? {})
            }
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Daemon ${path} failed (${response.status}): ${text}`)
        }
        return response.json() as Promise<T>
    }

    async health(): Promise<HealthResponse> {
        return this.request('/health')
    }

    async spawn(req: SpawnRequest): Promise<SpawnResponse> {
        return this.request('/process/spawn', {
            method: 'POST',
            body: JSON.stringify(req)
        })
    }

    async kill(): Promise<void> {
        await this.request('/process/kill', { method: 'POST' })
    }

    async status(): Promise<ProcessStatus> {
        return this.request('/process/status')
    }

    async output(count = 100): Promise<OutputResponse> {
        return this.request(`/process/output?count=${encodeURIComponent(String(count))}`)
    }

    async prepare(req: PrepareRequest): Promise<PrepareResponse> {
        return this.request('/runtime/prepare', {
            method: 'POST',
            body: JSON.stringify(req)
        })
    }

    async previewPorts(): Promise<PortInfo[]> {
        const data = await this.request<{ ports: PortInfo[] }>('/preview/ports')
        return data.ports
    }

    async waitReady(timeoutMs = 30_000, intervalMs = 500): Promise<void> {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
            try {
                await this.health()
                return
            } catch {
                await new Promise(r => setTimeout(r, intervalMs))
            }
        }
        throw new Error(`Daemon not ready after ${timeoutMs}ms`)
    }
}
