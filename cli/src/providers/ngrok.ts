import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Subprocess } from 'bun'
import type { MachineMapping } from '@hapi/protocol/types'
import type { CreateManagedMappingInput, MappingProviderController, ProviderSettings } from './types'
import { configuration } from '@/configuration'

type NgrokSettings = NonNullable<ProviderSettings['ngrok']>

type NgrokApiEnvelope = {
    endpoints?: unknown
    tunnels?: unknown
}

function slugifyMappingId(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mapping'
}

function inferMappingKind(name: string, localUrl: string): MachineMapping['kind'] {
    const normalized = `${name} ${localUrl}`.toLowerCase()
    if (normalized.includes('vscode') || normalized.includes('code-server')) return 'vscode'
    if (normalized.includes('jupyter') || normalized.includes(':8888')) return 'jupyter'
    if (normalized.includes('ssh') || normalized.includes(':22') || normalized.startsWith('tcp://')) return 'ssh'
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) return 'web'
    return 'custom'
}

function normalizeLocalUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) {
        throw new Error('Local URL is required')
    }
    if (/^\d+$/.test(trimmed)) {
        return `http://127.0.0.1:${trimmed}`
    }
    if (/^[^:\/?#]+:\d+$/.test(trimmed)) {
        return `http://${trimmed}`
    }
    if (!/^[a-z]+:\/\//i.test(trimmed)) {
        return `http://${trimmed}`
    }
    return trimmed
}

function normalizeNgrokItem(raw: unknown, index: number): MachineMapping | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }

    const record = raw as Record<string, unknown>
    const publicUrl = typeof record.public_url === 'string'
        ? record.public_url
        : typeof record.url === 'string'
            ? record.url
            : undefined
    const name = typeof record.name === 'string' && record.name.trim()
        ? record.name.trim()
        : typeof record.description === 'string' && record.description.trim()
            ? record.description.trim()
            : publicUrl ?? `ngrok-${index + 1}`

    let localUrl = ''
    if (typeof record.addr === 'string') {
        localUrl = record.addr
    } else if (record.config && typeof record.config === 'object' && typeof (record.config as Record<string, unknown>).addr === 'string') {
        localUrl = (record.config as Record<string, unknown>).addr as string
    } else if (typeof record.upstream_url === 'string') {
        localUrl = record.upstream_url
    }

    if (!localUrl) {
        localUrl = typeof record.proto === 'string' && record.proto.toLowerCase() === 'tcp'
            ? 'tcp://localhost'
            : 'http://127.0.0.1'
    }

    const proto = typeof record.proto === 'string' ? record.proto : undefined
    const idSeed = `${name}-${publicUrl ?? localUrl}`

    return {
        id: `ngrok-${slugifyMappingId(idSeed)}`,
        name,
        kind: inferMappingKind(name, localUrl),
        provider: 'ngrok',
        localUrl,
        ...(publicUrl ? { publicUrl } : {}),
        status: 'online',
        source: 'imported',
        metadata: {
            ...(proto ? { proto } : {}),
            ...(typeof record.id === 'string' ? { ngrokId: record.id } : {})
        },
        updatedAt: Date.now()
    }
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs: number): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        if (await condition()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('Timed out waiting for ngrok agent')
}

export class NgrokProviderController implements MappingProviderController {
    private agentProcess: Subprocess | null = null

    constructor(private readonly settings: NgrokSettings) {}

    async listMappings(): Promise<MachineMapping[]> {
        await this.ensureAgent()
        const payload = await this.fetchAgent('/api/endpoints') ?? await this.fetchAgent('/api/tunnels')
        if (!payload) {
            return []
        }

        const items = Array.isArray(payload.endpoints)
            ? payload.endpoints
            : Array.isArray(payload.tunnels)
                ? payload.tunnels
                : []

        return items
            .map((item, index) => normalizeNgrokItem(item, index))
            .filter((item): item is MachineMapping => item !== null)
    }

