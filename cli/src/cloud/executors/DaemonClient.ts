import type {
    SpawnRequest, SpawnResponse, ProcessStatus,
    HealthResponse, PortInfo, PrepareRequest, PrepareResponse
} from '@hapi/daemon/types'

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