    async createManagedMapping(input: CreateManagedMappingInput): Promise<MachineMapping> {
        await this.ensureAgent()

        const localUrl = normalizeLocalUrl(input.localUrl)
        const protocol = input.kind === 'ssh' || localUrl.startsWith('tcp://') ? 'tcp' : 'http'
        const addr = protocol === 'tcp'
            ? localUrl.replace(/^tcp:\/\//, '')
            : localUrl

        const endpoint: Record<string, unknown> = {
            name: input.name,
            addr,
            proto: protocol
        }

        if (protocol === 'http') {
            endpoint.domain = undefined
        }

        const response = await fetch(this.getApiBaseUrl() + '/api/endpoints', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json'
            },
            body: JSON.stringify(endpoint)
        })

        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Failed to create ngrok endpoint: HTTP ${response.status}${text ? ` ${text}` : ''}`)
        }

        const raw = await response.json() as unknown
        const normalized = normalizeNgrokItem(raw, 0)
        if (!normalized) {
            throw new Error('Failed to parse ngrok endpoint')
        }

        return {
            ...normalized,
            name: input.name,
            kind: input.kind,
            localUrl,
            source: 'managed',
            auth: input.auth,
            updatedAt: Date.now()
        }
    }

    async deleteManagedMapping(mapping: MachineMapping): Promise<void> {
        await this.ensureAgent()
        const ngrokId = typeof mapping.metadata?.ngrokId === 'string' ? mapping.metadata.ngrokId : null
        if (ngrokId) {
            const response = await fetch(this.getApiBaseUrl() + `/api/endpoints/${encodeURIComponent(ngrokId)}`, {
                method: 'DELETE',
                headers: { accept: 'application/json' }
            })
            if (response.ok || response.status === 404) {
                return
            }
            const text = await response.text().catch(() => '')
            throw new Error(`Failed to delete ngrok endpoint: HTTP ${response.status}${text ? ` ${text}` : ''}`)
        }

        const current = await this.listMappings()
        const matched = current.find((item) => item.publicUrl && mapping.publicUrl && item.publicUrl === mapping.publicUrl)
        if (!matched) {
            return
        }
        await this.deleteManagedMapping(matched)
    }

    private getApiBaseUrl(): string {
        return (this.settings.apiBaseUrl?.trim() || 'http://127.0.0.1:4040').replace(/\/$/, '')
    }

    private async fetchAgent(path: string): Promise<NgrokApiEnvelope | null> {
        const response = await fetch(this.getApiBaseUrl() + path, {
            headers: { accept: 'application/json' }
        }).catch(() => null)

        if (!response) {
            return null
        }
        if (!response.ok) {
            if (response.status === 404) {
                return null
            }
            const text = await response.text().catch(() => '')
            throw new Error(`ngrok agent returned HTTP ${response.status}${text ? ` ${text}` : ''}`)
        }
        return await response.json() as NgrokApiEnvelope
    }

    private async ensureAgent(): Promise<void> {
        const probe = await this.fetchAgent('/api/endpoints').catch(() => null)
        if (probe) {
            return
        }

        if (this.settings.managed === false) {
            throw new Error('ngrok agent is not running locally')
        }
        if (!this.settings.authToken?.trim()) {
            throw new Error('ngrok auth token is not configured')
        }

        const binary = Bun.which('ngrok')
        if (!binary) {
            throw new Error('ngrok binary not found in PATH')
        }

        if (!this.agentProcess || this.agentProcess.exitCode !== null) {
            const configDir = join(configuration.happyHomeDir, 'providers', 'ngrok')
            const configPath = join(configDir, 'haqi-ngrok.yml')
            await mkdir(configDir, { recursive: true })
            const configContent = [
                'version: "2"',
                `authtoken: ${this.settings.authToken.trim()}`,
                `web_addr: ${new URL(this.getApiBaseUrl()).host}`,
                ...(this.settings.region?.trim() ? [`region: ${this.settings.region.trim()}`] : [])
            ].join('\n')
            await writeFile(configPath, configContent, { mode: 0o600 })

            this.agentProcess = Bun.spawn({
                cmd: [binary, 'start', '--none', '--config', configPath],
                stdout: 'ignore',
                stderr: 'ignore',
                stdin: 'ignore'
            })
        }

        await waitFor(async () => {
            const result = await this.fetchAgent('/api/endpoints').catch(() => null)
            return result !== null
        }, 10_000)
    }
}
